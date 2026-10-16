import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { FORUM_THEMES } from '../db/seed-base.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { HttpError, badRequest, conflict, forbidden, fromZod, notFound } from '../lib/errors.js';
import { bodyField, cleanText, excerpt, likeTerm, placeKey, placeName } from '../lib/text.js';
import { isStaffRole, type SessionUser } from '../types.js';
import { publicName } from './community.service.js';
import { authorCols, authorOf, countComments, follow, isFollowing, recentSince, type Row } from './discussions.service.js';
import { notify, staffIds } from './notifications.service.js';
import { occCode } from './occurrences.service.js';

const MAX_INTERESTS = 5;
const MAX_TAGS = 5;
// limite de criação para conter spam: fóruns novos por pessoa em 24 h
export const FORUMS_PER_DAY = 3;

const themeIds = FORUM_THEMES.map((t) => t.id) as [string, ...string[]];
export const themeName = (id: string) => FORUM_THEMES.find((t) => t.id === id)?.name ?? 'Comunidade e bairros';
const themeIcon = (id: string) => FORUM_THEMES.find((t) => t.id === id)?.icon ?? 'chat';

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'forum';

// tags: minúsculas, sem #, sem repetição
export function parseTags(raw: unknown) {
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[,;#]+/) : [];
  const out: string[] = [];
  for (const t of list) {
    const tag = placeName(t).toLowerCase().replace(/^#/, '').slice(0, 24);
    if (tag.length >= 2 && !out.includes(tag)) out.push(tag);
  }
  return out;
}
const tagsOf = (s: string | null) => (s ? s.split(',').filter(Boolean) : []);

async function forumApprovalRequired(db: Db) {
  const row = await db('settings').where({ key: 'forum_approval' }).first('value');
  return row?.value === 'true';
}

export async function getForumSettings(db: Db) {
  return { approvalRequired: await forumApprovalRequired(db), forumsPerDay: FORUMS_PER_DAY };
}

export async function setForumApproval(db: Db, admin: SessionUser, body: unknown) {
  const parsed = z.object({ approvalRequired: z.boolean({ error: 'Informe sim ou não.' }) }).safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  await db.transaction(async (trx) => {
    await trx('settings').insert({ key: 'forum_approval', value: String(parsed.data.approvalRequired), updated_by: admin.id, updated_at: nowIso() }).onConflict('key').merge();
    await audit(trx, admin.id, 'config.aprovacao_foruns', 'settings', null, { exigeAprovacao: parsed.data.approvalRequired });
  });
  return getForumSettings(db);
}

// estatísticas reais de cada fórum: discussões, participantes distintos e seguidores
async function forumStats(db: Db, ids: number[]) {
  const out = new Map<number, { topics: number; participants: number; followers: number; lastActivity: string | null }>();
  if (ids.length === 0) return out;
  const marks = ids.map(() => '?').join(',');
  const topics = (await db('topics').whereIn('forum_id', ids).whereNull('hidden_at').select('forum_id').count({ n: '*' }).max({ last: 'last_activity_at' }).groupBy('forum_id')) as Row[];
  const people = (await db.raw(
    `select forum_id, count(distinct uid) as n from (
       select t.forum_id, t.author_id as uid from topics t where t.hidden_at is null and t.author_id is not null and t.forum_id in (${marks})
       union
       select t.forum_id, c.author_id as uid from discussion_comments c join topics t on t.id = c.target_id
       where c.target_type = 'topic' and c.deleted_at is null and c.hidden_at is null and t.hidden_at is null and t.forum_id in (${marks})
     ) group by forum_id`,
    [...ids, ...ids],
  )) as Row[];
  const followers = (await db('forum_follows').whereIn('forum_id', ids).select('forum_id').count({ n: '*' }).groupBy('forum_id')) as Row[];
  for (const id of ids) out.set(id, { topics: 0, participants: 0, followers: 0, lastActivity: null });
  for (const r of topics) Object.assign(out.get(r.forum_id)!, { topics: Number(r.n), lastActivity: r.last ?? null });
  for (const r of people) out.get(r.forum_id)!.participants = Number(r.n);
  for (const r of followers) out.get(r.forum_id)!.followers = Number(r.n);
  return out;
}

function forumDto(r: Row, viewer?: SessionUser) {
  const official = r.kind === 'oficial';
  const isOwner = Boolean(viewer && r.created_by === viewer.id);
  return {
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    description: r.description as string,
    kind: r.kind as 'oficial' | 'comunidade',
    theme: { id: r.theme as string, name: themeName(r.theme) },
    tags: tagsOf(r.tags),
    neighborhoodName: (r.neighborhood_name as string | null) ?? null,
    rules: (r.rules as string) ?? '',
    icon: official ? (r.icon as string) : themeIcon(r.theme),
    status: r.status as 'ativo' | 'pendente' | 'recusado',
    active: Boolean(r.active),
    createdAt: r.created_at as string,
    creator: official ? null : r.creator_name ? { name: publicName(r.creator_name), isMe: isOwner, isDemo: Boolean(r.creator_demo) } : null,
    isOwner,
  };
}

const forumCols = (db: Db) => ['f.*', 'u.name as creator_name', db.raw("u.email like '%@demo.urbantalk.local' as creator_demo")];

const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  theme: z.string().trim().max(30).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  kind: z.enum(['oficial', 'comunidade']).optional(),
  following: z.enum(['1']).optional(),
  sort: z.enum(['atividade', 'populares', 'novos', 'nome']).default('atividade'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
});

// fóruns visíveis: ativos, aprovados e não ocultados pela moderação
export async function listForums(db: Db, viewer: SessionUser | undefined, query: unknown) {
  const parsed = listSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const f = parsed.data;
  const qb = db('forums as f').leftJoin('users as u', 'u.id', 'f.created_by').where({ 'f.active': true, 'f.status': 'ativo' }).whereNull('f.hidden_at');
  if (f.kind) qb.where('f.kind', f.kind);
  if (f.theme) qb.where('f.theme', f.theme);
  if (f.neighborhood && placeKey(f.neighborhood)) qb.where('f.neighborhood_key', placeKey(f.neighborhood));
  if (f.following) {
    if (!viewer) return { items: [], page: 1, pageSize: f.pageSize, total: 0, totalPages: 1 };
    qb.whereIn('f.id', db('forum_follows').where({ user_id: viewer.id }).select('forum_id'));
  }
  if (f.q) {
    // busca por nome, descrição, tags e bairro mencionado, sem diferenciar acentos no nome e no bairro
    const term = likeTerm(f.q);
    const key = likeTerm(placeKey(f.q));
    qb.where((w) => {
      for (const c of ['f.name', 'f.description', 'f.tags']) w.orWhereRaw(`lower(${c}) like ? escape '\\'`, [term]);
      w.orWhereRaw("f.name_key like ? escape '\\'", [key]).orWhereRaw("coalesce(f.neighborhood_key, '') like ? escape '\\'", [key]);
    });
  }
  const rows = (await qb.select(forumCols(db))) as Row[];
  const stats = await forumStats(db, rows.map((r) => r.id));
  const following = viewer ? new Set(((await db('forum_follows').where({ user_id: viewer.id }).select('forum_id')) as Row[]).map((r) => r.forum_id as number)) : new Set<number>();
  const items = rows.map((r) => ({ ...forumDto(r, viewer), ...stats.get(r.id)!, following: following.has(r.id) }));
  const order = {
    atividade: (a: (typeof items)[0], b: (typeof items)[0]) => String(b.lastActivity ?? b.createdAt).localeCompare(String(a.lastActivity ?? a.createdAt)),
    populares: (a: (typeof items)[0], b: (typeof items)[0]) => b.participants - a.participants || b.topics - a.topics,
    novos: (a: (typeof items)[0], b: (typeof items)[0]) => b.createdAt.localeCompare(a.createdAt),
    nome: (a: (typeof items)[0], b: (typeof items)[0]) => a.name.localeCompare(b.name, 'pt-BR'),
  }[f.sort];
  // empate no critério escolhido: ordem alfabética
  items.sort((a, b) => order(a, b) || a.name.localeCompare(b.name, 'pt-BR'));
  const total = items.length;
  return {
    items: items.slice((f.page - 1) * f.pageSize, f.page * f.pageSize),
    page: f.page,
    pageSize: f.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    themes: FORUM_THEMES.map((t) => ({ id: t.id, name: t.name, icon: t.icon })),
  };
}

// fórum pelo slug; pendentes e ocultos só aparecem para quem criou e para a equipe
async function loadForum(db: Db, slug: string, viewer?: SessionUser) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) throw notFound('Fórum não encontrado.');
  const r = (await db('forums as f').leftJoin('users as u', 'u.id', 'f.created_by').where('f.slug', slug).first(forumCols(db))) as Row | undefined;
  if (!r) throw notFound('Fórum não encontrado.');
  const staff = Boolean(viewer && isStaffRole(viewer.role));
  const owner = Boolean(viewer && r.created_by === viewer.id);
  if (r.hidden_at && !staff) throw notFound('Fórum não encontrado. Ele pode ter sido removido pela moderação.');
  if (r.status !== 'ativo' && !staff && !owner) throw notFound('Fórum não encontrado.');
  if (!r.active && !staff) throw notFound('Fórum não encontrado.');
  return r;
}

export async function getForum(db: Db, slug: string, viewer?: SessionUser) {
  const r = await loadForum(db, slug, viewer);
  const stats = (await forumStats(db, [r.id])).get(r.id)!;
  const following = viewer ? Boolean(await db('forum_follows').where({ forum_id: r.id, user_id: viewer.id }).first('forum_id')) : false;
  const isAdmin = viewer?.role === 'admin';
  const dto = forumDto(r, viewer);
  return {
    ...dto,
    ...stats,
    following,
    hidden: Boolean(r.hidden_at),
    // criador edita o próprio fórum da comunidade; fóruns oficiais só o administrador
    canEdit: Boolean(viewer && (isAdmin || (dto.kind === 'comunidade' && dto.isOwner))),
    canModerate: Boolean(viewer && isStaffRole(viewer.role)),
    canPost: Boolean(viewer && dto.status === 'ativo' && dto.active && !r.hidden_at),
    canReport: Boolean(viewer && dto.kind === 'comunidade' && !dto.isOwner),
  };
}

const forumSchema = z.object({
  name: z
    .string({ error: 'Dê um nome ao fórum.' })
    .transform((v) => placeName(v))
    .pipe(z.string().min(5, 'O nome precisa de pelo menos 5 caracteres.').max(60, 'Use até 60 caracteres no nome.')),
  description: z
    .string({ error: 'Descreva o fórum.' })
    .transform(cleanText)
    .pipe(z.string().min(10, 'Descreva a finalidade em pelo menos 10 caracteres.').max(300, 'Use até 300 caracteres.')),
  theme: z.enum(themeIds, { error: 'Escolha um tema.' }),
  tags: z.unknown().optional().transform(parseTags).refine((t) => t.length <= MAX_TAGS, `Use no máximo ${MAX_TAGS} tags.`),
  neighborhoodName: z
    .string()
    .optional()
    .transform((v) => (v ? placeName(v) : ''))
    .refine((v) => v.length <= 80, 'Use até 80 caracteres.')
    .refine((v) => v === '' || placeKey(v).length >= 2, 'Digite o nome do bairro ou deixe em branco.'),
  rules: z.string().optional().transform((v) => (v ? cleanText(v) : '')).refine((v) => v.length <= 1500, 'Use até 1500 caracteres nas regras.'),
});

// qualquer conta cria fóruns da comunidade; a aprovação prévia é opcional e definida pelo administrador
export async function createCommunityForum(db: Db, viewer: SessionUser, body: unknown, official = false) {
  const parsed = forumSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const d = parsed.data;
  const nameKey = placeKey(d.name);
  const same = await db('forums').where({ name_key: nameKey }).whereNull('hidden_at').whereNot({ status: 'recusado' }).first('slug', 'name');
  if (same) throw new HttpError(409, 'duplicate_forum', `Já existe um fórum chamado "${same.name}". Participe dele em vez de criar outro.`, { name: 'Nome já usado.' });
  if (!official && !isStaffRole(viewer.role)) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const recent = Number((await db('forums').where({ created_by: viewer.id }).where('created_at', '>=', since).count({ n: '*' }).first())?.n ?? 0);
    if (recent >= FORUMS_PER_DAY) throw new HttpError(429, 'too_many_forums', `Você já criou ${FORUMS_PER_DAY} fóruns nas últimas 24 horas. Tente amanhã.`);
  }
  const pending = !official && !isStaffRole(viewer.role) && (await forumApprovalRequired(db));
  let slug = slugify(d.name);
  for (let i = 2; await db('forums').where({ slug }).first('id'); i++) slug = `${slugify(d.name).slice(0, 45)}-${i}`;
  const now = nowIso();
  const max = official ? await db('forums').where({ kind: 'oficial' }).max({ m: 'sort_order' }).first() : null;
  const id = await db.transaction(async (trx) => {
    const [fid] = await trx('forums').insert({
      slug,
      name: d.name,
      name_key: nameKey,
      description: d.description,
      kind: official ? 'oficial' : 'comunidade',
      theme: d.theme,
      tags: d.tags.join(','),
      neighborhood_name: d.neighborhoodName || null,
      neighborhood_key: d.neighborhoodName ? placeKey(d.neighborhoodName) : null,
      rules: d.rules,
      icon: themeIcon(d.theme),
      sort_order: official ? Number(max?.m ?? 0) + 10 : 0,
      active: true,
      status: pending ? 'pendente' : 'ativo',
      created_by: official ? null : viewer.id,
      created_at: now,
      updated_at: now,
    });
    if (!official) await trx('forum_follows').insert({ forum_id: fid, user_id: viewer.id, created_at: now });
    await audit(trx, viewer.id, 'forum.criar', 'forum', fid, { nome: d.name, oficial: official, pendente: pending });
    return fid as number;
  });
  if (pending) {
    await notify(db, await staffIds(db), { kind: 'equipe.forum_pendente', title: 'Novo fórum aguardando aprovação', body: d.name, link: '/admin/moderacao?aba=foruns', dedupeKey: 'foruns-pendentes' }, viewer.id);
  }
  return getForum(db, slug, viewer);
}

export async function updateCommunityForum(db: Db, viewer: SessionUser, slug: string, body: unknown) {
  const r = await loadForum(db, slug, viewer);
  const isAdmin = viewer.role === 'admin';
  const owner = r.kind === 'comunidade' && r.created_by === viewer.id;
  if (!isAdmin && !owner) throw forbidden(r.kind === 'oficial' ? 'Fóruns oficiais são editados pela administração.' : 'Só quem criou o fórum (ou a administração) pode editar.');
  const parsed = forumSchema.partial().extend({ active: z.boolean().optional() }).safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  // campos com transformação viram "" ou [] quando ausentes: só conta o que veio no corpo
  const sent = new Set(Object.keys((body ?? {}) as object));
  const d = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => sent.has(k))) as Partial<typeof parsed.data>;
  const changes: Row = {};
  if (d.name !== undefined && d.name !== r.name) {
    // trocar o nome mexe com quem já encontrou o fórum: só a administração
    if (!isAdmin) throw forbidden('O nome do fórum só pode ser alterado pela administração.');
    const key = placeKey(d.name);
    if (await db('forums').where({ name_key: key }).whereNot({ id: r.id }).whereNull('hidden_at').first('id')) throw conflict('duplicate_forum', 'Já existe um fórum com esse nome.');
    Object.assign(changes, { name: d.name, name_key: key });
  }
  if (d.description !== undefined) changes['description'] = d.description;
  if (d.theme !== undefined) Object.assign(changes, { theme: d.theme, ...(r.kind === 'comunidade' ? { icon: themeIcon(d.theme) } : {}) });
  if (d.tags !== undefined) changes['tags'] = d.tags.join(',');
  if (d.neighborhoodName !== undefined) Object.assign(changes, { neighborhood_name: d.neighborhoodName || null, neighborhood_key: d.neighborhoodName ? placeKey(d.neighborhoodName) : null });
  if (d.rules !== undefined) changes['rules'] = d.rules;
  if (d.active !== undefined) {
    if (!isAdmin) throw forbidden('Só a administração ativa ou desativa fóruns.');
    changes['active'] = d.active;
  }
  if (Object.keys(changes).length === 0) return getForum(db, slug, viewer);
  await db.transaction(async (trx) => {
    await trx('forums').where({ id: r.id }).update({ ...changes, updated_at: nowIso() });
    await audit(trx, viewer.id, 'forum.alterar', 'forum', r.id, { antes: { name: r.name, description: r.description, theme: r.theme, tags: r.tags, neighborhood: r.neighborhood_name, active: Boolean(r.active) }, depois: changes });
  });
  return getForum(db, slug, viewer);
}

export async function setForumFollow(db: Db, viewer: SessionUser, slug: string, on: boolean) {
  const r = await loadForum(db, slug, viewer);
  if (r.status !== 'ativo') throw conflict('not_active', 'Este fórum ainda não está disponível.');
  if (on) await db('forum_follows').insert({ forum_id: r.id, user_id: viewer.id, created_at: nowIso() }).onConflict(['forum_id', 'user_id']).ignore();
  else await db('forum_follows').where({ forum_id: r.id, user_id: viewer.id }).delete();
  const followers = Number((await db('forum_follows').where({ forum_id: r.id }).count({ n: '*' }).first())?.n ?? 0);
  return { following: on, followers };
}

// fila de aprovação de fóruns, usada só quando a administração exige aprovação
export async function pendingForums(db: Db) {
  const rows = (await db('forums as f').leftJoin('users as u', 'u.id', 'f.created_by').where('f.status', 'pendente').whereNull('f.hidden_at').orderBy('f.created_at').select(forumCols(db))) as Row[];
  return rows.map((r) => ({ ...forumDto(r), creatorFullName: (r.creator_name as string | null) ?? null }));
}

export async function reviewForum(db: Db, staff: SessionUser, id: number, body: unknown) {
  const parsed = z.object({ decision: z.enum(['aprovar', 'recusar'], { error: 'Escolha aprovar ou recusar.' }), note: z.string().trim().max(300).optional() }).safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const f = await db('forums').where({ id }).first('id', 'slug', 'name', 'status', 'created_by');
  if (!f) throw notFound('Fórum não encontrado.');
  if (f.status !== 'pendente') throw conflict('not_pending', 'Este fórum não está aguardando aprovação.');
  const status = parsed.data.decision === 'aprovar' ? 'ativo' : 'recusado';
  await db.transaction(async (trx) => {
    await trx('forums').where({ id }).update({ status, updated_at: nowIso() });
    await audit(trx, staff.id, status === 'ativo' ? 'forum.aprovar' : 'forum.recusar', 'forum', id, { nome: f.name, nota: parsed.data.note ?? null });
  });
  if (f.created_by) {
    await notify(db, [f.created_by], {
      kind: 'forum.revisao',
      title: status === 'ativo' ? `Seu fórum "${f.name}" foi aprovado` : `Seu fórum "${f.name}" não foi aprovado`,
      body: parsed.data.note ?? null,
      link: status === 'ativo' ? `/comunidade/f/${f.slug}` : '/comunidade/minhas',
      dedupeKey: `forum-revisao:${id}`,
    }, staff.id);
  }
  return { status };
}

// ---------- discussões dentro dos fóruns ----------

const topicListSchema = z.object({
  sort: z.enum(['populares', 'recentes', 'atividade', 'respostas']).default('atividade'),
  q: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(24).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(15),
});

function topicsQuery(db: Db) {
  const votes = db('topic_votes').select('topic_id').count({ n: '*' }).groupBy('topic_id').as('tv');
  const replies = db('discussion_comments').where({ target_type: 'topic' }).whereNull('deleted_at').whereNull('hidden_at').select('target_id').count({ n: '*' }).groupBy('target_id').as('rc');
  return db('topics as t')
    .join('forums as f', 'f.id', 't.forum_id')
    .leftJoin('users as u', 'u.id', 't.author_id')
    .leftJoin(votes, 'tv.topic_id', 't.id')
    .leftJoin(replies, 'rc.target_id', 't.id')
    .whereNull('t.hidden_at')
    .select(
      't.id',
      't.title',
      't.body',
      't.tags',
      't.author_id',
      't.is_institutional',
      't.pinned',
      't.locked',
      't.created_at',
      't.last_activity_at',
      't.occurrence_id',
      't.proposal_id',
      'f.id as forum_id',
      'f.slug as forum_slug',
      'f.name as forum_name',
      'f.kind as forum_kind',
      'f.status as forum_status',
      'f.active as forum_active',
      'f.hidden_at as forum_hidden',
      'f.created_by as forum_owner',
      db.raw('coalesce(tv.n, 0) as votes'),
      db.raw('coalesce(rc.n, 0) as replies'),
      ...authorCols(db),
    );
}

async function votedTopics(db: Db, viewer: SessionUser | undefined, ids: number[]) {
  if (!viewer || ids.length === 0) return new Set<number>();
  return new Set(((await db('topic_votes').where({ user_id: viewer.id }).whereIn('topic_id', ids).select('topic_id')) as Row[]).map((r) => r.topic_id as number));
}

function topicDto(r: Row, viewer: SessionUser | undefined, voted: Set<number>) {
  return {
    id: r.id as number,
    title: r.title as string,
    excerpt: excerpt(r.body as string, 180),
    tags: tagsOf(r.tags),
    isInstitutional: Boolean(r.is_institutional),
    // tópicos de apoio não têm autor: nunca aparecem como publicação de morador
    author: r.is_institutional ? null : authorOf(r, viewer),
    pinned: Boolean(r.pinned),
    locked: Boolean(r.locked),
    createdAt: r.created_at as string,
    lastActivityAt: r.last_activity_at as string,
    replies: Number(r.replies),
    votes: Number(r.votes),
    votedByMe: voted.has(r.id),
    canVote: Boolean(viewer && !r.is_institutional && r.author_id !== viewer.id),
    occurrenceCode: r.occurrence_id ? occCode(r.occurrence_id) : null,
    forum: { slug: r.forum_slug as string, name: r.forum_name as string, kind: r.forum_kind as 'oficial' | 'comunidade' },
  };
}

export async function listTopics(db: Db, slug: string, viewer: SessionUser | undefined, query: unknown) {
  const f = await loadForum(db, slug, viewer);
  const parsed = topicListSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const { sort, page, pageSize, q, tag } = parsed.data;
  const where = (qb: ReturnType<typeof topicsQuery>) => {
    qb.where('t.forum_id', f.id);
    if (q) qb.where((w) => w.whereRaw("lower(t.title) like ? escape '\\'", [likeTerm(q)]).orWhereRaw("lower(t.body) like ? escape '\\'", [likeTerm(q)]));
    if (tag) {
      const t = parseTags(tag)[0];
      // tags ficam separadas por vírgula; a comparação é pela tag inteira
      if (t) qb.whereRaw("(',' || t.tags || ',') like ?", [`%,${t},%`]);
    }
    return qb;
  };
  const total = Number(((await where(topicsQuery(db)).clearSelect().count({ n: '*' }).first()) as Row | undefined)?.n ?? 0);
  const qb = where(topicsQuery(db)).orderBy('t.pinned', 'desc');
  if (sort === 'recentes') qb.orderBy('t.created_at', 'desc');
  else if (sort === 'respostas') qb.orderBy('replies', 'desc').orderBy('t.last_activity_at', 'desc');
  // populares: votos de relevância e respostas, com peso maior para os votos
  else if (sort === 'populares') qb.orderByRaw('(coalesce(tv.n, 0) * 2 + coalesce(rc.n, 0)) desc').orderBy('t.created_at', 'desc');
  else qb.orderBy('t.last_activity_at', 'desc');
  const rows = (await qb.orderBy('t.id', 'desc').limit(pageSize).offset((page - 1) * pageSize)) as Row[];
  const voted = await votedTopics(db, viewer, rows.map((r) => r.id));
  return {
    items: rows.map((r) => topicDto(r, viewer, voted)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTopic(db: Db, id: number, viewer?: SessionUser) {
  const r = (await topicsQuery(db).where('t.id', id).first()) as Row | undefined;
  if (!r) throw notFound('Discussão não encontrada. Ela pode ter sido removida.');
  const staff = Boolean(viewer && isStaffRole(viewer.role));
  const forumVisible = !r.forum_hidden && r.forum_active && (r.forum_status === 'ativo' || staff || (viewer && r.forum_owner === viewer.id));
  if (!forumVisible) throw notFound('Discussão não encontrada.');
  const voted = await votedTopics(db, viewer, [id]);
  let occurrence = null;
  if (r.occurrence_id) {
    const o = await db('occurrences as o').join('categories as c', 'c.id', 'o.category_id').where('o.id', r.occurrence_id).first('o.id', 'o.status', 'o.street', 'o.neighborhood_name', 'c.name as category', 'c.icon');
    if (o) occurrence = { id: o.id as number, code: occCode(o.id), status: o.status as string, street: o.street as string | null, category: o.category as string, icon: o.icon as string, neighborhood: (o.neighborhood_name as string | null) ?? 'Cidade toda' };
  }
  let proposal = null;
  if (r.proposal_id) {
    const p = await db('proposals').where({ id: r.proposal_id }).whereNull('hidden_at').first('id', 'title', 'status');
    if (p) proposal = { id: p.id as number, title: p.title as string, status: p.status as string };
  }
  return {
    ...topicDto(r, viewer, voted),
    replies: (await countComments(db, 'topic', [id])).get(id) ?? 0,
    body: r.body as string,
    occurrence,
    proposal,
    following: await isFollowing(db, viewer, 'topic', id),
    canDelete: Boolean(viewer && !r.is_institutional && (r.author_id === viewer.id || staff)),
    // quem criou o fórum da comunidade também fixa e encerra discussões dele
    canModerate: staff || Boolean(viewer && r.forum_kind === 'comunidade' && r.forum_owner === viewer.id),
    canReport: Boolean(viewer && !r.is_institutional && r.author_id !== viewer.id),
  };
}

const topicSchema = z.object({
  title: z
    .string({ error: 'Dê um título para a discussão.' })
    .transform((v) => cleanText(v).replace(/\s+/g, ' '))
    .pipe(z.string().min(5, 'O título precisa de pelo menos 5 caracteres.').max(140, 'Use até 140 caracteres no título.')),
  body: bodyField(10, 3000, 'o texto da discussão', 3),
  tags: z.unknown().optional().transform(parseTags).refine((t) => t.length <= MAX_TAGS, `Use no máximo ${MAX_TAGS} tags.`),
  occurrenceId: z.coerce.number().int().positive().optional().nullable(),
  proposalId: z.coerce.number().int().positive().optional().nullable(),
});

export async function createTopic(db: Db, viewer: SessionUser, slug: string, body: unknown, institutional = false) {
  const f = await loadForum(db, slug, viewer);
  if (f.status !== 'ativo' || !f.active || f.hidden_at) throw conflict('forum_closed', 'Este fórum não está aceitando novas discussões.');
  const parsed = topicSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  // a discussão aponta para a reclamação existente; nenhum dado da ocorrência é copiado
  if (input.occurrenceId && !(await db('occurrences').where({ id: input.occurrenceId }).first('id'))) {
    throw badRequest('A reclamação informada não existe.', { occurrenceId: 'Reclamação não encontrada.' });
  }
  if (input.proposalId && !(await db('proposals').where({ id: input.proposalId }).whereNull('hidden_at').first('id'))) {
    throw badRequest('A proposta escolhida não existe.', { proposalId: 'Proposta não encontrada.' });
  }
  const dup = await db('topics').where({ author_id: viewer.id, title: input.title }).where('created_at', '>=', recentSince()).whereNull('hidden_at').first('id');
  if (dup) throw new HttpError(409, 'duplicate', 'Você acabou de abrir uma discussão com esse mesmo título.');
  const now = nowIso();
  const id = await db.transaction(async (trx) => {
    const [tid] = await trx('topics').insert({
      forum_id: f.id,
      author_id: institutional ? null : viewer.id,
      is_institutional: institutional,
      title: input.title,
      body: input.body,
      tags: input.tags.join(','),
      occurrence_id: input.occurrenceId ?? null,
      proposal_id: input.proposalId ?? null,
      pinned: false,
      locked: false,
      created_at: now,
      last_activity_at: now,
    });
    if (institutional) await audit(trx, viewer.id, 'forum.topico_institucional', 'topic', tid, { forum: f.slug });
    else await follow(trx, viewer.id, 'topic', tid);
    return tid as number;
  });
  // quem segue o fórum fica sabendo das novas discussões (aviso agrupado)
  const followers = ((await db('forum_follows').where({ forum_id: f.id }).select('user_id')) as Row[]).map((r) => r.user_id as number);
  await notify(db, followers, {
    kind: 'forum.novas',
    title: `Novas discussões em "${excerpt(f.name, 60)}"`,
    body: input.title,
    link: `/comunidade/f/${f.slug}`,
    dedupeKey: `forum-novas:${f.id}`,
  }, viewer.id);
  return getTopic(db, id, viewer);
}

export async function deleteTopic(db: Db, viewer: SessionUser, id: number) {
  const t = await db('topics').where({ id }).whereNull('hidden_at').first('id', 'author_id', 'is_institutional');
  if (!t) throw notFound('Discussão não encontrada.');
  const own = !t.is_institutional && t.author_id === viewer.id;
  if (!own && !isStaffRole(viewer.role)) throw forbidden('Você só pode remover as discussões que abriu.');
  await db.transaction(async (trx) => {
    // removida pelo autor ou pela equipe: some das listas, mas o registro fica
    await trx('topics').where({ id }).update({ hidden_at: nowIso(), hidden_by: viewer.id, hidden_reason: own ? 'removido_autor' : 'moderacao' });
    if (!own) await audit(trx, viewer.id, 'moderacao.topico', 'topic', id, { autor: t.author_id });
  });
}

const flagsSchema = z.object({ pinned: z.boolean().optional(), locked: z.boolean().optional() }).refine((v) => v.pinned !== undefined || v.locked !== undefined, 'Nada para alterar.');

// fixar e encerrar: equipe em qualquer fórum, criador no próprio fórum da comunidade
export async function setTopicFlags(db: Db, viewer: SessionUser, id: number, body: unknown) {
  const parsed = flagsSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const t = await db('topics as t').join('forums as f', 'f.id', 't.forum_id').where('t.id', id).whereNull('t.hidden_at').first('t.id', 't.pinned', 't.locked', 'f.created_by', 'f.kind');
  if (!t) throw notFound('Discussão não encontrada.');
  const forumOwner = t.kind === 'comunidade' && t.created_by === viewer.id;
  if (!isStaffRole(viewer.role) && !forumOwner) throw forbidden('Só a equipe ou quem criou o fórum pode fixar ou encerrar discussões.');
  await db.transaction(async (trx) => {
    await trx('topics').where({ id }).update(parsed.data);
    await audit(trx, viewer.id, 'forum.topico_ajuste', 'topic', id, { antes: { pinned: Boolean(t.pinned), locked: Boolean(t.locked) }, depois: parsed.data });
  });
  return getTopic(db, id, viewer);
}

// voto de relevância: um por pessoa, separado de confirmações e de votos em propostas
export async function setTopicVote(db: Db, viewer: SessionUser, id: number, on: boolean) {
  const t = await db('topics').where({ id }).whereNull('hidden_at').first('id', 'author_id', 'is_institutional');
  if (!t) throw notFound('Discussão não encontrada.');
  if (t.is_institutional || t.author_id === viewer.id) throw forbidden('Não é possível votar na própria discussão nem em conteúdo de apoio.');
  if (on) await db('topic_votes').insert({ topic_id: id, user_id: viewer.id, created_at: nowIso() }).onConflict(['topic_id', 'user_id']).ignore();
  else await db('topic_votes').where({ topic_id: id, user_id: viewer.id }).delete();
  const votes = Number((await db('topic_votes').where({ topic_id: id }).count({ n: '*' }).first())?.n ?? 0);
  return { votes, votedByMe: on };
}

// ---------- minhas participações e descoberta ----------

export async function myParticipation(db: Db, viewer: SessionUser) {
  const forumRows = (await db('forums as f')
    .leftJoin('users as u', 'u.id', 'f.created_by')
    .whereNull('f.hidden_at')
    .where((w) => w.whereIn('f.id', db('forum_follows').where({ user_id: viewer.id }).select('forum_id')).orWhere('f.created_by', viewer.id))
    .select(forumCols(db))) as Row[];
  const stats = await forumStats(db, forumRows.map((r) => r.id));
  const followed = new Set(((await db('forum_follows').where({ user_id: viewer.id }).select('forum_id')) as Row[]).map((r) => r.forum_id as number));
  const forums = forumRows.map((r) => ({ ...forumDto(r, viewer), ...stats.get(r.id)!, following: followed.has(r.id) }));
  const visible = (qb: ReturnType<typeof topicsQuery>) => qb.whereNull('f.hidden_at').where('f.active', true);
  const myTopicRows = (await visible(topicsQuery(db)).where('t.author_id', viewer.id).orderBy('t.last_activity_at', 'desc').limit(20)) as Row[];
  const commentedRows = (await visible(topicsQuery(db))
    .whereIn('t.id', db('discussion_comments').where({ target_type: 'topic', author_id: viewer.id }).whereNull('deleted_at').select('target_id'))
    .where((w) => w.whereNot('t.author_id', viewer.id).orWhereNull('t.author_id'))
    .orderBy('t.last_activity_at', 'desc')
    .limit(20)) as Row[];
  const voted = await votedTopics(db, viewer, [...myTopicRows, ...commentedRows].map((r) => r.id));
  const posts = Number((await db('posts').where({ author_id: viewer.id }).whereNull('deleted_at').whereNull('hidden_at').count({ n: '*' }).first())?.n ?? 0);
  return {
    createdForums: forums.filter((f) => f.isOwner),
    followedForums: forums.filter((f) => f.following && !f.isOwner && f.status === 'ativo'),
    myTopics: myTopicRows.map((r) => topicDto(r, viewer, voted)),
    commentedTopics: commentedRows.map((r) => topicDto(r, viewer, voted)),
    feedPosts: posts,
  };
}

// descoberta dentro da Comunidade: só números reais, sem preencher listas vazias
export async function communityExplore(db: Db, viewer: SessionUser | undefined) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const recentVotes = db('topic_votes').where('created_at', '>=', since).select('topic_id').count({ n: '*' }).groupBy('topic_id').as('rv');
  const recentReplies = db('discussion_comments').where({ target_type: 'topic' }).whereNull('deleted_at').whereNull('hidden_at').where('created_at', '>=', since).select('target_id').count({ n: '*' }).groupBy('target_id').as('rr');
  const popular = (await topicsQuery(db)
    .leftJoin(recentVotes, 'rv.topic_id', 't.id')
    .leftJoin(recentReplies, 'rr.target_id', 't.id')
    .whereNull('f.hidden_at')
    .where({ 'f.active': true, 'f.status': 'ativo' })
    .whereRaw('(coalesce(rv.n, 0) + coalesce(rr.n, 0)) > 0')
    .orderByRaw('(coalesce(rv.n, 0) * 2 + coalesce(rr.n, 0)) desc')
    .limit(8)) as Row[];
  const newest = (await topicsQuery(db).whereNull('f.hidden_at').where({ 'f.active': true, 'f.status': 'ativo', 't.is_institutional': false }).orderBy('t.created_at', 'desc').limit(6)) as Row[];
  const voted = await votedTopics(db, viewer, [...popular, ...newest].map((r) => r.id));
  const newForumRows = (await db('forums as f').leftJoin('users as u', 'u.id', 'f.created_by').where({ 'f.kind': 'comunidade', 'f.status': 'ativo', 'f.active': true }).whereNull('f.hidden_at').orderBy('f.created_at', 'desc').limit(6).select(forumCols(db))) as Row[];
  const stats = await forumStats(db, newForumRows.map((r) => r.id));
  // tags mais usadas nas discussões dos últimos 30 dias
  const tagCounts = new Map<string, number>();
  for (const r of (await db('topics').whereNull('hidden_at').where('created_at', '>=', since).whereNot('tags', '').select('tags')) as Row[]) {
    for (const t of tagsOf(r.tags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const themes = (await db('forums').where({ status: 'ativo', active: true }).whereNull('hidden_at').select('theme').count({ n: '*' }).groupBy('theme')) as Row[];
  return {
    popular: popular.map((r) => topicDto(r, viewer, voted)),
    newest: newest.map((r) => topicDto(r, viewer, voted)),
    newForums: newForumRows.map((r) => ({ ...forumDto(r, viewer), ...stats.get(r.id)! })),
    tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([tag, count]) => ({ tag, count })),
    themes: FORUM_THEMES.map((t) => ({ ...t, forums: Number(themes.find((x) => x.theme === t.id)?.n ?? 0) })),
  };
}

// bairros de interesse: privados, em texto livre
export async function myPlaces(db: Db, viewer?: SessionUser) {
  if (!viewer) return [] as string[];
  return ((await db('user_places').where({ user_id: viewer.id }).orderBy('created_at').select('place_name')) as Row[]).map((r) => r.place_name as string);
}

export async function setInterests(db: Db, viewer: SessionUser, body: unknown) {
  const parsed = z
    .object({ neighborhoods: z.array(z.string().max(80, 'Use até 80 caracteres.')).max(MAX_INTERESTS, `Escolha no máximo ${MAX_INTERESTS} bairros.`) })
    .safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const seen = new Map<string, string>();
  for (const n of parsed.data.neighborhoods) {
    const name = placeName(n);
    const key = placeKey(name);
    if (key.length >= 2 && !seen.has(key)) seen.set(key, name);
  }
  await db.transaction(async (trx) => {
    await trx('user_places').where({ user_id: viewer.id }).delete();
    if (seen.size) await trx('user_places').insert([...seen.entries()].map(([k, n]) => ({ user_id: viewer.id, place_key: k, place_name: n, created_at: nowIso() })));
  });
  return { neighborhoods: [...seen.values()] };
}

// tópico de apoio publicado em nome do UrbanTalk em um fórum oficial
export async function createInstitutionalTopic(db: Db, admin: SessionUser, slug: string, body: unknown) {
  return createTopic(db, admin, slug, body, true);
}

export { themeIds };

// lista completa para a administração: inclui desativados, pendentes e recusados
export async function adminForumList(db: Db) {
  const rows = (await db('forums as f').leftJoin('users as u', 'u.id', 'f.created_by').orderBy([{ column: 'f.kind', order: 'desc' }, { column: 'f.sort_order' }, { column: 'f.name' }]).select(forumCols(db))) as Row[];
  const stats = await forumStats(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...forumDto(r), ...stats.get(r.id)!, hidden: Boolean(r.hidden_at), creatorFullName: (r.creator_name as string | null) ?? null }));
}

export async function slugById(db: Db, id: number) {
  const f = await db('forums').where({ id }).first('slug');
  if (!f) throw notFound('Fórum não encontrado.');
  return f.slug as string;
}
