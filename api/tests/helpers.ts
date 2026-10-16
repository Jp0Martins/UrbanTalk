import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, prepareDb, type Db } from '../src/db/knex.js';
import { hashPassword } from '../src/lib/password.js';

export const H = { 'X-Requested-With': 'UrbanTalk' };
export const CENTRO = { latitude: -23.5015, longitude: -47.4583 };

export async function setup() {
  const db = createDb(':memory:');
  await prepareDb(db);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ut-test-'));
  const app = createApp({ db, uploadDir });
  return { db, app, uploadDir };
}

export type Ctx = Awaited<ReturnType<typeof setup>>;

let seq = 0;
// cria e autentica um cidadão; devolve um agente que mantém o cookie de sessão
export async function citizen(ctx: Ctx, name = 'Pessoa Teste') {
  const agent = request.agent(ctx.app);
  const email = `pessoa${++seq}@teste.com`;
  const res = await agent.post('/api/auth/register').set(H).send({ name, email, password: 'senha1234' });
  if (res.status !== 201) throw new Error(`cadastro falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: number; email: string } };
}

// funcionário criado direto no banco, como faz o script de provisionamento
export async function employee(ctx: Ctx, role: 'staff' | 'admin' = 'staff', name = 'Funcionária Teste') {
  const email = `${role}${++seq}@teste.com`;
  const [id] = await ctx.db('users').insert({
    name,
    email,
    password_hash: await hashPassword('equipe1234'),
    role,
    created_at: new Date().toISOString(),
  });
  const agent = request.agent(ctx.app);
  const res = await agent.post('/api/auth/login').set(H).send({ email, password: 'equipe1234', profile: 'funcionario' });
  if (res.status !== 200) throw new Error(`login ${role} falhou: ${JSON.stringify(res.body)}`);
  return { agent, user: { id: id as number, email } };
}

export const admin = (ctx: Ctx) => employee(ctx, 'admin', 'Admin');

export async function ids(db: Db) {
  const cats = await db('categories').select('id', 'slug');
  return {
    cat: (slug: string) => cats.find((c) => c.slug === slug)!.id as number,
    // bairro agora é texto livre: o "id" é o próprio nome
    hood: (name: string) => name,
  };
}

export async function createOcc(
  agent: ReturnType<typeof request.agent>,
  fields: {
    categoryId: number;
    neighborhoodId?: string;
    scope?: 'cidade' | 'bairro';
    description?: string;
    latitude?: number;
    longitude?: number;
    street?: string;
    categoryDetail?: string;
  },
) {
  const req = agent.post('/api/occurrences').set(H);
  if (fields.street) req.field('street', fields.street);
  if (fields.categoryDetail) req.field('categoryDetail', fields.categoryDetail);
  const scope = fields.scope ?? 'bairro';
  req.field('scope', scope);
  if (scope === 'bairro') {
    req.field('neighborhoodName', fields.neighborhoodId ?? 'Centro');
    req.field('latitude', String(fields.latitude ?? CENTRO.latitude)).field('longitude', String(fields.longitude ?? CENTRO.longitude));
  } else if (fields.latitude !== undefined) {
    req.field('latitude', String(fields.latitude)).field('longitude', String(fields.longitude));
  }
  const res = await req
    .field('categoryId', String(fields.categoryId))
    .field('description', fields.description ?? 'Buraco grande no meio da rua principal.');
  if (res.status !== 201) throw new Error(`criação falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: number; createdAt: string };
}

export function pngWithExif() {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 80, b: 20 } } })
    .png()
    .withExif({ IFD0: { Make: 'TelefoneTeste', Model: 'ModeloSecreto' } })
    .toBuffer();
}
