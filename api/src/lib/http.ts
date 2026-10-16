import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError, badRequest, notFound } from './errors.js';

// limite por pessoa (ou por IP para visitantes) para conter spam
export const userLimiter = (minutes: number, limit: number, message: string) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: config.isTest ? 10_000 : limit,
    keyGenerator: (req) => (req.user ? `u${req.user.id}` : `ip${ipKeyGenerator(req.ip ?? '')}`),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'too_many_requests', message)),
  });

// envio de fotos em memória; erros do multer viram mensagens claras
export function photoUpload(field: string, maxFiles: number) {
  const mw = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: maxFiles, fields: 20 },
  }).array(field, maxFiles);
  return (req: Request, res: Response, next: NextFunction) =>
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(badRequest(`Cada foto pode ter até ${mb} MB.`, { [field]: `Arquivo maior que ${mb} MB.` }));
      if (err instanceof multer.MulterError && (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')) {
        return next(badRequest(`Envie no máximo ${maxFiles} ${maxFiles === 1 ? 'foto' : 'fotos'}.`, { [field]: 'Fotos demais.' }));
      }
      if (err instanceof multer.MulterError) return next(badRequest('Envio inválido.', { [field]: 'Envio inválido.' }));
      next(err);
    });
}

export const filesOf = (req: Request) => (Array.isArray(req.files) ? req.files : []);

export const idParam = (raw: string | string[] | undefined, what: string) => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id < 1) throw notFound(what);
  return id;
};

// vários campos de foto no mesmo envio (ex.: antes e depois)
export function photoFields(fields: { name: string; maxCount: number }[]) {
  const mw = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: fields.reduce((a, f) => a + f.maxCount, 0), fields: 20 },
  }).fields(fields);
  return (req: Request, res: Response, next: NextFunction) =>
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(badRequest(`Cada foto pode ter até ${mb} MB.`, { photos: `Arquivo maior que ${mb} MB.` }));
      if (err instanceof multer.MulterError) return next(badRequest('Fotos demais ou envio inválido.', { photos: 'Envio inválido.' }));
      next(err);
    });
}

export const fieldFiles = (req: Request, name: string) => {
  const f = req.files as Record<string, Express.Multer.File[]> | undefined;
  return f && !Array.isArray(f) ? (f[name] ?? []) : [];
};
