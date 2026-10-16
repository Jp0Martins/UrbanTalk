import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { H, admin, citizen, createOcc, ids, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let id: Awaited<ReturnType<typeof ids>>;
beforeEach(async () => {
  ctx = await setup();
  id = await ids(ctx.db);
});

async function scenario() {
  const c = await citizen(ctx);
  const others = [await citizen(ctx), await citizen(ctx)];
  const a = await admin(ctx);
  const plan: [string, string, string][] = [
    ['buraco', 'Centro', '2026-09-01T15:00:00.000Z'],
    ['buraco', 'Centro', '2026-09-01T18:00:00.000Z'],
    ['buraco', 'Campolim', '2026-09-03T12:00:00.000Z'],
    ['lixo', 'Campolim', '2026-09-05T12:00:00.000Z'],
    ['iluminacao', 'Éden', '2026-09-20T12:00:00.000Z'],
  ];
  const created: number[] = [];
  for (const [cat, hood, at] of plan) {
    const o = await createOcc(c.agent, { categoryId: id.cat(cat), neighborhoodId: id.hood(hood) });
    await ctx.db('occurrences').where({ id: o.id }).update({ created_at: at, updated_at: at });
    created.push(o.id);
  }
  await a.agent.patch(`/api/admin/occurrences/${created[0]}/status`).set(H).send({ status: 'resolvida' });
  await a.agent.patch(`/api/admin/occurrences/${created[3]}/status`).set(H).send({ status: 'encaminhada' });
  // 3 confirmações no total: duas na ocorrência 2 e uma na 3
  await others[0].agent.post(`/api/occurrences/${created[1]}/confirmations`).set(H);
  await others[1].agent.post(`/api/occurrences/${created[1]}/confirmations`).set(H);
  await others[0].agent.post(`/api/occurrences/${created[2]}/confirmations`).set(H);
  return { a, created };
}

describe('indicadores', () => {
  it('contagens batem com os registros do banco', async () => {
    const { a } = await scenario();
    const res = await a.agent.get('/api/admin/indicators?from=2026-09-01&to=2026-09-30');
    expect(res.status).toBe(200);
    const ind = res.body;
    expect(ind.total).toBe(5);
    expect(ind.resolved).toBe(1);
    expect(ind.confirmations).toBe(3);
    expect(ind.byStatus.map((s: { status: string; count: number }) => [s.status, s.count])).toEqual([
      ['registrada', 3],
      ['encaminhada', 1],
      ['resolvida', 1],
    ]);
    expect(ind.open).toBe(4);
    expect(ind.closed).toBe(1);
    const cat = Object.fromEntries(ind.byCategory.map((c: { slug: string; count: number }) => [c.slug, c.count]));
    expect(cat).toMatchObject({ buraco: 3, lixo: 1, iluminacao: 1, calcada: 0, sinalizacao: 0, 'ponto-onibus': 0, outros: 0 });
    expect(ind.byNeighborhood).toEqual([
      { key: 'campolim', name: 'Campolim', count: 2 },
      { key: 'centro', name: 'Centro', count: 2 },
      { key: 'eden', name: 'Éden', count: 1 },
    ]);
    // cada distribuição soma o total, sem contar nada duas vezes
    const sum = (arr: { count: number }[]) => arr.reduce((s, x) => s + x.count, 0);
    expect(sum(ind.byStatus)).toBe(5);
    expect(sum(ind.byCategory)).toBe(5);
    expect(sum(ind.byNeighborhood)).toBe(5);
    expect(ind.granularity).toBe('day');
    expect(ind.timeline).toHaveLength(30);
    expect(sum(ind.timeline)).toBe(5);
    expect(ind.timeline.find((t: { start: string }) => t.start === '2026-09-01').count).toBe(2);
  });

  it('aplica os filtros nos indicadores', async () => {
    const { a } = await scenario();
    const res = await a.agent.get(`/api/admin/indicators?from=2026-09-01&to=2026-09-30&neighborhood=${id.hood('Campolim')}`);
    expect(res.body.total).toBe(2);
    expect(res.body.confirmations).toBe(1);
    const byStatus = await a.agent.get('/api/admin/indicators?from=2026-09-01&to=2026-09-30&status=registrada');
    expect(byStatus.body.total).toBe(3);
  });

  it('banco vazio devolve zeros, sem números inventados', async () => {
    const a = await admin(ctx);
    const res = await a.agent.get('/api/admin/indicators?from=2026-09-01&to=2026-09-07');
    expect(res.body.total).toBe(0);
    expect(res.body.byNeighborhood).toEqual([]);
    expect(res.body.timeline.every((t: { count: number }) => t.count === 0)).toBe(true);
    expect(res.body.timeline).toHaveLength(7);
  });

  it('usa semanas em períodos longos', async () => {
    const a = await admin(ctx);
    const res = await a.agent.get('/api/admin/indicators?from=2026-01-01&to=2026-06-30');
    expect(res.body.granularity).toBe('week');
    expect(res.body.timeline[0].start).toBe('2025-12-29');
  });
});

describe('relatório PDF', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asBuffer = (r: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  it('gera PDF válido com os filtros', async () => {
    const { a } = await scenario();
    const res = await a.agent
      .get(`/api/admin/reports/occurrences.pdf?from=2026-09-01&to=2026-09-30&category=${id.cat('buraco')}`)
      .buffer(true)
      .parse(asBuffer);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/urbantalk-relatorio-2026-09-01-a-2026-09-30\.pdf/);
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.subarray(-6).toString()).toMatch(/%%EOF/);
  });

  it('gera PDF mesmo sem registros no período', async () => {
    const a = await admin(ctx);
    const res = await a.agent.get('/api/admin/reports/occurrences.pdf?from=2026-01-01&to=2026-01-31').buffer(true).parse(asBuffer);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exige período e permissão', async () => {
    const a = await admin(ctx);
    const c = await citizen(ctx);
    const noPeriod = await a.agent.get('/api/admin/reports/occurrences.pdf');
    expect(noPeriod.status).toBe(400);
    expect(Object.keys(noPeriod.body.error.fields).sort()).toEqual(['from', 'to']);
    expect((await c.agent.get('/api/admin/reports/occurrences.pdf?from=2026-01-01&to=2026-01-31')).status).toBe(403);
    expect((await request(ctx.app).get('/api/admin/reports/occurrences.pdf?from=2026-01-01&to=2026-01-31')).status).toBe(401);
  });
});
