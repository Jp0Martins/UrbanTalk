import { config } from '../config.js';
import { createDb, prepareDb } from '../db/knex.js';

const db = createDb(config.databaseFile);
const rollback = process.argv.includes('--rollback');

if (rollback) {
  const [batch, files] = await db.migrate.rollback();
  console.log(`Rollback do lote ${batch}: ${files.length ? files.join(', ') : 'nada a desfazer'}`);
} else {
  const [, before] = await db.migrate.list();
  await prepareDb(db);
  console.log(
    before.length
      ? `Migrações aplicadas: ${before.map((m: { file: string }) => m.file).join(', ')}`
      : 'Banco já está atualizado.',
  );
  console.log('Categorias, status e fóruns oficiais conferidos.');
  console.log(`Banco: ${config.databaseFile}`);
}
await db.destroy();
