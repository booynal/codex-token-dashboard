import assert from 'node:assert/strict';
import { test } from 'node:test';
import { millisecondsUntilNextHour } from '../src/hourlyRefresh.js';

test('schedules automatic refresh for the next local hour boundary', () => {
  const now = new Date(2026, 7, 20, 10, 15, 30, 250);

  assert.equal(millisecondsUntilNextHour(now), 2_669_750);
});

test('does not refresh twice at an exact hour boundary', () => {
  const now = new Date(2026, 7, 20, 10, 0, 0, 0);

  assert.equal(millisecondsUntilNextHour(now), 3_600_000);
});
