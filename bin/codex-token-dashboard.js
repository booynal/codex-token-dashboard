#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const args = parseArgs(process.argv.slice(2));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('Missing built frontend. Run `npm run build` before starting the dashboard.');
  process.exit(1);
}

const host = args.host || process.env.HOST || '0.0.0.0';
const requestedPort = Number(args.port || process.env.PORT || 8787);
const port = await findOpenPort(host, requestedPort);
const codexDir = path.resolve(args.codexDir || process.env.CODEX_DIR || path.join(os.homedir(), '.codex'));
const includeArchived = !args.noArchived;

startServer({
  codexDir,
  distDir,
  host,
  port,
  includeArchived,
  quickMode: args.quick || undefined,
  staticMode: true,
});

const browserHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const url = `http://${browserHost}:${port}`;
console.log(`Local dashboard: ${url}`);
console.log(`Archived logs: ${includeArchived ? 'included' : 'disabled'}`);

if (!args.noOpen) {
  openBrowser(url);
}

function parseArgs(argv) {
  const parsed = {
    codexDir: '',
    host: '',
    port: '',
    noOpen: false,
    noArchived: false,
    quick: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [name, inlineValue] = arg.split('=');
    const readValue = () => inlineValue ?? argv[++i];

    if (name === '--codex-dir') parsed.codexDir = readValue();
    else if (name === '--host') parsed.host = readValue();
    else if (name === '--port') parsed.port = readValue();
    else if (arg === '--no-open') parsed.noOpen = true;
    else if (arg === '--no-archived') parsed.noArchived = true;
    else if (arg === '--quick') parsed.quick = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`codex-token-dashboard

Usage:
  codex-token-dashboard [options]

Options:
  --codex-dir <path>   Codex data directory. Defaults to ~/.codex
  --host <host>        Host to bind. Defaults to 0.0.0.0
  --port <port>        Preferred port. Defaults to 8787
  --no-open            Do not open the browser automatically
  --no-archived        Exclude ~/.codex/archived_sessions
  --quick              Scan recent seven days only; full history is loaded on demand
  -h, --help           Show this help message
`);
}

function findOpenPort(host, startPort) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once('error', () => tryPort(port + 1));
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, host);
    };
    tryPort(startPort);
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin'
    ? 'open'
    : platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const argsForCommand = platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url];

  const child = spawn(command, argsForCommand, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
