import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { config } from '../config.js';
import { createDb, prepareDb } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { hashPassword } from '../lib/password.js';

// provisionamento de funcionários pelo terminal (quem roda já tem acesso ao servidor)
// uso:
//   npm run staff:create -- --email pessoa@exemplo.com --name "Nome"            (funcionário novo, senha gerada)
//   npm run staff:create -- --email pessoa@exemplo.com --role admin             (administrador: gerencia status e equipe)
//   npm run staff:create -- --email pessoa@exemplo.com --promote                (promove conta que já existe)
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'staff' },
    promote: { type: 'boolean', default: false },
  },
});

const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Informe um e-mail válido com --email.');
  process.exit(1);
}
const role = values.role === 'admin' ? 'admin' : values.role === 'staff' ? 'staff' : null;
if (!role) {
  console.error('Use --role staff (funcionário) ou --role admin (administrador).');
  process.exit(1);
}
const label = role === 'admin' ? 'administrador' : 'funcionário';

const db = createDb(config.databaseFile);
await prepareDb(db);
const existing = await db('users').where({ email }).first();

if (existing) {
  await db('users').where({ id: existing.id }).update({ role });
  await audit(db, null, 'equipe.terminal', 'user', existing.id, { antes: existing.role, depois: role });
  console.log(`A conta ${email} agora é ${label}.`);
} else if (values.promote) {
  console.error(`Não existe conta com o e-mail ${email}. Cadastre-se pelo site primeiro ou rode sem --promote.`);
  process.exitCode = 1;
} else {
  // senha aleatória, mostrada uma única vez; nunca há senha padrão
  const password = crypto.randomBytes(9).toString('base64url') + '7a';
  const [id] = await db('users').insert({
    name: values.name?.trim() || 'Equipe UrbanTalk',
    email,
    password_hash: await hashPassword(password),
    role,
    created_at: nowIso(),
  });
  await audit(db, null, 'equipe.terminal', 'user', id, { depois: role });
  console.log(`Conta de ${label} criada: ${email}`);
  console.log(`Senha gerada (anote, ela não será mostrada de novo): ${password}`);
  console.log('Depois de entrar, troque a senha em "Meu perfil".');
}
await db.destroy();
