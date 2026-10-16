import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import type { Db } from '../db/knex.js';
import { HttpError, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  getPost,
  listComments,
  listPosts,
  setLike,
} from './community.service.js';

const parseId = (raw: string | string[], what: string) => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id < 1) throw notFound(what);
  return id;
};

// limite por pessoa para conter spam
const limiter = (limit: number, message: string) =>
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: config.isTest ? 1000 : limit,
    keyGenerator: (req) => `u${req.user?.id ?? 0}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'too_many_requests', message)),
  });

export function communityRoutes(db: Db) {
  const router = Router();
  router.use(requireAuth);

  const postLimiter = limiter(8, 'Você publicou bastante nos últimos minutos. Respire um pouco e tente daqui a pouco.');
  const commentLimiter = limiter(25, 'Muitos comentários em pouco tempo. Tente de novo em alguns minutos.');
  const likeLimiter = limiter(120, 'Muitas curtidas em pouco tempo. Tente de novo em alguns minutos.');

  router.get('/posts', async (req, res) => {
    res.json(await listPosts(db, req.user!, req.query));
  });
  router.get('/posts/:id', async (req, res) => {
    res.json(await getPost(db, req.user!, parseId(req.params.id, 'Publicação não encontrada.')));
  });
  router.post('/posts', postLimiter, async (req, res) => {
    res.status(201).json(await createPost(db, req.user!, req.body));
  });
  router.delete('/posts/:id', async (req, res) => {
    await deletePost(db, req.user!, parseId(req.params.id, 'Publicação não encontrada.'));
    res.status(204).end();
  });

  router.put('/posts/:id/like', likeLimiter, async (req, res) => {
    res.json(await setLike(db, req.user!, parseId(req.params.id, 'Publicação não encontrada.'), true));
  });
  router.delete('/posts/:id/like', likeLimiter, async (req, res) => {
    res.json(await setLike(db, req.user!, parseId(req.params.id, 'Publicação não encontrada.'), false));
  });

  router.get('/posts/:id/comments', async (req, res) => {
    res.json(await listComments(db, req.user!, parseId(req.params.id, 'Publicação não encontrada.'), req.query));
  });
  router.post('/posts/:id/comments', commentLimiter, async (req, res) => {
    res.status(201).json(await createComment(db, req.user!, parseId(req.params.id, 'Publicação não encontrada.'), req.body));
  });
  router.delete('/comments/:id', async (req, res) => {
    await deleteComment(db, req.user!, parseId(req.params.id, 'Comentário não encontrado.'));
    res.status(204).end();
  });

  return router;
}
