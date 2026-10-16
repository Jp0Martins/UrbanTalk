import fs from 'node:fs';
import path from 'node:path';
import knexFactory, { type Knex } from 'knex';
import { NodeSqliteClient } from './node-sqlite-client.js';
import { seedBase, seedForums } from './seed-base.js';

export type Db = Knex;

const migrationsDir = path.resolve(import.meta.dirname, 'migrations');

export function createDb(filename: string): Db {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  return knexFactory({
    // SQLite nativo do Node; para PostgreSQL ou SQL Server, troque client/connection aqui
    client: NodeSqliteClient as unknown as Knex.Config['client'],
    connection: { filename },
    useNullAsDefault: true,
    // memória: uma única conexão, senão cada conexão vê um banco diferente
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: { pragma: (s: string) => void }, done: (err: Error | null, conn: unknown) => void) => {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done(null, conn);
      },
    },
    migrations: {
      directory: migrationsDir,
      loadExtensions: ['.ts', '.js'],
    },
  });
}

// cópia do arquivo do banco antes de aplicar migrações pendentes (algumas não têm volta automática)
async function backupBeforeMigrate(db: Db) {
  const filename = (db.client.config.connection as { filename: string }).filename;
  if (filename === ':memory:' || !fs.existsSync(filename)) return null;
  // banco novo (nenhuma migração aplicada ainda) não precisa de cópia
  if (!(await db.schema.hasTable('knex_migrations'))) return null;
  const [done, pending] = (await db.migrate.list()) as [unknown[], unknown[]];
  if (pending.length === 0 || done.length === 0) return null;
  const dir = path.join(path.dirname(filename), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(dir, `${path.basename(filename, path.extname(filename))}-${stamp}.sqlite`);
  // o próprio SQLite gera a cópia consistente (inclui o que ainda está no WAL), sem mexer no arquivo em uso
  await db.raw('VACUUM INTO ?', [target]);
  return target;
}

// aplica migrações pendentes (com cópia de segurança antes) e garante categorias e fóruns oficiais
export async function prepareDb(db: Db) {
  const backup = await backupBeforeMigrate(db);
  if (backup) console.log(`Cópia de segurança do banco antes da atualização: ${backup}`);
  await db.migrate.latest();
  await seedBase(db);
  await seedForums(db);
}
