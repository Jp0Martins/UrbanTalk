import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { Db } from '../db/knex.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { isStaffRole, type SessionUser } from '../types.js';

export const SESSION_COOKIE = 'ut_session';

export function signSession(userId: number) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionDays}d`,
  });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 86_400_000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}

// lê o cookie e carrega o usuário do banco; o papel vem sempre do banco, nunca do token
export function loadUser(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub?: string };
      const id = Number(payload.sub);
      if (!Number.isInteger(id)) throw new Error('sub inválido');
      const user = await db('users').select('id', 'name', 'email', 'role').where({ id }).first<SessionUser>();
      if (user) req.user = user;
      else clearSessionCookie(res);
    } catch {
      clearSessionCookie(res);
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

// funcionários (staff e admin); o papel vem do banco a cada requisição
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!isStaffRole(req.user.role)) return next(forbidden('Esta área é restrita aos funcionários do UrbanTalk.'));
  next();
}

// gestão de status e da equipe: só administradores
export function requireManager(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Só administradores podem fazer esta alteração.'));
  next();
}

// ações de cidadão (registrar, confirmar): contas de funcionário não entram aqui
export function requireCitizen(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'user') return next(forbidden('Contas de funcionário não registram nem confirmam reclamações. Use uma conta de cliente.'));
  next();
}

// barreira simples contra CSRF: requisições que alteram dados precisam deste cabeçalho,
// que um formulário de outro site não consegue enviar sem passar pelo CORS
export function requireAppHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'UrbanTalk') {
    return next(forbidden('Requisição recusada: cabeçalho de aplicação ausente.'));
  }
  next();
}
