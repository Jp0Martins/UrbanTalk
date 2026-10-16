import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import type { Db } from '../db/knex.js';
import { nowIso } from '../lib/dates.js';
import { HttpError, badRequest, conflict, forbidden, fromZod, unauthorized } from '../lib/errors.js';
import { getDummyHash, hashPassword, verifyPassword } from '../lib/password.js';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../middleware/auth.js';
import { isStaffRole } from '../types.js';

const email = z
  .string({ error: 'Informe seu e-mail.' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail longo demais.')
  .pipe(z.email({ error: 'Informe um e-mail válido, como nome@exemplo.com.' }));

// campos extras (como "role") são descartados: ninguém se cadastra como administrador
const nameField = z
  .string({ error: 'Informe seu nome.' })
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 letras.')
  .max(120, 'O nome pode ter até 120 caracteres.');

const newPassword = z
  .string({ error: 'Crie uma senha.' })
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'A senha pode ter até 128 caracteres.')
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra.')
  .regex(/\d/, 'A senha precisa ter pelo menos um número.');

const registerSchema = z.object({ name: nameField, email, password: newPassword });

// o perfil escolhido na tela só confere o papel que já está no banco; nunca o altera
const loginSchema = z.object({
  email,
  password: z.string({ error: 'Informe sua senha.' }).min(1, 'Informe sua senha.').max(128),
  profile: z.enum(['cliente', 'funcionario'], { error: 'Escolha o tipo de acesso.' }).default('cliente'),
});

const profileSchema = z.object({ name: nameField });
const passwordSchema = z.object({
  current: z.string({ error: 'Informe a senha atual.' }).min(1, 'Informe a senha atual.').max(128),
  next: newPassword,
});

const publicUser = (u: { id: number; name: string; email: string; role: string }) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export function authRoutes(db: Db) {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 1000 : 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'too_many_requests', 'Muitas tentativas. Aguarde alguns minutos e tente de novo.')),
  });

  router.post('/register', limiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    const { name, email, password } = parsed.data;

    const exists = await db('users').where({ email }).first('id');
    if (exists) throw conflict('email_taken', 'Já existe uma conta com este e-mail. Entre com sua senha.');

    const [id] = await db('users').insert({
      name,
      email,
      password_hash: await hashPassword(password),
      role: 'user',
      created_at: nowIso(),
    });
    setSessionCookie(res, signSession(id));
    res.status(201).json({ user: publicUser({ id, name, email, role: 'user' }) });
  });

  router.post('/login', limiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    const { email, password, profile } = parsed.data;

    const user = await db('users').where({ email }).first();
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : (await verifyPassword(password, await getDummyHash()), false);
    if (!user || !ok) throw unauthorized('E-mail ou senha incorretos.');

    // só depois da senha certa dizemos se o tipo de acesso não bate
    const staff = isStaffRole(user.role);
    if (profile === 'funcionario' && !staff) {
      throw forbidden('Esta conta é de cliente e não tem acesso de funcionário. Entre como Cliente.');
    }
    if (profile === 'cliente' && staff) {
      throw new HttpError(403, 'staff_account', 'Esta é uma conta de funcionário. Selecione "Funcionário" para entrar.');
    }

    setSessionCookie(res, signSession(user.id));
    res.json({ user: publicUser(user) });
  });

  router.patch('/me', requireAuth, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    await db('users').where({ id: req.user!.id }).update({ name: parsed.data.name });
    res.json({ user: publicUser({ ...req.user!, name: parsed.data.name }) });
  });

  router.post('/password', requireAuth, limiter, async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    const row = await db('users').where({ id: req.user!.id }).first('password_hash');
    if (!(await verifyPassword(parsed.data.current, row.password_hash))) {
      throw badRequest('A senha atual não confere.', { current: 'Senha atual incorreta.' });
    }
    if (parsed.data.current === parsed.data.next) throw badRequest('Escolha uma senha diferente da atual.', { next: 'Igual à atual.' });
    await db('users').where({ id: req.user!.id }).update({ password_hash: await hashPassword(parsed.data.next) });
    res.status(204).end();
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  // sessão atual; visitante recebe user: null (sem erro, para o site saber que não há login)
  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return router;
}
