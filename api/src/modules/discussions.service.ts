import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { HttpError, conflict, forbidden, fromZod, notFound } from '../lib/errors.js';
import { bodyField, excerpt } from '../lib/text.js';
import { isStaffRole, type Role, type SessionUser } from '../types.js';
import { publicName } from './community.service.js';
import { followerIds, notify } from './notifications.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Target = 'proposal' | 'topic';

const initialsOf = (full: string) => {
  const p = full.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
};

// autor público: primeiro nome e inicial; e-mail e id nunca saem
export function authorOf(r: Row, viewer?: SessionUser, prefix = 'author') {
  const name = r[`${prefix}_name`] as string | null;
  if (!name) return null;
  return {
    name: publicName(name),
    initials: initialsOf(name),
    isStaff: isStaffRole(r[`${prefix}_role`] as Role),
    isMe: Boolean(viewer && r[`${prefix}_id`] === viewer.id),
    isDemo: Boolean(r[`${prefix}_demo`]),
  };
}

export const authorCols = (db: Db, alias = 'u', prefix = 'author') => [
  `${alias}.name as ${prefix}_name`,
  `${alias}.role as ${prefix}_role`,
  db.raw(`${alias}.email like '%@demo.urbantalk.local' as ${prefix}_demo`),
];

export const DUP_WINDOW_MS = 10 * 60 * 1000;
export const recentSince = () => new Date(Date.now() - DUP_WINDOW_MS).toISOString();

const commentSchema = z.object({
  body: bodyField(1, 1000, 'seu comentário'),
  parentId: z.coerce.number().int().positive().optional().nullable(),
});

const pageSchema = z.object({
  after: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

// confere se o alvo existe, está visível e aceita comentários
async function loadTarget(db: Db, type: Target, id: number) {
  if (type === 'topic') {
    const t = await db('topics as t').join('forums as f', 'f.id', 't.forum_id').where('t.id', id).whereNull('t.hidden_at').first('t.id', 't.title', 't.locked', 't.author_id', 'f.active', 'f.status', 'f.hidden_at');
    if (!t || !t.active || t.hidden_at) throw notFound('Discussão não encontrada. Ela pode ter sido removida.');
    // fórum ainda não aprovado não recebe respostas
    return { title: t.title as string, locked: Boolean(t.locked) || t.status !== 'ativo', authorId: t.author_id as number | null, link: `/comunidade/discussoes/${id}` };
  }
  const p = await db('proposals').where({ id }).whereNull('hidden_at').first('id', 'title', 'author_id');
  if (!p) throw notFound('Proposta não encontrada. Ela pode ter sido removida.');
  return { title: p.title as string, locked: false, authorId: p.author_id as number, link: `/propostas/${id}` };
}

function commentDto(r: Row, viewer?: SessionUser) {
  return {
    id: r.id as number,
    body: r.body as string,
    createdAt: r.created_at as string,
    parentId: (r.parent_id as number | null) ?? null,
    // trecho do comentário respondido, para dar contexto sem aninhar a conversa
    replyTo: r.parent_id
      ? { name: r.parent_author_name ? publicName(r.parent_author_name) : null, excerpt: r.parent_body && !r.parent_gone ? excerpt(r.parent_body, 80) : null }
      : null,
    author: authorOf(r, viewer)!,
    votes: Number(r.votes ?? 0),
    votedByMe: Boolean(r.voted),
    canVote: Boolean(viewer && r.author_id !== viewer.id),
    canDelete: Boolean(viewer && (r.author_id === viewer.id || isStaffRole(viewer.role))),
    canReport: Boolean(viewer && r.author_id !== viewer.id),
  };
}

function commentsQuery(db: Db, viewer?: SessionUser) {
  const votes = db('comment_votes').select('comment_id').count({ n: '*' }).groupBy('comment_id').as('cv');
  return db('discussion_comments as dc')
    .join('users as u', 'u.id', 'dc.author_id')
    .leftJoin(votes, 'cv.comment_id', 'dc.id')
    .leftJoin('comment_votes as mine', (j) => j.on('mine.comment_id', 'dc.id').andOnVal('mine.user_id', viewer?.id ?? 0))
    .leftJoin('discussion_comments as pc', 'pc.id', 'dc.parent_id')
    .leftJoin('users as pu', 'pu.id', 'pc.author_id')
    .whereNull('dc.deleted_at')
    .whereNull('dc.hidden_at')
    .select(
      'dc.id',
      'dc.body',
      'dc.created_at',
      'dc.parent_id',
      'dc.author_id',
      ...authorCols(db),
      'pc.body as parent_body',
      db.raw('(pc.deleted_at is not null or pc.hidden_at is not null) as parent_gone'),
      'pu.name as parent_author_name',
      db.raw('coalesce(cv.n, 0) as votes'),
      db.raw('mine.user_id is not null as voted'),
    );
}

export async function listComments(db: Db, type: Target, id: number, viewer: SessionUser | undefined, query: unknown) {
  await loadTarget(db, type, id);
  const parsed = pageSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Paginação inválida.');
  const qb = commentsQuery(db, viewer).where({ 'dc.target_type': type, 'dc.target_id': id }).orderBy('dc.id', 'asc').limit(parsed.data.limit + 1);
  if (parsed.data.after) qb.where('dc.id', '>', parsed.data.after);
  const rows = (await qb) as Row[];
  const items = rows.slice(0, parsed.data.limit).map((r) => commentDto(r, viewer));
  return { items, nextAfter: rows.length > parsed.data.limit ? items[items.length - 1].id : null };
}

export async function countComments(db: Db, type: Target, ids: number[]) {
  if (ids.length === 0) return new Map<number, number>();
  const rows = (await db('discussion_comments')
    .where({ target_type: type })
    .whereIn('target_id', ids)
    .whereNull('deleted_at')
    .whereNull('hidden_at')
    .select('target_id')
    .count({ n: '*' })
    .groupBy('target_id')) as Row[];
  return new Map(rows.map((r) => [r.target_id as number, Number(r.n)]));
}

export async function follow(db: Db, userId: number, type: Target, id: number) {
  await db('follows').insert({ user_id: userId, target_type: type, target_id: id, created_at: nowIso() }).onConflict(['user_id', 'target_type', 'target_id']).ignore();
}

export async function setFollow(db: Db, viewer: SessionUser, type: Target, id: number, on: boolean) {
  await loadTarget(db, type, id);
  if (on) await follow(db, viewer.id, type, id);
  else await db('follows').where({ user_id: viewer.id, target_type: type, target_id: id }).delete();
  return { following: on };
}

export async function isFollowing(db: Db, viewer: SessionUser | undefined, type: Target, id: number) {
  if (!viewer) return false;
  return Boolean(await db('follows').where({ user_id: viewer.id, target_type: type, target_id: id }).first('user_id'));
}

export async function createComment(db: Db, viewer: SessionUser, type: Target, id: number, body: unknown) {
  const target = await loadTarget(db, type, id);
  if (target.locked) throw conflict('locked', 'Esta discussão foi encerrada pela moderação e não recebe novas respostas.');
  const parsed = commentSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const { body: text, parentId } = parsed.data;
  let parent: Row | undefined;
  if (parentId) {
    parent = await db('discussion_comments').where({ id: parentId, target_type: type, target_id: id }).whereNull('deleted_at').whereNull('hidden_at').first('id', 'author_id');
    if (!parent) throw notFound('O comentário que você quer responder não existe mais.');
  }
  const dup = await db('discussion_comments').where({ target_type: type, target_id: id, author_id: viewer.id, body: text }).where('created_at', '>=', recentSince()).whereNull('deleted_at').first('id');
  if (dup) throw new HttpError(409, 'duplicate', 'Você acabou de enviar esse mesmo comentário.');

  const now = nowIso();
  const newId = await db.transaction(async (trx) => {
    const [cid] = await trx('discussion_comments').insert({ target_type: type, target_id: id, parent_id: parentId ?? null, author_id: viewer.id, body: text, created_at: now });
    if (type === 'topic') await trx('topics').where({ id }).update({ last_activity_at: now });
    // quem participa passa a acompanhar a conversa
    await follow(trx as unknown as Db, viewer.id, type, id);
    return cid as number;
  });

  const who = publicName(viewer.name);
  if (parent && parent.author_id !== viewer.id) {
    await notify(db, [parent.author_id], {
      kind: 'comentario.resposta',
      title: `${who} respondeu ao seu comentário em “${excerpt(target.title, 60)}”`,
      body: excerpt(text, 120),
      link: target.link,
      dedupeKey: `resposta:${parent.id}`,
    }, viewer.id);
  }
  const followers = (await followerIds(db, type, id)).filter((u) => u !== parent?.author_id);
  await notify(db, followers, {
    kind: type === 'topic' ? 'topico.respostas' : 'proposta.comentarios',
    title: type === 'topic' ? `Novas respostas em “${excerpt(target.title, 70)}”` : `Novos comentários na proposta “${excerpt(target.title, 60)}”`,
    body: `${who}: ${excerpt(text, 100)}`,
    link: target.link,
    dedupeKey: `${type}-comentarios:${id}`,
  }, viewer.id);

  const row = (await commentsQuery(db, viewer).where('dc.id', newId).first()) as Row;
  return commentDto(row, viewer);
}

export async function deleteComment(db: Db, viewer: SessionUser, commentId: number) {
  const c = await db('discussion_comments').where({ id: commentId }).whereNull('deleted_at').first('id', 'author_id', 'target_type', 'target_id');
  if (!c) throw notFound('Comentário não encontrado.');
  const own = c.author_id === viewer.id;
  if (!own && !isStaffRole(viewer.role)) throw forbidden('Você só pode apagar os seus comentários.');
  await db.transaction(async (trx) => {
    await trx('discussion_comments').where({ id: commentId }).update({ deleted_at: nowIso(), deleted_by: viewer.id });
    if (!own) await audit(trx, viewer.id, 'moderacao.comentario_discussao', 'comment', commentId, { autor: c.author_id, alvo: `${c.target_type}:${c.target_id}` });
  });
}

// voto "útil" em comentário: um por pessoa, nunca no próprio comentário
export async function setCommentVote(db: Db, viewer: SessionUser, commentId: number, on: boolean) {
  const c = await db('discussion_comments').where({ id: commentId }).whereNull('deleted_at').whereNull('hidden_at').first('id', 'author_id');
  if (!c) throw notFound('Comentário não encontrado.');
  if (c.author_id === viewer.id) throw forbidden('Não é possível votar no próprio comentário.');
  if (on) await db('comment_votes').insert({ comment_id: commentId, user_id: viewer.id, created_at: nowIso() }).onConflict(['comment_id', 'user_id']).ignore();
  else await db('comment_votes').where({ comment_id: commentId, user_id: viewer.id }).delete();
  const votes = Number((await db('comment_votes').where({ comment_id: commentId }).count({ n: '*' }).first())?.n ?? 0);
  return { votes, votedByMe: on };
}
