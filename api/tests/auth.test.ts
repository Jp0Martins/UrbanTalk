import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { H, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeEach(async () => {
  ctx = await setup();
});

describe('cadastro e login', () => {
  it('cadastra, mantém sessão em cookie httpOnly e ignora tentativa de virar admin', async () => {
    const agent = request.agent(ctx.app);
    const res = await agent
      .post('/api/auth/register')
      .set(H)
      .send({ name: 'Ana', email: 'ANA@Exemplo.com ', password: 'senha1234', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ana', email: 'ana@exemplo.com', role: 'user' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ut_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('user');
    const stored = await ctx.db('users').where({ email: 'ana@exemplo.com' }).first();
    expect(stored.role).toBe('user');
    expect(stored.password_hash).toMatch(/^scrypt\$/);
    expect(stored.password_hash).not.toContain('senha1234');
  });

  it('valida campos e explica o erro por campo', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .set(H)
      .send({ name: 'A', email: 'nao-e-email', password: 'curta' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password']);
  });

  it('exige letra e número na senha', async () => {
    const res = await request(ctx.app).post('/api/auth/register').set(H).send({ name: 'Ana', email: 'a@b.com', password: 'somenteletras' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.password).toMatch(/número/);
  });

  it('recusa e-mail duplicado', async () => {
    const body = { name: 'Ana', email: 'ana@exemplo.com', password: 'senha1234' };
    await request(ctx.app).post('/api/auth/register').set(H).send(body);
    const res = await request(ctx.app).post('/api/auth/register').set(H).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('login com senha errada e com e-mail inexistente devolve a mesma mensagem', async () => {
    await request(ctx.app).post('/api/auth/register').set(H).send({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha1234' });
    const wrong = await request(ctx.app).post('/api/auth/login').set(H).send({ email: 'ana@exemplo.com', password: 'errada123' });
    const missing = await request(ctx.app).post('/api/auth/login').set(H).send({ email: 'ninguem@exemplo.com', password: 'errada123' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it('login e logout', async () => {
    await request(ctx.app).post('/api/auth/register').set(H).send({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha1234' });
    const agent = request.agent(ctx.app);
    expect((await agent.post('/api/auth/login').set(H).send({ email: 'ana@exemplo.com', password: 'senha1234' })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.post('/api/auth/logout').set(H)).status).toBe(204);
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(200);
    expect(after.body.user).toBeNull();
    // e as rotas protegidas voltam a recusar
    expect((await agent.get('/api/me/summary')).status).toBe(401);
  });

  it('recusa token adulterado', async () => {
    const res = await request(ctx.app).get('/api/me/summary').set('Cookie', 'ut_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinaturafalsa');
    expect(res.status).toBe(401);
    const me = await request(ctx.app).get('/api/auth/me').set('Cookie', 'ut_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinaturafalsa');
    expect(me.body.user).toBeNull();
  });

  it('bloqueia requisição de escrita sem o cabeçalho da aplicação', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({ name: 'Ana', email: 'a@b.com', password: 'senha1234' });
    expect(res.status).toBe(403);
  });
});
