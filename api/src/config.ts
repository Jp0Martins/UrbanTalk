import path from 'node:path';
import 'dotenv/config';

// raiz da pasta api, independente de onde o processo foi iniciado
const apiRoot = path.resolve(import.meta.dirname, '..');

function resolveFromApi(p: string) {
  return path.isAbsolute(p) ? p : path.resolve(apiRoot, p);
}

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (!isTest && jwtSecret.length < 32) {
  console.error(
    'JWT_SECRET ausente ou curto demais (mínimo 32 caracteres). Rode "npm run setup" na raiz do projeto para gerar o arquivo .env.',
  );
  process.exit(1);
}

export const config = {
  isProduction,
  isTest,
  port: Number(process.env.PORT ?? 3000),
  databaseFile: resolveFromApi(process.env.DATABASE_FILE ?? './data/urbantalk.sqlite'),
  uploadDir: resolveFromApi(process.env.UPLOAD_DIR ?? './data/uploads'),
  webDist: resolveFromApi(process.env.WEB_DIST ?? '../web/dist/web/browser'),
  jwtSecret: isTest ? 'test-secret-test-secret-test-secret-000' : jwtSecret,
  sessionDays: 7,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // origens extras liberadas no CORS; vazio = só mesma origem
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 5) * 1024 * 1024,
  // tiles do mapa, também usados na política de segurança (CSP)
  mapTileHosts: (process.env.MAP_TILE_HOSTS ?? 'https://*.tile.openstreetmap.org')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
};
