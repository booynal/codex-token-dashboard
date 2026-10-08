import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../server/index.js';

const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-token-dashboard-'));
const testDate = shanghaiToday();
const rolloutDir = path.join(codexDir, 'sessions', ...testDate.split('-'));
const rolloutPath = path.join(rolloutDir, 'rollout-session-a.jsonl');
fs.mkdirSync(rolloutDir, { recursive: true });

after(() => fs.rmSync(codexDir, { recursive: true, force: true }));

test('refreshes changed logs, invalidates metadata, and keeps invalid counts out of totals', async (t) => {
  writeRollout([validUsage({ input: 70, cached: 20, output: 30, total: 100 })]);
  const { app } = createApp({ codexDir, includeArchived: false, quickMode: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  const [first, concurrent] = await Promise.all([
    fetch(`${url}/api/usage`).then((response) => response.json()),
    fetch(`${url}/api/usage`).then((response) => response.json()),
  ]);
  assert.equal(first.eventCount, 1);
  assert.deepEqual(concurrent.events, first.events);
  assert.equal(first.events[0].totalTokens, 100);

  fs.writeFileSync(path.join(codexDir, 'session_index.jsonl'), `${JSON.stringify({
    id: 'session-a', thread_name: 'renamed session', updated_at: `${testDate}T10:00:00Z`,
  })}\n`);
  writeRollout([
    validUsage({ input: 70, cached: 20, output: 30, total: 100 }),
    validUsage({ input: 'not-a-number', cached: 20, output: 5, total: -1, minute: '01' }),
  ]);
  await fetch(`${url}/api/refresh`, { method: 'POST' }).then((response) => response.json());
  const refreshed = await waitForReadyScan(url);

  assert.equal(refreshed.eventCount, 2);
  assert.equal(refreshed.events.reduce((sum, event) => sum + event.totalTokens, 0), 105);
  assert.equal(refreshed.events[0].sessionName, 'renamed session');
  assert.ok(refreshed.warnings.some((warning) => warning.type === 'invalid_token_count'));
  assert.ok(refreshed.warnings.some((warning) => warning.type === 'cached_input_exceeds_input'));
});

test('expands bounded coverage incrementally and reserves all-history scans for the explicit endpoint', async (t) => {
  const fixture = createRangeFixture();
  t.after(() => fs.rmSync(fixture.codexDir, { recursive: true, force: true }));
  const { app } = createApp({ codexDir: fixture.codexDir, includeArchived: false, quickMode: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  const initial = await fetch(`${url}/api/usage`).then((response) => response.json());
  assert.equal(initial.scan.state, 'ready');
  assert.deepEqual(initial.scan.coverage, {
    all: false,
    ranges: [{ startDate: fixture.recentStart, endDate: fixture.today }],
  });
  assert.deepEqual(initial.events.map((event) => event.date), [fixture.recentDate]);

  await fetch(`${url}/api/scan-range`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: fixture.oldestDate, endDate: fixture.today }),
  }).then((response) => response.json());
  const expanded = await waitForReadyScan(url);
  assert.deepEqual(expanded.scan.coverage, {
    all: false,
    ranges: [{ startDate: fixture.oldestDate, endDate: fixture.today }],
  });
  assert.deepEqual(expanded.events.map((event) => event.date), [
    fixture.oldestDate,
    fixture.middleDate,
    fixture.recentDate,
  ]);

  const alreadyCovered = await fetch(`${url}/api/scan-range`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: fixture.oldestDate, endDate: fixture.today }),
  }).then((response) => response.json());
  assert.equal(alreadyCovered.scan.state, 'ready');
  assert.equal(alreadyCovered.generatedAt, expanded.generatedAt);

  await fetch(`${url}/api/scan-all`, { method: 'POST' }).then((response) => response.json());
  const allHistory = await waitForReadyScan(url);
  assert.deepEqual(allHistory.scan.coverage, { all: true, ranges: [] });
  assert.equal(allHistory.eventCount, 3);
});

test('manual refresh stays bounded to the ranges already loaded', async (t) => {
  const fixture = createRangeFixture();
  t.after(() => fs.rmSync(fixture.codexDir, { recursive: true, force: true }));
  const { app } = createApp({ codexDir: fixture.codexDir, includeArchived: false, quickMode: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  const initial = await fetch(`${url}/api/usage`).then((response) => response.json());
  await fetch(`${url}/api/refresh`, { method: 'POST' }).then((response) => response.json());
  const refreshed = await waitForReadyScan(url);

  assert.deepEqual(refreshed.scan.coverage, initial.scan.coverage);
  assert.deepEqual(refreshed.events.map((event) => event.date), [fixture.recentDate]);
  assert.equal(refreshed.eventCount, 1);
});

test('rolling refresh scans only the requested week and preserves previously loaded history', async (t) => {
  const fixture = createRangeFixture();
  t.after(() => fs.rmSync(fixture.codexDir, { recursive: true, force: true }));
  const { app } = createApp({ codexDir: fixture.codexDir, includeArchived: false, quickMode: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  await fetch(`${url}/api/usage`);
  const invalid = await fetch(`${url}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: fixture.today, endDate: fixture.oldestDate }),
  });
  assert.equal(invalid.status, 400);
  await fetch(`${url}/api/scan-range`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: fixture.oldestDate, endDate: fixture.today }),
  });
  const expanded = await waitForReadyScan(url);
  assert.equal(expanded.eventCount, 3);

  const nextDay = shiftDate(fixture.today, 1);
  const nextWeekStart = shiftDate(nextDay, -6);
  writeRolloutForDate(fixture.codexDir, nextDay, 40);
  writeRolloutForDate(fixture.codexDir, fixture.oldestDate, 999);
  writeRolloutForDate(fixture.codexDir, fixture.recentDate, 50);
  const request = { startDate: nextWeekStart, endDate: nextDay };
  const scanning = await fetch(`${url}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }).then((response) => response.json());
  assert.deepEqual(scanning.scan.request.ranges, [request]);

  const refreshed = await waitForReadyScan(url);
  assert.deepEqual(refreshed.scan.coverage, {
    all: false,
    ranges: [{ startDate: fixture.oldestDate, endDate: nextDay }],
  });
  assert.deepEqual(refreshed.events.map((event) => [event.date, event.inputTokens]), [
    [fixture.oldestDate, 10],
    [fixture.middleDate, 20],
    [fixture.recentDate, 50],
    [nextDay, 40],
  ]);
  assert.equal(refreshed.fileCount, 4);

  fs.rmSync(path.join(fixture.codexDir, 'sessions', ...fixture.recentDate.split('-'), `rollout-${fixture.recentDate}T08-00-00.jsonl`));
  await fetch(`${url}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const afterDeletion = await waitForReadyScan(url);
  assert.deepEqual(afterDeletion.events.map((event) => event.date), [fixture.oldestDate, fixture.middleDate, nextDay]);
  assert.equal(afterDeletion.fileCount, 3);
});

test('bounded refresh retains all-history coverage', async (t) => {
  const fixture = createRangeFixture();
  t.after(() => fs.rmSync(fixture.codexDir, { recursive: true, force: true }));
  const { app } = createApp({ codexDir: fixture.codexDir, includeArchived: false, quickMode: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  await fetch(`${url}/api/usage`);
  await fetch(`${url}/api/scan-all`, { method: 'POST' });
  await waitForReadyScan(url);
  const request = { startDate: fixture.recentStart, endDate: fixture.today };
  const scanning = await fetch(`${url}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }).then((response) => response.json());
  assert.equal(scanning.scan.request.all, false);
  assert.deepEqual(scanning.scan.request.ranges, [request]);
  const refreshed = await waitForReadyScan(url);
  assert.deepEqual(refreshed.scan.coverage, { all: true, ranges: [] });
  assert.equal(refreshed.eventCount, 3);
});

function writeRollout(records) {
  const meta = {
    type: 'session_meta',
    payload: { id: 'session-a', cwd: '/work/demo', originator: 'Codex Desktop' },
  };
  const context = { type: 'turn_context', payload: { model: 'gpt-5.6-sol' } };
  fs.writeFileSync(rolloutPath, [meta, context, ...records].map((record) => JSON.stringify(record)).join('\n'));
}

function validUsage({ input, cached, output, total, date = testDate, minute = '00' }) {
  return {
    type: 'event_msg',
    timestamp: `${date}T10:${minute}:00Z`,
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          total_tokens: total,
        },
      },
    },
  };
}

function createRangeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-token-dashboard-range-'));
  const today = shanghaiToday();
  const oldestDate = shiftDate(today, -26);
  const middleDate = shiftDate(today, -15);
  const recentDate = shiftDate(today, -2);
  writeRolloutForDate(dir, oldestDate, 10);
  writeRolloutForDate(dir, middleDate, 20);
  writeRolloutForDate(dir, recentDate, 30);
  return {
    codexDir: dir,
    today,
    recentStart: shiftDate(today, -6),
    oldestDate,
    middleDate,
    recentDate,
  };
}

function writeRolloutForDate(dir, date, input) {
  const [year, month, day] = date.split('-');
  const filePath = path.join(dir, 'sessions', year, month, day, `rollout-${date}T08-00-00.jsonl`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, [
    JSON.stringify({ type: 'session_meta', payload: { id: `session-${date}`, cwd: '/work/range' } }),
    JSON.stringify(validUsage({ input, cached: 0, output: input, total: input * 2, date })),
  ].join('\n'));
  fs.utimesSync(filePath, new Date(`${date}T08:00:00Z`), new Date(`${date}T08:00:00Z`));
}

async function waitForReadyScan(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await fetch(`${url}/api/usage`).then((response) => response.json());
    if (snapshot.scan?.state === 'ready') return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for scan completion');
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftDate(date, amount) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}
