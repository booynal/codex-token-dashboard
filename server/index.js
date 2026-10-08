import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = os.homedir();
const DEFAULT_CODEX_DIR = path.join(HOME, '.codex');
const RECENT_DAYS = 7;

export function createApp(options = {}) {
  const app = express();
  const config = normalizeConfig(options);
  let cache = null;
  let coverage = { all: false, ranges: [] };
  const parseCache = { files: new Map(), metadataSignature: '' };
  let initialScanPromise = null;
  let activeScanPromise = null;
  let pendingScanRequest = null;
  let scanQueue = Promise.resolve();

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      codexDir: config.codexDir,
      includeArchived: config.includeArchived,
      quickMode: config.quickMode,
    });
  });

  app.get('/api/usage', async (_req, res) => {
    try {
      if (!cache) {
        res.json(await startInitialScan());
        return;
      }
      res.json(cache);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/refresh', async (req, res) => {
    try {
      if (!cache) await startInitialScan();
      const requestedRange = req.body?.startDate || req.body?.endDate
        ? normalizeRequestedRange(req.body)
        : null;
      const refreshAll = req.body?.all === true || (!requestedRange && coverage.all);
      res.json(scheduleScan({
        mode: 'refresh',
        ranges: requestedRange ? [requestedRange] : coverage.ranges,
        all: refreshAll,
      }));
    } catch (error) {
      res.status(error.message === '日期范围无效' ? 400 : 500).json({ error: error.message });
    }
  });

  app.post('/api/scan-range', async (req, res) => {
    try {
      if (!cache) await startInitialScan();
      res.json(scheduleScan({ mode: 'expand', ranges: [normalizeRequestedRange(req.body)] }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post(['/api/scan-all', '/api/scan-full'], async (_req, res) => {
    try {
      if (!cache) await startInitialScan();
      res.json(scheduleScan({ mode: 'all', all: true, ranges: [] }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  async function startInitialScan() {
    if (initialScanPromise) return initialScanPromise;
    const initialRange = { startDate: getRecentStartDate(), endDate: formatShanghaiDate(new Date()) };
    initialScanPromise = enqueueScan(async () => {
      const initialResult = await scanUsage(config, {
        dateRanges: [initialRange],
        parseCache,
        pruneCache: true,
      });
      coverage = { all: false, ranges: [initialRange] };
      cache = withScanStatus(initialResult, {
        state: 'ready',
        coverage,
        quickMode: config.quickMode,
      });
      console.log(formatScanLog('Initial range scan complete', initialResult));
      return cache;
    }).finally(() => {
      initialScanPromise = null;
    });
    return initialScanPromise;
  }

  function scheduleScan(request) {
    if (!cache) return cache;
    if (request.mode === 'expand' && isCoverageRequestSatisfied(request, coverage)) return cache;
    if (request.mode === 'all' && coverage.all) return cache;

    pendingScanRequest = mergeScanRequests(pendingScanRequest, request);
    cache = withScanStatus(cache, {
      ...cache.scan,
      state: 'scanning',
      coverage,
      request: scanRequestSummary(pendingScanRequest),
      progress: { processedFiles: 0, totalFiles: 0 },
    });
    if (!activeScanPromise) {
      activeScanPromise = enqueueScan(processPendingScans).finally(() => {
        activeScanPromise = null;
      });
    }
    return cache;
  }

  async function processPendingScans() {
    try {
      while (pendingScanRequest) {
        const request = pendingScanRequest;
        pendingScanRequest = null;
        await completeScanRequest(request);
      }
      cache = withScanStatus(cache, {
        ...cache.scan,
        state: 'ready',
        coverage,
        request: null,
      });
    } catch (error) {
      cache = withScanStatus(cache, {
        ...cache.scan,
        state: 'failed',
        coverage,
        error: error.message,
      });
      console.error(`Range scan failed: ${error.message}`);
    }
  }

  async function completeScanRequest(request) {
    const requestedRanges = request.all
      ? []
      : request.mode === 'refresh'
        ? normalizeDateRanges(request.ranges)
        : subtractCoverageRanges(request.ranges, coverage.ranges);
    if (!request.all && !requestedRanges.length) return;

    const result = await scanUsage(config, {
      dateRanges: requestedRanges,
      parseCache,
      pruneCache: request.all,
      onProgress: (progress) => {
        if (!cache) return;
        cache = withScanStatus(cache, {
          ...cache.scan,
          state: 'scanning',
          coverage,
          request: scanRequestSummary(request),
          progress,
        });
      },
    });

    if (request.all) {
      coverage = { all: true, ranges: [] };
      cache = withScanStatus(result, { ...cache.scan, coverage });
      console.log(formatScanLog('All-history scan complete', result));
      return;
    }

    const nextCoverage = coverage.all ? coverage : {
      all: false,
      ranges: normalizeDateRanges([...coverage.ranges, ...requestedRanges]),
    };
    coverage = nextCoverage;
    const nextSnapshot = request.mode === 'refresh'
      ? mergeRefreshedScanResults(cache, result, requestedRanges)
      : mergeScanResults(cache, result);
    cache = withScanStatus(nextSnapshot, { ...cache.scan, coverage });
    console.log(formatScanLog(request.mode === 'refresh' ? 'Coverage refresh complete' : 'Range expansion complete', result));
  }

  function enqueueScan(task) {
    const queued = scanQueue.then(task, task);
    scanQueue = queued.catch(() => {});
    return queued;
  }

  if (config.staticMode) {
    app.use(express.static(config.distDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(config.distDir, 'index.html'));
    });
  }

  return { app, config };
}

export function startServer(options = {}) {
  const { app, config } = createApp(options);
  const server = app.listen(config.port, config.host, () => {
    console.log(`Codex token dashboard listening on http://${config.host}:${config.port}`);
    console.log(`Reading Codex data from ${config.codexDir}`);
    console.log(`Quick mode: ${config.quickMode ? 'enabled' : 'disabled'}`);
  });
  return { app, config, server };
}

function normalizeConfig(options = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const codexDir = path.resolve(options.codexDir || process.env.CODEX_DIR || DEFAULT_CODEX_DIR);
  return {
    codexDir,
    includeArchived: options.includeArchived ?? process.env.CODEX_INCLUDE_ARCHIVED !== 'false',
    quickMode: options.quickMode ?? process.env.CODEX_QUICK_MODE === 'true',
    staticMode: Boolean(options.staticMode),
    distDir: path.resolve(options.distDir || path.join(__dirname, '..', 'dist')),
    host: options.host || process.env.HOST || '0.0.0.0',
    port: Number(options.port || process.env.PORT || 8787),
  };
}

async function scanUsage(config, { dateRanges = [], onProgress, parseCache, pruneCache = false } = {}) {
  const normalizedRanges = normalizeDateRanges(dateRanges);
  const startedAt = new Date();
  const warnings = [];
  const events = [];
  const files = [];
  const sourceDirs = getSourceDirs(config);
  const sessionNames = readSessionNames(config.codexDir, warnings);
  const workspaceLabels = readWorkspaceLabels(config.codexDir, warnings);
  const metadataSignature = getMetadataSignature(config.codexDir);
  if (parseCache && parseCache.metadataSignature !== metadataSignature) {
    parseCache.files.clear();
    parseCache.metadataSignature = metadataSignature;
  }

  const rolloutFiles = sourceDirs.flatMap((source) => listRolloutFiles(source.dir, warnings, normalizedRanges)
    .map((file) => ({ file, source })));
  const scannedPaths = new Set();
  onProgress?.({ processedFiles: 0, totalFiles: rolloutFiles.length });

  for (let index = 0; index < rolloutFiles.length; index += 1) {
    const { file, source } = rolloutFiles[index];
    scannedPaths.add(file);
    const parsed = getParsedRolloutFile(file, source, sessionNames, workspaceLabels, parseCache);
    files.push(parsed.file);
    warnings.push(...parsed.warnings);
    events.push(...parsed.events.filter((event) => isDateInRanges(event.date, normalizedRanges)));
    const processedFiles = index + 1;
    if (processedFiles === rolloutFiles.length || processedFiles % 20 === 0) {
      onProgress?.({ processedFiles, totalFiles: rolloutFiles.length });
      await yieldToEventLoop();
    }
  }

  if (parseCache && pruneCache) {
    for (const filePath of parseCache.files.keys()) {
      if (!scannedPaths.has(filePath)) parseCache.files.delete(filePath);
    }
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    roots: sourceDirs.map(({ key, label, dir }) => ({ key, label, dir })),
    codexDir: config.codexDir,
    fileCount: files.length,
    eventCount: events.length,
    events,
    files,
    warnings,
    scanMs: new Date() - startedAt,
  };
}

function getParsedRolloutFile(filePath, source, sessionNames, workspaceLabels, parseCache) {
  const signature = getFileSignature(filePath);
  const cached = parseCache?.files.get(filePath);
  if (signature && cached?.signature === signature) return cached.parsed;

  const parsed = parseRolloutFile(filePath, source, sessionNames, workspaceLabels);
  if (signature && parseCache) parseCache.files.set(filePath, { signature, parsed });
  return parsed;
}

function getMetadataSignature(codexDir) {
  return [
    path.join(codexDir, 'session_index.jsonl'),
    path.join(codexDir, '.codex-global-state.json'),
  ].map((filePath) => `${filePath}:${getFileSignature(filePath) || 'missing'}`).join('|');
}

function getFileSignature(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function withScanStatus(result, scan) {
  return {
    ...result,
    scan,
  };
}

function formatScanLog(label, result) {
  return `${label}: ${result.fileCount} files, ${result.eventCount} token events, ${result.scanMs}ms`;
}

function getRecentStartDate() {
  const today = formatShanghaiDate(new Date());
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (RECENT_DAYS - 1));
  return start.toISOString().slice(0, 10);
}

function normalizeRequestedRange(body = {}) {
  const startDate = String(body.startDate || '');
  const endDate = String(body.endDate || formatShanghaiDate(new Date()));
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    throw new Error('日期范围无效');
  }
  return { startDate, endDate };
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function normalizeDateRanges(ranges = []) {
  const sorted = ranges
    .filter((range) => isIsoDate(range?.startDate) && isIsoDate(range?.endDate) && range.startDate <= range.endDate)
    .map((range) => ({ startDate: range.startDate, endDate: range.endDate }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
  const normalized = [];
  for (const range of sorted) {
    const previous = normalized.at(-1);
    if (previous && range.startDate <= addDays(previous.endDate, 1)) {
      if (range.endDate > previous.endDate) previous.endDate = range.endDate;
    } else {
      normalized.push(range);
    }
  }
  return normalized;
}

function subtractCoverageRanges(requestedRanges, coveredRanges) {
  const gaps = [];
  const covered = normalizeDateRanges(coveredRanges);
  for (const requested of normalizeDateRanges(requestedRanges)) {
    let cursor = requested.startDate;
    for (const existing of covered) {
      if (existing.endDate < cursor) continue;
      if (existing.startDate > requested.endDate) break;
      if (existing.startDate > cursor) {
        gaps.push({ startDate: cursor, endDate: addDays(existing.startDate, -1) });
      }
      if (existing.endDate >= requested.endDate) {
        cursor = '';
        break;
      }
      cursor = addDays(existing.endDate, 1);
    }
    if (cursor && cursor <= requested.endDate) gaps.push({ startDate: cursor, endDate: requested.endDate });
  }
  return normalizeDateRanges(gaps);
}

function addDays(date, amount) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function isDateInRanges(date, ranges) {
  return !ranges.length || ranges.some((range) => date >= range.startDate && date <= range.endDate);
}

function isCoverageRequestSatisfied(request, currentCoverage) {
  return currentCoverage.all || subtractCoverageRanges(request.ranges, currentCoverage.ranges).length === 0;
}

function mergeScanRequests(current, next) {
  if (!current) return next;
  if (current.all || next.all) return { mode: 'all', all: true, ranges: [] };
  const ranges = normalizeDateRanges([...current.ranges, ...next.ranges]);
  const mode = current.mode === 'refresh' || next.mode === 'refresh' ? 'refresh' : 'expand';
  return { mode, all: false, ranges };
}

function scanRequestSummary(request) {
  return {
    mode: request.mode,
    all: Boolean(request.all),
    ranges: request.ranges || [],
  };
}

function mergeScanResults(current, delta) {
  const eventKey = (event) => `${event.filePath}:${event.id}`;
  const fileKey = (file) => `${file.source}:${file.path}`;
  const warningKey = (warning) => `${warning.type}:${warning.message}`;
  const events = new Map((current?.events || []).map((event) => [eventKey(event), event]));
  const files = new Map((current?.files || []).map((file) => [fileKey(file), file]));
  const warnings = new Map((current?.warnings || []).map((warning) => [warningKey(warning), warning]));
  delta.events.forEach((event) => events.set(eventKey(event), event));
  delta.files.forEach((file) => files.set(fileKey(file), file));
  delta.warnings.forEach((warning) => warnings.set(warningKey(warning), warning));
  const mergedEvents = [...events.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  return {
    ...delta,
    eventCount: mergedEvents.length,
    fileCount: files.size,
    events: mergedEvents,
    files: [...files.values()],
    warnings: [...warnings.values()],
  };
}

function mergeRefreshedScanResults(current, delta, ranges) {
  const retainedEvents = current.events.filter((event) => !isDateInRanges(event.date, ranges));
  const refreshedPaths = new Set(delta.files.map((file) => file.path));
  const previouslyRefreshedPaths = new Set(current.events
    .filter((event) => isDateInRanges(event.date, ranges))
    .map((event) => event.filePath));
  const retainedFiles = current.files.filter((file) => {
    const pathDate = getDateFromPath(file.path);
    return !refreshedPaths.has(file.path)
      && !(pathDate && isDateInRanges(pathDate, ranges))
      && !previouslyRefreshedPaths.has(file.path);
  });
  const events = [...retainedEvents, ...delta.events].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const files = [...retainedFiles, ...delta.files];
  return {
    ...delta,
    eventCount: events.length,
    fileCount: files.length,
    events,
    files,
    warnings: delta.warnings,
  };
}

function getSourceDirs(config) {
  const dirs = [
    { key: 'current', label: '当前日志', dir: path.join(config.codexDir, 'sessions') },
  ];
  if (config.includeArchived) {
    dirs.push({ key: 'archived', label: '归档日志', dir: path.join(config.codexDir, 'archived_sessions') });
  }
  return dirs;
}

function listRolloutFiles(root, warnings, dateRanges = []) {
  if (!fs.existsSync(root)) {
    warnings.push({ type: 'missing_root', message: `日志目录不存在：${root}` });
    return [];
  }

  const result = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      warnings.push({ type: 'read_dir_failed', message: `${dir}: ${error.message}` });
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) {
        if (!isRolloutFileInRanges(fullPath, dateRanges, warnings)) continue;
        result.push(fullPath);
      }
    }
  }

  return result;
}

function getDateFromPath(filePath) {
  const directoryMatch = filePath.match(/\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
  if (directoryMatch) return `${directoryMatch[1]}-${directoryMatch[2]}-${directoryMatch[3]}`;
  const filenameMatch = path.basename(filePath).match(/^rollout-(\d{4}-\d{2}-\d{2})T/);
  return filenameMatch?.[1] || '';
}

function isRolloutFileInRanges(filePath, dateRanges, warnings) {
  if (!dateRanges.length) return true;
  const pathDate = getDateFromPath(filePath);
  if (pathDate && isDateInRanges(pathDate, dateRanges)) return true;

  try {
    const modifiedDate = formatShanghaiDate(fs.statSync(filePath).mtime);
    // An older rollout can stay active across a requested boundary. Re-read it
    // whenever it changed after the start of a requested range.
    return dateRanges.some((range) => modifiedDate >= range.startDate);
  } catch (error) {
    warnings.push({ type: 'stat_file_failed', message: `${filePath}: ${error.message}` });
    return false;
  }
}

function readSessionNames(codexDir, warnings) {
  const indexPath = path.join(codexDir, 'session_index.jsonl');
  const names = new Map();

  if (!fs.existsSync(indexPath)) return names;

  let content = '';
  try {
    content = fs.readFileSync(indexPath, 'utf8');
  } catch (error) {
    warnings.push({ type: 'read_session_index_failed', message: `${indexPath}: ${error.message}` });
    return names;
  }

  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const record = JSON.parse(line);
      if (!record.id || !record.thread_name) return;
      const previous = names.get(record.id);
      if (!previous || String(record.updated_at || '') >= String(previous.updatedAt || '')) {
        names.set(record.id, {
          name: cleanThreadName(record.thread_name),
          updatedAt: record.updated_at || '',
        });
      }
    } catch (error) {
      warnings.push({
        type: 'session_index_parse_failed',
        message: `${indexPath}:${index + 1}: ${error.message}`,
      });
    }
  });

  return new Map([...names].map(([id, value]) => [id, value.name]));
}

function readWorkspaceLabels(codexDir, warnings) {
  const statePath = path.join(codexDir, '.codex-global-state.json');
  if (!fs.existsSync(statePath)) return new Map();

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const labels = state?.['electron-persisted-atom-state']?.['electron-workspace-root-labels'] || {};
    return new Map(Object.entries(labels));
  } catch (error) {
    warnings.push({ type: 'global_state_parse_failed', message: `${statePath}: ${error.message}` });
    return new Map();
  }
}

function parseRolloutFile(filePath, source, sessionNames, workspaceLabels) {
  const warnings = [];
  const fileSummary = {
    path: filePath,
    source: source.key,
    sourceLabel: source.label,
    sessionId: null,
    sessionName: null,
    cwd: null,
    projectName: null,
    originator: null,
    client: null,
    cliVersion: null,
    modelProvider: null,
    eventCount: 0,
  };

  let currentModel = 'unknown';
  let currentCwd = 'unknown';
  let currentOriginator = 'unknown';
  let currentReasoningEffort = 'unknown';
  let sessionId = path.basename(filePath, '.jsonl').replace(/^rollout-/, '');
  let content = '';
  const events = [];

  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    warnings.push({ type: 'read_file_failed', message: `${filePath}: ${error.message}` });
    return { file: fileSummary, events, warnings };
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;

    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      warnings.push({
        type: 'json_parse_failed',
        message: `${filePath}:${index + 1}: ${error.message}`,
      });
      return;
    }

    if (record.type === 'session_meta') {
      sessionId = record.payload?.id || sessionId;
      currentCwd = record.payload?.cwd || currentCwd;
      currentOriginator = record.payload?.originator || currentOriginator;
      currentReasoningEffort = getReasoningEffort(record.payload) || currentReasoningEffort;
      fileSummary.sessionId = sessionId;
      fileSummary.sessionName = getSessionName(sessionId, sessionNames);
      fileSummary.cwd = currentCwd;
      fileSummary.projectName = getProjectName(currentCwd, workspaceLabels);
      fileSummary.originator = currentOriginator;
      fileSummary.client = getClientType(currentOriginator);
      fileSummary.cliVersion = record.payload?.cli_version || null;
      fileSummary.modelProvider = record.payload?.model_provider || null;
      return;
    }

    if (record.type === 'turn_context') {
      currentModel = record.payload?.model || currentModel;
      currentCwd = record.payload?.cwd || currentCwd;
      currentReasoningEffort = getReasoningEffort(record.payload) || currentReasoningEffort;
      return;
    }

    if (record.type === 'event_msg') {
      currentReasoningEffort = getReasoningEffort(record.payload) || currentReasoningEffort;
    }
    if (record.type !== 'event_msg' || record.payload?.type !== 'token_count') return;

    const tokenInfo = record.payload?.info;
    const usage = tokenInfo?.last_token_usage;
    if (!usage) {
      if (tokenInfo != null) {
        warnings.push({
          type: 'missing_last_usage',
          message: `${filePath}:${index + 1}: token_count 缺少 last_token_usage`,
        });
      }
      return;
    }

    const timestamp = record.timestamp;
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
      warnings.push({
        type: 'invalid_timestamp',
        message: `${filePath}:${index + 1}: token_count 时间戳无效`,
      });
      return;
    }
    const date = formatShanghaiDate(timestamp);
    const inputTokens = getTokenCount(usage.input_tokens, 'input_tokens', filePath, index, warnings);
    const rawCachedInputTokens = getTokenCount(usage.cached_input_tokens, 'cached_input_tokens', filePath, index, warnings);
    const cachedInputTokens = Math.min(inputTokens, rawCachedInputTokens);
    if (rawCachedInputTokens > inputTokens) {
      warnings.push({
        type: 'cached_input_exceeds_input',
        message: `${filePath}:${index + 1}: cached_input_tokens 大于 input_tokens，已按 input_tokens 计`,
      });
    }
    const outputTokens = getTokenCount(usage.output_tokens, 'output_tokens', filePath, index, warnings);
    const reasoningOutputTokens = getTokenCount(usage.reasoning_output_tokens, 'reasoning_output_tokens', filePath, index, warnings);
    const declaredTotalTokens = Number(usage.total_tokens);
    const hasValidDeclaredTotal = usage.total_tokens != null
      && Number.isFinite(declaredTotalTokens)
      && declaredTotalTokens >= 0;
    if (usage.total_tokens != null && !hasValidDeclaredTotal) {
      warnings.push({
        type: 'invalid_token_count',
        message: `${filePath}:${index + 1}: total_tokens 不是有效的非负数，已按 input_tokens + output_tokens 计`,
      });
    }
    const totalTokens = hasValidDeclaredTotal ? declaredTotalTokens : inputTokens + outputTokens;

    events.push({
      id: `${sessionId}:${index + 1}`,
      timestamp,
      date,
      source: source.key,
      sourceLabel: source.label,
      filePath,
      sessionId,
      sessionName: getSessionName(sessionId, sessionNames),
      cwd: currentCwd,
      projectName: getProjectName(currentCwd, workspaceLabels),
      originator: currentOriginator,
      client: getClientType(currentOriginator),
      model: currentModel,
      reasoningEffort: currentReasoningEffort,
      planType: record.payload?.plan_type || null,
      inputTokens,
      cachedInputTokens,
      uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens),
      outputTokens,
      reasoningOutputTokens,
      totalTokens,
      modelContextWindow: record.payload?.info?.model_context_window || null,
      rateLimits: record.payload?.rate_limits || null,
    });
    fileSummary.eventCount += 1;
  });

  fileSummary.sessionId = fileSummary.sessionId || sessionId;
  fileSummary.sessionName = fileSummary.sessionName || getSessionName(sessionId, sessionNames);
  fileSummary.cwd = fileSummary.cwd || currentCwd;
  fileSummary.projectName = fileSummary.projectName || getProjectName(currentCwd, workspaceLabels);
  fileSummary.originator = fileSummary.originator || currentOriginator;
  fileSummary.client = fileSummary.client || getClientType(currentOriginator);

  return { file: fileSummary, events, warnings };
}

function getTokenCount(value, field, filePath, index, warnings) {
  if (value == null) return 0;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  warnings.push({
    type: 'invalid_token_count',
    message: `${filePath}:${index + 1}: ${field} 不是有效的非负数，已按 0 计`,
  });
  return 0;
}

function getReasoningEffort(payload) {
  const effort = payload?.reasoning_effort
    || payload?.effort
    || payload?.thread_settings?.reasoning_effort
    || payload?.thread_settings?.collaboration_mode?.settings?.reasoning_effort
    || payload?.collaboration_mode?.settings?.reasoning_effort;
  return typeof effort === 'string' && effort ? effort.toLowerCase() : null;
}

function getClientType(originator) {
  if (originator === 'Codex Desktop') return 'desktop';
  if (originator === 'codex_vscode') return 'vscode';
  if (originator === 'codex_exec') return 'exec';
  return 'cli';
}

function cleanThreadName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('<ide_opened_file>')) return 'IDE 文件上下文';
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
}

function getSessionName(sessionId, sessionNames) {
  return sessionNames.get(sessionId) || shortSessionId(sessionId);
}

function shortSessionId(sessionId = '') {
  return sessionId.length > 14 ? `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}` : sessionId;
}

function getProjectName(cwd, workspaceLabels) {
  if (!cwd || cwd === 'unknown') return 'unknown';
  if (workspaceLabels.has(cwd)) return workspaceLabels.get(cwd);
  const normalized = cwd.replace(/\/+$/, '');
  return path.basename(normalized) || normalized;
}

function formatShanghaiDate(timestamp) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(timestamp));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer({
    staticMode: process.argv.includes('--static'),
  });
}
