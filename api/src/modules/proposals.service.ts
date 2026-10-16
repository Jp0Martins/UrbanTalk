import type { Knex } from 'knex';
import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { HttpError, badRequest, conflict, forbidden, fromZod, notFound } from '../lib/errors.js';
import { bodyField, cleanText, excerpt, likeTerm, placeKey, placeName } from '../lib/text.js';
import { STATUS_COLORS, isStaffRole, type SessionUser } from '../types.js';
import { authorCols, authorOf, countComments, follow, isFollowing, recentSince, type Row } from './discussions.service.js';
import { followerIds, notify } from './notifications.service.js';
import { occCode } from './occurrences.service.js';

export const MAX_PROPOSAL_IMAGES = 3;
const MAX_LINKED = 10;
// marcos de apoio que geram aviso para quem acompanha (não a cada voto)
const VOTE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

export const proposalStatusDto = (r: Row) => ({
  id: r.id as number,
  slug: r.slug as string,
  name: r.name as string,
  description: r.description as string,
  color: r.color as string,
  isInitial: Boolean(r.is_initial),
  isFinal: Boolean(r.is_final),
  active: Boolean(r.active),
  sortOrder: r.sort_order as number,
});

export async function listProposalStatuses(db: Knex) {
  return ((await db('proposal_statuses').orderBy('sort_order').orderBy('id')) as Row[]).map(proposalStatusDto);
}

const listSchema = z.object({
  sort: z.enum(['votos', 'recentes', 'em-alta']).default('votos'),
  category: z.coerce.number().int().positive().optional(),
  // número do bairro ou "cidade" para propostas da cidade toda
  // nome do bairro digitado, ou "cidade" para as propostas da cidade toda
  neighborhood: z.string().trim().max(80).optional(),
  status: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, 'Situação inválida.').optional(),
  situation: z.enum(['abertas', 'finais']).optional(),
  q: z.string().trim().max(100, 'A busca pode ter até 100 caracteres.').optional(),
  mine: z.enum(['1']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(12),
});

function proposalsQuery(db: Db) {
  const votes = db('proposal_votes').select('proposal_id').count({ n: '*' }).groupBy('proposal_id').as('pv');
  return db('proposals as p')
    .join('users as u', 'u.id', 'p.author_id')
    .join('proposal_statuses as ps', 'ps.slug', 'p.status')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .leftJoin(votes, 'pv.proposal_id', 'p.id')
    .whereNull('p.hidden_at')
    .select(
      'p.id',
      'p.title',
      'p.body',
      'p.status',
      'p.author_id',
      'p.reference_url',
      'p.created_at',
      'p.updated_at',
      'ps.is_final',
      'c.id as category_id',
      'c.name as category_name',
      'c.icon as category_icon',
      'p.neighborhood_name',
      'p.neighborhood_key',
      db.raw('coalesce(pv.n, 0) as votes'),
      ...authorCols(db),
    );
}

async function votedSet(db: Db, viewer: SessionUser | undefined, ids: number[]) {
  if (!viewer || ids.length === 0) return new Set<number>();
  const rows = (await db('proposal_votes').where({ user_id: viewer.id }).whereIn('proposal_id', ids).select('proposal_id')) as Row[];
  return new Set(rows.map((r) => r.proposal_id as number));
}

async function firstImages(db: Db, ids: number[]) {
  if (ids.length === 0) return new Map<number, string>();
  const rows = (await db('proposal_images').whereIn('proposal_id', ids).orderBy('sort_order').orderBy('id').select('proposal_id', 'photo_path')) as Row[];
  const out = new Map<number, string>();
  for (const r of rows) if (!out.has(r.proposal_id)) out.set(r.proposal_id, `/api/photos/${r.photo_path}`);
  return out;
}

function summaryDto(r: Row, viewer: SessionUser | undefined, extra: { voted: boolean; comments: number; image: string | null }) {
  const isFinal = Boolean(r.is_final);
  return {
    id: r.id as number,
    title: r.title as string,
    excerpt: excerpt(r.body as string, 200),
    status: r.status as string,
    isFinal,
    category: r.category_id ? { id: r.category_id as number, name: r.category_name as string, icon: r.category_icon as string } : null,
    neighborhood: r.neighborhood_name ? { name: r.neighborhood_name as string, key: r.neighborhood_key as string } : null,
    votes: Number(r.votes),
    votedByMe: extra.voted,
    canVote: Boolean(viewer && viewer.role === 'user' && !isFinal),
    comments: extra.comments,
    imageUrl: extra.image,
    author: authorOf(r, viewer)!,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listProposals(db: Db, viewer: SessionUser | undefined, query: unknown) {
  const parsed = listSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const f = parsed.data;
  const where = (qb: Knex.QueryBuilder) => {
    if (f.category) qb.where('p.category_id', f.category);
    if (f.neighborhood === 'cidade') qb.whereNull('p.neighborhood_key');
    else if (f.neighborhood && placeKey(f.neighborhood)) qb.where('p.neighborhood_key', placeKey(f.neighborhood));
    if (f.status) qb.where('p.status', f.status);
    if (f.situation) qb.where('ps.is_final', f.situation === 'finais');
    if (f.mine && viewer) qb.where('p.author_id', viewer.id);
    if (f.q) {
      const term = likeTerm(f.q);
      qb.where((w) => w.whereRaw("lower(p.title) like ? escape '\\'", [term]).orWhereRaw("lower(p.body) like ? escape '\\'", [term]));
    }
    return qb;
  };
  const totalRow = await where(db('proposals as p').join('proposal_statuses as ps', 'ps.slug', 'p.status').whereNull('p.hidden_at')).count({ n: '*' }).first();
  const total = Number(totalRow?.n ?? 0);
  const qb = where(proposalsQuery(db));
  if (f.sort === 'recentes') qb.orderBy('p.created_at', 'desc');
  else if (f.sort === 'em-alta') {
    // em alta: apoio e conversa das últimas duas semanas
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const recentVotes = db('proposal_votes').where('created_at', '>=', since).select('proposal_id').count({ n: '*' }).groupBy('proposal_id').as('rv');
    const recentComments = db('discussion_comments').where({ target_type: 'proposal' }).whereNull('deleted_at').whereNull('hidden_at').where('created_at', '>=', since).select('target_id').count({ n: '*' }).groupBy('target_id').as('rcm');
    qb.leftJoin(recentVotes, 'rv.proposal_id', 'p.id').leftJoin(recentComments, 'rcm.target_id', 'p.id');
    qb.orderByRaw('(coalesce(rv.n, 0) + coalesce(rcm.n, 0)) desc').orderBy('p.created_at', 'desc');
  } else qb.orderBy('votes', 'desc').orderBy('p.created_at', 'desc');
  const rows = (await qb.orderBy('p.id', 'desc').limit(f.pageSize).offset((f.page - 1) * f.pageSize)) as Row[];
  const ids = rows.map((r) => r.id as number);
  const [voted, comments, images] = await Promise.all([votedSet(db, viewer, ids), countComments(db, 'proposal', ids), firstImages(db, ids)]);
  return {
    items: rows.map((r) => summaryDto(r, viewer, { voted: voted.has(r.id), comments: comments.get(r.id) ?? 0, image: images.get(r.id) ?? null })),
    page: f.page,
    pageSize: f.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
  };
}

export async function getProposal(db: Db, id: number, viewer?: SessionUser) {
  const r = (await proposalsQuery(db).where('p.id', id).first()) as Row | undefined;
  if (!r) throw notFound('Proposta não encontrada. Ela pode ter sido removida.');
  const [voted, comments, images, history, linked, following] = await Promise.all([
    votedSet(db, viewer, [id]),
    countComments(db, 'proposal', [id]),
    db('proposal_images').where({ proposal_id: id }).orderBy('sort_order').orderBy('id').select('photo_path') as Promise<Row[]>,
    db('proposal_status_history as h').leftJoin('users as u', 'u.id', 'h.changed_by').where('h.proposal_id', id).orderBy('h.id', 'asc').select('h.id', 'h.from_status', 'h.to_status', 'h.note', 'h.created_at', 'u.role as changed_by_role') as Promise<Row[]>,
    db('proposal_occurrences as po')
      .join('occurrences as o', 'o.id', 'po.occurrence_id')
      .join('categories as c', 'c.id', 'o.category_id')
      .where('po.proposal_id', id)
      .orderBy('po.created_at')
      .select('o.id', 'o.status', 'o.street', 'c.name as category', 'c.icon', 'o.neighborhood_name as neighborhood') as Promise<Row[]>,
    isFollowing(db, viewer, 'proposal', id),
  ]);
  const own = Boolean(viewer && r.author_id === viewer.id);
  return {
    ...summaryDto(r, viewer, { voted: voted.has(id), comments: comments.get(id) ?? 0, image: null }),
    body: r.body as string,
    referenceUrl: (r.reference_url as string | null) ?? null,
    images: images.map((i) => `/api/photos/${i.photo_path}`),
    history: history.map((h) => ({
      id: h.id as number,
      fromStatus: (h.from_status as string | null) ?? null,
      toStatus: h.to_status as string,
      note: (h.note as string | null) ?? null,
      createdAt: h.created_at as string,
      byStaff: h.from_status !== null && isStaffRole(h.changed_by_role),
    })),
    occurrences: linked.map((o) => ({ id: o.id as number, code: occCode(o.id), status: o.status as string, street: (o.street as string | null) ?? null, category: o.category as string, icon: o.icon as string, neighborhood: (o.neighborhood as string | null) ?? 'Cidade toda' })),
    following,
    isMine: own,
    canLink: Boolean(viewer && (own || isStaffRole(viewer.role))),
    canChangeStatus: Boolean(viewer && isStaffRole(viewer.role)),
    canDelete: Boolean(own || viewer?.role === 'admin'),
    canReport: Boolean(viewer && !own),
  };
}

const urlField = z
  .string()
  .trim()
  .max(300, 'O link pode ter até 300 caracteres.')
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), 'Informe um link completo, começando com http:// ou https://.');

export const proposalSchema = z.object({
  title: z
    .string({ error: 'Dê um título para a proposta.' })
    .transform((v) => cleanText(v).replace(/\s+/g, ' '))
    .pipe(z.string().min(8, 'O título precisa de pelo menos 8 caracteres.').max(120, 'Use até 120 caracteres no título.')),
  body: bodyField(30, 4000, 'a descrição da proposta', 3),
  categoryId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform((v) => (v === '' ? undefined : v)),
  // vazio = cidade toda; qualquer nome é aceito, sem lista fechada
  neighborhoodName: z
    .string()
    .optional()
    .transform((v) => (v ? placeName(v) : ''))
    .refine((v) => v.length <= 80, 'O nome do bairro pode ter até 80 caracteres.')
    .refine((v) => v === '' || placeKey(v).length >= 2, 'Digite o nome do bairro ou deixe em branco para a cidade toda.'),
  referenceUrl: urlField,
  occurrenceIds: z
    .union([z.string(), z.array(z.coerce.number().int().positive())])
    .optional()
    .transform((v) => {
      if (v === undefined) return [] as number[];
      const list = Array.isArray(v) ? v : v.split(',').filter(Boolean).map(Number);
      return [...new Set(list)].filter((n) => Number.isInteger(n) && n > 0);
    })
    .refine((v) => v.length <= MAX_LINKED, `Relacione no máximo ${MAX_LINKED} ocorrências.`),
});

async function validateRefs(db: Db, input: { categoryId?: number; occurrenceIds: number[] }) {
  const errors: Record<string, string> = {};
  if (input.categoryId && !(await db('categories').where({ id: input.categoryId, active: true }).first('id'))) errors['categoryId'] = 'Categoria inexistente.';
  if (input.occurrenceIds.length) {
    const found = (await db('occurrences').whereIn('id', input.occurrenceIds).select('id')) as Row[];
    if (found.length !== input.occurrenceIds.length) errors['occurrenceIds'] = 'Uma das ocorrências relacionadas não existe.';
  }
  if (Object.keys(errors).length) throw badRequest('Revise os campos destacados.', errors);
}

export async function initialProposalStatus(db: Knex) {
  const row = await db('proposal_statuses').where({ is_initial: true, active: true }).first('slug');
  if (row) return row.slug as string;
  const first = await db('proposal_statuses').where({ active: true }).orderBy('sort_order').first('slug');
  return (first?.slug as string | undefined) ?? 'nova';
}

export async function createProposal(db: Db, viewer: SessionUser, body: unknown, photos: string[]) {
  const parsed = proposalSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  await validateRefs(db, input);
  const dup = await db('proposals').where({ author_id: viewer.id, title: input.title }).where('created_at', '>=', recentSince()).whereNull('hidden_at').first('id');
  if (dup) throw new HttpError(409, 'duplicate', 'Você acabou de publicar uma proposta com esse mesmo título.');
  const status = await initialProposalStatus(db);
  const now = nowIso();
  const id = await db.transaction(async (trx) => {
    const [pid] = await trx('proposals').insert({
      author_id: viewer.id,
      title: input.title,
      body: input.body,
      category_id: input.categoryId ?? null,
      neighborhood_name: input.neighborhoodName || null,
      neighborhood_key: input.neighborhoodName ? placeKey(input.neighborhoodName) : null,
      status,
      reference_url: input.referenceUrl,
      created_at: now,
      updated_at: now,
    });
    if (photos.length) await trx('proposal_images').insert(photos.map((p, i) => ({ proposal_id: pid, photo_path: p, sort_order: i })));
    if (input.occurrenceIds.length) await trx('proposal_occurrences').insert(input.occurrenceIds.map((o) => ({ proposal_id: pid, occurrence_id: o, linked_by: viewer.id, created_at: now })));
    await trx('proposal_status_history').insert({ proposal_id: pid, from_status: null, to_status: status, changed_by: viewer.id, note: null, created_at: now });
    await follow(trx, viewer.id, 'proposal', pid);
    return pid as number;
  });
  return getProposal(db, id, viewer);
}

async function activeProposal(db: Db, id: number) {
  const p = await db('proposals as p').join('proposal_statuses as ps', 'ps.slug', 'p.status').where('p.id', id).whereNull('p.hidden_at').first('p.id', 'p.title', 'p.author_id', 'p.status', 'ps.is_final', 'ps.name as status_name');
  if (!p) throw notFound('Proposta não encontrada. Ela pode ter sido removida.');
  return p as Row;
}

async function voteCount(db: Db, id: number) {
  return Number((await db('proposal_votes').where({ proposal_id: id }).count({ n: '*' }).first())?.n ?? 0);
}

// apoio: um voto por pessoa; pode ser retirado enquanto a proposta não chega a uma fase final
export async function setVote(db: Db, viewer: SessionUser, id: number, on: boolean) {
  if (viewer.role !== 'user') throw forbidden('Contas de funcionário não votam em propostas. O apoio é dos moradores.');
  const p = await activeProposal(db, id);
  if (p.is_final) throw conflict('voting_closed', `A votação desta proposta foi encerrada na fase "${p.status_name}".`);
  const before = await voteCount(db, id);
  if (on) {
    await db('proposal_votes').insert({ proposal_id: id, user_id: viewer.id, created_at: nowIso() }).onConflict(['proposal_id', 'user_id']).ignore();
    await follow(db, viewer.id, 'proposal', id);
  } else {
    await db('proposal_votes').where({ proposal_id: id, user_id: viewer.id }).delete();
  }
  const votes = await voteCount(db, id);
  const reached = VOTE_MILESTONES.find((m) => before < m && votes >= m);
  if (reached) {
    const people = new Set([p.author_id as number, ...(await followerIds(db, 'proposal', id))]);
    await notify(db, people, {
      kind: 'proposta.apoio',
      title: `A proposta “${excerpt(p.title, 60)}” chegou a ${reached} apoios`,
      body: 'Apoio da comunidade não é decisão oficial, mas ajuda a mostrar a demanda.',
      link: `/propostas/${id}`,
      dedupeKey: `proposta-apoio:${id}:${reached}`,
    }, viewer.id);
  }
  return { votes, votedByMe: on };
}

const statusChangeSchema = z.object({
  status: z.string({ error: 'Escolha a nova fase.' }).trim().min(1, 'Escolha a nova fase.').max(40),
  note: z.string().trim().max(500, 'A explicação pode ter até 500 caracteres.').optional().transform((v) => v || null),
});

export async function changeProposalStatus(db: Db, staff: SessionUser, id: number, body: unknown) {
  const parsed = statusChangeSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const p = await activeProposal(db, id);
  const target = await db('proposal_statuses').where({ slug: parsed.data.status }).first('slug', 'name', 'active', 'is_final');
  if (!target) throw badRequest('Escolha uma fase válida.', { status: 'Fase inexistente.' });
  if (!target.active) throw badRequest(`A fase "${target.name}" está desativada.`, { status: 'Fase desativada.' });
  if (p.status === target.slug) throw conflict('same_status', `A proposta já está na fase "${target.name}".`);
  // fases finais dependem de uma resposta externa: a equipe precisa dizer de onde veio a informação
  if (target.is_final && (!parsed.data.note || parsed.data.note.length < 10)) {
    throw badRequest('Explique a decisão e de onde veio a informação.', { note: 'Obrigatório nas fases finais (pelo menos 10 caracteres).' });
  }
  const now = nowIso();
  await db.transaction(async (trx) => {
    await trx('proposals').where({ id }).update({ status: target.slug, updated_at: now });
    await trx('proposal_status_history').insert({ proposal_id: id, from_status: p.status, to_status: target.slug, changed_by: staff.id, note: parsed.data.note, created_at: now });
    await audit(trx, staff.id, 'proposta.status', 'proposal', id, { antes: p.status, depois: target.slug });
  });
  const people = new Set([p.author_id as number, ...(await followerIds(db, 'proposal', id))]);
  await notify(db, people, {
    kind: 'proposta.status',
    title: `Proposta “${excerpt(p.title, 60)}” agora está em “${target.name}”`,
    body: parsed.data.note,
    link: `/propostas/${id}`,
    dedupeKey: `proposta-status:${id}`,
  }, staff.id);
  return getProposal(db, id, staff);
}

export async function linkOccurrence(db: Db, viewer: SessionUser, id: number, occurrenceId: number, on: boolean) {
  const p = await activeProposal(db, id);
  if (p.author_id !== viewer.id && !isStaffRole(viewer.role)) throw forbidden('Só quem criou a proposta ou a equipe pode relacionar ocorrências.');
  if (on) {
    if (!(await db('occurrences').where({ id: occurrenceId }).first('id'))) throw notFound('Ocorrência não encontrada.');
    const n = Number((await db('proposal_occurrences').where({ proposal_id: id }).count({ n: '*' }).first())?.n ?? 0);
    if (n >= MAX_LINKED) throw conflict('too_many', `Relacione no máximo ${MAX_LINKED} ocorrências.`);
    await db('proposal_occurrences').insert({ proposal_id: id, occurrence_id: occurrenceId, linked_by: viewer.id, created_at: nowIso() }).onConflict(['proposal_id', 'occurrence_id']).ignore();
  } else {
    await db('proposal_occurrences').where({ proposal_id: id, occurrence_id: occurrenceId }).delete();
  }
  return getProposal(db, id, viewer);
}

// autor remove a própria; administrador remove qualquer uma (fica restaurável na moderação)
export async function deleteOwnProposal(db: Db, viewer: SessionUser, id: number) {
  const p = await activeProposal(db, id);
  const own = p.author_id === viewer.id;
  if (!own && viewer.role !== 'admin') throw forbidden('Você só pode remover as suas propostas.');
  await db.transaction(async (trx) => {
    await trx('proposals').where({ id }).update({ hidden_at: nowIso(), hidden_by: viewer.id, hidden_reason: own ? 'removido_autor' : 'moderacao' });
    if (!own) await audit(trx, viewer.id, 'moderacao.proposta', 'proposal', id, { autor: p.author_id });
  });
}

// propostas que citam uma ocorrência (mostradas no detalhe da ocorrência)
export async function proposalsForOccurrence(db: Db, occurrenceId: number) {
  const rows = (await db('proposal_occurrences as po')
    .join('proposals as p', 'p.id', 'po.proposal_id')
    .where('po.occurrence_id', occurrenceId)
    .whereNull('p.hidden_at')
    .select('p.id', 'p.title', 'p.status')) as Row[];
  return rows.map((r) => ({ id: r.id as number, title: r.title as string, status: r.status as string }));
}

// fases das propostas: só administradores alteram
const psSchema = z.object({
  name: z.string({ error: 'Informe o nome.' }).trim().min(3, 'Use pelo menos 3 caracteres.').max(40, 'Use até 40 caracteres.'),
  description: z.string().trim().max(240, 'Use até 240 caracteres.').default(''),
  color: z.enum(STATUS_COLORS, { error: 'Cor inválida.' }).default('cinza'),
  isFinal: z.boolean().default(false),
});

export async function createProposalStatus(db: Db, admin: SessionUser, body: unknown) {
  const parsed = psSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  if (await db('proposal_statuses').whereRaw('lower(name) = ?', [parsed.data.name.toLowerCase()]).first('id')) throw conflict('duplicate', 'Já existe uma fase com esse nome.');
  const base = parsed.data.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34) || 'fase';
  let slug = base;
  for (let i = 2; await db('proposal_statuses').where({ slug }).first('id'); i++) slug = `${base}-${i}`;
  const max = await db('proposal_statuses').max({ m: 'sort_order' }).first();
  const now = nowIso();
  const id = await db.transaction(async (trx) => {
    const [nid] = await trx('proposal_statuses').insert({ slug, name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, is_final: parsed.data.isFinal, is_initial: false, active: true, sort_order: Number(max?.m ?? 0) + 10, created_at: now, updated_at: now });
    await audit(trx, admin.id, 'proposta_fase.criar', 'proposal_status', nid, { nome: parsed.data.name });
    return nid as number;
  });
  return proposalStatusDto(await db('proposal_statuses').where({ id }).first());
}

export async function updateProposalStatus(db: Db, admin: SessionUser, id: number, body: unknown) {
  const parsed = psSchema.partial().extend({ active: z.boolean().optional(), isInitial: z.literal(true).optional() }).safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const cur = await db('proposal_statuses').where({ id }).first();
  if (!cur) throw notFound('Fase não encontrada.');
  const d = parsed.data;
  if (d.name && (await db('proposal_statuses').whereRaw('lower(name) = ?', [d.name.toLowerCase()]).whereNot({ id }).first('id'))) throw conflict('duplicate', 'Já existe uma fase com esse nome.');
  if (d.active === false && cur.is_initial) throw conflict('initial', 'Escolha outra fase inicial antes de desativar esta.');
  if (d.isInitial && (cur.is_final || d.isFinal || !cur.active)) throw conflict('initial', 'A fase inicial precisa estar ativa e não pode ser final.');
  if (d.isFinal && cur.is_initial) throw conflict('initial', 'A fase inicial não pode ser final.');
  const changes: Record<string, unknown> = {};
  if (d.name !== undefined) changes['name'] = d.name;
  if (d.description !== undefined) changes['description'] = d.description;
  if (d.color !== undefined) changes['color'] = d.color;
  if (d.isFinal !== undefined) changes['is_final'] = d.isFinal;
  if (d.active !== undefined) changes['active'] = d.active;
  await db.transaction(async (trx) => {
    if (d.isInitial) {
      await trx('proposal_statuses').update({ is_initial: false }).where({ is_initial: true });
      changes['is_initial'] = true;
    }
    await trx('proposal_statuses').where({ id }).update({ ...changes, updated_at: nowIso() });
    await audit(trx, admin.id, 'proposta_fase.alterar', 'proposal_status', id, { antes: proposalStatusDto(cur), depois: changes });
  });
  return proposalStatusDto(await db('proposal_statuses').where({ id }).first());
}
