import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { bodyField } from '../lib/text.js';
import { HttpError, badRequest, forbidden, fromZod, notFound } from '../lib/errors.js';
import { isStaffRole, type Role, type SessionUser } from '../types.js';
import { occCode } from './occurrences.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// nome público: primeiro nome e inicial do sobrenome; e-mail nunca sai daqui
export function publicName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Pessoa';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

const initials = (full: string) => {
  const p = full.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
};

export const postSchema = z.object({
  body: bodyField(3, 500, 'sua publicação'),
  occurrenceId: z.coerce.number().int().positive().optional().nullable(),
});
export const commentSchema = z.object({ body: bodyField(1, 300, 'seu comentário') });

const feedSchema = z.object({
  filter: z.enum(['recentes', 'ocorrencias', 'minhas']).default('recentes'),
  occurrence: z.coerce.number().int().positive().optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

const author = (r: Row, viewer: SessionUser) => ({
  name: publicName(r.author_name),
  initials: initials(r.author_name),
  isStaff: isStaffRole(r.author_role as Role),
  isMe: r.author_id === viewer.id,
  // contas de demonstração ganham um selo, sem expor o e-mail
  isDemo: Boolean(r.author_demo),
});

function postsQuery(db: Db, viewer: SessionUser) {
  const likes = db('post_likes').select('post_id').count({ n: '*' }).groupBy('post_id').as('lk');
  const comments = db('post_comments').whereNull('deleted_at').whereNull('hidden_at').select('post_id').count({ n: '*' }).groupBy('post_id').as('cm');
  return db('posts as p')
    .join('users as u', 'u.id', 'p.author_id')
    .leftJoin(likes, 'lk.post_id', 'p.id')
    .leftJoin(comments, 'cm.post_id', 'p.id')
    .leftJoin('occurrences as o', 'o.id', 'p.occurrence_id')
    .leftJoin('categories as c', 'c.id', 'o.category_id')
    .leftJoin('post_likes as me', (j) => j.on('me.post_id', 'p.id').andOnVal('me.user_id', viewer.id))
    .whereNull('p.deleted_at')
    .whereNull('p.hidden_at')
    .select(
      'p.id',
      'p.body',
      'p.created_at',
      'p.author_id',
      'u.name as author_name',
      'u.role as author_role',
      db.raw("u.email like '%@demo.urbantalk.local' as author_demo"),
      'o.id as occ_id',
      'o.status as occ_status',
      'o.street as occ_street',
      'c.name as occ_category',
      'c.icon as occ_icon',
      'o.neighborhood_name as occ_neighborhood',
      db.raw('coalesce(lk.n, 0) as likes'),
      db.raw('coalesce(cm.n, 0) as comments'),
      db.raw('me.user_id is not null as liked'),
    );
}

const toPost = (r: Row, viewer: SessionUser) => ({
  id: r.id as number,
  body: r.body as string,
  createdAt: r.created_at as string,
  author: author(r, viewer),
  occurrence: r.occ_id
    ? {
        id: r.occ_id as number,
        code: occCode(r.occ_id),
        status: r.occ_status as string,
        categoryName: r.occ_category as string,
        categoryIcon: r.occ_icon as string,
        neighborhoodName: (r.occ_neighborhood as string | null) ?? 'Cidade toda',
        street: (r.occ_street as string | null) ?? null,
      }
    : null,
  likes: Number(r.likes),
  comments: Number(r.comments),
  likedByMe: Boolean(r.liked),
  canDelete: r.author_id === viewer.id || isStaffRole(viewer.role),
  canReport: r.author_id !== viewer.id,
});

export type PostDto = ReturnType<typeof toPost>;

// feed paginado por cursor: "before" é o id da última publicação já mostrada
export async function listPosts(db: Db, viewer: SessionUser, query: unknown) {
  const parsed = feedSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const f = parsed.data;
  const qb = postsQuery(db, viewer);
  if (f.filter === 'ocorrencias') qb.whereNotNull('p.occurrence_id');
  if (f.filter === 'minhas') qb.where('p.author_id', viewer.id);
  if (f.occurrence) qb.where('p.occurrence_id', f.occurrence);
  if (f.before) qb.where('p.id', '<', f.before);
  const rows = (await qb.orderBy('p.id', 'desc').limit(f.limit + 1)) as Row[];
  const items = rows.slice(0, f.limit).map((r) => toPost(r, viewer));
  return { items, nextBefore: rows.length > f.limit ? items[items.length - 1].id : null };
}

export async function getPost(db: Db, viewer: SessionUser, id: number) {
  const row = await postsQuery(db, viewer).where('p.id', id).first();
  if (!row) throw notFound('Publicação não encontrada. Ela pode ter sido removida.');
  return toPost(row as Row, viewer);
}

const DUP_WINDOW_MS = 10 * 60 * 1000;

export async function createPost(db: Db, viewer: SessionUser, body: unknown) {
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const { body: text, occurrenceId } = parsed.data;
  if (occurrenceId && !(await db('occurrences').where({ id: occurrenceId }).first('id'))) {
    throw badRequest('A reclamação escolhida não existe.', { occurrenceId: 'Reclamação não encontrada.' });
  }
  // mesma mensagem repetida em seguida é tratada como spam
  const since = new Date(Date.now() - DUP_WINDOW_MS).toISOString();
  const dup = await db('posts').where({ author_id: viewer.id, body: text }).where('created_at', '>=', since).whereNull('deleted_at').first('id');
  if (dup) throw new HttpError(409, 'duplicate', 'Você acabou de publicar essa mesma mensagem.');
  const [id] = await db('posts').insert({ author_id: viewer.id, occurrence_id: occurrenceId ?? null, body: text, created_at: nowIso() });
  return getPost(db, viewer, id);
}

async function activePost(db: Db, id: number) {
  const post = await db('posts').where({ id }).whereNull('deleted_at').whereNull('hidden_at').first('id', 'author_id');
  if (!post) throw notFound('Publicação não encontrada. Ela pode ter sido removida.');
  return post as Row;
}

export async function deletePost(db: Db, viewer: SessionUser, id: number) {
  const post = await activePost(db, id);
  const own = post.author_id === viewer.id;
  if (!own && !isStaffRole(viewer.role)) throw forbidden('Você só pode apagar as suas publicações.');
  await db.transaction(async (trx) => {
    await trx('posts').where({ id }).update({ deleted_at: nowIso(), deleted_by: viewer.id });
    if (!own) await audit(trx, viewer.id, 'moderacao.publicacao', 'post', id, { autor: post.author_id });
  });
}

export async function setLike(db: Db, viewer: SessionUser, id: number, liked: boolean) {
  await activePost(db, id);
  if (liked) {
    // a chave primária (post, pessoa) impede curtida repetida mesmo em requisições simultâneas
    await db('post_likes').insert({ post_id: id, user_id: viewer.id, created_at: nowIso() }).onConflict(['post_id', 'user_id']).ignore();
  } else {
    await db('post_likes').where({ post_id: id, user_id: viewer.id }).delete();
  }
  const row = await db('post_likes').where({ post_id: id }).count({ n: '*' }).first();
  const mine = await db('post_likes').where({ post_id: id, user_id: viewer.id }).first('post_id');
  return { likes: Number(row?.n ?? 0), likedByMe: Boolean(mine) };
}

const commentsPage = z.object({
  after: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export async function listComments(db: Db, viewer: SessionUser, postId: number, query: unknown) {
  await activePost(db, postId);
  const parsed = commentsPage.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Paginação inválida.');
  const qb = db('post_comments as pc')
    .join('users as u', 'u.id', 'pc.author_id')
    .where('pc.post_id', postId)
    .whereNull('pc.deleted_at')
    .whereNull('pc.hidden_at')
    .select('pc.id', 'pc.body', 'pc.created_at', 'pc.author_id', 'u.name as author_name', 'u.role as author_role', db.raw("u.email like '%@demo.urbantalk.local' as author_demo"))
    .orderBy('pc.id', 'asc')
    .limit(parsed.data.limit + 1);
  if (parsed.data.after) qb.where('pc.id', '>', parsed.data.after);
  const rows = (await qb) as Row[];
  const items = rows.slice(0, parsed.data.limit).map((r) => ({
    id: r.id as number,
    body: r.body as string,
    createdAt: r.created_at as string,
    author: author(r, viewer),
    canDelete: r.author_id === viewer.id || isStaffRole(viewer.role),
    canReport: r.author_id !== viewer.id,
  }));
  return { items, nextAfter: rows.length > parsed.data.limit ? items[items.length - 1].id : null };
}

export async function createComment(db: Db, viewer: SessionUser, postId: number, body: unknown) {
  await activePost(db, postId);
  const parsed = commentSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const since = new Date(Date.now() - DUP_WINDOW_MS).toISOString();
  const dup = await db('post_comments')
    .where({ post_id: postId, author_id: viewer.id, body: parsed.data.body })
    .where('created_at', '>=', since)
    .whereNull('deleted_at')
    .first('id');
  if (dup) throw new HttpError(409, 'duplicate', 'Você acabou de enviar esse mesmo comentário.');
  const [id] = await db('post_comments').insert({ post_id: postId, author_id: viewer.id, body: parsed.data.body, created_at: nowIso() });
  const row = await db('post_comments as pc')
    .join('users as u', 'u.id', 'pc.author_id')
    .where('pc.id', id)
    .first('pc.id', 'pc.body', 'pc.created_at', 'pc.author_id', 'u.name as author_name', 'u.role as author_role', db.raw("u.email like '%@demo.urbantalk.local' as author_demo"));
  return {
    id: row.id as number,
    body: row.body as string,
    createdAt: row.created_at as string,
    author: author(row, viewer),
    canDelete: true,
    canReport: false,
  };
}

export async function deleteComment(db: Db, viewer: SessionUser, id: number) {
  const c = await db('post_comments').where({ id }).whereNull('deleted_at').first('id', 'author_id', 'post_id');
  if (!c) throw notFound('Comentário não encontrado.');
  const own = c.author_id === viewer.id;
  if (!own && !isStaffRole(viewer.role)) throw forbidden('Você só pode apagar os seus comentários.');
  await db.transaction(async (trx) => {
    await trx('post_comments').where({ id }).update({ deleted_at: nowIso(), deleted_by: viewer.id });
    if (!own) await audit(trx, viewer.id, 'moderacao.comentario', 'comment', id, { autor: c.author_id, publicacao: c.post_id });
  });
}
