import type { Knex } from 'knex';
import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { nowIso, todayLocal } from '../lib/dates.js';
import { fromZod, notFound } from '../lib/errors.js';
import { emitAfterCommit, emitUserChange } from '../lib/realtime.js';
import { isStaffRole, type SessionUser } from '../types.js';

export interface NoticeInput {
  kind: string;
  title: string;
  body?: string | null;
  // caminho interno do site, ex.: /ocorrencias/12
  link: string;
  // avisos com a mesma chave viram um só enquanto não forem lidos
  dedupeKey?: string | null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// envia um aviso para cada pessoa da lista, nunca para quem causou o evento
export async function notify(db: Knex, userIds: Iterable<number>, n: NoticeInput, actorId?: number | null) {
  const targets = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id !== actorId);
  if (targets.length === 0) return;
  if (!n.link.startsWith('/')) throw new Error('link de notificação precisa ser um caminho interno');
  const row = { kind: n.kind, title: clip(n.title, 160), body: n.body ? clip(n.body, 300) : null, link: n.link, created_at: nowIso() };
  for (const userId of targets) {
    if (n.dedupeKey) {
      const updated = await db('notifications')
        .where({ user_id: userId, dedupe_key: n.dedupeKey })
        .whereNull('read_at')
        .update({ ...row, count: db.raw('count + 1') });
      if (updated > 0) continue;
    }
    try {
      await db('notifications').insert({ ...row, user_id: userId, dedupe_key: n.dedupeKey ?? null, count: 1 });
    } catch (err) {
      // inserção simultânea com a mesma chave: o índice único garante um só aviso
      if (!String((err as Error).message).includes('UNIQUE')) throw err;
    }
  }
  emitAfterCommit(db, targets);
}

// remove avisos que apontam para um conteúdo apagado e atualiza quem estava com eles abertos
export async function dropNoticesFor(db: Knex, links: string[]) {
  if (links.length === 0) return;
  const users = (await db('notifications').whereIn('link', links).distinct('user_id')) as { user_id: number }[];
  if (users.length === 0) return;
  await db('notifications').whereIn('link', links).delete();
  emitAfterCommit(
    db,
    users.map((u) => u.user_id),
  );
}

export async function staffIds(db: Knex) {
  return ((await db('users').whereIn('role', ['staff', 'admin']).select('id')) as { id: number }[]).map((r) => r.id);
}

// pessoas que confirmaram a ocorrência (acompanham o problema sem tê-lo registrado)
export async function confirmerIds(db: Knex, occurrenceId: number) {
  return ((await db('confirmations').where({ occurrence_id: occurrenceId }).select('user_id')) as { user_id: number }[]).map((r) => r.user_id);
}

export async function followerIds(db: Knex, targetType: 'proposal' | 'topic', targetId: number) {
  return ((await db('follows').where({ target_type: targetType, target_id: targetId }).select('user_id')) as { user_id: number }[]).map((r) => r.user_id);
}

// aviso diário para a equipe sobre ocorrências paradas; gerado quando a pessoa abre a central
export async function ensureStaleNotice(db: Db, user: SessionUser, staleDays: number) {
  if (!isStaffRole(user.role)) return;
  const key = `paradas:${todayLocal()}`;
  const exists = await db('notifications').where({ user_id: user.id, dedupe_key: key }).first('id');
  if (exists) return;
  const limit = new Date(Date.now() - staleDays * 86_400_000).toISOString();
  const row = await db('occurrences as o')
    .join('statuses as s', 's.slug', 'o.status')
    .where('s.is_closed', false)
    .where('o.updated_at', '<', limit)
    .count({ n: '*' })
    .first();
  const n = Number(row?.n ?? 0);
  if (n === 0) return;
  try {
    await db('notifications').insert({
      user_id: user.id,
      kind: 'equipe.paradas',
      title: n === 1 ? `1 ocorrência sem movimentação há mais de ${staleDays} dias` : `${n} ocorrências sem movimentação há mais de ${staleDays} dias`,
      body: 'Veja na Fila de Análise com o filtro "Sem movimentação".',
      link: '/admin/fila?parada=1',
      dedupe_key: key,
      count: 1,
      created_at: nowIso(),
    });
    emitUserChange([user.id]);
  } catch {
    // outra requisição criou o mesmo aviso ao mesmo tempo
  }
}

const listSchema = z.object({
  filter: z.enum(['todas', 'nao-lidas']).default('todas'),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function listNotifications(db: Db, user: SessionUser, query: unknown) {
  const parsed = listSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const f = parsed.data;
  const qb = db('notifications').where({ user_id: user.id });
  if (f.filter === 'nao-lidas') qb.whereNull('read_at');
  if (f.before) qb.where('id', '<', f.before);
  // avisos agrupados sobem para o topo quando recebem novidade
  const rows = (await qb.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(f.limit + 1).select()) as Record<string, unknown>[];
  const items = rows.slice(0, f.limit).map((r) => ({
    id: r.id as number,
    kind: r.kind as string,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    link: r.link as string,
    count: Number(r.count),
    createdAt: r.created_at as string,
    read: r.read_at !== null,
  }));
  return { items, unread: await unreadCount(db, user.id), nextBefore: rows.length > f.limit ? items[items.length - 1].id : null };
}

export async function unreadCount(db: Db, userId: number) {
  const row = await db('notifications').where({ user_id: userId }).whereNull('read_at').count({ n: '*' }).first();
  return Number(row?.n ?? 0);
}

// marca como lida só se for da própria pessoa
export async function markRead(db: Db, user: SessionUser, id: number) {
  const row = await db('notifications').where({ id, user_id: user.id }).first('id', 'read_at');
  if (!row) throw notFound('Notificação não encontrada.');
  if (!row.read_at) {
    await db('notifications').where({ id }).update({ read_at: nowIso() });
    emitUserChange([user.id]);
  }
  return { unread: await unreadCount(db, user.id) };
}

export async function markAllRead(db: Db, user: SessionUser) {
  const n = await db('notifications').where({ user_id: user.id }).whereNull('read_at').update({ read_at: nowIso() });
  if (n > 0) emitUserChange([user.id]);
  return { unread: 0 };
}

// o que a conexão em tempo real envia: contador e o aviso mais recente (para o alerta na tela)
export async function liveSnapshot(db: Db, userId: number) {
  const latest = (await db('notifications').where({ user_id: userId }).orderBy('created_at', 'desc').orderBy('id', 'desc').first('id', 'kind', 'title', 'link', 'count', 'created_at', 'read_at')) as
    | Record<string, unknown>
    | undefined;
  return {
    unread: await unreadCount(db, userId),
    latest: latest
      ? { id: latest.id as number, kind: latest.kind as string, title: latest.title as string, link: latest.link as string, count: Number(latest.count), createdAt: latest.created_at as string, read: latest.read_at !== null }
      : null,
  };
}
