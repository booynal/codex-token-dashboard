import { access } from 'node:fs/promises';
import process from 'node:process';

const requireVite = process.argv.includes('--require-vite');
let vite;

try {
  vite = await import('vite');
} catch (error) {
  const viteIsUnavailable = error?.code === 'ERR_MODULE_NOT_FOUND'
    && error.message.includes("Cannot find package 'vite'");

  if (requireVite || !viteIsUnavailable) {
    throw error;
  }
}

if (vite) {
  await vite.build();
} else {
  try {
    await access(new URL('../dist/index.html', import.meta.url));
  } catch {
    console.error('Missing built frontend. Run `npm install && npm run build` before packaging the dashboard.');
    process.exitCode = 1;
  }
}
