import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { todayLocal } from '../src/lib/dates.js';
import { CENTRO, H, citizen, createOcc, employee, ids, setup } from './helpers.js';

describe('onde se aplica: cidade toda ou bairro digitado', () => {
  it('cidade toda é registrada sem bairro e sem ponto inventado', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('lixo'), scope: 'cidade', description: 'Coleta seletiva não passa em vários bairros.' });
    const row = await ctx.db('occurrences').where({ id: occ.id }).first();
    expect(row).toMatchObject({ scope: 'cidade', neighborhood_name: null, neighborhood_key: null, latitude: null, longitude: null });
    const detail = await request(ctx.app).get(`/api/occurrences/${occ.id}`);
    expect(detail.body).toMatchObject({ scope: 'cidade', neighborhood: null, latitude: null });
    // um bairro enviado junto com "cidade toda" é descartado
    const res = await ana.agent.post('/api/occurrences').set(H).field('scope', 'cidade').field('neighborhoodName', 'Centro').field('categoryId', String(id.cat('lixo'))).field('description', 'Outra reclamação para a cidade inteira.');
    expect(res.status).toBe(201);
    expect(res.body.neighborhood).toBeNull();
    // fica fora dos marcadores do mapa, mas é contada
    const map = await request(ctx.app).get('/api/occurrences/map');
    expect(map.body.markers).toHaveLength(0);
    expect(map.body.withoutPoint).toBe(2);
    expect((await request(ctx.app).get('/api/occurrences?scope=cidade')).body.total).toBe(2);
    // o banco recusa bairro em reclamação da cidade toda
    await expect(ctx.db('occurrences').where({ id: occ.id }).update({ neighborhood_name: 'Centro', neighborhood_key: 'centro' })).rejects.toThrow();
  });

  it('bairro novo digitado aparece em detalhes, filtros, sugestões, indicadores e relatórios', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const staff = await employee(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: '  Jardim   São Conrado ' });
    await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: 'Jardim Sao Conrado', description: 'Outro buraco grande na mesma rua.' });
    await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: 'Jardim São Conrado II', description: 'Buraco no loteamento novo do bairro.' });

    const detail = await request(ctx.app).get(`/api/occurrences/${occ.id}`);
    expect(detail.body.neighborhood).toEqual({ name: 'Jardim São Conrado', key: 'jardim sao conrado' });

    // filtro ignora maiúsculas e acentos, sem misturar bairros de nome parecido
    for (const typed of ['jardim são conrado', 'JARDIM SAO CONRADO', 'Jardim  Sao  Conrado']) {
      const list = await request(ctx.app).get(`/api/occurrences?neighborhood=${encodeURIComponent(typed)}`);
      expect(list.body.total).toBe(2);
    }
    // a busca livre encontra pelo bairro sem acento
    expect((await request(ctx.app).get('/api/occurrences?q=conrado')).body.total).toBe(3);

    const sug = await request(ctx.app).get('/api/neighborhoods?q=sao con');
    expect(sug.body.neighborhoods.map((n: { name: string }) => n.name)).toEqual(['Jardim São Conrado', 'Jardim São Conrado II']);
    expect(sug.body.neighborhoods[0].uses).toBe(2);

    const hoods = await request(ctx.app).get('/api/occurrences/neighborhoods');
    expect(hoods.body.items.find((h: { key: string }) => h.key === 'jardim sao conrado')).toMatchObject({ total: 2 });

    const ind = await staff.agent.get('/api/admin/indicators');
    expect(ind.body.byNeighborhood.find((b: { key: string }) => b.key === 'jardim sao conrado').count).toBe(2);
    const queue = await staff.agent.get(`/api/admin/occurrences?neighborhood=${encodeURIComponent('JARDIM SÃO CONRADO')}`);
    expect(queue.body.total).toBe(2);
    const csv = await staff.agent.get('/api/admin/reports/occurrences.csv?neighborhood=jardim%20sao%20conrado');
    expect(csv.text).toContain('Jardim São Conrado');
    expect(csv.text).not.toContain('São Conrado II');
    const pdf = await staff.agent.get(`/api/admin/reports/occurrences.pdf?from=2026-01-01&to=${todayLocal()}&neighborhood=jardim%20sao%20conrado`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
  });

  it('bairro exige nome válido e ponto no mapa; nada é cadastrado em tabela fechada', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const base = () => ana.agent.post('/api/occurrences').set(H).field('categoryId', String(id.cat('buraco'))).field('description', 'Buraco grande no meio da rua principal.');
    const empty = await base().field('scope', 'bairro').field('neighborhoodName', '  ').field('latitude', String(CENTRO.latitude)).field('longitude', String(CENTRO.longitude));
    expect(empty.status).toBe(400);
    expect(empty.body.error.fields.neighborhoodName).toBeTruthy();
    const noScope = await base().field('neighborhoodName', 'Centro');
    expect(noScope.body.error.fields.scope).toBeTruthy();
    const before = Number((await ctx.db('neighborhoods').count({ n: '*' }).first())!.n);
    await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: 'Vila Recém Criada' });
    expect(Number((await ctx.db('neighborhoods').count({ n: '*' }).first())!.n)).toBe(before);
  });

  it('propostas e fóruns usam o mesmo bairro livre', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    const p = await ana.agent.post('/api/proposals').set(H).send({ title: 'Praça nova no Jardim Árvore Grande', body: 'Transformar o terreno vazio da esquina em praça com bancos e sombra.', neighborhoodName: 'jardim árvore grande' });
    expect(p.body.neighborhood).toEqual({ name: 'jardim árvore grande', key: 'jardim arvore grande' });
    expect((await request(ctx.app).get('/api/proposals?neighborhood=Jardim%20Arvore%20Grande')).body.total).toBe(1);
    const sug = await request(ctx.app).get('/api/neighborhoods?q=arvore');
    expect(sug.body.neighborhoods[0].key).toBe('jardim arvore grande');
  });
});
