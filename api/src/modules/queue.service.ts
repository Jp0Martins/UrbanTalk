import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { badRequest, conflict, fromZod, notFound } from '../lib/errors.js';
import { cleanText } from '../lib/text.js';
import type { SessionUser } from '../types.js';
import { notify } from './notifications.service.js';
import { applyFilters, occCode, parseFilters } from './occurrences.service.js';
import { getPrioritySettings, type PrioritySettings } from './settings.service.js';
import { PRIORITY_LABEL, addEvent } from './tracking.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const DAY = 86_400_000;

// pontuação transparente: cada parcela vem com a explicação mostrada à equipe
export function scoreOf(r: Row, s: PrioritySettings, now = Date.now()) {
  const parts: { label: string; points: number }[] = [];
  const pr = r.priority as string | null;
  const prPoints = pr === 'alta' ? s.priorityAlta : pr === 'media' ? s.priorityMedia : pr === 'baixa' ? s.priorityBaixa : s.priorityNone;
  parts.push({ label: pr ? `prioridade ${PRIORITY_LABEL[pr]} definida pela equipe` : 'prioridade ainda não avaliada', points: prPoints });
  const conf = Number(r.confirmations ?? 0);
  if (conf > 0 && s.perConfirmation > 0) {
    const counted = Math.min(conf, s.maxConfirmations);
    parts.push({ label: `${conf} ${conf === 1 ? 'confirmação' : 'confirmações'}${conf > counted ? ` (contam até ${s.maxConfirmations})` : ''}`, points: counted * s.perConfirmation });
  }
  const daysOpen = Math.floor((now - Date.parse(r.created_at)) / DAY);
  if (daysOpen > 0 && s.perDay > 0) {
    const counted = Math.min(daysOpen, s.maxDays);
    parts.push({ label: `${daysOpen} ${daysOpen === 1 ? 'dia' : 'dias'} desde o registro${daysOpen > counted ? ` (contam até ${s.maxDays})` : ''}`, points: counted * s.perDay });
  }
  const daysIdle = Math.floor((now - Date.parse(r.updated_at)) / DAY);
  if (daysIdle >= s.staleDays && s.staleBonus > 0) parts.push({ label: `sem movimentação há ${daysIdle} dias`, points: s.staleBonus });
  if (r.review_requested_at && s.reviewBonus > 0) parts.push({ label: 'morador informou que o problema continua', points: s.reviewBonus });
  return { score: parts.reduce((a, p) => a + p.points, 0), parts: parts.filter((p) => p.points > 0 || p.label.startsWith('prioridade')), daysOpen, daysIdle };
}

const queueSchema = z.object({
  view: z.enum(['todas', 'minhas', 'sem-responsavel']).default('todas'),
  priority: z.enum(['baixa', 'media', 'alta', 'nenhuma']).optional(),
  flag: z.enum(['atrasadas', 'paradas', 'reavaliacao', 'pedido-pendente', 'duplicatas']).optional(),
  sort: z.enum(['pontuacao', 'antigas', 'recentes', 'confirmacoes', 'parada', 'categoria', 'bairro', 'status']).default('pontuacao'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const LIMIT = 5000;

// distância aproximada em metros (suficiente para escalas de bairro)
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const SIMILAR_RADIUS_M = 200;
const SIMILAR_WINDOW_DAYS = 90;

export async function listQueue(db: Db, viewer: SessionUser, query: Record<string, unknown>) {
  // sem situação informada, a fila mostra só as abertas
  const situation = query['situation'] === 'todas' ? '' : (query['situation'] ?? 'abertas');
  const filters = parseFilters({ ...query, situation });
  const parsed = queueSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const q = parsed.data;
  const settings = await getPrioritySettings(db);
  const counts = db('confirmations').select('occurrence_id').count({ cnt: '*' }).groupBy('occurrence_id').as('cf');
  const pending = db('occurrence_info_requests').whereNull('answered_at').whereNull('cancelled_at').select('occurrence_id').count({ n: '*' }).groupBy('occurrence_id').as('pi');
  const qb = db('occurrences as o')
    .join('categories as c', 'c.id', 'o.category_id')
    .join('statuses as s', 's.slug', 'o.status')
    .leftJoin('users as a', 'a.id', 'o.assigned_to')
    .leftJoin(counts, 'cf.occurrence_id', 'o.id')
    .leftJoin(pending, 'pi.occurrence_id', 'o.id')
    .select(
      'o.id', 'o.status', 'o.street', 'o.category_detail', 'o.description', 'o.latitude', 'o.longitude', 'o.created_at', 'o.updated_at',
      'o.priority', 'o.priority_reason', 'o.assigned_to', 'o.duplicate_of', 'o.review_requested_at', 'o.is_demo',
      's.name as status_name', 's.sort_order as status_order', 's.is_closed',
      'c.id as category_id', 'c.name as category_name', 'c.icon as category_icon',
      'o.scope', 'o.neighborhood_name', 'o.neighborhood_key',
      'a.name as assignee_name',
      db.raw('coalesce(cf.cnt, 0) as confirmations'),
      db.raw('coalesce(pi.n, 0) as pending_info'),
    );
  applyFilters(qb, filters);
  if (q.view === 'minhas') qb.where('o.assigned_to', viewer.id);
  if (q.view === 'sem-responsavel') qb.whereNull('o.assigned_to');
  if (q.priority === 'nenhuma') qb.whereNull('o.priority');
  else if (q.priority) qb.where('o.priority', q.priority);
  const now = Date.now();
  if (q.flag === 'atrasadas') qb.where('o.created_at', '<', new Date(now - settings.overdueDays * DAY).toISOString());
  if (q.flag === 'paradas') qb.where('o.updated_at', '<', new Date(now - settings.staleDays * DAY).toISOString());
  if (q.flag === 'reavaliacao') qb.whereNotNull('o.review_requested_at');
  if (q.flag === 'pedido-pendente') qb.whereRaw('coalesce(pi.n, 0) > 0');
  if (q.flag === 'duplicatas') qb.whereNotNull('o.duplicate_of');
  const rows = (await qb.limit(LIMIT + 1)) as Row[];

  const enriched = rows.slice(0, LIMIT).map((r) => ({ r, ...scoreOf(r, settings, now) }));
  const by = {
    pontuacao: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => b.score - a.score || a.r.created_at.localeCompare(b.r.created_at),
    antigas: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => a.r.created_at.localeCompare(b.r.created_at),
    recentes: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => b.r.created_at.localeCompare(a.r.created_at),
    confirmacoes: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => Number(b.r.confirmations) - Number(a.r.confirmations) || a.r.created_at.localeCompare(b.r.created_at),
    parada: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => a.r.updated_at.localeCompare(b.r.updated_at),
    categoria: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => a.r.category_name.localeCompare(b.r.category_name, 'pt-BR') || b.score - a.score,
    bairro: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => String(a.r.neighborhood_key ?? '').localeCompare(String(b.r.neighborhood_key ?? ''), 'pt-BR') || String(a.r.street ?? '').localeCompare(String(b.r.street ?? ''), 'pt-BR') || b.score - a.score,
    status: (a: (typeof enriched)[0], b: (typeof enriched)[0]) => Number(a.r.status_order) - Number(b.r.status_order) || b.score - a.score,
  }[q.sort];
  enriched.sort(by);
  const total = enriched.length;
  const pageItems = enriched.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);

  // possíveis duplicatas só para os itens da página (mesma categoria, perto e em tempo próximo)
  const similarCount = new Map<number, number>();
  if (pageItems.length) {
    const cats = [...new Set(pageItems.map((e) => e.r.category_id))];
    const candidates = (await db('occurrences').whereIn('category_id', cats).whereNotNull('latitude').select('id', 'category_id', 'latitude', 'longitude', 'created_at')) as Row[];
    for (const e of pageItems) {
      // sem ponto no mapa (cidade toda) não há como comparar distância
      if (e.r.latitude === null) continue;
      const t = Date.parse(e.r.created_at);
      const n = candidates.filter(
        (c) => c.id !== e.r.id && c.category_id === e.r.category_id && Math.abs(Date.parse(c.created_at) - t) <= SIMILAR_WINDOW_DAYS * DAY && distanceM(c as never, e.r as never) <= SIMILAR_RADIUS_M,
      ).length;
      similarCount.set(e.r.id, n);
    }
  }

  const summary = {
    total,
    mine: enriched.filter((e) => e.r.assigned_to === viewer.id).length,
    unassigned: enriched.filter((e) => !e.r.assigned_to).length,
    overdue: enriched.filter((e) => e.daysOpen >= settings.overdueDays).length,
    stale: enriched.filter((e) => e.daysIdle >= settings.staleDays).length,
    review: enriched.filter((e) => e.r.review_requested_at).length,
  };

  return {
    items: pageItems.map((e) => ({
      id: e.r.id as number,
      code: occCode(e.r.id),
      category: { id: e.r.category_id as number, name: e.r.category_name as string, icon: e.r.category_icon as string },
      categoryDetail: (e.r.category_detail as string | null) ?? null,
      scope: e.r.scope as 'cidade' | 'bairro',
      neighborhood: e.r.neighborhood_name ? { name: e.r.neighborhood_name as string, key: e.r.neighborhood_key as string } : null,
      street: (e.r.street as string | null) ?? null,
      description: String(e.r.description).slice(0, 160),
      status: e.r.status as string,
      isClosed: Boolean(e.r.is_closed),
      createdAt: e.r.created_at as string,
      updatedAt: e.r.updated_at as string,
      confirmations: Number(e.r.confirmations),
      priority: (e.r.priority as string | null) ?? null,
      priorityReason: (e.r.priority_reason as string | null) ?? null,
      assignee: e.r.assigned_to ? { id: e.r.assigned_to as number, name: e.r.assignee_name as string } : null,
      duplicateOf: (e.r.duplicate_of as number | null) ?? null,
      reviewRequested: Boolean(e.r.review_requested_at),
      pendingInfo: Number(e.r.pending_info) > 0,
      isDemo: Boolean(e.r.is_demo),
      daysOpen: e.daysOpen,
      daysIdle: e.daysIdle,
      overdue: e.daysOpen >= settings.overdueDays,
      stale: e.daysIdle >= settings.staleDays,
      score: e.score,
      scoreParts: e.parts,
      similar: similarCount.get(e.r.id) ?? 0,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    truncated: rows.length > LIMIT,
    summary,
    settings,
  };
}

// ocorrências parecidas: mesma categoria, até 200 m e registradas em até 90 dias de diferença
export async function similarOccurrences(db: Db, id: number) {
  const base = (await db('occurrences').where({ id }).first('id', 'category_id', 'latitude', 'longitude', 'created_at', 'street', 'duplicate_of')) as Row | undefined;
  if (!base) throw notFound('Ocorrência não encontrada.');
  if (base.latitude === null) return [];
  const t = Date.parse(base.created_at);
  const counts = db('confirmations').select('occurrence_id').count({ cnt: '*' }).groupBy('occurrence_id').as('cf');
  const rows = (await db('occurrences as o')
    .join('statuses as s', 's.slug', 'o.status')
    .leftJoin(counts, 'cf.occurrence_id', 'o.id')
    .where('o.category_id', base.category_id)
    .whereNotNull('o.latitude')
    .whereNot('o.id', id)
    .whereBetween('o.created_at', [new Date(t - SIMILAR_WINDOW_DAYS * DAY).toISOString(), new Date(t + SIMILAR_WINDOW_DAYS * DAY).toISOString()])
    .select('o.id', 'o.status', 'o.street', 'o.description', 'o.latitude', 'o.longitude', 'o.created_at', 'o.duplicate_of', 's.is_closed', 'o.neighborhood_name as neighborhood', db.raw('coalesce(cf.cnt, 0) as confirmations'))) as Row[];
  return rows
    .map((r) => ({ r, d: distanceM(base as never, r as never) }))
    .filter((x) => x.d <= SIMILAR_RADIUS_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map(({ r, d }) => ({
      id: r.id as number,
      code: occCode(r.id),
      status: r.status as string,
      isClosed: Boolean(r.is_closed),
      street: (r.street as string | null) ?? null,
      neighborhood: (r.neighborhood as string | null) ?? 'Cidade toda',
      description: String(r.description).slice(0, 140),
      createdAt: r.created_at as string,
      confirmations: Number(r.confirmations),
      distanceM: Math.round(d),
      duplicateOf: (r.duplicate_of as number | null) ?? null,
      // marcado como duplicata desta, ou esta marcada como duplicata dela
      linked: r.duplicate_of === id || base.duplicate_of === r.id,
    }));
}

export async function staffMembers(db: Db) {
  return ((await db('users').whereIn('role', ['staff', 'admin']).orderBy('name').select('id', 'name', 'role')) as Row[]).map((r) => ({ id: r.id as number, name: r.name as string, role: r.role as string }));
}

const assignSchema = z.object({ userId: z.coerce.number().int().positive().nullable() });

export async function assignOccurrence(db: Db, staff: SessionUser, id: number, body: unknown) {
  const parsed = assignSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Escolha um responsável.');
  const occ = await db('occurrences').where({ id }).first('id', 'assigned_to');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const to = parsed.data.userId;
  let toName: string | null = null;
  if (to) {
    const u = await db('users').where({ id: to }).whereIn('role', ['staff', 'admin']).first('id', 'name');
    if (!u) throw badRequest('O responsável precisa ser um funcionário.', { userId: 'Funcionário não encontrado.' });
    toName = u.name;
  }
  if ((occ.assigned_to ?? null) === to) throw conflict('same_assignee', to ? `Já está atribuída a ${toName}.` : 'Já está sem responsável.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    await trx('occurrences').where({ id }).update({ assigned_to: to, assigned_at: to ? now : null, updated_at: now });
    await addEvent(trx, id, staff.id, 'atribuicao', 'interna', null, { from: occ.assigned_to ?? null, to, toName }, now);
    await audit(trx, staff.id, 'ocorrencia.atribuir', 'occurrence', id, { antes: occ.assigned_to ?? null, depois: to });
  });
  if (to) {
    await notify(db, [to], {
      kind: 'equipe.atribuida',
      title: `${occCode(id)} foi atribuída a você`,
      body: `Atribuída por ${staff.name}.`,
      link: `/ocorrencias/${id}`,
      dedupeKey: `atribuida:${id}`,
    }, staff.id);
  }
}

const prioritySchema = z.object({
  priority: z.enum(['baixa', 'media', 'alta']).nullable(),
  reason: z.string().optional().transform((v) => (v ? cleanText(v) : '')),
});

// prioridade é decisão humana e sempre justificada
export async function setPriority(db: Db, staff: SessionUser, id: number, body: unknown) {
  const parsed = prioritySchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Prioridade inválida.');
  const { priority, reason } = parsed.data;
  if (priority && reason.length < 10) throw badRequest('Explique o motivo da prioridade.', { reason: 'Use pelo menos 10 caracteres, com base no que foi verificado.' });
  if (reason.length > 300) throw badRequest('Use até 300 caracteres.', { reason: 'Use até 300 caracteres.' });
  const occ = await db('occurrences').where({ id }).first('id', 'priority');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    await trx('occurrences').where({ id }).update({ priority, priority_reason: priority ? reason : null, updated_at: now });
    await addEvent(trx, id, staff.id, 'prioridade', 'interna', reason || null, { from: occ.priority ?? null, to: priority }, now);
    await audit(trx, staff.id, 'ocorrencia.prioridade', 'occurrence', id, { antes: occ.priority ?? null, depois: priority, motivo: reason || null });
  });
}

const duplicateSchema = z.object({
  of: z.coerce.number().int().positive().nullable(),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});

// marcação feita por uma pessoa da equipe; nada é apagado nem mesclado
export async function markDuplicate(db: Db, staff: SessionUser, id: number, body: unknown) {
  const parsed = duplicateSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Escolha a ocorrência original.');
  const { of, note } = parsed.data;
  const occ = await db('occurrences').where({ id }).first('id', 'duplicate_of');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  if (of === id) throw badRequest('Uma ocorrência não pode ser duplicata dela mesma.', { of: 'Escolha outra ocorrência.' });
  if (of) {
    const orig = await db('occurrences').where({ id: of }).first('id', 'duplicate_of');
    if (!orig) throw badRequest('A ocorrência original não existe.', { of: 'Ocorrência não encontrada.' });
    if (orig.duplicate_of) throw conflict('chain', `${occCode(of)} já está marcada como duplicata de ${occCode(orig.duplicate_of)}. Use a original.`);
    const children = await db('occurrences').where({ duplicate_of: id }).first('id');
    if (children) throw conflict('chain', 'Outras ocorrências apontam para esta como original. Desfaça essas marcações antes.');
  }
  if ((occ.duplicate_of ?? null) === of) throw conflict('same', 'Nada mudou.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    await trx('occurrences').where({ id }).update({ duplicate_of: of, updated_at: now });
    await addEvent(trx, id, staff.id, 'duplicata', 'interna', note, { of, before: occ.duplicate_of ?? null }, now);
    await audit(trx, staff.id, of ? 'ocorrencia.duplicata' : 'ocorrencia.duplicata_desfeita', 'occurrence', id, { de: of, antes: occ.duplicate_of ?? null });
  });
}
