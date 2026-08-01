import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = os.homedir();
const DEFAULT_CODEX_DIR = path.join(HOME, '.codex');
const RECENT_DAYS = 7;
const BACKGROUND_SCAN_DELAY_MS = 100;

export function createApp(options = {}) {
  const app = express();
  const config = normalizeConfig(options);
  let cache = null;
  let recentScanPromise = null;
  let scanGeneration = 0;
  let fullScanGeneration = null;

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
        recentScanPromise = recentScanPromise || startUsageScan().finally(() => {
          recentScanPromise = null;
        });
        res.json(await recentScanPromise);
        return;
      }
      res.json(cache);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/refresh', async (_req, res) => {
    try {
      res.json(await startUsageScan());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/scan-full', async (_req, res) => {
    try {
      if (!cache) {
        await startUsageScan();
        res.json(startFullScan(scanGeneration));
        return;
      }
      res.json(startFullScan(scanGeneration));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  async function startUsageScan() {
    const generation = ++scanGeneration;
    const recentStartDate = getRecentStartDate();
    const recentResult = await scanUsage(config, { minDate: recentStartDate });
    if (generation !== scanGeneration) return cache;

    cache = withScanStatus(recentResult, {
      state: config.quickMode ? 'ready' : 'scanning',
      recentStartDate,
      quickMode: config.quickMode,
    });
    console.log(formatScanLog('Recent seven-day scan complete', recentResult));
    if (!config.quickMode) startFullScan(generation);
    return cache;
  }

  function startFullScan(generation) {
    if (!cache || fullScanGeneration === generation) return cache;
    fullScanGeneration = generation;
    const recentStartDate = cache.scan?.recentStartDate || getRecentStartDate();
    cache = withScanStatus(cache, {
      state: 'scanning',
      recentStartDate,
      quickMode: config.quickMode,
    });
    console.log('Full-history scan started');
    setTimeout(() => {
      void completeFullScan(generation, recentStartDate);
    }, BACKGROUND_SCAN_DELAY_MS);
    return cache;
  }

  async function completeFullScan(generation, recentStartDate) {
    try {
      const fullResult = await scanUsage(config);
      if (generation !== scanGeneration) return;
      cache = withScanStatus(fullResult, {
        state: 'complete',
        recentStartDate,
        quickMode: config.quickMode,
      });
      console.log(formatScanLog('Full-history scan complete', fullResult));
    } catch (error) {
      if (generation !== scanGeneration || !cache) return;
      fullScanGeneration = null;
      cache = withScanStatus(cache, {
        state: 'failed',
        recentStartDate,
        quickMode: config.quickMode,
        error: error.message,
      });
      console.error(`Full-history scan failed: ${error.message}`);
    }
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

async function scanUsage(config, { minDate = '' } = {}) {
  const startedAt = new Date();
  const warnings = [];
  const events = [];
  const files = [];
  const sourceDirs = getSourceDirs(config);
  const sessionNames = readSessionNames(config.codexDir, warnings);
  const workspaceLabels = readWorkspaceLabels(config.codexDir, warnings);

  for (const source of sourceDirs) {
    const rolloutFiles = listRolloutFiles(source.dir, warnings, minDate);
    for (const file of rolloutFiles) {
      const parsed = parseRolloutFile(file, source, warnings, sessionNames, workspaceLabels, minDate);
      files.push(parsed.file);
      events.push(...parsed.events);
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

function getSourceDirs(config) {
  const dirs = [
    { key: 'current', label: '当前日志', dir: path.join(config.codexDir, 'sessions') },
  ];
  if (config.includeArchived) {
    dirs.push({ key: 'archived', label: '归档日志', dir: path.join(config.codexDir, 'archived_sessions') });
  }
  return dirs;
}

function listRolloutFiles(root, warnings, minDate = '') {
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
        if (minDate && !isRecentRolloutFile(fullPath, minDate, warnings)) continue;
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

function isRecentRolloutFile(filePath, minDate, warnings) {
  const pathDate = getDateFromPath(filePath);
  if (pathDate && pathDate >= minDate) return true;

  try {
    return formatShanghaiDate(fs.statSync(filePath).mtime) >= minDate;
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

function parseRolloutFile(filePath, source, warnings, sessionNames, workspaceLabels, minDate = '') {
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
    return { file: fileSummary, events };
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

    const timestamp = record.timestamp || new Date(0).toISOString();
    const date = formatShanghaiDate(timestamp);
    if (minDate && date < minDate) return;
    const inputTokens = Number(usage.input_tokens || 0);
    const cachedInputTokens = Number(usage.cached_input_tokens || 0);
    const outputTokens = Number(usage.output_tokens || 0);
    const reasoningOutputTokens = Number(usage.reasoning_output_tokens || 0);
    const totalTokens = Number(
      usage.total_tokens || inputTokens + outputTokens
    );

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

  return { file: fileSummary, events };
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
