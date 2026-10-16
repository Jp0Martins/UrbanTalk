import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import type { Db } from './db/knex.js';
import { HttpError } from './lib/errors.js';
import { loadUser, requireAppHeader } from './middleware/auth.js';
import { adminRoutes } from './modules/admin.routes.js';
import { adminExtraRoutes } from './modules/admin-extra.routes.js';
import { authRoutes } from './modules/auth.routes.js';
import { catalogRoutes } from './modules/catalog.routes.js';
import { communityRoutes } from './modules/community.routes.js';
import { occurrenceRoutes } from './modules/occurrences.routes.js';
import { participationRoutes } from './modules/participation.routes.js';
import { notificationRoutes } from './modules/notifications.routes.js';
import './types.js';

export interface AppOptions {
  db: Db;
  uploadDir: string;
  webDist?: string;
}

export function createApp({ db, uploadDir, webDist }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // Leaflet e Angular aplicam estilos inline
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', ...config.mapTileHosts],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.cookieSecure ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      // o OSM exige Referer nas requisições de tiles (o padrão do helmet é no-referrer)
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // CORS restrito: só as origens listadas em CORS_ORIGINS (vazio = mesma origem apenas)
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    next();
  });

  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireAppHeader);
  api.use(loadUser(db));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes(db));
  api.use(catalogRoutes(db));
  api.use(occurrenceRoutes(db, uploadDir));
  api.use('/admin', adminRoutes(db, uploadDir));
  api.use('/admin', adminExtraRoutes(db));
  api.use('/community', communityRoutes(db));
  api.use('/notifications', notificationRoutes(db));
  api.use(participationRoutes(db, uploadDir));
  api.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Endereço da API não encontrado.')));
  app.use('/api', api);

  // em produção, a própria API serve o front-end já compilado
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, file) => {
          const name = path.basename(file);
          // arquivos com hash no nome nunca mudam; ícones e manifesto sempre revalidam para a troca de favicon aparecer
          if (/-[A-Z0-9]{8}\.(js|css)$/.test(name)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (/^(favicon|apple-touch-icon|icon-)|\.webmanifest$/.test(name)) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  // tratamento único de erros: nunca expõe stack, SQL ou dados internos
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    }
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Corpo da requisição inválido.' } });
    }
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'too_large', message: 'Requisição grande demais.' } });
    }
    console.error('[erro interno]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Erro inesperado no servidor. Tente novamente em instantes.' } });
  });

  return app;
}
