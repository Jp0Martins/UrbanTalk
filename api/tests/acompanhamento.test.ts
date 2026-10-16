import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { H, citizen, createOcc, employee, ids, pngWithExif, setup } from './helpers.js';

const kinds = (tl: { kind: string }[]) => tl.map((t) => t.kind);

describe('notificações', () => {
  it('são de cada pessoa, marcam como lidas e não vazam para outros', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const staff = await employee(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    // nova ocorrência avisa a equipe, agrupada
    await createOcc(bia.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Centro') });
    const sn = await staff.agent.get('/api/notifications');
    const novas = sn.body.items.filter((n: { kind: string }) => n.kind === 'equipe.nova');
    expect(novas).toHaveLength(1);
    expect(novas[0].count).toBe(2);

    await bia.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H);
    await staff.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada', note: 'Enviada no relatório.' });
    const na = await ana.agent.get('/api/notifications');
    const mine = na.body.items.find((n: { kind: string }) => n.kind === 'ocorrencia.atualizacao');
    expect(mine.link).toBe(`/ocorrencias/${occ.id}`);
    expect(na.body.unread).toBeGreaterThan(0);
    const nb = await bia.agent.get('/api/notifications');
    expect(nb.body.items.some((n: { kind: string }) => n.kind === 'ocorrencia.confirmada')).toBe(true);

    // ninguém marca a notificação de outra pessoa
    expect((await bia.agent.post(`/api/notifications/${mine.id}/read`).set(H)).status).toBe(404);
    const read = await ana.agent.post(`/api/notifications/${mine.id}/read`).set(H);
    expect(read.status).toBe(200);
    // novo evento depois de lido gera aviso novo, não reaproveita o lido
    await staff.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ visibility: 'publica', body: 'Equipe da regional avisada.' });
    const after = await ana.agent.get('/api/notifications?filter=nao-lidas');
    expect(after.body.items.filter((n: { kind: string }) => n.kind === 'ocorrencia.atualizacao')).toHaveLength(1);
    expect((await ana.agent.post('/api/notifications/read-all').set(H)).body.unread).toBe(0);
    expect((await request(ctx.app).get('/api/notifications')).status).toBe(401);
  });
});

describe('pedido de informação, evidências e resolução', () => {
  it('fluxo completo: pedido, resposta, resolução com evidências, avaliação e reabertura com histórico preservado', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx, 'Ana Souza');
    const bia = await citizen(ctx);
    const caio = await citizen(ctx);
    const staff = await employee(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });

    // pedido de informação: só a equipe pede, só quem registrou responde
    expect((await ana.agent.post(`/api/admin/occurrences/${occ.id}/info-requests`).set(H).send({ question: 'Qual o número mais próximo?' })).status).toBe(403);
    const asked = await staff.agent.post(`/api/admin/occurrences/${occ.id}/info-requests`).set(H).send({ question: 'Qual o número da casa mais próxima?' });
    expect(asked.status).toBe(201);
    const rid = asked.body.infoRequest.id;
    expect((await staff.agent.post(`/api/admin/occurrences/${occ.id}/info-requests`).set(H).send({ question: 'Outra pergunta qualquer aqui' })).status).toBe(409);
    // o público não vê a pergunta; quem registrou vê
    const pub = await request(ctx.app).get(`/api/occurrences/${occ.id}`);
    expect(pub.body.infoRequest).toBeNull();
    expect(kinds(pub.body.timeline)).not.toContain('pedido_info');
    const own = await ana.agent.get(`/api/occurrences/${occ.id}`);
    expect(own.body.infoRequest.question).toContain('número da casa');
    expect((await bia.agent.post(`/api/occurrences/${occ.id}/info-requests/${rid}/answer`).set(H).field('answer', 'Número 120')).status).toBe(403);
    const answered = await ana.agent
      .post(`/api/occurrences/${occ.id}/info-requests/${rid}/answer`)
      .set(H)
      .field('answer', 'Em frente ao número 120.')
      .attach('photo', await pngWithExif(), { filename: 'f.png', contentType: 'image/png' });
    expect(answered.status).toBe(201);
    expect(answered.body.infoRequest).toBeNull();
    expect((await ana.agent.post(`/api/occurrences/${occ.id}/info-requests/${rid}/answer`).set(H).field('answer', 'De novo')).status).toBe(409);
    const sn = await staff.agent.get('/api/notifications');
    expect(sn.body.items.some((n: { kind: string }) => n.kind === 'equipe.resposta_cidadao')).toBe(true);

    // status que não conta como resolvido não serve para "resolver"
    const wrong = await staff.agent.post(`/api/admin/occurrences/${occ.id}/resolution`).set(H).field('status', 'encaminhada').field('description', 'Tapa-buraco feito ontem.');
    expect(wrong.status).toBe(400);
    const solved = await staff.agent
      .post(`/api/admin/occurrences/${occ.id}/resolution`)
      .set(H)
      .field('status', 'resolvida')
      .field('description', 'Equipe de tapa-buraco esteve no local em 10/10.')
      .attach('depois', await pngWithExif(), { filename: 'd.png', contentType: 'image/png' });
    expect(solved.status).toBe(201);
    const r = solved.body.resolution;
    expect(r.levels).toEqual({ informada: true, comEvidencias: true, confirmadaPelaComunidade: false });
    expect(r.evidence.depois).toHaveLength(1);

    // funcionário não avalia; quem não foi resolvido não avalia
    expect((await staff.agent.post(`/api/occurrences/${occ.id}/feedback`).set(H).send({ verdict: 'resolvido' })).status).toBe(403);
    await bia.agent.post(`/api/occurrences/${occ.id}/feedback`).set(H).send({ verdict: 'resolvido' });
    expect((await bia.agent.post(`/api/occurrences/${occ.id}/feedback`).set(H).send({ verdict: 'resolvido' })).status).toBe(409);
    const oneVote = (await request(ctx.app).get(`/api/occurrences/${occ.id}`)).body.resolution;
    expect(oneVote.levels.confirmadaPelaComunidade).toBe(false);
    await ana.agent.post(`/api/occurrences/${occ.id}/feedback`).set(H).send({ verdict: 'resolvido' });
    expect((await request(ctx.app).get(`/api/occurrences/${occ.id}`)).body.resolution.levels.confirmadaPelaComunidade).toBe(true);

    // alguém diz que continua: vira pedido de reavaliação, sem reabrir sozinho
    expect((await caio.agent.post(`/api/occurrences/${occ.id}/feedback`).set(H).send({ verdict: 'persiste' })).status).toBe(400);
    const persists = await caio.agent.post(`/api/occurrences/${occ.id}/feedback`).set(H).send({ verdict: 'persiste', comment: 'Choveu e abriu de novo.' });
    expect(persists.status).toBe(201);
    expect(persists.body.reviewRequested).toBe(true);
    expect(persists.body.status).toBe('resolvida');
    // comentário da avaliação não aparece para o público
    const publicTl = (await request(ctx.app).get(`/api/occurrences/${occ.id}`)).body.timeline;
    const fb = publicTl.filter((t: { kind: string }) => t.kind === 'avaliacao');
    expect(fb.every((t: { body: string | null }) => t.body === null)).toBe(true);

    // reabrir exige justificativa e preserva a resolução anterior
    expect((await staff.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada' })).status).toBe(400);
    const reopened = await staff.agent.patch(`/api/admin/occurrences/${occ.id}/status`).set(H).send({ status: 'encaminhada', note: 'Morador informou que voltou a abrir.' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.reopenedCount).toBe(1);
    expect(reopened.body.reviewRequestedAt).toBeNull();
    expect(reopened.body.resolution).toBeNull();
    expect(reopened.body.previousResolutions).toBe(1);
    expect(await ctx.db('occurrence_resolutions').where({ occurrence_id: occ.id }).count({ n: '*' }).first()).toMatchObject({ n: 1 });
    expect(await ctx.db('occurrence_evidence').where({ occurrence_id: occ.id }).count({ n: '*' }).first()).toMatchObject({ n: 1 });
    const staffTl = kinds(reopened.body.timeline);
    expect(staffTl).toEqual(expect.arrayContaining(['registro', 'pedido_info', 'resposta_cidadao', 'resolucao', 'avaliacao', 'reaberta', 'status']));
  });

  it('nota interna nunca aparece fora da área da equipe', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const staff = await employee(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    await staff.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ visibility: 'interna', body: 'SEGREDO-INTERNO-123' });
    for (const res of [await ana.agent.get(`/api/occurrences/${occ.id}`), await request(ctx.app).get(`/api/occurrences/${occ.id}`)]) {
      expect(JSON.stringify(res.body)).not.toContain('SEGREDO-INTERNO-123');
    }
    expect(JSON.stringify((await staff.agent.get(`/api/admin/occurrences/${occ.id}`)).body)).toContain('SEGREDO-INTERNO-123');
  });

  it('status configurado como "conta como resolvido" exige ser de encerramento', async () => {
    const ctx = await setup();
    const boss = await employee(ctx, 'admin');
    const bad = await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Concluída', countsAsResolved: true });
    expect(bad.status).toBe(400);
    const ok = await boss.agent.post('/api/admin/statuses').set(H).send({ name: 'Concluída', isClosed: true, countsAsResolved: true });
    expect(ok.body.countsAsResolved).toBe(true);
  });
});
