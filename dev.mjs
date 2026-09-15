import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('.', import.meta.url));
const windows = process.platform === 'win32';
const python = join(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const missing = [];
if (!existsSync(python)) missing.push('Create .venv and install ML/requirements.txt (see README.md).');
for (const folder of ['client', 'server']) {
  if (!existsSync(join(root, folder, 'node_modules'))) missing.push(`Run npm ci in ${folder}/.`);
}
if (!missing.length) {
  const check = spawnSync(python, ['-c', 'import uvicorn; import ML.src.api.main'], { cwd: root, encoding: 'utf8' });
  if (check.status !== 0) missing.push('ML service could not load. Install ML/requirements.txt in .venv and check the model artifacts.\n' + (check.stderr || check.error?.message || ''));
}
if (missing.length) {
  console.error('[dev] Setup required:\n' + missing.join('\n'));
  process.exit(1);
}

const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('[dev] Stopping all services…');
  await Promise.all(children.map(child => new Promise(resolve => {
    if (windows) {
      // Kill only the process tree started by this launcher, including reload workers.
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', resolve);
      killer.once('exit', resolve);
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { resolve(); return; }
      const timer = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        resolve();
      }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    }
  })));
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => {
  if (input.trim().toLowerCase() === 'q' || input.includes('\u0003')) stop();
});
process.stdin.resume();

function start(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd, detached: !windows, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  if (child.pid) children.push(child);
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', line => console.log(`[${name}] ${line}`));
  }
  child.once('error', error => {
    console.error(`[${name}] Failed to start: ${error.message}`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[${name}] Exited unexpectedly (${signal || code}).`);
      stop(code || 1);
    }
  });
}

console.log('[dev] Starting DePhish. Ctrl+C (or q + Enter) stops all services.');
start('ml', python, ['-m', 'uvicorn', 'ML.src.api.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload', '--reload-dir', 'ML/src'], root);
start('server', process.execPath, ['--watch', '--watch-path=src', 'src/server.js'], join(root, 'server'));
start('client', process.execPath, ['node_modules/vite/bin/vite.js'], join(root, 'client'));
