// prepara o projeto do zero: dependências, .env com segredo gerado na hora e banco
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const run = (cmd, cwd = root) => {
  console.log(`\n> ${cmd}  (${path.relative(root, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
};

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Node ${process.versions.node} detectado. Instale o Node 22.13 ou mais novo (LTS 22 ou 24).`);
  process.exit(1);
}

run('npm install', path.join(root, 'api'));
run('npm install', path.join(root, 'web'));

const envFile = path.join(root, 'api', '.env');
if (!fs.existsSync(envFile)) {
  const example = fs.readFileSync(path.join(root, 'api', '.env.example'), 'utf8');
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(envFile, example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
  console.log('\nArquivo api/.env criado com um JWT_SECRET aleatório.');
} else {
  console.log('\napi/.env já existe, mantido como está.');
}

run('npm run migrate', path.join(root, 'api'));

console.log(`
Pronto. Próximos passos:
  npm run admin:create -- --email seu@email.com --name "Seu nome"   cria uma conta de administração
  npm run staff:create -- --email seu@email.com --name "Seu nome"   cria um funcionário    
  npm run demo:seed                                                 (opcional) insere dados FICTÍCIOS de demonstração
  npm start                                                         compila o site e abre em http://localhost:3000
  npm run dev                                                       modo desenvolvimento em http://localhost:4200
`);
