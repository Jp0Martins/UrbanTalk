import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb, prepareDb } from '../src/db/knex.js';
import { todayLocal } from '../src/lib/dates.js';
import { CENTRO, H, citizen, createOcc, employee, ids, setup, type Ctx } from './helpers.js';

const login = (ctx: Ctx, email: string, password: string, profile?: string) =>
  request(ctx.app).post('/api/auth/login').set(H).send({ email, password, ...(profile ? { profile } : {}) });

describe('perfis de cliente e funcionário', () => {
  it('o tipo de acesso escolhido no login confere o papel do banco e nunca o altera', async () => {
    const ctx = await setup();
    const c = await citizen(ctx);
    const asStaff = await login(ctx, c.user.email, 'senha1234', 'funcionario');
    expect(asStaff.status).toBe(403);
    expect((await ctx.db('users').where({ id: c.user.id }).first()).role).toBe('user');
    expect((await login(ctx, c.user.email, 'senha1234', 'cliente')).status).toBe(200);
    // campo "role" extra no login é ignorado
    const forged = await request(ctx.app).post('/api/auth/login').set(H).send({ email: c.user.email, password: 'senha1234', role: 'admin' });
    expect(forged.body.user.role).toBe('user');

    const f = await employee(ctx);
    expect((await login(ctx, f.user.email, 'equipe1234', 'cliente')).body.error.code).toBe('staff_account');
    // senha errada continua com a mesma mensagem genérica, sem revelar o perfil
    const wrong = await login(ctx, f.user.email, 'errada123', 'cliente');
    expect(wrong.status).toBe(401);
  });

  it('cliente não executa nenhuma operação administrativa pela API', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const c = await citizen(ctx);
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const calls = [
      c.agent.get('/api/admin/overview'),
      c.agent.get('/api/admin/occurrences'),
      c.agent.get(`/api/admin/occurrences/${occ.id}`),
      c.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'resolvida' }),
      c.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ visibility: 'publica', body: 'Teste de invasão' }),
      c.agent.patch(`/api/admin/occurrences/${occ.id}/address`).set(H).send({ street: 'Rua Nova' }),
      c.agent.get('/api/admin/statuses'),
      c.agent.post('/api/admin/statuses').set(H).send({ name: 'Hackeado' }),
      c.agent.get('/api/admin/team'),
      c.agent.post('/api/admin/team').set(H).send({ email: c.user.email, role: 'admin' }),
      c.agent.get('/api/admin/reports/occurrences.pdf?from=2026-01-01&to=2026-01-31'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    expect((await ctx.db('occurrences').where({ id: occ.id }).first()).status).toBe('registrada');
    expect(await ctx.db('occurrence_notes').count({ n: '*' }).first()).toMatchObject({ n: 0 });
  });

  it('funcionário comum não gerencia status nem equipe; administrador sim, com auditoria', async () => {
    const ctx = await setup();
    const staff = await employee(ctx, 'staff');
    const boss = await employee(ctx, 'admin');
    expect((await staff.agent.get('/api/admin/statuses')).body.canManage).toBe(false);
    expect((await staff.agent.post('/api/admin/statuses').set(H).send({ name: 'Em análise' })).status).toBe(403);
    expect((await staff.agent.get('/api/admin/team')).status).toBe(403);

    const c = await citizen(ctx);
    const unknown = await boss.agent.post('/api/admin/team').set(H).send({ email: 'ninguem@teste.com', role: 'staff' });
    expect(unknown.status).toBe(400);
    const promote = await boss.agent.post('/api/admin/team').set(H).send({ email: c.user.email, role: 'staff' });
    expect(promote.status).toBe(201);
    expect((await ctx.db('users').where({ id: c.user.id }).first()).role).toBe('staff');
    const self = await boss.agent.patch(`/api/admin/team/${boss.user.id}`).set(H).send({ role: 'user' });
    expect(self.status).toBe(409);
    const log = await ctx.db('audit_log').where({ action: 'equipe.conceder', target_id: c.user.id }).first();
    expect(log.actor_id).toBe(boss.user.id);
  });

  it('funcionário não registra reclamação como cidadão', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const f = await employee(ctx);
    const res = await f.agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('buraco')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('description', 'Tentativa de registro pela equipe.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude));
    expect(res.status).toBe(403);
  });

  it('cliente altera o próprio nome e a senha', async () => {
    const ctx = await setup();
    const c = await citizen(ctx);
    expect((await c.agent.patch('/api/auth/me').set(H).send({ name: 'Nome Novo' })).body.user.name).toBe('Nome Novo');
    expect((await c.agent.post('/api/auth/password').set(H).send({ current: 'errada000', next: 'outra1234' })).status).toBe(400);
    expect((await c.agent.post('/api/auth/password').set(H).send({ current: 'senha1234', next: 'outra1234' })).status).toBe(204);
    expect((await login(ctx, c.user.email, 'outra1234')).status).toBe(200);
  });
});

describe('fluxo compartilhado entre cliente e funcionário', () => {
  it('a reclamação salva aparece para o cliente e para a equipe, que administra o andamento', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const c = await citizen(ctx);
    const f = await employee(ctx, 'staff', 'Diego Martins');

    // 1 e 2: registro com rua e bairro, salvo pelo servidor
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), street: '  Rua   XV de Novembro ' });
    const row = await ctx.db('occurrences').where({ id: occ.id }).first();
    expect(row).toMatchObject({ street: 'Rua XV de Novembro', status: 'registrada', user_id: c.user.id });
    const mine = await c.agent.get('/api/me/occurrences');
    expect(mine.body.items[0]).toMatchObject({ id: occ.id, street: 'Rua XV de Novembro', neighborhood: { name: 'Centro' } });

    // 3: o mesmo registro na área da equipe, sem recadastro
    const list = await f.agent.get('/api/admin/occurrences');
    expect(list.body.items.map((o: { id: number }) => o.id)).toEqual([occ.id]);
    expect(list.body.latestId).toBe(occ.id);
    const full = await f.agent.get(`/api/admin/occurrences/${occ.id}`);
    expect(full.body.reporter.email).toBe(c.user.email);

    // 4 e 5: equipe muda o status, cliente vê
    const upd = await f.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada', note: 'Enviada no relatório de outubro.' });
    expect(upd.status).toBe(200);
    const pub = await c.agent.get(`/api/occurrences/${occ.id}`);
    expect(pub.body.status).toBe('encaminhada');
    expect(pub.body.history.at(-1)).toMatchObject({ fromStatus: 'registrada', toStatus: 'encaminhada', changedBy: 'equipe', note: 'Enviada no relatório de outubro.' });
    // o cidadão não vê o nome do funcionário
    expect(JSON.stringify(pub.body)).not.toContain('Diego');

    // 8: o histórico guarda quem alterou
    const staffView = await f.agent.get(`/api/admin/occurrences/${occ.id}`);
    expect(staffView.body.history.at(-1).changedByName).toBe('Diego Martins');
    const hist = await ctx.db('status_history').where({ occurrence_id: occ.id }).orderBy('id');
    expect(hist.map((h) => [h.from_status, h.to_status, h.changed_by])).toEqual([
      [null, 'registrada', c.user.id],
      ['registrada', 'encaminhada', f.user.id],
    ]);

    // 6 e 7: anotação interna não chega ao cliente; atualização pública chega
    await f.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ visibility: 'interna', body: 'Ligar para a regional na segunda.' });
    await f.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ visibility: 'publica', body: 'Equipe da prefeitura avisada.' });
    const afterNotes = await c.agent.get(`/api/occurrences/${occ.id}`);
    expect(afterNotes.body.publicUpdates.map((u: { body: string }) => u.body)).toEqual(['Equipe da prefeitura avisada.']);
    expect(JSON.stringify(afterNotes.body)).not.toContain('regional');
    expect(afterNotes.body.notes).toBeUndefined();
    const anonymous = await request(ctx.app).get(`/api/occurrences/${occ.id}`);
    expect(JSON.stringify(anonymous.body)).not.toContain('regional');
    expect((await c.agent.get(`/api/admin/occurrences/${occ.id}`)).status).toBe(403);
    const staffNotes = (await f.agent.get(`/api/admin/occurrences/${occ.id}`)).body.notes;
    expect(staffNotes.map((n: { visibility: string; authorName: string }) => [n.visibility, n.authorName])).toEqual([
      ['interna', 'Diego Martins'],
      ['publica', 'Diego Martins'],
    ]);
    // tipo da anotação é obrigatório
    expect((await f.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ body: 'Sem tipo' })).status).toBe(400);
  });

  it('envio repetido com a mesma chave não duplica a reclamação', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const c = await citizen(ctx);
    const send = () =>
      c.agent
        .post('/api/occurrences')
        .set(H)
        .set('X-Idempotency-Key', 'chave-de-teste-1234567890')
        .field('categoryId', String(id.cat('lixo')))
        .field('scope', 'bairro').field('neighborhoodName', 'Centro')
        .field('description', 'Lixo acumulado na esquina há dias.')
        .field('latitude', String(CENTRO.latitude))
        .field('longitude', String(CENTRO.longitude));
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await ctx.db('occurrences').count({ n: '*' }).first()).toMatchObject({ n: 1 });
  });

  it('equipe corrige o endereço e a mudança fica auditada', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const c = await citizen(ctx);
    const f = await employee(ctx);
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const res = await f.agent.patch(`/api/admin/occurrences/${occ.id}/address`).set(H).send({ street: 'Rua da Penha', scope: 'bairro', neighborhoodName: '  campolim ' });
    expect(res.body).toMatchObject({ street: 'Rua da Penha', scope: 'bairro', neighborhood: { name: 'campolim', key: 'campolim' } });
    const log = await ctx.db('audit_log').where({ action: 'ocorrencia.endereco', target_id: occ.id }).first();
    expect(JSON.parse(log.details).antes.street).toBeNull();
    // trocar para cidade toda não deixa o bairro antigo para trás
    const city = await f.agent.patch(`/api/admin/occurrences/${occ.id}/address`).set(H).send({ scope: 'cidade' });
    expect(city.body).toMatchObject({ scope: 'cidade', neighborhood: null });
    const row = await ctx.db('occurrences').where({ id: occ.id }).first();
    expect([row.neighborhood_name, row.neighborhood_key]).toEqual([null, null]);
    // cidadão não corrige endereço
    expect((await c.agent.patch(`/api/admin/occurrences/${occ.id}/address`).set(H).send({ scope: 'cidade' })).status).toBe(403);
  });
});

describe('status personalizáveis', () => {
  it('cria, ordena, desativa e preserva o histórico antigo', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const boss = await employee(ctx, 'admin');
    const c = await citizen(ctx);
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });

    const created = await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Em análise', description: 'A equipe está avaliando.', color: 'violeta' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: 'em-analise', active: true, isClosed: false });
    expect((await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'em análise' })).status).toBe(400);
    expect((await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Outra', color: 'rosa-choque' })).status).toBe(400);

    // aparece no catálogo público e pode ser usado
    const catalog = await request(ctx.app).get('/api/statuses');
    expect(catalog.body.statuses.map((s: { slug: string }) => s.slug)).toContain('em-analise');
    expect((await boss.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'em-analise' })).status).toBe(200);

    // em uso: não pode ser excluído, só desativado
    expect((await boss.agent.delete(`/api/admin/statuses/${created.body.id}`).set(H)).status).toBe(409);
    const off = await boss.agent.patch(`/api/admin/statuses/${created.body.id}`).set(H).send({ active: false });
    expect(off.body.active).toBe(false);
    await boss.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada' });
    const reuse = await boss.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'em-analise' });
    expect(reuse.status).toBe(400);
    // o histórico continua mostrando o status desativado com o nome certo
    const detail = await c.agent.get(`/api/occurrences/${occ.id}`);
    expect(detail.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['registrada', 'em-analise', 'encaminhada']);
    expect((await request(ctx.app).get('/api/statuses')).body.statuses.find((s: { slug: string }) => s.slug === 'em-analise').name).toBe('Em análise');

    // status nunca usado pode ser excluído
    const temp = await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Temporário' });
    expect((await boss.agent.delete(`/api/admin/statuses/${temp.body.id}`).set(H)).status).toBe(204);

    // ordem de apresentação
    const all = (await boss.agent.get('/api/admin/statuses')).body.statuses.map((s: { id: number }) => s.id);
    const reordered = await boss.agent.put('/api/admin/statuses/order').set(H).send({ ids: [...all].reverse() });
    expect(reordered.body.statuses.map((s: { id: number }) => s.id)).toEqual([...all].reverse());
    expect((await boss.agent.put('/api/admin/statuses/order').set(H).send({ ids: all.slice(1) })).status).toBe(400);
  });

  it('troca o status inicial das novas reclamações sem permitir estados inválidos', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const boss = await employee(ctx, 'admin');
    const c = await citizen(ctx);
    const triagem = (await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Em triagem' })).body;
    const registrada = (await boss.agent.get('/api/admin/statuses')).body.statuses.find((s: { slug: string }) => s.slug === 'registrada');
    const resolvida = (await boss.agent.get('/api/admin/statuses')).body.statuses.find((s: { slug: string }) => s.slug === 'resolvida');

    expect((await boss.agent.patch(`/api/admin/statuses/${registrada.id}`).set(H).send({ active: false })).status).toBe(409);
    expect((await boss.agent.patch(`/api/admin/statuses/${resolvida.id}`).set(H).send({ isInitial: true })).status).toBe(409);
    expect((await boss.agent.patch(`/api/admin/statuses/${triagem.id}`).set(H).send({ isInitial: true })).body.isInitial).toBe(true);

    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    expect((await c.agent.get(`/api/occurrences/${occ.id}`)).body.status).toBe('em-triagem');
    const initials = await ctx.db('statuses').where({ is_initial: true });
    expect(initials).toHaveLength(1);
  });

  it('status encerrado bloqueia confirmações e entra como encerrado nos indicadores', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const boss = await employee(ctx, 'admin');
    const c = await citizen(ctx);
    await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Não procedente', isClosed: true, color: 'cinza' });
    const occ = await createOcc(c.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Centro') });
    await boss.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'nao-procedente' });
    const other = await citizen(ctx);
    expect((await other.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H)).status).toBe(409);
    const ind = (await boss.agent.get('/api/admin/indicators')).body;
    expect(ind).toMatchObject({ total: 1, open: 0, closed: 1 });
    expect((await c.agent.get('/api/me/summary')).body).toMatchObject({ open: 0, closed: 1 });
  });
});

describe('rua e categoria "Outros"', () => {
  it('"Outros" exige especificação; demais categorias ignoram o campo', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const c = await citizen(ctx);
    const cats = (await request(ctx.app).get('/api/categories')).body.categories;
    expect(cats.find((x: { slug: string }) => x.slug === 'outros')).toMatchObject({ requiresDetail: true });
    expect(cats.find((x: { slug: string }) => x.slug === 'buraco')).toMatchObject({ requiresDetail: false });

    const missing = await c.agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('outros')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('description', 'Problema que não está na lista.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude));
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.categoryDetail).toBeTruthy();

    const ok = await createOcc(c.agent, { categoryId: id.cat('outros'), neighborhoodId: id.hood('Centro'), categoryDetail: 'Árvore caída' });
    const detail = (await c.agent.get(`/api/occurrences/${ok.id}`)).body;
    expect(detail).toMatchObject({ category: { slug: 'outros' }, categoryDetail: 'Árvore caída' });
    const plain = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), categoryDetail: 'ignorar' });
    expect((await c.agent.get(`/api/occurrences/${plain.id}`)).body.categoryDetail).toBeNull();
    // nenhuma categoria nova criada a partir do texto livre
    expect(await ctx.db('categories').count({ n: '*' }).first()).toMatchObject({ n: 7 });

    const f = await employee(ctx);
    const ind = (await f.agent.get('/api/admin/indicators')).body;
    expect(ind.byCategory.find((x: { slug: string }) => x.slug === 'outros').count).toBe(1);
    const pdf = await f.agent.get(`/api/admin/reports/occurrences.pdf?from=2026-01-01&to=${todayLocal()}`);
    expect(pdf.status).toBe(200);
  });

  it('filtra por rua e encontra o endereço na busca', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const c = await citizen(ctx);
    await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), street: 'Rua da Penha' });
    await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), street: 'Avenida Dom Aguirre' });
    await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const f = await employee(ctx);
    expect((await f.agent.get('/api/admin/occurrences?street=penha')).body.total).toBe(1);
    expect((await request(ctx.app).get('/api/occurrences?q=aguirre')).body.total).toBe(1);
    // caracteres de busca são tratados como texto
    expect((await request(ctx.app).get('/api/occurrences?q=%25')).body.total).toBe(0);
    const tooShort = await c.agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('buraco')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('street', 'R')
      .field('description', 'Rua com nome curto demais.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude));
    expect(tooShort.status).toBe(400);
  });
});

describe('comunidade', () => {
  it('publica, comenta e curte, sem expor e-mail e sem curtida repetida', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx, 'Ana Ribeiro');
    const bia = await citizen(ctx, 'Beatriz Lima');

    // estado vazio
    expect((await ana.agent.get('/api/community/posts')).body).toEqual({ items: [], nextBefore: null });
    expect((await request(ctx.app).get('/api/community/posts')).status).toBe(401);

    const occ = await createOcc(ana.agent, { categoryId: id.cat('iluminacao'), neighborhoodId: id.hood('Centro'), street: 'Rua da Penha' });
    const post = await ana.agent.post('/api/community/posts').set(H).send({ body: 'Poste apagado faz uma semana.', occurrenceId: occ.id });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ author: { name: 'Ana R.', isMe: true }, occurrence: { id: occ.id, street: 'Rua da Penha' }, likes: 0, comments: 0 });
    expect(JSON.stringify(post.body)).not.toContain('@');
    // a publicação não vira reclamação oficial
    expect(await ctx.db('occurrences').count({ n: '*' }).first()).toMatchObject({ n: 1 });

    const like1 = await bia.agent.put(`/api/community/posts/${post.body.id}/like`).set(H);
    const like2 = await bia.agent.put(`/api/community/posts/${post.body.id}/like`).set(H);
    expect(like1.body).toEqual({ likes: 1, likedByMe: true });
    expect(like2.body).toEqual({ likes: 1, likedByMe: true });
    const comment = await bia.agent.post(`/api/community/posts/${post.body.id}/comments`).set(H).send({ body: 'Também passo por ali.' });
    expect(comment.body.author.name).toBe('Beatriz L.');

    const feed = (await ana.agent.get('/api/community/posts')).body.items[0];
    expect(feed).toMatchObject({ likes: 1, comments: 1, likedByMe: false });
    expect((await ana.agent.get(`/api/community/posts?occurrence=${occ.id}`)).body.items).toHaveLength(1);
    expect((await ana.agent.get('/api/community/posts?filter=minhas')).body.items).toHaveLength(1);
    expect((await bia.agent.get('/api/community/posts?filter=minhas')).body.items).toHaveLength(0);

    const unlike = await bia.agent.delete(`/api/community/posts/${post.body.id}/like`).set(H);
    expect(unlike.body).toEqual({ likes: 0, likedByMe: false });
  });

  it('valida conteúdo, barra repetição e protege conteúdo alheio', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx, 'Ana Ribeiro');
    const bia = await citizen(ctx, 'Beatriz Lima');
    expect((await ana.agent.post('/api/community/posts').set(H).send({ body: '  ' })).status).toBe(400);
    expect((await ana.agent.post('/api/community/posts').set(H).send({ body: 'x'.repeat(501) })).status).toBe(400);
    expect((await ana.agent.post('/api/community/posts').set(H).send({ body: 'veja http://a.com http://b.com http://c.com' })).status).toBe(400);
    expect((await ana.agent.post('/api/community/posts').set(H).send({ body: 'Oi', occurrenceId: 999 })).status).toBe(400);

    const p = await ana.agent.post('/api/community/posts').set(H).send({ body: 'Mensagem original da Ana.' });
    expect((await ana.agent.post('/api/community/posts').set(H).send({ body: 'Mensagem original da Ana.' })).status).toBe(409);
    // não dá para publicar em nome de outra pessoa
    const forged = await bia.agent.post('/api/community/posts').set(H).send({ body: 'Fingindo ser outra pessoa', author_id: 1, authorId: 1 });
    expect(forged.body.author.name).toBe('Beatriz L.');

    expect((await bia.agent.delete(`/api/community/posts/${p.body.id}`).set(H)).status).toBe(403);
    const f = await employee(ctx);
    expect((await f.agent.delete(`/api/community/posts/${p.body.id}`).set(H)).status).toBe(204);
    expect((await ana.agent.get('/api/community/posts')).body.items.map((x: { id: number }) => x.id)).not.toContain(p.body.id);
    const log = await ctx.db('audit_log').where({ action: 'moderacao.publicacao', target_id: p.body.id }).first();
    expect(log.actor_id).toBe(f.user.id);
    expect((await ana.agent.put(`/api/community/posts/${p.body.id}/like`).set(H)).status).toBe(404);
  });

  it('pagina o feed e carrega publicações anteriores', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    for (let i = 1; i <= 7; i++) await ana.agent.post('/api/community/posts').set(H).send({ body: `Publicação número ${i}` });
    const p1 = (await ana.agent.get('/api/community/posts?limit=3')).body;
    expect(p1.items.map((p: { body: string }) => p.body)).toEqual(['Publicação número 7', 'Publicação número 6', 'Publicação número 5']);
    const p2 = (await ana.agent.get(`/api/community/posts?limit=3&before=${p1.nextBefore}`)).body;
    const p3 = (await ana.agent.get(`/api/community/posts?limit=3&before=${p2.nextBefore}`)).body;
    expect(p3.items.map((p: { body: string }) => p.body)).toEqual(['Publicação número 1']);
    expect(p3.nextBefore).toBeNull();
  });
});

describe('persistência e migração', () => {
  it('reclamações, publicações e curtidas continuam lá depois de reiniciar a aplicação', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ut-persist-'));
    const file = path.join(dir, 'banco.sqlite');
    let db = createDb(file);
    await prepareDb(db);
    let ctx = { db, app: createApp({ db, uploadDir: dir }), uploadDir: dir };
    const id = await ids(db);
    const c = await citizen(ctx);
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), street: 'Rua da Penha' });
    const post = await c.agent.post('/api/community/posts').set(H).send({ body: 'Vai continuar aqui depois do reinício.' });
    await c.agent.post(`/api/community/posts/${post.body.id}/comments`).set(H).send({ body: 'Comentário que também fica.' });
    await db.destroy();

    db = createDb(file);
    await prepareDb(db);
    ctx = { db, app: createApp({ db, uploadDir: dir }), uploadDir: dir };
    const again = request.agent(ctx.app);
    await again.post('/api/auth/login').set(H).send({ email: c.user.email, password: 'senha1234' });
    expect((await again.get('/api/me/occurrences')).body.items[0]).toMatchObject({ id: occ.id, street: 'Rua da Penha' });
    const feed = (await again.get('/api/community/posts')).body.items;
    expect(feed[0]).toMatchObject({ id: post.body.id, comments: 1 });
    await db.destroy();
  });

  it('a migração preserva os registros criados na estrutura antiga', async () => {
    const db = createDb(':memory:');
    // só a primeira migração: banco no formato da versão anterior
    await db.migrate.up();
    const now = new Date().toISOString();
    await db('categories').insert({ slug: 'buraco', name: 'Buraco na via', description: 'x', icon: 'pothole', sort_order: 1 });
    await db('neighborhoods').insert({ name: 'Centro' });
    await db('users').insert([
      { name: 'Antiga', email: 'antiga@teste.com', password_hash: 'x', role: 'user', created_at: now },
      { name: 'Equipe', email: 'equipe@teste.com', password_hash: 'x', role: 'admin', created_at: now },
    ]);
    await db('occurrences').insert({ user_id: 1, category_id: 1, neighborhood_id: 1, description: 'Registro antigo', latitude: -23.5, longitude: -47.45, status: 'encaminhada', created_at: now, updated_at: now });
    await db('confirmations').insert({ occurrence_id: 1, user_id: 2, created_at: now });
    await db('status_history').insert({ occurrence_id: 1, from_status: 'registrada', to_status: 'encaminhada', changed_by: 2, created_at: now });

    await prepareDb(db);
    const occ = await db('occurrences').where({ id: 1 }).first();
    expect(occ).toMatchObject({ description: 'Registro antigo', status: 'encaminhada', street: null, category_detail: null });
    expect(await db('confirmations').count({ n: '*' }).first()).toMatchObject({ n: 1 });
    expect(await db('status_history').count({ n: '*' }).first()).toMatchObject({ n: 1 });
    expect((await db('users').where({ id: 2 }).first()).role).toBe('admin');
    // as chaves estrangeiras continuam valendo depois da troca de tabelas
    await expect(db('occurrences').insert({ user_id: 1, category_id: 1, neighborhood_id: 1, description: 'x', latitude: 0, longitude: 0, status: 'inexistente', created_at: now, updated_at: now })).rejects.toThrow();
    await expect(db('confirmations').insert({ occurrence_id: 99, user_id: 1, created_at: now })).rejects.toThrow();
    await db.destroy();
  });
});
