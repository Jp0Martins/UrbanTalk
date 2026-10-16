import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CENTRO, H, citizen, createOcc, employee, ids, setup } from './helpers.js';

describe('fila de análise', () => {
  it('pontuação explicada, confirmações com teto, atribuição, prioridade justificada e minhas tarefas', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const staff = await employee(ctx, 'staff', 'Diego Martins');
    const other = await employee(ctx, 'staff', 'Lia Prado');
    const a = await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const b = await createOcc(ana.agent, { categoryId: id.cat('lixo'), neighborhoodId: id.hood('Campolim'), latitude: -23.53, longitude: -47.47 });
    // 15 confirmações, mas só 10 contam
    for (let i = 0; i < 15; i++) {
      const c = await citizen(ctx);
      await c.agent.post(`/api/occurrences/${b.id}/confirmations`).set(H);
    }
    const q = await staff.agent.get('/api/admin/queue');
    expect(q.status).toBe(200);
    const itemB = q.body.items.find((x: { id: number }) => x.id === b.id);
    const conf = itemB.scoreParts.find((p: { label: string }) => p.label.includes('confirmações'));
    expect(conf.points).toBe(10 * q.body.settings.perConfirmation);
    expect(conf.label).toContain('contam até 10');
    expect(q.body.items[0].id).toBe(b.id);

    // prioridade sem justificativa é recusada; com justificativa sobe na fila
    expect((await staff.agent.patch(`/api/admin/occurrences/${a.id}/priority`).set(H).send({ priority: 'alta' })).status).toBe(400);
    const pr = await staff.agent.patch(`/api/admin/occurrences/${a.id}/priority`).set(H).send({ priority: 'alta', reason: 'Vistoria confirmou buraco profundo na faixa.' });
    expect(pr.body.priority).toBe('alta');
    expect(pr.body.timeline.some((t: { kind: string }) => t.kind === 'prioridade')).toBe(true);
    // prioridade é interna
    expect(kinds((await ana.agent.get(`/api/occurrences/${a.id}`)).body.timeline)).not.toContain('prioridade');

    // atribuição só para funcionário, com aviso para quem recebe
    expect((await staff.agent.patch(`/api/admin/occurrences/${a.id}/assignee`).set(H).send({ userId: ana.user.id })).status).toBe(400);
    const asg = await staff.agent.patch(`/api/admin/occurrences/${a.id}/assignee`).set(H).send({ userId: other.user.id });
    expect(asg.body.assignee.name).toBe('Lia Prado');
    const notes = await other.agent.get('/api/notifications');
    expect(notes.body.items.some((n: { kind: string; link: string }) => n.kind === 'equipe.atribuida' && n.link === `/ocorrencias/${a.id}`)).toBe(true);
    const mine = await other.agent.get('/api/admin/queue?view=minhas');
    expect(mine.body.items.map((x: { id: number }) => x.id)).toEqual([a.id]);
    const unassigned = await staff.agent.get('/api/admin/queue?view=sem-responsavel');
    expect(unassigned.body.items.map((x: { id: number }) => x.id)).toEqual([b.id]);

    // filtro de paradas e atrasadas usa as datas reais
    await ctx.db('occurrences').where({ id: b.id }).update({ updated_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), created_at: new Date(Date.now() - 40 * 86_400_000).toISOString() });
    expect((await staff.agent.get('/api/admin/queue?flag=paradas')).body.items.map((x: { id: number }) => x.id)).toEqual([b.id]);
    expect((await staff.agent.get('/api/admin/queue?flag=atrasadas')).body.items.map((x: { id: number }) => x.id)).toEqual([b.id]);
    expect((await ana.agent.get('/api/admin/queue')).status).toBe(403);
  });

  it('sugere duplicatas sem mesclar e só marca com ação da equipe', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const staff = await employee(ctx);
    const a = await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro') });
    const b = await createOcc(bia.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), latitude: CENTRO.latitude + 0.0005 });
    const far = await createOcc(bia.agent, { categoryId: id.cat('buraco'), neighborhoodId: id.hood('Centro'), latitude: CENTRO.latitude + 0.01 });
    const sim = await staff.agent.get(`/api/admin/occurrences/${b.id}/similar`);
    expect(sim.body.items.map((x: { id: number }) => x.id)).toEqual([a.id]);
    expect(sim.body.items[0].distanceM).toBeLessThan(100);
    const q = await staff.agent.get('/api/admin/queue');
    expect(q.body.items.find((x: { id: number }) => x.id === far.id).similar).toBe(0);
    // nada foi alterado só por sugerir
    expect(await ctx.db('occurrences').whereNotNull('duplicate_of').count({ n: '*' }).first()).toMatchObject({ n: 0 });
    expect((await staff.agent.patch(`/api/admin/occurrences/${b.id}/duplicate`).set(H).send({ of: b.id })).status).toBe(400);
    const marked = await staff.agent.patch(`/api/admin/occurrences/${b.id}/duplicate`).set(H).send({ of: a.id });
    expect(marked.body.duplicateOf).toBe(a.id);
    // corrente de duplicatas é recusada
    expect((await staff.agent.patch(`/api/admin/occurrences/${far.id}/duplicate`).set(H).send({ of: b.id })).status).toBe(409);
    expect(await ctx.db('occurrences').count({ n: '*' }).first()).toMatchObject({ n: 3 });
    expect(await ctx.db('audit_log').where({ action: 'ocorrencia.duplicata', target_id: b.id }).first()).toBeTruthy();
  });

  it('configuração da priorização só por administrador, com validação e auditoria', async () => {
    const ctx = await setup();
    const staff = await employee(ctx);
    const boss = await employee(ctx, 'admin');
    const cur = (await staff.agent.get('/api/admin/settings/priority')).body;
    expect(cur.canManage).toBe(false);
    expect((await staff.agent.put('/api/admin/settings/priority').set(H).send(cur.settings)).status).toBe(403);
    expect((await boss.agent.put('/api/admin/settings/priority').set(H).send({ ...cur.settings, perConfirmation: 99 })).status).toBe(400);
    const ok = await boss.agent.put('/api/admin/settings/priority').set(H).send({ ...cur.settings, perConfirmation: 5 });
    expect(ok.body.settings.perConfirmation).toBe(5);
    expect((await staff.agent.get('/api/admin/settings/priority')).body.settings.perConfirmation).toBe(5);
    expect(await ctx.db('audit_log').where({ action: 'config.priorizacao' }).first()).toBeTruthy();
  });
});

const kinds = (tl: { kind: string }[]) => tl.map((t) => t.kind);

describe('moderação e permissões administrativas', () => {
  it('denúncia única, decisão da equipe oculta sem apagar e fica auditada', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const caio = await citizen(ctx);
    const staff = await employee(ctx);
    const post = await ana.agent.post('/api/community/posts').set(H).send({ body: 'Compre seguidores baratos em meu-site.com agora!' });
    expect((await ana.agent.post('/api/reports').set(H).send({ targetType: 'post', targetId: post.body.id, reason: 'spam' })).status).toBe(403);
    expect((await bia.agent.post('/api/reports').set(H).send({ targetType: 'post', targetId: post.body.id, reason: 'outro' })).status).toBe(400);
    expect((await bia.agent.post('/api/reports').set(H).send({ targetType: 'post', targetId: post.body.id, reason: 'spam' })).status).toBe(201);
    expect((await bia.agent.post('/api/reports').set(H).send({ targetType: 'post', targetId: post.body.id, reason: 'spam' })).status).toBe(409);
    await caio.agent.post('/api/reports').set(H).send({ targetType: 'post', targetId: post.body.id, reason: 'ofensivo' });
    expect((await bia.agent.get('/api/admin/moderation/reports')).status).toBe(403);
    const queue = await staff.agent.get('/api/admin/moderation/reports');
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].reports).toBe(2);
    expect((await staff.agent.post('/api/admin/moderation/decide').set(H).send({ targetType: 'post', targetId: post.body.id, decision: 'ocultar' })).status).toBe(400);
    const d = await staff.agent.post('/api/admin/moderation/decide').set(H).send({ targetType: 'post', targetId: post.body.id, decision: 'ocultar', reason: 'spam' });
    expect(d.status).toBe(200);
    const feed = await bia.agent.get('/api/community/posts');
    expect(feed.body.items.find((p: { id: number }) => p.id === post.body.id)).toBeUndefined();
    const row = await ctx.db('posts').where({ id: post.body.id }).first();
    expect(row.body).toContain('seguidores');
    expect(row.hidden_reason).toBe('spam');
    expect((await staff.agent.get('/api/admin/moderation/hidden')).body.items[0].id).toBe(post.body.id);
    // restaurar também fica registrado
    await staff.agent.post('/api/admin/moderation/visibility').set(H).send({ targetType: 'post', targetId: post.body.id, hidden: false });
    expect((await bia.agent.get('/api/community/posts')).body.items.some((p: { id: number }) => p.id === post.body.id)).toBe(true);
    const actions = (await ctx.db('audit_log').where({ target_type: 'post', target_id: post.body.id }).select('action')).map((r) => r.action);
    expect(actions).toEqual(['moderacao.ocultar', 'moderacao.restaurar']);
  });

  it('funcionário comum não gerencia categorias, fóruns, fases, auditoria nem configurações', async () => {
    const ctx = await setup();
    const staff = await employee(ctx);
    const boss = await employee(ctx, 'admin');
    const calls = [
      staff.agent.get('/api/admin/audit'),
      staff.agent.get('/api/admin/categories'),
      staff.agent.post('/api/admin/categories').set(H).send({ name: 'Nova categoria' }),
      staff.agent.patch('/api/admin/categories/1').set(H).send({ active: false }),
      staff.agent.get('/api/admin/forums'),
      staff.agent.post('/api/admin/forums').set(H).send({ name: 'Novo fórum' }),
      staff.agent.post('/api/admin/forums/mobilidade-urbana/institutional-topics').set(H).send({ title: 'Tópico de apoio', body: 'Texto do tópico institucional.' }),
      staff.agent.post('/api/admin/proposal-statuses').set(H).send({ name: 'Nova fase' }),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(403);

    const cat = await boss.agent.post('/api/admin/categories').set(H).send({ name: 'Poda de árvore', icon: 'other', description: 'Galhos e árvores.' });
    expect(cat.status).toBe(201);
    expect((await request(ctx.app).get('/api/categories')).body.categories.some((c: { name: string }) => c.name === 'Poda de árvore')).toBe(true);
    await boss.agent.patch(`/api/admin/categories/${cat.body.id}`).set(H).send({ active: false });
    expect((await request(ctx.app).get('/api/categories')).body.categories.some((c: { name: string }) => c.name === 'Poda de árvore')).toBe(false);
    const inst = await boss.agent.post('/api/admin/forums/mobilidade-urbana/institutional-topics').set(H).send({ title: 'Calendário de audiências', body: 'Datas das audiências públicas de mobilidade.' });
    expect(inst.body.isInstitutional).toBe(true);
    expect(inst.body.author).toBeNull();
    const log = await boss.agent.get('/api/admin/audit');
    expect(log.body.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['categoria.criar', 'categoria.alterar', 'forum.topico_institucional']));
  });

  it('sinais de spam encontram texto repetido', async () => {
    const ctx = await setup();
    const a = await citizen(ctx);
    const b = await citizen(ctx);
    const staff = await employee(ctx);
    await a.agent.post('/api/community/posts').set(H).send({ body: 'Promoção imperdível, chame no zap!' });
    await b.agent.post('/api/community/posts').set(H).send({ body: 'promoção IMPERDÍVEL chame no zap' });
    const s = await staff.agent.get('/api/admin/moderation/spam');
    expect(s.body.repeated[0].count).toBe(2);
    const act = await staff.agent.get('/api/admin/moderation/activity');
    expect(act.body.week.posts).toBe(2);
    expect(act.body.week.activePeople).toBe(2);
  });
});
