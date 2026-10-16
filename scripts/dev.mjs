// sobe API (porta 3000) e Angular (porta 4200, com proxy para /api) ao mesmo tempo
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const isWin = process.platform === 'win32';

const procs = [
  { name: 'api', cwd: path.join(root, 'api'), args: ['run', 'dev'] },
  { name: 'web', cwd: path.join(root, 'web'), args: ['start'] },
].map(({ name, cwd, args }) => {
  // grupo de processos próprio, para encerrar também os filhos (ng serve, tsx)
  const p = spawn('npm', args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: !isWin });
  const tag = (chunk) =>
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .map((l) => `[${name}] ${l}`)
      .join('\n');
  p.stdout.on('data', (c) => console.log(tag(c)));
  p.stderr.on('data', (c) => console.error(tag(c)));
  p.on('exit', (code) => {
    console.log(`[${name}] encerrou (código ${code}). Parando tudo.`);
    shutdown();
  });
  return p;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (!p.pid || p.exitCode !== null) continue;
    if (isWin) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
    else {
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {
        // já encerrado
      }
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
