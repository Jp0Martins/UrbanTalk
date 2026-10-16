import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from '../config.js';
import type { Db } from '../db/knex.js';
import { HttpError, badRequest, fromZod, notFound } from '../lib/errors.js';
import { PHOTO_NAME_RE, removePhoto, storePhoto } from '../lib/photos.js';
import { requireAuth, requireCitizen } from '../middleware/auth.js';
import { filesOf, idParam, photoUpload, userLimiter } from '../lib/http.js';
import { answerInfo, giveFeedback } from './tracking.service.js';
import { explore, globalSearch, heatGrid, neighborhoodSummary } from './insights.service.js';
import {
  confirmOccurrence,
  createOccurrence,
  createSchema,
  findByIdempotencyKey,
  getOccurrence,
  IDEMPOTENCY_RE,
  listOccurrences,
  mapMarkers,
  parseFilters,
  parsePaging,
  userSummary,
} from './occurrences.service.js';

const parseId = (raw: string | string[]) => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id < 1) throw notFound('Ocorrência não encontrada.');
  return id;
};

export function occurrenceRoutes(db: Db, uploadDir: string) {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 12 },
  }).single('photo');

  // traduz erros do multer para mensagens claras
  const handleUpload = (req: Request, res: Response, next: NextFunction) =>
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
        return next(badRequest(`A foto pode ter até ${mb} MB.`, { photo: `Arquivo maior que ${mb} MB.` }));
      }
      if (err instanceof multer.MulterError) return next(badRequest('Envio inválido. Anexe apenas uma foto.', { photo: 'Envio inválido.' }));
      next(err);
    });

  const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.isTest ? 1000 : 30,
    keyGenerator: (req) => `u${req.user?.id ?? 0}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'too_many_requests', 'Você registrou muitas ocorrências na última hora. Tente novamente mais tarde.')),
  });

  const searchLimiter = userLimiter(1, 60, 'Muitas buscas em pouco tempo. Aguarde um instante.');

  router.get('/occurrences', async (req, res) => {
    const filters = parseFilters(req.query);
    const paging = parsePaging(req.query);
    res.json(await listOccurrences(db, filters, paging, req.user));
  });

  router.get('/occurrences/map', async (req, res) => {
    res.json(await mapMarkers(db, parseFilters(req.query)));
  });

  // concentração em grade e resumo por bairro, sempre sobre os mesmos filtros do mapa
  router.get('/occurrences/heat', async (req, res) => {
    res.json(await heatGrid(db, parseFilters(req.query)));
  });
  router.get('/occurrences/neighborhoods', async (req, res) => {
    res.json(await neighborhoodSummary(db, parseFilters(req.query)));
  });

  router.get('/explore', async (req, res) => {
    res.json(await explore(db, req.user, req.query));
  });
  router.get('/search', searchLimiter, async (req, res) => {
    res.json(await globalSearch(db, req.user, req.query));
  });

  router.get('/occurrences/:id', async (req, res) => {
    res.json(await getOccurrence(db, parseId(req.params.id), req.user));
  });

  router.post('/occurrences', requireCitizen, createLimiter, handleUpload, async (req, res) => {
    // chave enviada pelo navegador para cada formulário: repetir o envio não duplica a reclamação
    const rawKey = req.get('X-Idempotency-Key') ?? null;
    if (rawKey !== null && !IDEMPOTENCY_RE.test(rawKey)) throw badRequest('Chave de envio inválida.');
    const already = await findByIdempotencyKey(db, req.user!.id, rawKey);
    if (already) return res.status(200).json(await getOccurrence(db, already, req.user));

    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    const photo = req.file ? await storePhoto(uploadDir, req.file.buffer) : null;
    try {
      const { id, created } = await createOccurrence(db, req.user!, parsed.data, photo, rawKey);
      if (!created) await removePhoto(uploadDir, photo);
      res.status(created ? 201 : 200).json(await getOccurrence(db, id, req.user));
    } catch (err) {
      await removePhoto(uploadDir, photo);
      throw err;
    }
  });

  router.post('/occurrences/:id/confirmations', requireCitizen, async (req, res) => {
    const id = parseId(req.params.id);
    const confirmations = await confirmOccurrence(db, req.user!, id);
    res.status(201).json({ confirmations, confirmedByMe: true });
  });

  // resposta de quem registrou a um pedido de informação da equipe (foto opcional)
  router.post('/occurrences/:id/info-requests/:rid/answer', requireCitizen, photoUpload('photo', 1), async (req, res) => {
    const id = parseId(req.params.id);
    const file = filesOf(req)[0];
    const photo = file ? await storePhoto(uploadDir, file.buffer) : null;
    try {
      await answerInfo(db, req.user!, id, idParam(req.params.rid, 'Pedido não encontrado.'), req.body, photo);
    } catch (err) {
      await removePhoto(uploadDir, photo);
      throw err;
    }
    res.status(201).json(await getOccurrence(db, id, req.user));
  });

  const feedbackLimiter = userLimiter(60, 30, 'Muitas avaliações em pouco tempo. Tente mais tarde.');
  router.post('/occurrences/:id/feedback', requireAuth, feedbackLimiter, async (req, res) => {
    const id = parseId(req.params.id);
    await giveFeedback(db, req.user!, id, req.body);
    res.status(201).json(await getOccurrence(db, id, req.user));
  });

  router.get('/me/occurrences', requireAuth, async (req, res) => {
    const filters = parseFilters(req.query);
    const paging = parsePaging(req.query);
    res.json(await listOccurrences(db, filters, paging, req.user, req.user!.id));
  });

  router.get('/me/summary', requireAuth, async (req, res) => {
    res.json(await userSummary(db, req.user!));
  });

  // fotos de ocorrências são públicas como as próprias ocorrências; nome validado contra path traversal
  router.get('/photos/:name', (req, res, next) => {
    const name = String(req.params.name);
    if (!PHOTO_NAME_RE.test(name)) return next(notFound('Foto não encontrada.'));
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(path.join(uploadDir, name), { dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) next(notFound('Foto não encontrada.'));
    });
  });

  return router;
}
