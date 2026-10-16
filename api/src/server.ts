import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { createDb, prepareDb } from './db/knex.js';

const db = createDb(config.databaseFile);
await prepareDb(db);

const app = createApp({ db, uploadDir: config.uploadDir, webDist: config.webDist });
const server = http.createServer(app);
server.listen(config.port, () => {
  console.log(`UrbanTalk rodando em http://localhost:${config.port}`);
});

// porta ocupada (outra cópia rodando, por exemplo): avisa e encerra em vez de ficar parado
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${config.port} já está em uso. Feche o outro processo ou mude PORT no arquivo api/.env.`);
  } else {
    console.error('Não foi possível iniciar o servidor:', err.message);
  }
  process.exit(1);
});

const stop = async () => {
  server.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
