import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { H, admin, citizen, createOcc, employee, ids, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.db.destroy();
});

describe('exclusão pelo administrador', () => {
  it('administrador exclui reclamação de outra pessoa; demais perfis são recusados pela API', async () => {
    const id = await ids(ctx.db);
    const ana = await citizen(ctx, 'Ana R.');
    const bia = await citizen(ctx, 'Bia S.');
    const staff = await employee(ctx);
    const adm = await admin(ctx);
    const occ = await createOcc(ana.agent, { categoryId: id.cat('buraco') });

    // dados ligados: foto no disco, confirmação, anotação, publicação e aviso apontando para ela
    const photo = `${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(ctx.uploadDir, photo), 'x');
    await ctx.db('occurrences').where({ id: occ.id }).update({ photo_path: photo });
    expect((await bia.agent.post(`/api/occurrences/${occ.id}/confirmations`).set(H)).status).toBeLessThan(300);
    expect((await staff.agent.post(`/api/admin/occurrences/${occ.id}/notes`).set(H).send({ body: 'Equipe vai verificar.', visibility: 'publica' })).status).toBeLessThan(300);
    expect(((await ana.agent.get('/api/occurrences/map')).body.markers as { id: number }[]).some((m) => m.id === occ.id)).toBe(true);
    const post = await ana.agent.post('/api/community/posts').set(H).send({ body: 'Olhem esse buraco aqui na rua.', occurrenceId: occ.id });
    expect(post.status).toBe(201);
    // a autora recebeu aviso da anotação pública, com link para a reclamação
    expect(await ctx.db('notifications').where({ user_id: ana.user.id }).where('link', 'like', `/ocorrencias/${occ.id}%`).first()).toBeTruthy();

    expect((await request(ctx.app).delete(`/api/admin/occurrences/${occ.id}`).set(H)).status).toBe(401);
    expect((await ana.agent.delete(`/api/admin/occurrences/${occ.id}`).set(H)).status).toBe(403);
    expect((await bia.agent.delete(`/api/admin/occurrences/${occ.id}`).set(H)).status).toBe(403);
    expect((await staff.agent.delete(`/api/admin/occurrences/${occ.id}`).set(H)).status).toBe(403);
    // sem o cabeçalho da aplicação (proteção contra CSRF) também não passa
    expect((await adm.agent.delete(`/api/admin/occurrences/${occ.id}`)).status).toBe(403);
    expect(await ctx.db('occurrences').where({ id: occ.id }).first('id')).toBeTruthy();

    const del = await adm.agent.delete(`/api/admin/occurrences/${occ.id}`).set(H);
    expect(del.status).toBe(204);
    expect((await ana.agent.get(`/api/occurrences/${occ.id}`)).status).toBe(404);
    expect((await adm.agent.get(`/api/admin/occurrences/${occ.id}`)).status).toBe(404);
    const markers = (await ana.agent.get('/api/occurrences/map')).body.markers as { id: number }[];
    expect(markers.some((m) => m.id === occ.id)).toBe(false);
    expect(await ctx.db('confirmations').where({ occurrence_id: occ.id }).first()).toBeUndefined();
    expect(await ctx.db('occurrence_notes').where({ occurrence_id: occ.id }).first()).toBeUndefined();
    expect(await ctx.db('notifications').where('link', 'like', `/ocorrencias/${occ.id}%`).first()).toBeUndefined();
    expect(fs.existsSync(path.join(ctx.uploadDir, photo))).toBe(false);
    // a publicação continua, só perde a ligação
    const feed = (await ana.agent.get('/api/community/posts')).body.items;
    expect(feed[0]).toMatchObject({ id: post.body.id, occurrence: null });
    const log = await ctx.db('audit_log').where({ action: 'ocorrencia.excluida', target_id: occ.id }).first();
    expect(log.actor_id).toBe(adm.user.id);
    expect(JSON.parse(log.details)).toMatchObject({ codigo: `UT-${String(occ.id).padStart(5, '0')}`, autor: ana.user.id });

    expect((await adm.agent.delete(`/api/admin/occurrences/${occ.id}`).set(H)).status).toBe(404);
  });

  it('publicação do feed: administrador remove a de outra pessoa, cidadão não', async () => {
    const ana = await citizen(ctx, 'Ana R.');
    const bia = await citizen(ctx, 'Bia S.');
    const adm = await admin(ctx);
    const post = (await ana.agent.post('/api/community/posts').set(H).send({ body: 'Semáforo piscando na avenida.' })).body;
    await bia.agent.put(`/api/community/posts/${post.id}/like`).set(H);
    expect(await ctx.db('notifications').where({ user_id: ana.user.id }).count({ n: '*' }).first()).toEqual({ n: 1 });

    expect((await bia.agent.delete(`/api/community/posts/${post.id}`).set(H)).status).toBe(403);
    expect((await adm.agent.get('/api/community/posts')).body.items[0].canDelete).toBe(true);
    expect((await adm.agent.delete(`/api/community/posts/${post.id}`).set(H)).status).toBe(204);
    expect((await ana.agent.get('/api/community/posts')).body.items).toHaveLength(0);
    expect((await ana.agent.get(`/api/community/posts/${post.id}`)).status).toBe(404);
    // o aviso da curtida apontava para a publicação apagada e saiu junto
    expect(await ctx.db('notifications').where({ user_id: ana.user.id }).first()).toBeUndefined();
    expect(await ctx.db('audit_log').where({ action: 'moderacao.publicacao', target_id: post.id }).first()).toBeTruthy();
  });

  it('proposta: administrador remove a de outra pessoa; funcionário comum e cidadão não', async () => {
    const id = await ids(ctx.db);
    const ana = await citizen(ctx, 'Ana R.');
    const bia = await citizen(ctx, 'Bia S.');
    const staff = await employee(ctx);
    const adm = await admin(ctx);
    const p = (
      await ana.agent
        .post('/api/proposals')
        .set(H)
        .field('title', 'Bicicletário na praça central')
        .field('body', 'Instalar um bicicletário coberto na praça central para quem vai ao comércio de bicicleta.')
        .field('categoryId', String(id.cat('calcada')))
        .field('scope', 'cidade')
    ).body;
    expect((await bia.agent.get(`/api/proposals/${p.id}`)).body.canDelete).toBe(false);
    expect((await adm.agent.get(`/api/proposals/${p.id}`)).body.canDelete).toBe(true);
    expect((await bia.agent.delete(`/api/proposals/${p.id}`).set(H)).status).toBe(403);
    expect((await staff.agent.delete(`/api/proposals/${p.id}`).set(H)).status).toBe(403);
    expect((await adm.agent.delete(`/api/proposals/${p.id}`).set(H)).status).toBe(204);
    expect((await bia.agent.get(`/api/proposals/${p.id}`)).status).toBe(404);
    const row = await ctx.db('proposals').where({ id: p.id }).first('hidden_reason');
    expect(row.hidden_reason).toBe('moderacao');
  });
});

describe('notificações do feed', () => {
  it('curtida e comentário avisam o autor, sem duplicar e sem avisar a própria pessoa', async () => {
    const ana = await citizen(ctx, 'Ana R.');
    const bia = await citizen(ctx, 'Bia S.');
    const caio = await citizen(ctx, 'Caio T.');
    const post = (await ana.agent.post('/api/community/posts').set(H).send({ body: 'Calçada quebrada perto da escola.' })).body;

    // a própria autora curtindo e comentando não gera aviso
    await ana.agent.put(`/api/community/posts/${post.id}/like`).set(H);
    await ana.agent.post(`/api/community/posts/${post.id}/comments`).set(H).send({ body: 'Atualizando: piorou hoje.' });
    expect((await ana.agent.get('/api/notifications/unread-count')).body.unread).toBe(0);

    // curtir, descurtir e curtir de novo avisa uma vez só
    await bia.agent.put(`/api/community/posts/${post.id}/like`).set(H);
    await bia.agent.delete(`/api/community/posts/${post.id}/like`).set(H);
    await bia.agent.put(`/api/community/posts/${post.id}/like`).set(H);
    let list = (await ana.agent.get('/api/notifications')).body;
    expect(list.unread).toBe(1);
    expect(list.items[0]).toMatchObject({ kind: 'feed.curtida', title: 'Bia S. curtiu sua publicação', link: `/comunidade?publicacao=${post.id}`, count: 1, read: false });

    // curtidas simultâneas da mesma pessoa não duplicam
    await Promise.all([1, 2, 3].map(() => caio.agent.put(`/api/community/posts/${post.id}/like`).set(H)));
    list = (await ana.agent.get('/api/notifications')).body;
    expect(list.unread).toBe(1);
    expect(list.items[0]).toMatchObject({ kind: 'feed.curtida', title: 'Caio T. curtiu sua publicação', count: 2 });

    await bia.agent.post(`/api/community/posts/${post.id}/comments`).set(H).send({ body: 'Vi também, está perigoso.' });
    list = (await ana.agent.get('/api/notifications')).body;
    expect(list.unread).toBe(2);
    expect(list.items[0]).toMatchObject({ kind: 'feed.comentario', title: 'Bia S. comentou na sua publicação', body: 'Vi também, está perigoso.', link: `/comunidade?publicacao=${post.id}` });

    // ninguém além da autora recebe esses avisos
    expect((await bia.agent.get('/api/notifications')).body.items).toHaveLength(0);
    expect((await caio.agent.get('/api/notifications')).body.items).toHaveLength(0);
    // e ninguém marca como lido o aviso de outra pessoa
    expect((await bia.agent.post(`/api/notifications/${list.items[0].id}/read`).set(H)).status).toBe(404);

    // os avisos ficam no banco: nova sessão da mesma pessoa continua vendo
    const again = request.agent(ctx.app);
    await again.post('/api/auth/login').set(H).send({ email: ana.user.email, password: 'senha1234' });
    expect((await again.get('/api/notifications')).body.unread).toBe(2);
  });

  it('o canal em tempo real entrega o novo contador sem recarregar e só para o dono', async () => {
    const ana = await citizen(ctx, 'Ana R.');
    const bia = await citizen(ctx, 'Bia S.');
    const post = (await ana.agent.post('/api/community/posts').set(H).send({ body: 'Lâmpada queimada na praça.' })).body;

    const server = http.createServer(ctx.app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const login = async (email: string) => {
      const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'senha1234' }) });
      return (r.headers.get('set-cookie') ?? '').split(';')[0];
    };
    const open = async (cookie: string) => {
      const ac = new AbortController();
      const res = await fetch(`${base}/api/notifications/stream`, { headers: { cookie }, signal: ac.signal });
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      // lê até chegar o próximo evento "notificacoes"
      const next = async (ms = 3000) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          const m = /event: notificacoes\ndata: (.*)\n\n/.exec(buf);
          if (m) {
            buf = buf.slice(m.index + m[0].length);
            return JSON.parse(m[1]);
          }
          const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), deadline - Date.now()))]);
          if (!r || r.done) break;
          buf += dec.decode(r.value);
        }
        return null;
      };
      return { next, close: () => ac.abort() };
    };

    try {
      expect((await fetch(`${base}/api/notifications/stream`)).status).toBe(401);
      const anaLive = await open(await login(ana.user.email));
      const biaLive = await open(await login(bia.user.email));
      expect(await anaLive.next()).toMatchObject({ unread: 0, latest: null });
      expect(await biaLive.next()).toMatchObject({ unread: 0 });

      await bia.agent.put(`/api/community/posts/${post.id}/like`).set(H);
      const ev = await anaLive.next();
      expect(ev).toMatchObject({ unread: 1, latest: { kind: 'feed.curtida', link: `/comunidade?publicacao=${post.id}`, read: false } });

      await bia.agent.post(`/api/community/posts/${post.id}/comments`).set(H).send({ body: 'Passei lá agora, continua apagada.' });
      expect(await anaLive.next()).toMatchObject({ unread: 2, latest: { kind: 'feed.comentario' } });

      // ler em outra aba também atualiza esta conexão
      await ana.agent.post('/api/notifications/read-all').set(H);
      expect(await anaLive.next()).toMatchObject({ unread: 0 });

      // a conexão da Bia não recebeu nada sobre a Ana
      expect(await biaLive.next(400)).toBeNull();
      anaLive.close();
      biaLive.close();
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
