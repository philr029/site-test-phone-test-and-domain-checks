/**
 * Start dashboard UI + API in one terminal.
 * Press Ctrl+C to stop both.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = process.env.DASHBOARD_API_PORT || '3847';
const uiPort = process.env.DASHBOARD_PORT || '8080';

const children = [];

const start = (label, script) => {
  const child = spawn('node', [script], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env }
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${label}] exited with code ${code}`);
  });
  children.push(child);
  return child;
};

console.log('\nStarting QA Dashboard...\n');
console.log(`  UI:  http://127.0.0.1:${uiPort}`);
console.log(`  API: http://127.0.0.1:${apiPort}`);
console.log('\nPress Ctrl+C to stop.\n');

start('api', 'src/api/server.js');
start('ui', 'src/api/static-server.js');

const shutdown = () => {
  children.forEach((c) => c.kill('SIGTERM'));
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
