import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { todayLocal } from '../src/lib/dates.js';
import { CENTRO, H, citizen, createOcc, employee, ids, setup } from './helpers.js';

describe('mapa de concentração e bairros', () => {
  it('usa só dados reais, respeita filtros e avisa quando a amostra é pequena', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const empty = await request(ctx.app).get('/api/occurrences/heat');
    expect(empty.body).toMatchObject({ total: 0, reliable: false, cells: [] });
    for (let i = 0; i < 3; i++) await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    await createOcc(ana.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Campolim'), latitude: -23.5338, longitude: -47.4709 });
    const heat = await request(ctx.app).get('/api/occurrences/heat');
    expect(heat.body.total).toBe(4);
    expect(heat.body.reliable).toBe(false);
    expect(heat.body.cells[0].count).toBe(3);
    expect(heat.body.cells.reduce((a: number, c: { count: number }) => a + c.count, 0)).toBe(4);
    const onlyLixo = await request(ctx.app).get(`/api/occurrences/heat?category=${id.cat('lixo')}`);
    expect(onlyLixo.body.total).toBe(1);

    const hoods = await request(ctx.app).get('/api/occurrences/neighborhoods');
    const centro = hoods.body.items.find((h: { name: string }) => h.name === 'Centro');
    expect(centro).toMatchObject({ total: 3, open: 3, resolved: 0 });
    expect(centro.recurring[0]).toMatchObject({ name: 'Buraco na via', count: 3 });
    // bairro com menos de 3 registros fica fora dos rankings
    expect(hoods.body.rankings.mostOpen.map((r: { name: string }) => r.name)).toEqual(['Centro']);

    const markers = await request(ctx.app).get('/api/occurrences/map');
    expect(markers.body.markers[0]).toHaveProperty('description');
    expect(markers.body.markers[0]).toHaveProperty('photoUrl');
  });
});

describe('indicadores comparativos e exportação', () => {
  it('compara períodos, calcula tempo de resolução só com amostra suficiente e exporta CSV seguro', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const staff = await employee(ctx);
    const occs = [];
    for (let i = 0; i < 6; i++) {
      occs.push(await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), description: i === 0 ? '=HYPERLINK("http://mal.example")' : `Buraco número ${i} na rua.` }));
    }
    const today = todayLocal();
    const q = `from=${today}&to=${today}`;
    let ind = await staff.agent.get(`/api/admin/indicators?${q}`);
    expect(ind.body.extra.resolutionTime).toMatchObject({ sample: 0, enough: false, meanDays: null });
    expect(ind.body.extra.comparison.total).toMatchObject({ current: 6, previous: 0, pct: null });
    for (const o of occs.slice(0, 5)) {
      await staff.agent.patch(`/api/admin/occurrences/${o.id}/status`).set(H).send({ status: 'resolvida', note: 'Resolvido pela regional.' });
    }
    ind = await staff.agent.get(`/api/admin/indicators?${q}`);
    expect(ind.body.resolved).toBe(5);
    expect(ind.body.extra.resolutionTime.enough).toBe(true);
    expect(ind.body.extra.resolutionTime.medianDays).toBeGreaterThanOrEqual(0);
    expect(ind.body.extra.comparison.resolved.current).toBe(5);
    // granularidade escolhida
    expect((await staff.agent.get(`/api/admin/indicators?${q}&granularity=mes`)).body.granularity).toBe('month');

    const csv = await staff.agent.get(`/api/admin/reports/occurrences.csv?${q}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const text = csv.text.replace(/^﻿/, '');
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(7);
    expect(lines[0].split(';')[0]).toBe('Código');
    // descrição não vai para o CSV e nenhuma célula começa com fórmula
    expect(text).not.toContain('HYPERLINK');
    for (const l of lines) for (const c of l.split(';')) expect(c.startsWith('=')).toBe(false);
    expect((await ana.agent.get(`/api/admin/reports/occurrences.csv?${q}`)).status).toBe(403);

    const pdf = await staff.agent.get(`/api/admin/reports/occurrences.pdf?${q}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('explorar e busca global', () => {
  it('reúne conteúdo público e a busca nunca devolve nota interna nem publicação para visitante', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx, 'Ana Souza');
    const staff = await employee(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('iluminacao'), neighborhoodId: id.hood('Centro'), description: 'Poste apagado na praça da matriz.' });
    await staff.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ visibility: 'interna', body: 'praça segredo interno' });
    await ana.agent.post('/api/community/posts').set(H).send({ body: 'Alguém viu a praça apagada ontem?' });
    await ana.agent.post('/api/proposals').set(H).send({ title: 'Iluminação de LED na praça da matriz', body: 'Trocar as lâmpadas da praça por LED para melhorar a segurança à noite.' });

    const ex = await request(ctx.app).get(`/api/explore?lat=${CENTRO.latitude}&lng=${CENTRO.longitude}`);
    expect(ex.status).toBe(200);
    expect(ex.body.near[0]).toMatchObject({ id: occ.id, distanceM: 0 });
    expect(ex.body.forums).toBeUndefined();
    expect(ex.body.neighborhoods[0]).toMatchObject({ key: 'centro', name: 'Centro' });
    expect(ex.body.proposals).toHaveLength(1);

    const anon = await request(ctx.app).get('/api/search?q=praça');
    expect(anon.body.groups.ocorrencias.total).toBe(1);
    expect(anon.body.groups.propostas.total).toBe(1);
    expect(anon.body.groups.publicacoes.total).toBe(0);
    expect(JSON.stringify(anon.body)).not.toContain('segredo');
    expect((await request(ctx.app).get('/api/search?q=praça&type=publicacoes')).status).toBe(400);
    const logged = await ana.agent.get('/api/search?q=praça');
    expect(logged.body.groups.publicacoes.total).toBe(1);
    // nota interna não é pesquisável nem pela equipe na busca pública
    expect((await staff.agent.get('/api/search?q=segredo')).body.groups.ocorrencias.total).toBe(0);
    const byCode = await request(ctx.app).get(`/api/search?q=UT-${String(occ.id).padStart(5, '0')}&type=ocorrencias`);
    expect(byCode.body.items[0].id).toBe(occ.id);
    expect((await request(ctx.app).get('/api/search?q=a')).status).toBe(400);
    const forums = await request(ctx.app).get('/api/search?q=mobilidade&type=foruns');
    expect(forums.body.items.map((f: { title: string }) => f.title)).toEqual(expect.arrayContaining(['Mobilidade urbana', 'Acessibilidade']));
  });
});
