import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { CENTRO, H, admin, citizen, createOcc, ids, pngWithExif, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let id: Awaited<ReturnType<typeof ids>>;
beforeEach(async () => {
  ctx = await setup();
  id = await ids(ctx.db);
});

describe('registro de ocorrência', () => {
  it('exige login', async () => {
    const res = await request(ctx.app).post('/api/occurrences').set(H).field('description', 'teste de envio sem login');
    expect(res.status).toBe(401);
  });

  it('valida campos obrigatórios', async () => {
    const { agent } = await citizen(ctx);
    const res = await agent.post('/api/occurrences').set(H).field('description', 'curto');
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('categoryId');
    expect(res.body.error.fields).toHaveProperty('scope');
    expect(res.body.error.fields).toHaveProperty('description');
    // bairro exige nome e ponto no mapa
    const id = await ids(ctx.db);
    const hood = await agent.post('/api/occurrences').set(H).field('categoryId', String(id.cat('buraco'))).field('scope', 'bairro').field('description', 'descrição válida do problema na rua');
    expect(hood.status).toBe(400);
    expect(hood.body.error.fields).toHaveProperty('neighborhoodName');
    expect(hood.body.error.fields).toHaveProperty('latitude');
  });

  it('recusa local fora de Sorocaba', async () => {
    const { agent } = await citizen(ctx);
    const res = await agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('buraco')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('description', 'Buraco na avenida em frente ao mercado.')
      .field('latitude', '-23.5505')
      .field('longitude', '-46.6333');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.longitude).toMatch(/fora de Sorocaba/);
  });

  it('recusa categoria inexistente', async () => {
    const { agent } = await citizen(ctx);
    const res = await agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', '999')
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('description', 'Descrição válida com tamanho suficiente.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.categoryId).toBeDefined();
  });

  it('cria com foto, regrava como JPEG e remove metadados', async () => {
    const { agent } = await citizen(ctx);
    const res = await agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('iluminacao')))
      .field('scope', 'bairro').field('neighborhoodName', 'Campolim')
      .field('description', 'Poste apagado na esquina, rua escura.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude))
      .field('createdAt', '2001-01-01T00:00:00.000Z')
      .attach('photo', await pngWithExif(), { filename: 'foto.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('registrada');
    expect(res.body.photoUrl).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\.jpg$/);
    // data definida pelo servidor, não pelo cliente
    expect(res.body.createdAt.startsWith('2001')).toBe(false);
    expect(Date.now() - Date.parse(res.body.createdAt)).toBeLessThan(60_000);
    expect(res.body.history).toHaveLength(1);

    const photo = await request(ctx.app).get(res.body.photoUrl).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(photo.body as Buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
  });

  it('recusa arquivo que não é imagem, mesmo com extensão de imagem', async () => {
    const { agent } = await citizen(ctx);
    const res = await agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('lixo')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('description', 'Lixo acumulado na calçada há dias.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude))
      .attach('photo', Buffer.from('<?php echo 1; ?>'), { filename: 'foto.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.photo).toBeDefined();
    expect(await ctx.db('occurrences').count({ c: '*' }).first()).toEqual({ c: 0 });
  });

  it('recusa foto acima do limite', async () => {
    const { agent } = await citizen(ctx);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024)]);
    const res = await agent
      .post('/api/occurrences')
      .set(H)
      .field('categoryId', String(id.cat('lixo')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('description', 'Lixo acumulado na calçada há dias.')
      .field('latitude', String(CENTRO.latitude))
      .field('longitude', String(CENTRO.longitude))
      .attach('photo', big, { filename: 'grande.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/MB/);
  });

  it('nunca expõe dados de quem registrou', async () => {
    const { agent } = await citizen(ctx, 'Nome Privado');
    const occ = await createOcc(agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const pub = await request(ctx.app).get(`/api/occurrences/${occ.id}`);
    const list = await request(ctx.app).get('/api/occurrences');
    for (const body of [pub.body, list.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/Nome Privado|@teste\.com|user_id|userId/);
    }
    expect(pub.body.isMine).toBe(false);
    expect((await agent.get(`/api/occurrences/${occ.id}`)).body.isMine).toBe(true);
  });

  it('não serve arquivos fora da pasta de fotos', async () => {
    expect((await request(ctx.app).get('/api/photos/..%2F..%2Fpackage.json')).status).toBe(404);
    expect((await request(ctx.app).get('/api/photos/naoexiste.jpg')).status).toBe(404);
  });
});

describe('confirmações', () => {
  it('permite uma confirmação por pessoa e bloqueia a repetição', async () => {
    const autor = await citizen(ctx);
    const outra = await citizen(ctx);
    const occ = await createOcc(autor.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });

    const own = await autor.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H);
    expect(own.status).toBe(403);

    const first = await outra.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H);
    expect(first.status).toBe(201);
    expect(first.body.confirmations).toBe(1);

    const again = await outra.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_confirmed');

    const detail = await outra.agent.get(`/api/occurrences/${occ.id}`);
    expect(detail.body.confirmations).toBe(1);
    expect(detail.body.confirmedByMe).toBe(true);
  });

  it('o banco também impede confirmação duplicada', async () => {
    const autor = await citizen(ctx);
    const outra = await citizen(ctx);
    const occ = await createOcc(autor.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const row = { occurrence_id: occ.id, user_id: outra.user.id, created_at: new Date().toISOString() };
    await ctx.db('confirmations').insert(row);
    await expect(ctx.db('confirmations').insert(row)).rejects.toThrow(/UNIQUE/);
  });

  it('exige login para confirmar', async () => {
    const autor = await citizen(ctx);
    const occ = await createOcc(autor.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    expect((await request(ctx.app).post(`/api/occurrences/${occ.id}/confirmations`).set(H)).status).toBe(401);
  });

  it('confirmações não mudam o status sozinhas', async () => {
    const autor = await citizen(ctx);
    const occ = await createOcc(autor.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    for (let i = 0; i < 5; i++) {
      const c = await citizen(ctx);
      await c.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H);
    }
    const detail = await request(ctx.app).get(`/api/occurrences/${occ.id}`);
    expect(detail.body.confirmations).toBe(5);
    expect(detail.body.status).toBe('registrada');
  });
});

describe('controle de acesso e status', () => {
  it('somente admin acessa a área administrativa', async () => {
    const c = await citizen(ctx);
    const a = await admin(ctx);
    expect((await request(ctx.app).get('/api/admin/indicators')).status).toBe(401);
    expect((await c.agent.get('/api/admin/indicators')).status).toBe(403);
    expect((await a.agent.get('/api/admin/indicators')).status).toBe(200);
  });

  it('cidadão não altera status, nem da própria ocorrência', async () => {
    const c = await citizen(ctx);
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const res = await c.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'resolvida' });
    expect(res.status).toBe(403);
    expect((await ctx.db('occurrences').where({ id: occ.id }).first()).status).toBe('registrada');
  });

  it('admin altera status e o histórico registra a mudança', async () => {
    const c = await citizen(ctx);
    const a = await admin(ctx);
    const occ = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });

    const fwd = await a.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada', note: 'Enviado no relatório de outubro.' });
    expect(fwd.status).toBe(200);
    expect(fwd.body.status).toBe('encaminhada');
    expect(fwd.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['registrada', 'encaminhada']);
    expect(fwd.body.history[1]).toMatchObject({ fromStatus: 'registrada', note: 'Enviado no relatório de outubro.', changedBy: 'equipe' });

    const same = await a.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada' });
    expect(same.status).toBe(409);

    const invalid = await a.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'arquivada' });
    expect(invalid.status).toBe(400);

    // ocorrência resolvida não recebe novas confirmações
    await a.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'resolvida' });
    const outra = await citizen(ctx);
    const conf = await outra.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H);
    expect(conf.status).toBe(409);
  });

  it('histórico pessoal mostra só as ocorrências da própria pessoa', async () => {
    const a = await citizen(ctx);
    const b = await citizen(ctx);
    await createOcc(a.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    await createOcc(a.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Centro') });
    await createOcc(b.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Centro') });
    const mine = await a.agent.get('/api/me/occurrences');
    expect(mine.body.total).toBe(2);
    expect(mine.body.items.every((o: { isMine: boolean }) => o.isMine)).toBe(true);
    const summary = await a.agent.get('/api/me/summary');
    expect(summary.body).toMatchObject({ total: 2, open: 2, closed: 0, byStatus: [{ status: 'registrada', count: 2 }] });
    expect((await request(ctx.app).get('/api/me/occurrences')).status).toBe(401);
  });
});

describe('filtros', () => {
  it('filtra por categoria, bairro, status, texto e período', async () => {
    const c = await citizen(ctx);
    const a = await admin(ctx);
    const o1 = await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), description: 'Buraco perto da praça central.' });
    const o2 = await createOcc(c.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Campolim'), description: 'Lixo acumulado no canteiro.' });
    const o3 = await createOcc(c.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Centro'), description: 'Entulho jogado na calçada.' });
    await a.agent.patch(`/api/admin/occurrences/${o3.id}/status`).set(H).send({ status: 'encaminhada' });
    // o1 registrada em 10/09/2026 às 23h de Sorocaba (02h UTC do dia 11)
    await ctx.db('occurrences').where({ id: o1.id }).update({ created_at: '2026-09-11T02:00:00.000Z' });

    const q = async (qs: string) => (await request(ctx.app).get(`/api/occurrences?${qs}`)).body.items.map((o: { id: number }) => o.id).sort();
    expect(await q(`category=${id.cat('lixo')}`)).toEqual([o2.id, o3.id].sort());
    expect(await q(`neighborhood=${id.hood('Centro')}`)).toEqual([o1.id, o3.id].sort());
    expect(await q('status=encaminhada')).toEqual([o3.id]);
    expect(await q('q=ENTULHO')).toEqual([o3.id]);
    expect(await q(`category=${id.cat('lixo')}&neighborhood=${id.hood('Centro')}`)).toEqual([o3.id]);
    // o dia é contado no fuso de Sorocaba
    expect(await q('from=2026-09-10&to=2026-09-10')).toEqual([o1.id]);
    expect(await q('from=2026-09-11&to=2026-09-11')).toEqual([]);

    const bad = await request(ctx.app).get('/api/occurrences?from=2026-13-40');
    expect(bad.status).toBe(400);
    const inverted = await request(ctx.app).get('/api/occurrences?from=2026-10-10&to=2026-10-01');
    expect(inverted.status).toBe(400);
  });

  it('pagina resultados', async () => {
    const c = await citizen(ctx);
    for (let i = 0; i < 5; i++) await createOcc(c.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const p1 = await request(ctx.app).get('/api/occurrences?pageSize=2&page=1');
    const p3 = await request(ctx.app).get('/api/occurrences?pageSize=2&page=3');
    expect(p1.body).toMatchObject({ total: 5, totalPages: 3 });
    expect(p1.body.items).toHaveLength(2);
    expect(p3.body.items).toHaveLength(1);
    expect((await request(ctx.app).get('/api/occurrences?pageSize=500')).status).toBe(400);
  });
});
