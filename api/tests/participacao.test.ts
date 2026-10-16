import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { H, citizen, createOcc, employee, ids, setup } from './helpers.js';

describe('fóruns da comunidade', () => {
  const NEW_FORUM = { name: 'Ciclistas do Éden', description: 'Rotas seguras e ciclofaixas para quem pedala no Éden.', theme: 'mobilidade', tags: ['bike', 'Ciclofaixa'], neighborhoodName: 'Éden', rules: 'Sem propaganda.' };

  it('vêm só os 9 fóruns oficiais, sem grupos automáticos por bairro, e tópicos de apoio sem autor', async () => {
    const ctx = await setup();
    const res = await request(ctx.app).get('/api/forums?sort=nome&pageSize=50');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(9);
    expect(res.body.items.every((f: { kind: string }) => f.kind === 'oficial')).toBe(true);
    expect(res.body.items.map((f: { name: string }) => f.name)).toContain('Mobilidade urbana');
    // nenhum fórum é criado a partir de bairros
    expect(await ctx.db('forums').where({ kind: 'comunidade' }).first()).toBeUndefined();
    const topics = await request(ctx.app).get('/api/forums/duvidas-orientacoes/topics');
    expect(topics.body.items.length).toBeGreaterThan(0);
    for (const t of topics.body.items) {
      expect(t.isInstitutional).toBe(true);
      expect(t.author).toBeNull();
    }
    // reaplicar a base não duplica fóruns nem tópicos
    const { seedForums } = await import('../src/db/seed-base.js');
    await seedForums(ctx.db);
    expect((await request(ctx.app).get('/api/forums')).body.total).toBe(9);
    expect((await request(ctx.app).get('/api/forums/duvidas-orientacoes/topics')).body.total).toBe(topics.body.total);
    // registrar reclamação em um bairro novo também não cria fórum
    const ana = await citizen(ctx);
    const id = await ids(ctx.db);
    await createOcc(ana.agent, { categoryId: id.cat('buraco'), neighborhoodId: 'Jardim Inventado' });
    expect((await request(ctx.app).get('/api/forums')).body.total).toBe(9);
  });

  it('pessoa cria fórum, outra encontra pela busca (sem acento) e participa', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx, 'Ana Souza');
    const bia = await citizen(ctx, 'Bia Lima');
    expect((await request(ctx.app).post('/api/forums').set(H).send(NEW_FORUM)).status).toBe(401);
    const bad = await ana.agent.post('/api/forums').set(H).send({ name: 'Oi', description: 'curta', theme: 'xyz' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['description', 'name', 'theme']);

    const created = await ana.agent.post('/api/forums').set(H).send(NEW_FORUM);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'comunidade', status: 'ativo', neighborhoodName: 'Éden', tags: ['bike', 'ciclofaixa'], following: true, canEdit: true });
    const slug = created.body.slug;
    // nome repetido (mesmo com outra grafia) é recusado
    expect((await bia.agent.post('/api/forums').set(H).send({ ...NEW_FORUM, name: 'CICLISTAS do eden' })).status).toBe(409);

    for (const q of ['ciclistas', 'EDEN', 'éden', 'bike']) {
      const found = await request(ctx.app).get(`/api/forums?q=${encodeURIComponent(q)}`);
      expect(found.body.items.map((f: { slug: string }) => f.slug)).toContain(slug);
    }
    expect((await request(ctx.app).get('/api/forums?neighborhood=EDEN')).body.items.map((f: { slug: string }) => f.slug)).toEqual([slug]);
    expect((await request(ctx.app).get('/api/forums?theme=mobilidade&kind=comunidade')).body.total).toBe(1);
    const search = await request(ctx.app).get('/api/search?q=ciclistas&type=foruns');
    expect(search.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Ciclistas do Éden', link: `/comunidade/f/${slug}` })]));

    // a outra pessoa segue, abre discussão, comenta e vota
    expect((await bia.agent.put(`/api/forums/${slug}/follow`).set(H)).body).toEqual({ following: true, followers: 2 });
    const t = await bia.agent.post(`/api/forums/${slug}/topics`).set(H).send({ title: 'Ciclofaixa da Av. Itavuvu', body: 'Alguém sabe quando a ciclofaixa vai ser pintada de novo?', tags: ['ciclofaixa'] });
    expect(t.status).toBe(201);
    // quem segue o fórum é avisado de discussões novas
    const na = await ana.agent.get('/api/notifications');
    expect(na.body.items.some((n: { kind: string; link: string }) => n.kind === 'forum.novas' && n.link === `/comunidade/f/${slug}`)).toBe(true);
    const c1 = await ana.agent.post(`/api/topics/${t.body.id}/comments`).set(H).send({ body: 'Disseram que em novembro.' });
    expect(c1.status).toBe(201);
    const reply = await bia.agent.post(`/api/topics/${t.body.id}/comments`).set(H).send({ body: 'Obrigada!', parentId: c1.body.id });
    expect(reply.body.replyTo.name).toBe('Ana S.');

    const forum = await bia.agent.get(`/api/forums/${slug}`);
    expect(forum.body).toMatchObject({ topics: 1, participants: 2, followers: 2, canEdit: false, canPost: true });
    // só o criador edita
    expect((await bia.agent.patch(`/api/forums/${slug}`).set(H).send({ description: 'Tentativa de mudar a descrição.' })).status).toBe(403);
    const edited = await ana.agent.patch(`/api/forums/${slug}`).set(H).send({ rules: 'Respeito sempre.' });
    // editar só as regras mantém tags e bairro
    expect(edited.body).toMatchObject({ rules: 'Respeito sempre.', tags: ['bike', 'ciclofaixa'], neighborhoodName: 'Éden' });
    expect((await ana.agent.patch(`/api/forums/${slug}`).set(H).send({ name: 'Outro nome qualquer' })).status).toBe(403);
    const byTag = await request(ctx.app).get(`/api/forums/${slug}/topics?tag=CicloFaixa`);
    expect(byTag.body.total).toBe(1);
    const mine = await bia.agent.get('/api/me/participation');
    expect(mine.body.followedForums.map((f: { slug: string }) => f.slug)).toEqual([slug]);
    expect(mine.body.myTopics[0].id).toBe(t.body.id);
  });

  it('votos de relevância são únicos e separados de confirmações e votos de proposta', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const caio = await citizen(ctx);
    const t = await ana.agent.post('/api/forums/mobilidade-urbana/topics').set(H).send({ title: 'Linha 20 atrasando', body: 'A linha 20 tem atrasado muito de manhã, alguém mais percebeu?' });
    expect((await ana.agent.put(`/api/topics/${t.body.id}/vote`).set(H)).status).toBe(403);
    await Promise.all([1, 2, 3].map(() => bia.agent.put(`/api/topics/${t.body.id}/vote`).set(H)));
    expect((await caio.agent.put(`/api/topics/${t.body.id}/vote`).set(H)).body).toEqual({ votes: 2, votedByMe: true });
    expect((await bia.agent.delete(`/api/topics/${t.body.id}/vote`).set(H)).body).toEqual({ votes: 1, votedByMe: false });
    const c = await bia.agent.post(`/api/topics/${t.body.id}/comments`).set(H).send({ body: 'Sim, todo dia.' });
    expect((await bia.agent.put(`/api/discussions/comments/${c.body.id}/vote`).set(H)).status).toBe(403);
    await ana.agent.put(`/api/discussions/comments/${c.body.id}/vote`).set(H);
    await ana.agent.put(`/api/discussions/comments/${c.body.id}/vote`).set(H);
    const comments = await caio.agent.get(`/api/topics/${t.body.id}/comments`);
    expect(comments.body.items[0]).toMatchObject({ votes: 1, votedByMe: false, canVote: true });
    // nenhuma tabela de confirmação ou de proposta foi tocada
    expect(Number((await ctx.db('proposal_votes').count({ n: '*' }).first())!.n)).toBe(0);
    expect(Number((await ctx.db('confirmations').count({ n: '*' }).first())!.n)).toBe(0);
    // ordenação por populares coloca a discussão votada à frente
    await bia.agent.post('/api/forums/mobilidade-urbana/topics').set(H).send({ title: 'Outra discussão recente', body: 'Texto de uma discussão nova, sem votos ainda.' });
    const pop = await request(ctx.app).get('/api/forums/mobilidade-urbana/topics?sort=populares');
    expect(pop.body.items.filter((x: { isInstitutional: boolean }) => !x.isInstitutional)[0].id).toBe(t.body.id);
  });

  it('aprovação prévia: só o administrador liga; fórum pendente fica oculto até a equipe aprovar', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const staff = await employee(ctx);
    const boss = await employee(ctx, 'admin');
    expect((await ana.agent.put('/api/admin/settings/forums').set(H).send({ approvalRequired: true })).status).toBe(403);
    expect((await staff.agent.put('/api/admin/settings/forums').set(H).send({ approvalRequired: true })).status).toBe(403);
    expect((await boss.agent.put('/api/admin/settings/forums').set(H).send({ approvalRequired: true })).status).toBe(200);

    const f = (await ana.agent.post('/api/forums').set(H).send(NEW_FORUM)).body;
    expect(f.status).toBe('pendente');
    expect((await request(ctx.app).get(`/api/forums/${f.slug}`)).status).toBe(404);
    expect((await bia.agent.get(`/api/forums/${f.slug}`)).status).toBe(404);
    expect((await ana.agent.get(`/api/forums/${f.slug}`)).status).toBe(200);
    expect((await ana.agent.post(`/api/forums/${f.slug}/topics`).set(H).send({ title: 'Primeira conversa', body: 'Ainda não aprovado, não deveria aceitar.' })).status).toBe(409);
    expect((await ana.agent.get('/api/admin/forums-pending')).status).toBe(403);
    const pend = await staff.agent.get('/api/admin/forums-pending');
    expect(pend.body.forums.map((x: { id: number }) => x.id)).toEqual([f.id]);
    expect((await ana.agent.post(`/api/admin/forums/${f.id}/review`).set(H).send({ decision: 'aprovar' })).status).toBe(403);
    expect((await staff.agent.post(`/api/admin/forums/${f.id}/review`).set(H).send({ decision: 'aprovar' })).body).toEqual({ status: 'ativo' });
    expect((await bia.agent.get(`/api/forums/${f.slug}`)).status).toBe(200);
    const notes = await ana.agent.get('/api/notifications');
    expect(notes.body.items.some((n: { link: string }) => n.link === `/comunidade/f/${f.slug}`)).toBe(true);
    expect(await ctx.db('audit_log').where({ action: 'forum.aprovar', target_id: f.id }).first()).toBeTruthy();
  });

  it('limite diário, denúncia de fórum e remoção de discussão com auditoria', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const staff = await employee(ctx);
    for (let i = 1; i <= 3; i++) expect((await ana.agent.post('/api/forums').set(H).send({ ...NEW_FORUM, name: `Fórum de teste número ${i}` })).status).toBe(201);
    expect((await ana.agent.post('/api/forums').set(H).send({ ...NEW_FORUM, name: 'Fórum de teste número 4' })).status).toBe(429);
    const slug = (await request(ctx.app).get('/api/forums?q=numero 1')).body.items[0].slug;
    const forum = (await bia.agent.get(`/api/forums/${slug}`)).body;
    expect(forum.canReport).toBe(true);
    expect((await bia.agent.post('/api/reports').set(H).send({ targetType: 'forum', targetId: forum.id, reason: 'spam' })).status).toBe(201);
    // fórum oficial não é denunciável
    const official = (await bia.agent.get('/api/forums/mobilidade-urbana')).body;
    expect((await bia.agent.post('/api/reports').set(H).send({ targetType: 'forum', targetId: official.id, reason: 'spam' })).status).toBeGreaterThanOrEqual(400);

    const t = await ana.agent.post('/api/forums/mobilidade-urbana/topics').set(H).send({ title: 'Linha 20 atrasando', body: 'A linha 20 tem atrasado muito de manhã, alguém mais percebeu?' });
    expect((await bia.agent.delete(`/api/topics/${t.body.id}`).set(H)).status).toBe(403);
    expect((await bia.agent.patch(`/api/topics/${t.body.id}/flags`).set(H).send({ locked: true })).status).toBe(403);
    expect((await staff.agent.patch(`/api/topics/${t.body.id}/flags`).set(H).send({ locked: true })).status).toBe(200);
    expect((await bia.agent.post(`/api/topics/${t.body.id}/comments`).set(H).send({ body: 'Também!' })).status).toBe(409);
    expect((await staff.agent.delete(`/api/topics/${t.body.id}`).set(H)).status).toBe(204);
    expect((await request(ctx.app).get(`/api/topics/${t.body.id}`)).status).toBe(404);
    const row = await ctx.db('topics').where({ id: t.body.id }).first();
    expect(row.hidden_reason).toBe('moderacao');
    expect(await ctx.db('audit_log').where({ action: 'moderacao.topico', target_id: t.body.id }).first()).toBeTruthy();
  });

  it('bairros de interesse são texto livre, privados e limitados', async () => {
    const ctx = await setup();
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const r = await ana.agent.put('/api/me/interests').set(H).send({ neighborhoods: ['  Jardim   Nova Esperança ', 'centro', 'CENTRO'] });
    expect(r.body).toEqual({ neighborhoods: ['Jardim Nova Esperança', 'centro'] });
    expect((await ana.agent.get('/api/me/interests')).body.neighborhoods).toHaveLength(2);
    expect((await bia.agent.get('/api/me/interests')).body.neighborhoods).toEqual([]);
    expect((await request(ctx.app).get('/api/me/interests')).status).toBe(401);
    expect((await ana.agent.put('/api/me/interests').set(H).send({ neighborhoods: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] })).status).toBe(400);
  });
});

describe('ideias e propostas', () => {
  it('cria proposta com voto único, retirada de voto e fase final que encerra a votação', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx, 'Ana Souza');
    const bia = await citizen(ctx, 'Bia Lima');
    const staff = await employee(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('calcada'), neighborhoodId: id.hood('Centro') });

    const created = await ana.agent
      .post('/api/proposals')
      .set(H)
      .field('title', 'Rampas em todas as esquinas da Rua XV')
      .field('body', 'Proposta de instalar rampas acessíveis em todas as esquinas da Rua XV de Novembro, que tem grande circulação de pedestres.')
      .field('categoryId', String(id.cat('calcada')))
      .field('scope', 'bairro').field('neighborhoodName', 'Centro')
      .field('occurrenceIds', String(occ.id));
    expect(created.status).toBe(201);
    const p = created.body;
    expect(p.status).toBe('nova');
    expect(p.occurrences[0].id).toBe(occ.id);

    // funcionário não vota e não cria proposta
    expect((await staff.agent.put(`/api/proposals/${p.id}/vote`).set(H)).status).toBe(403);
    expect((await staff.agent.post('/api/proposals').set(H).send({ title: 'Proposta da equipe x', body: 'x'.repeat(40) })).status).toBe(403);

    // votos repetidos e simultâneos contam uma vez só
    const results = await Promise.all([1, 2, 3].map(() => bia.agent.put(`/api/proposals/${p.id}/vote`).set(H)));
    for (const r of results) expect(r.status).toBe(200);
    expect(Number((await ctx.db('proposal_votes').where({ proposal_id: p.id }).count({ n: '*' }).first())!.n)).toBe(1);
    expect((await ana.agent.put(`/api/proposals/${p.id}/vote`).set(H)).body.votes).toBe(2);
    const withdrawn = await bia.agent.delete(`/api/proposals/${p.id}/vote`).set(H);
    expect(withdrawn.body).toEqual({ votes: 1, votedByMe: false });

    // cidadão não muda a fase; equipe muda e quem acompanha é avisado
    expect((await bia.agent.patch(`/api/proposals/${p.id}/status`).set(H).send({ status: 'aceita' })).status).toBe(403);
    expect((await staff.agent.patch(`/api/proposals/${p.id}/status`).set(H).send({ status: 'aceita' })).status).toBe(400);
    const accepted = await staff.agent.patch(`/api/proposals/${p.id}/status`).set(H).send({ status: 'aceita', note: 'Secretaria respondeu por ofício em 10/10.' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.isFinal).toBe(true);
    const notes = await ana.agent.get('/api/notifications');
    expect(notes.body.items[0]).toMatchObject({ kind: 'proposta.status', link: `/propostas/${p.id}` });
    expect((await bia.agent.put(`/api/proposals/${p.id}/vote`).set(H)).body.error.code).toBe('voting_closed');
    expect((await ana.agent.delete(`/api/proposals/${p.id}/vote`).set(H)).status).toBe(409);
    const hist = (await request(ctx.app).get(`/api/proposals/${p.id}`)).body.history;
    expect(hist.map((h: { toStatus: string }) => h.toStatus)).toEqual(['nova', 'aceita']);
    expect(await ctx.db('audit_log').where({ action: 'proposta.status', target_id: p.id }).first()).toBeTruthy();
  });

  it('valida campos, filtra e ordena por votos', async () => {
    const ctx = await setup();
    const id = await ids(ctx.db);
    const ana = await citizen(ctx);
    const bia = await citizen(ctx);
    const bad = await ana.agent.post('/api/proposals').set(H).send({ title: 'curto', body: 'pouco', referenceUrl: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['body', 'referenceUrl', 'title']);
    const mk = (title: string, hood?: string) =>
      ana.agent.post('/api/proposals').set(H).send({ title, body: 'Descrição longa o suficiente para a proposta ser aceita pelo sistema.', neighborhoodName: hood ?? '' });
    const a = (await mk('Mais árvores na praça central', id.hood('Centro'))).body;
    const b = (await mk('Ciclofaixa ligando os parques')).body;
    await bia.agent.put(`/api/proposals/${b.id}/vote`).set(H);
    const byVotes = await request(ctx.app).get('/api/proposals?sort=votos');
    expect(byVotes.body.items.map((x: { id: number }) => x.id)).toEqual([b.id, a.id]);
    const city = await request(ctx.app).get('/api/proposals?neighborhood=cidade');
    expect(city.body.items.map((x: { id: number }) => x.id)).toEqual([b.id]);
    const search = await request(ctx.app).get('/api/proposals?q=árvores');
    expect(search.body.total).toBe(1);
    // comentários com resposta e contagem
    const c = await bia.agent.post(`/api/proposals/${a.id}/comments`).set(H).send({ body: 'Apoio, a praça é muito quente.' });
    expect(c.status).toBe(201);
    expect((await request(ctx.app).get(`/api/proposals/${a.id}`)).body.comments).toBe(1);
  });
});
