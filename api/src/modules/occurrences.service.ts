import type { Knex } from 'knex';
import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { endOfLocalDayExclusive, isValidDay, nowIso, startOfLocalDay } from '../lib/dates.js';
import { badRequest, conflict, forbidden, fromZod, notFound } from '../lib/errors.js';
import { placeKey, placeName } from '../lib/text.js';
import { isStaffRole, type SessionUser, type Status } from '../types.js';
import { initialStatus } from './statuses.service.js';
import { notify, staffIds } from './notifications.service.js';
import { addEvent, buildTimeline, notifyOccurrenceUpdate, openInfoRequest, resolutionSummary } from './tracking.service.js';

// área aproximada do município de Sorocaba, com margem
export const SOROCABA_BOUNDS = { minLat: -23.7, maxLat: -23.3, minLng: -47.7, maxLng: -47.25 };

const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      ctx.addIssue({ code: 'custom', message: 'Valor inválido.' });
      return z.NEVER;
    }
    return n;
  });

const optionalDay = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    if (!isValidDay(v)) {
      ctx.addIssue({ code: 'custom', message: 'Use uma data no formato AAAA-MM-DD.' });
      return z.NEVER;
    }
    return v;
  });

const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .optional()
    .transform((v) => v || undefined);

export const filtersSchema = z
  .object({
    category: optionalInt,
    // nome do bairro como digitado; a comparação ignora acentos, maiúsculas e espaços extras
    neighborhood: optionalText(80, 'O bairro pode ter até 80 caracteres.'),
    scope: z
      .enum(['cidade', 'bairro', ''], { error: 'Abrangência inválida.' })
      .optional()
      .transform((v) => v || undefined),
    status: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{0,40}$/, 'Status inválido.')
      .optional()
      .transform((v) => v || undefined),
    // "abertas" ou "encerradas", conforme o tipo do status
    situation: z
      .enum(['abertas', 'encerradas', ''], { error: 'Situação inválida.' })
      .optional()
      .transform((v) => v || undefined),
    from: optionalDay,
    to: optionalDay,
    q: optionalText(100, 'A busca pode ter até 100 caracteres.'),
    street: optionalText(100, 'A rua pode ter até 100 caracteres.'),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, { message: 'A data inicial precisa ser anterior à final.', path: ['from'] });

export type Filters = z.output<typeof filtersSchema>;

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['recent', 'oldest', 'confirmations']).default('recent'),
});

export function parseFilters(query: unknown): Filters {
  const parsed = filtersSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  return parsed.data;
}

export function parsePaging(query: unknown) {
  const parsed = pageSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Paginação inválida.');
  return parsed.data;
}

const like = (s: string) => `%${s.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function applyFilters(qb: Knex.QueryBuilder, f: Filters, alias = 'o') {
  if (f.category) qb.where(`${alias}.category_id`, f.category);
  if (f.neighborhood) {
    const key = placeKey(f.neighborhood);
    // um bairro só é filtrado pela chave exata: "jardim ipe" acha "Jardim Ipê", mas não "Jardim Ipanema"
    if (key) qb.where(`${alias}.neighborhood_key`, key);
  }
  if (f.scope) qb.where(`${alias}.scope`, f.scope);
  if (f.status) qb.where(`${alias}.status`, f.status);
  if (f.situation) {
    const closed = f.situation === 'encerradas';
    qb.whereIn(`${alias}.status`, (sub) => sub.from('statuses').select('slug').where('is_closed', closed));
  }
  if (f.from) qb.where(`${alias}.created_at`, '>=', startOfLocalDay(f.from));
  if (f.to) qb.where(`${alias}.created_at`, '<', endOfLocalDayExclusive(f.to));
  if (f.street) qb.whereRaw(`lower(coalesce(${alias}.street, '')) like ? escape '\\'`, [like(f.street)]);
  if (f.q) {
    // busca no texto e no endereço informado
    const term = like(f.q);
    qb.where((w) => {
      for (const col of ['description', 'street', 'category_detail', 'reference']) {
        w.orWhereRaw(`lower(coalesce(${alias}.${col}, '')) like ? escape '\\'`, [term]);
      }
      // nome do bairro também, comparado sem acento
      const key = placeKey(f.q!);
      if (key) w.orWhereRaw(`coalesce(${alias}.neighborhood_key, '') like ? escape '\\'`, [like(key)]);
    });
  }
  return qb;
}

export const occCode = (id: number) => `UT-${String(id).padStart(5, '0')}`;

function baseQuery(db: Db) {
  const counts = db('confirmations').select('occurrence_id').count({ cnt: '*' }).groupBy('occurrence_id').as('cf');
  return db('occurrences as o')
    .join('categories as c', 'c.id', 'o.category_id')
    .join('statuses as s', 's.slug', 'o.status')
    .leftJoin(counts, 'cf.occurrence_id', 'o.id')
    .select(
      'o.id',
      'o.user_id',
      'o.street',
      'o.category_detail',
      'o.description',
      'o.reference',
      'o.latitude',
      'o.longitude',
      'o.photo_path',
      'o.status',
      'o.is_demo',
      'o.created_at',
      'o.updated_at',
      'o.reopened_count',
      'o.review_requested_at',
      's.is_closed as status_closed',
      'c.id as category_id',
      'c.slug as category_slug',
      'c.name as category_name',
      'c.icon as category_icon',
      'o.scope',
      'o.neighborhood_name',
      'o.neighborhood_key',
      db.raw('coalesce(cf.cnt, 0) as confirmations'),
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// visão pública: nunca inclui nome, e-mail ou id de quem registrou
export function toDto(row: Row, viewer?: SessionUser, confirmedIds?: Set<number>) {
  return {
    id: row.id as number,
    code: occCode(row.id),
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name, icon: row.category_icon },
    categoryDetail: (row.category_detail as string | null) ?? null,
    // abrangência: cidade toda (sem bairro) ou um bairro digitado
    scope: row.scope as 'cidade' | 'bairro',
    neighborhood: row.neighborhood_name ? { name: row.neighborhood_name as string, key: row.neighborhood_key as string } : null,
    street: (row.street as string | null) ?? null,
    description: row.description as string,
    reference: row.reference as string | null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    photoUrl: row.photo_path ? `/api/photos/${row.photo_path}` : null,
    status: row.status as Status,
    isClosed: Boolean(row.status_closed),
    confirmations: Number(row.confirmations),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    isMine: viewer ? row.user_id === viewer.id : false,
    confirmedByMe: confirmedIds ? confirmedIds.has(row.id) : false,
  };
}

export type OccurrenceDto = ReturnType<typeof toDto>;

async function confirmedSet(db: Db, viewer: SessionUser | undefined, ids: number[]) {
  if (!viewer || ids.length === 0) return new Set<number>();
  const rows = (await db('confirmations').where({ user_id: viewer.id }).whereIn('occurrence_id', ids).select('occurrence_id')) as Row[];
  return new Set(rows.map((r) => r.occurrence_id as number));
}

function applySort(qb: Knex.QueryBuilder, sort: 'recent' | 'oldest' | 'confirmations') {
  if (sort === 'confirmations') qb.orderBy([{ column: 'confirmations', order: 'desc' }, { column: 'o.created_at', order: 'desc' }]);
  else qb.orderBy([{ column: 'o.created_at', order: sort === 'oldest' ? 'asc' : 'desc' }, { column: 'o.id', order: sort === 'oldest' ? 'asc' : 'desc' }]);
  return qb;
}

export async function listOccurrences(
  db: Db,
  filters: Filters,
  paging: ReturnType<typeof parsePaging>,
  viewer?: SessionUser,
  onlyUserId?: number,
) {
  const where = (qb: Knex.QueryBuilder) => {
    applyFilters(qb, filters);
    if (onlyUserId) qb.where('o.user_id', onlyUserId);
    return qb;
  };
  const totalRow = await where(db('occurrences as o')).count({ total: '*' }).first();
  const total = Number(totalRow?.total ?? 0);
  const rows = (await applySort(where(baseQuery(db)), paging.sort)
    .limit(paging.pageSize)
    .offset((paging.page - 1) * paging.pageSize)) as Row[];
  const confirmed = await confirmedSet(db, viewer, rows.map((r) => r.id));
  // maior id existente: o painel da equipe usa para destacar o que chegou depois
  const latest = await db('occurrences').max({ m: 'id' }).first();
  return {
    items: rows.map((r) => toDto(r, viewer, confirmed)),
    page: paging.page,
    pageSize: paging.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
    latestId: Number(latest?.m ?? 0),
  };
}

// versão enxuta para o mapa: só o necessário para desenhar os marcadores
export async function mapMarkers(db: Db, filters: Filters) {
  const LIMIT = 2000;
  const rows = (await applyFilters(baseQuery(db), filters).whereNotNull('o.latitude').orderBy('o.created_at', 'desc').limit(LIMIT + 1)) as Row[];
  // reclamações da cidade toda sem ponto no mapa não viram marcador, mas são contadas
  const noPoint = await applyFilters(db('occurrences as o'), filters).whereNull('o.latitude').count({ n: '*' }).first();
  return {
    truncated: rows.length > LIMIT,
    withoutPoint: Number(noPoint?.n ?? 0),
    markers: rows.slice(0, LIMIT).map((r) => ({
      id: r.id,
      code: occCode(r.id),
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status as Status,
      categoryId: r.category_id,
      categoryIcon: r.category_icon,
      categoryName: r.category_name,
      scope: r.scope as 'cidade' | 'bairro',
      neighborhoodName: (r.neighborhood_name as string | null) ?? null,
      street: r.street ?? null,
      confirmations: Number(r.confirmations),
      createdAt: r.created_at,
      // dados do balão do mapa
      description: String(r.description).slice(0, 140),
      photoUrl: r.photo_path ? `/api/photos/${r.photo_path}` : null,
      isClosed: Boolean(r.status_closed),
    })),
  };
}

async function loadRow(db: Db, id: number) {
  const row = await baseQuery(db).where('o.id', id).first();
  if (!row) throw notFound('Ocorrência não encontrada. Ela pode ter sido removida ou o endereço está incorreto.');
  return row as Row;
}

async function loadHistory(db: Db, id: number) {
  return (await db('status_history as h')
    .leftJoin('users as u', 'u.id', 'h.changed_by')
    .where('h.occurrence_id', id)
    .orderBy('h.created_at', 'asc')
    .orderBy('h.id', 'asc')
    .select('h.id', 'h.from_status', 'h.to_status', 'h.note', 'h.created_at', 'u.role as changed_by_role', 'u.name as changed_by_name')) as Row[];
}

const who = (h: Row) => (h.from_status === null ? 'cidadao' : isStaffRole(h.changed_by_role) ? 'equipe' : 'sistema');

// detalhe público: histórico sem nomes e só as atualizações públicas da equipe
export async function getOccurrence(db: Db, id: number, viewer?: SessionUser) {
  const row = await loadRow(db, id);
  const confirmed = await confirmedSet(db, viewer, [id]);
  const isOwner = Boolean(viewer && row.user_id === viewer.id);
  const audience = viewer && isStaffRole(viewer.role) ? 'equipe' : isOwner ? 'autor' : 'publico';
  const [timeline, resolution, infoRequest] = await Promise.all([
    buildTimeline(db, id, audience === 'equipe' ? 'autor' : audience),
    resolutionSummary(db, id, viewer, audience === 'equipe' ? 'publico' : audience),
    isOwner ? openInfoRequest(db, id) : Promise.resolve(null),
  ]);
  const history = await loadHistory(db, id);
  const updates = (await db('occurrence_notes')
    .where({ occurrence_id: id, visibility: 'publica' })
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .select('id', 'body', 'created_at')) as Row[];
  return {
    ...toDto(row, viewer, confirmed),
    history: history.map((h) => ({
      id: h.id as number,
      fromStatus: h.from_status as Status | null,
      toStatus: h.to_status as Status,
      note: h.note as string | null,
      createdAt: h.created_at as string,
      changedBy: who(h) as 'cidadao' | 'equipe' | 'sistema',
    })),
    publicUpdates: updates.map((u) => ({ id: u.id as number, body: u.body as string, createdAt: u.created_at as string })),
    timeline,
    resolution: resolution.current,
    previousResolutions: resolution.previousResolutions,
    reopenedCount: Number(row.reopened_count ?? 0),
    reviewRequested: Boolean(row.review_requested_at),
    // pergunta da equipe em aberto, só para quem registrou
    infoRequest,
  };
}

// detalhe completo para funcionários: quem registrou, autores e anotações internas
export async function getOccurrenceForStaff(db: Db, id: number, viewer: SessionUser) {
  const base = await getOccurrence(db, id, viewer);
  const row = await db('occurrences as o')
    .join('users as u', 'u.id', 'o.user_id')
    .leftJoin('users as a', 'a.id', 'o.assigned_to')
    .where('o.id', id)
    .first('u.name', 'u.email', 'o.priority', 'o.priority_reason', 'o.assigned_to', 'o.assigned_at', 'o.duplicate_of', 'o.review_requested_at', 'a.name as assignee_name');
  const [timeline, resolution, infoRequest] = await Promise.all([buildTimeline(db, id, 'equipe'), resolutionSummary(db, id, viewer, 'equipe'), openInfoRequest(db, id)]);
  const history = await loadHistory(db, id);
  const notes = (await db('occurrence_notes as n')
    .join('users as u', 'u.id', 'n.author_id')
    .where('n.occurrence_id', id)
    .orderBy('n.created_at', 'asc')
    .orderBy('n.id', 'asc')
    .select('n.id', 'n.visibility', 'n.body', 'n.created_at', 'u.name as author_name')) as Row[];
  return {
    ...base,
    reporter: { name: row.name as string, email: row.email as string },
    timeline,
    resolution: resolution.current,
    infoRequest,
    priority: (row.priority as 'baixa' | 'media' | 'alta' | null) ?? null,
    priorityReason: (row.priority_reason as string | null) ?? null,
    assignee: row.assigned_to ? { id: row.assigned_to as number, name: row.assignee_name as string, since: row.assigned_at as string } : null,
    duplicateOf: (row.duplicate_of as number | null) ?? null,
    reviewRequestedAt: (row.review_requested_at as string | null) ?? null,
    history: base.history.map((h, i) => ({ ...h, changedByName: (history[i].changed_by_name as string | null) ?? null })),
    notes: notes.map((n) => ({
      id: n.id as number,
      visibility: n.visibility as 'interna' | 'publica',
      body: n.body as string,
      createdAt: n.created_at as string,
      authorName: n.author_name as string,
    })),
  };
}

export const createSchema = z.object({
  categoryId: z.coerce.number({ error: 'Escolha uma categoria.' }).int().min(1, 'Escolha uma categoria.'),
  categoryDetail: z
    .string()
    .trim()
    .max(80, 'Use até 80 caracteres para dizer qual é o problema.')
    .optional()
    .transform((v) => v || null),
  // "Onde se aplica?": cidade toda ou um bairro digitado livremente
  scope: z.enum(['cidade', 'bairro'], { error: 'Diga onde o problema se aplica: cidade toda ou bairro.' }),
  neighborhoodName: z
    .string()
    .optional()
    .transform((v) => (v ? placeName(v) : '')),
  street: z
    .string()
    .trim()
    .max(160, 'A rua pode ter até 160 caracteres.')
    .optional()
    .transform((v) => v?.replace(/\s+/g, ' ') || null)
    .refine((v) => v === null || v.length >= 3, 'Escreva o nome da rua com pelo menos 3 letras, ou deixe em branco.'),
  description: z
    .string({ error: 'Descreva o problema.' })
    .trim()
    .min(10, 'Descreva o problema com pelo menos 10 caracteres.')
    .max(1000, 'A descrição pode ter até 1000 caracteres.'),
  reference: z
    .string()
    .trim()
    .max(120, 'O ponto de referência pode ter até 120 caracteres.')
    .optional()
    .transform((v) => v || null),
  latitude: optionalCoord(SOROCABA_BOUNDS.minLat, SOROCABA_BOUNDS.maxLat),
  longitude: optionalCoord(SOROCABA_BOUNDS.minLng, SOROCABA_BOUNDS.maxLng),
}).superRefine((v, ctx) => {
  // bairro: nome obrigatório e ponto no mapa; cidade toda: nenhum dos dois é exigido
  if (v.scope === 'bairro') {
    if (!v.neighborhoodName || placeKey(v.neighborhoodName).length < 2) ctx.addIssue({ code: 'custom', path: ['neighborhoodName'], message: 'Digite o nome do bairro.' });
    else if (v.neighborhoodName.length > 80) ctx.addIssue({ code: 'custom', path: ['neighborhoodName'], message: 'O nome do bairro pode ter até 80 caracteres.' });
    if (v.latitude === null || v.longitude === null) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Marque o local no mapa.' });
  }
  if ((v.latitude === null) !== (v.longitude === null)) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Ponto no mapa incompleto.' });
});

function optionalCoord(min: number, max: number) {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: 'Marque o local no mapa.' });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: 'O ponto marcado está fora de Sorocaba.' });
        return z.NEVER;
      }
      return n;
    });
}

export const IDEMPOTENCY_RE = /^[A-Za-z0-9-]{16,64}$/;

export async function findByIdempotencyKey(db: Db, userId: number, key: string | null) {
  if (!key) return null;
  const row = await db('occurrences').where({ user_id: userId, idempotency_key: key }).first('id');
  return (row?.id as number | undefined) ?? null;
}

export async function createOccurrence(
  db: Db,
  user: SessionUser,
  input: z.output<typeof createSchema>,
  photoPath: string | null,
  idempotencyKey: string | null = null,
) {
  const category = await db('categories').where({ id: input.categoryId, active: true }).first('id', 'requires_detail');
  if (!category) throw badRequest('Revise os campos destacados.', { categoryId: 'Categoria inexistente.' });
  // "Outros" precisa de especificação; nas demais o campo é ignorado
  const detail = category.requires_detail ? input.categoryDetail : null;
  if (category.requires_detail && (!detail || detail.length < 3)) {
    throw badRequest('Revise os campos destacados.', { categoryDetail: 'Conte em poucas palavras qual é o problema (pelo menos 3 letras).' });
  }

  // data e status inicial definidos pelo servidor, nunca pelo cliente
  const now = nowIso();
  const status = await initialStatus(db);
  try {
    const result = await db.transaction(async (trx) => {
      const [id] = await trx('occurrences').insert({
        user_id: user.id,
        category_id: input.categoryId,
        category_detail: detail,
        scope: input.scope,
        // cidade toda nunca guarda bairro, mesmo que algum nome tenha vindo no envio
        neighborhood_name: input.scope === 'bairro' ? input.neighborhoodName : null,
        neighborhood_key: input.scope === 'bairro' ? placeKey(input.neighborhoodName) : null,
        street: input.street,
        description: input.description,
        reference: input.reference,
        latitude: input.latitude,
        longitude: input.longitude,
        photo_path: photoPath,
        status,
        idempotency_key: idempotencyKey,
        is_demo: false,
        created_at: now,
        updated_at: now,
      });
      await trx('status_history').insert({
        occurrence_id: id,
        from_status: null,
        to_status: status,
        changed_by: user.id,
        note: null,
        created_at: now,
      });
      return { id: id as number, created: true };
    });
    await notify(db, await staffIds(db), {
      kind: 'equipe.nova',
      title: 'Novas reclamações aguardando análise',
      body: input.description.slice(0, 140),
      link: '/admin/fila',
      dedupeKey: 'novas-ocorrencias',
    }, user.id);
    return result;
  } catch (err) {
    // duas requisições iguais ao mesmo tempo: a segunda devolve a primeira
    if (idempotencyKey && String((err as Error).message).includes('UNIQUE')) {
      const existing = await findByIdempotencyKey(db, user.id, idempotencyKey);
      if (existing) return { id: existing, created: false };
    }
    throw err;
  }
}

export async function confirmOccurrence(db: Db, user: SessionUser, id: number) {
  const occ = await db('occurrences as o').join('statuses as s', 's.slug', 'o.status').where('o.id', id).first('o.id', 'o.user_id', 's.is_closed', 's.name');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  if (occ.user_id === user.id) {
    throw forbidden('Você registrou esta ocorrência. A confirmação serve para outras pessoas que também viram o problema.');
  }
  if (occ.is_closed) throw conflict('already_closed', `Esta ocorrência já foi encerrada como "${occ.name}".`);
  try {
    await db('confirmations').insert({ occurrence_id: id, user_id: user.id, created_at: nowIso() });
  } catch (err) {
    // a restrição única do banco é a garantia final contra confirmação repetida
    if (String((err as Error).message).includes('UNIQUE')) {
      throw conflict('already_confirmed', 'Você já confirmou esta ocorrência.');
    }
    throw err;
  }
  const row = await db('confirmations').where({ occurrence_id: id }).count({ cnt: '*' }).first();
  return Number(row?.cnt ?? 0);
}

export const statusSchema = z.object({
  status: z.string({ error: 'Escolha um status.' }).trim().min(1, 'Escolha um status.').max(40),
  note: z
    .string()
    .trim()
    .max(500, 'A mensagem pode ter até 500 caracteres.')
    .optional()
    .transform((v) => v || null),
});

export async function changeStatus(db: Db, staff: SessionUser, id: number, input: z.output<typeof statusSchema>) {
  const occ = await db('occurrences as o').join('statuses as s', 's.slug', 'o.status').where('o.id', id).first('o.id', 'o.status', 's.is_closed');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const target = await db('statuses').where({ slug: input.status }).first('slug', 'name', 'active', 'is_closed', 'counts_as_resolved');
  if (!target) throw badRequest('Escolha um status válido.', { status: 'Status inexistente.' });
  if (!target.active) throw badRequest(`O status "${target.name}" está desativado e não pode ser usado em novas alterações.`, { status: 'Status desativado.' });
  if (occ.status === input.status) throw conflict('same_status', `A ocorrência já está com o status "${target.name}".`);
  // reabrir algo encerrado exige justificativa; o histórico anterior continua intacto
  const reopening = Boolean(occ.is_closed) && !target.is_closed;
  if (reopening && (!input.note || input.note.length < 5)) {
    throw badRequest('Explique por que a reclamação está sendo reaberta.', { note: 'Obrigatório ao reabrir (pelo menos 5 caracteres).' });
  }
  const now = nowIso();
  await db.transaction(async (trx) => {
    await trx('occurrences')
      .where({ id })
      .update({
        status: input.status,
        updated_at: now,
        ...(reopening ? { reopened_count: trx.raw('reopened_count + 1') } : {}),
        // reavaliação feita: sai da lista de pedidos de reavaliação
        ...(reopening || target.is_closed ? { review_requested_at: null } : {}),
      });
    await trx('status_history').insert({
      occurrence_id: id,
      from_status: occ.status,
      to_status: input.status,
      changed_by: staff.id,
      note: input.note,
      created_at: now,
    });
    if (reopening) {
      await trx('occurrence_resolutions').where({ occurrence_id: id }).whereNull('superseded_at').update({ superseded_at: now });
      await addEvent(trx, id, staff.id, 'reaberta', 'publica', input.note, { to: input.status }, now);
    }
    // status que conta como resolvido registra uma resolução informada
    if (target.counts_as_resolved) {
      await trx('occurrence_resolutions').where({ occurrence_id: id }).whereNull('superseded_at').update({ superseded_at: now });
      await trx('occurrence_resolutions').insert({ occurrence_id: id, resolved_by: staff.id, status: input.status, description: input.note, created_at: now });
      await addEvent(trx, id, staff.id, 'resolucao', 'publica', null, { status: input.status, evidencias: 0, photos: [] }, now);
    }
  });
  await notifyOccurrenceUpdate(db, id, staff.id, `status alterado para "${target.name}"`, input.note);
}

export const noteSchema = z.object({
  visibility: z.enum(['interna', 'publica'], { error: 'Escolha se a anotação é interna ou visível ao cidadão.' }),
  body: z
    .string({ error: 'Escreva a anotação.' })
    .trim()
    .min(3, 'Escreva pelo menos 3 caracteres.')
    .max(1000, 'A anotação pode ter até 1000 caracteres.'),
});

export async function addNote(db: Db, staff: SessionUser, id: number, input: z.output<typeof noteSchema>) {
  const occ = await db('occurrences').where({ id }).first('id');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    await trx('occurrence_notes').insert({ occurrence_id: id, author_id: staff.id, visibility: input.visibility, body: input.body, created_at: now });
    // atualização pública conta como movimentação da ocorrência
    if (input.visibility === 'publica') await trx('occurrences').where({ id }).update({ updated_at: now });
  });
  if (input.visibility === 'publica') await notifyOccurrenceUpdate(db, id, staff.id, 'nova atualização da equipe', input.body.slice(0, 160));
}

export const addressSchema = z
  .object({
    scope: z.enum(['cidade', 'bairro'], { error: 'Abrangência inválida.' }).optional(),
    neighborhoodName: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : placeName(v))),
    street: z
      .string()
      .trim()
      .max(160, 'A rua pode ter até 160 caracteres.')
      .optional()
      .transform((v) => (v === undefined ? undefined : v.replace(/\s+/g, ' ') || null)),
    reference: z
      .string()
      .trim()
      .max(120, 'O ponto de referência pode ter até 120 caracteres.')
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
  })
  .refine((v) => v.scope !== undefined || v.neighborhoodName !== undefined || v.street !== undefined || v.reference !== undefined, { message: 'Nada para alterar.' });

// correção de localização pela equipe; cada mudança fica no registro de auditoria
export async function updateAddress(db: Db, staff: SessionUser, id: number, input: z.output<typeof addressSchema>) {
  const occ = await db('occurrences').where({ id }).first('id', 'scope', 'neighborhood_name', 'neighborhood_key', 'street', 'reference', 'latitude');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const scope = input.scope ?? occ.scope;
  const changes: Record<string, unknown> = {};
  if (scope === 'cidade') {
    // ao virar cidade toda, o bairro antigo é apagado de verdade
    if (occ.scope !== 'cidade' || occ.neighborhood_name !== null) Object.assign(changes, { scope: 'cidade', neighborhood_name: null, neighborhood_key: null });
  } else {
    const name = input.neighborhoodName ?? occ.neighborhood_name ?? '';
    if (placeKey(name).length < 2) throw badRequest('Revise os campos destacados.', { neighborhoodName: 'Digite o nome do bairro.' });
    if (name.length > 80) throw badRequest('Revise os campos destacados.', { neighborhoodName: 'Use até 80 caracteres.' });
    if (occ.latitude === null) throw badRequest('Esta reclamação não tem ponto no mapa e por isso só pode ficar como cidade toda.', { scope: 'Sem ponto no mapa.' });
    if (occ.scope !== 'bairro') changes['scope'] = 'bairro';
    if (name !== occ.neighborhood_name) Object.assign(changes, { neighborhood_name: name, neighborhood_key: placeKey(name) });
  }
  if (input.street && input.street.length < 3) throw badRequest('Revise os campos destacados.', { street: 'Use pelo menos 3 letras.' });
  if (input.street !== undefined && input.street !== occ.street) changes['street'] = input.street;
  if (input.reference !== undefined && input.reference !== occ.reference) changes['reference'] = input.reference;
  if (Object.keys(changes).length === 0) return;
  const before = { scope: occ.scope, neighborhood_name: occ.neighborhood_name, street: occ.street, reference: occ.reference };
  await db.transaction(async (trx) => {
    await trx('occurrences').where({ id }).update({ ...changes, updated_at: nowIso() });
    await addEvent(trx, id, staff.id, 'endereco', 'interna', null, { antes: before, depois: changes });
    await audit(trx, staff.id, 'ocorrencia.endereco', 'occurrence', id, { antes: before, depois: changes });
  });
}

export async function userSummary(db: Db, user: SessionUser) {
  const byStatus = (await db('occurrences as o')
    .join('statuses as s', 's.slug', 'o.status')
    .where('o.user_id', user.id)
    .select('o.status', 's.is_closed', 's.counts_as_resolved')
    .count({ cnt: '*' })
    .groupBy('o.status', 's.is_closed', 's.counts_as_resolved')) as Row[];
  const received = await db('confirmations as cf')
    .join('occurrences as o', 'o.id', 'cf.occurrence_id')
    .where('o.user_id', user.id)
    .count({ cnt: '*' })
    .first();
  const given = await db('confirmations').where({ user_id: user.id }).count({ cnt: '*' }).first();
  const items = byStatus.map((r) => ({ status: r.status as string, count: Number(r.cnt), closed: Boolean(r.is_closed), resolved: Boolean(r.counts_as_resolved) }));
  return {
    total: items.reduce((a, i) => a + i.count, 0),
    open: items.filter((i) => !i.closed).reduce((a, i) => a + i.count, 0),
    closed: items.filter((i) => i.closed).reduce((a, i) => a + i.count, 0),
    resolved: items.filter((i) => i.resolved).reduce((a, i) => a + i.count, 0),
    byStatus: items.map(({ status, count }) => ({ status, count })),
    confirmationsReceived: Number(received?.cnt ?? 0),
    confirmationsGiven: Number(given?.cnt ?? 0),
  };
}

// visão rápida do painel administrativo
export async function staffOverview(db: Db) {
  const initial = await initialStatus(db);
  const count = async (qb: Knex.QueryBuilder) => Number((await qb.count({ c: '*' }).first())?.c ?? 0);
  const openQ = () => db('occurrences as o').join('statuses as s', 's.slug', 'o.status').where('s.is_closed', false);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [waiting, open, stale, lastDay, total] = await Promise.all([
    count(db('occurrences').where({ status: initial })),
    count(openQ()),
    count(openQ().where('o.updated_at', '<', weekAgo)),
    count(db('occurrences').where('created_at', '>=', dayAgo)),
    count(db('occurrences')),
  ]);
  const latest = await db('occurrences').max({ m: 'id' }).first();
  return { initialStatus: initial, waiting, open, stale, lastDay, total, latestId: Number(latest?.m ?? 0) };
}
