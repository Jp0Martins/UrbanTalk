// início na nuvem: com AUTO_DEMO=true insere os dados de demonstração (se ainda não existirem) e sobe o servidor
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const api = path.resolve(import.meta.dirname, '..', 'api');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (process.env.AUTO_DEMO === 'true') {
  const seed = spawnSync(npm, ['run', 'demo:seed'], { cwd: api, stdio: 'inherit' });
  if (seed.status !== 0) console.error('Não foi possível inserir os dados de demonstração; o servidor sobe mesmo assim.');
}

const server = spawn(npm, ['start'], { cwd: api, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));
server.on('exit', (code) => process.exit(code ?? 0));
