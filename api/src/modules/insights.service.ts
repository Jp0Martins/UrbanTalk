import type { Knex } from 'knex';
import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { addDays, daysBetween, formatDateTimeBr, todayLocal } from '../lib/dates.js';
import { badRequest, fromZod } from '../lib/errors.js';
import { excerpt, likeTerm, placeKey } from '../lib/text.js';
import { pickSpelling, placeNames } from './places.service.js';
import type { SessionUser } from '../types.js';
import { publicName } from './community.service.js';
import { applyFilters, occCode, type Filters } from './occurrences.service.js';
import { distanceM } from './queue.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// abaixo disso, a concentração é mostrada com aviso e sem destacar áreas
export const MIN_HEAT_SAMPLE = 20;
// abaixo disso, tempo médio/mediano não é calculado
export const MIN_RESOLUTION_SAMPLE = 5;
const CELL_M = 500;
const DLAT = CELL_M / 111_320;
const DLNG = CELL_M / (111_320 * Math.cos((23.5 * Math.PI) / 180));

// duplicatas confirmadas pela equipe não contam duas vezes nas análises de concentração
const scoped = (db: Db, f: Filters) => applyFilters(db('occurrences as o'), f).whereNull('o.duplicate_of');

export async function heatGrid(db: Db, f: Filters) {
  const rows = (await scoped(db, f).whereNotNull('o.latitude').join('statuses as s', 's.slug', 'o.status').select('o.latitude', 'o.longitude', 's.is_closed')) as Row[];
  // reclamações da cidade toda sem ponto não entram na grade (não há onde desenhá-las)
  const noPoint = Number((await scoped(db, f).whereNull('o.latitude').count({ n: '*' }).first())?.n ?? 0);
  const cells = new Map<string, { i: number; j: number; count: number; open: number }>();
  for (const r of rows) {
    const i = Math.floor(r.latitude / DLAT);
    const j = Math.floor(r.longitude / DLNG);
    const k = `${i}:${j}`;
    const c = cells.get(k) ?? { i, j, count: 0, open: 0 };
    c.count++;
    if (!r.is_closed) c.open++;
    cells.set(k, c);
  }
  const list = [...cells.values()].map((c) => ({
    south: c.i * DLAT,
    west: c.j * DLNG,
    north: (c.i + 1) * DLAT,
    east: (c.j + 1) * DLNG,
    count: c.count,
    open: c.open,
  }));
  return {
    total: rows.length,
    withoutPoint: noPoint,
    cellMeters: CELL_M,
    minSample: MIN_HEAT_SAMPLE,
    reliable: rows.length >= MIN_HEAT_SAMPLE,
    max: list.reduce((m, c) => Math.max(m, c.count), 0),
    cells: list.sort((a, b) => b.count - a.count),
  };
}

// resumo por bairro (agrupado pela chave normalizada) com categorias recorrentes e rankings
export async function neighborhoodSummary(db: Db, f: Filters) {
  const rows = (await scoped(db, f)
    .join('statuses as s', 's.slug', 'o.status')
    .join('categories as c', 'c.id', 'o.category_id')
    .select('o.scope', 'o.neighborhood_key as k', 'o.neighborhood_name as nname', 'c.id as cid', 'c.name as cname', 'c.icon as cicon', 's.is_closed', 's.counts_as_resolved', 'o.latitude', 'o.longitude')) as Row[];
  type Hood = { key: string; names: Map<string, number>; total: number; open: number; resolved: number; lat: number; lng: number; points: number; cats: Map<number, { id: number; name: string; icon: string; count: number }> };
  const map = new Map<string, Hood>();
  const city = { total: 0, open: 0, resolved: 0 };
  for (const r of rows) {
    if (r.scope === 'cidade' || !r.k) {
      city.total++;
      if (!r.is_closed) city.open++;
      if (r.counts_as_resolved) city.resolved++;
      continue;
    }
    const h = map.get(r.k) ?? { key: r.k, names: new Map(), total: 0, open: 0, resolved: 0, lat: 0, lng: 0, points: 0, cats: new Map() };
    h.total++;
    h.names.set(r.nname, (h.names.get(r.nname) ?? 0) + 1);
    if (!r.is_closed) h.open++;
    if (r.counts_as_resolved) h.resolved++;
    if (r.latitude !== null) {
      h.lat += r.latitude;
      h.lng += r.longitude;
      h.points++;
    }
    const c = h.cats.get(r.cid) ?? { id: r.cid, name: r.cname, icon: r.cicon, count: 0 };
    c.count++;
    h.cats.set(r.cid, c);
    map.set(r.k, h);
  }
  const items = [...map.values()]
    .map((h) => {
      const cats = [...h.cats.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
      return {
        key: h.key,
        // grafia mais usada entre as pessoas que digitaram este bairro
        name: pickSpelling(h.names.entries()),
        total: h.total,
        open: h.open,
        resolved: h.resolved,
        center: h.points ? { latitude: h.lat / h.points, longitude: h.lng / h.points } : null,
        categories: cats,
        recurring: cats.filter((c) => c.count >= 3),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  // rankings só com bairros que têm amostra mínima de 3 registros
  const eligible = items.filter((i) => i.total >= 3);
  return {
    total: rows.length,
    cityWide: city,
    items,
    rankings: {
      minSample: 3,
      mostOpen: [...eligible].sort((a, b) => b.open - a.open || b.total - a.total).filter((i) => i.open > 0).slice(0, 5).map((i) => ({ key: i.key, name: i.name, value: i.open, total: i.total })),
      mostResolved: [...eligible].sort((a, b) => b.resolved - a.resolved || b.total - a.total).filter((i) => i.resolved > 0).slice(0, 5).map((i) => ({ key: i.key, name: i.name, value: i.resolved, total: i.total })),
    },
  };
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function resolutionTimes(db: Db, f: Filters) {
  const first = db('occurrence_resolutions').whereNull('superseded_at').select('occurrence_id').min({ at: 'created_at' }).groupBy('occurrence_id').as('r');
  const rows = (await applyFilters(db('occurrences as o'), f).join(first, 'r.occurrence_id', 'o.id').select('o.created_at', 'r.at')) as Row[];
  const days = rows.map((r) => (Date.parse(r.at) - Date.parse(r.created_at)) / 86_400_000).filter((d) => d >= 0);
  const enough = days.length >= MIN_RESOLUTION_SAMPLE;
  return {
    sample: days.length,
    minSample: MIN_RESOLUTION_SAMPLE,
    enough,
    meanDays: enough ? Math.round((days.reduce((a, d) => a + d, 0) / days.length) * 10) / 10 : null,
    medianDays: enough ? Math.round(median(days) * 10) / 10 : null,
  };
}

async function periodCounts(db: Db, f: Filters) {
  const q = () => applyFilters(db('occurrences as o'), f).join('statuses as s', 's.slug', 'o.status');
  const [t, r, o] = await Promise.all([
    q().count({ n: '*' }).first(),
    q().where('s.counts_as_resolved', true).count({ n: '*' }).first(),
    q().where('s.is_closed', false).count({ n: '*' }).first(),
  ]);
  return { total: Number(t?.n ?? 0), resolved: Number(r?.n ?? 0), open: Number(o?.n ?? 0) };
}

// números complementares: tempo de resolução, reaberturas, comparação de períodos e propostas
export async function extraIndicators(db: Db, f: Filters, period: { from: string; to: string }) {
  const len = daysBetween(period.from, period.to) + 1;
  const prevTo = addDays(period.from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  const [current, previous, times, reopenedRow, persistsRow] = await Promise.all([
    periodCounts(db, { ...f, from: period.from, to: period.to }),
    periodCounts(db, { ...f, from: prevFrom, to: prevTo }),
    resolutionTimes(db, { ...f, from: period.from, to: period.to }),
    applyFilters(db('occurrences as o'), { ...f, from: period.from, to: period.to }).where('o.reopened_count', '>', 0).count({ n: '*' }).first(),
    applyFilters(db('occurrences as o'), { ...f, from: period.from, to: period.to })
      .whereExists(db('resolution_feedback as rf').whereRaw('rf.occurrence_id = o.id').where('rf.verdict', 'persiste'))
      .count({ n: '*' })
      .first(),
  ]);
  const pq = db('proposals as p')
    .join('proposal_statuses as ps', 'ps.slug', 'p.status')
    .whereNull('p.hidden_at')
    .select('p.id', 'p.title', 'p.status', 'ps.name as status_name', 'p.neighborhood_name as neighborhood')
    .select(db.raw('(select count(*) from proposal_votes v where v.proposal_id = p.id) as votes'))
    .orderBy('votes', 'desc')
    .orderBy('p.created_at', 'asc')
    .limit(5);
  if (f.neighborhood) pq.where('p.neighborhood_key', placeKey(f.neighborhood));
  if (f.category) pq.where('p.category_id', f.category);
  const proposals = ((await pq) as Row[]).filter((p) => Number(p.votes) > 0);
  const delta = (a: number, b: number) => ({ current: a, previous: b, diff: a - b, pct: b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null });
  return {
    resolutionTime: times,
    reopened: Number(reopenedRow?.n ?? 0),
    reportedUnresolved: Number(persistsRow?.n ?? 0),
    comparison: {
      current: { from: period.from, to: period.to },
      previous: { from: prevFrom, to: prevTo },
      total: delta(current.total, previous.total),
      resolved: delta(current.resolved, previous.resolved),
      open: delta(current.open, previous.open),
    },
    topProposals: proposals.map((p) => ({ id: p.id as number, title: p.title as string, status: p.status as string, statusName: p.status_name as string, neighborhood: (p.neighborhood as string | null) ?? null, votes: Number(p.votes) })),
  };
}

export type ExtraIndicators = Awaited<ReturnType<typeof extraIndicators>>;

// CSV no padrão do Excel em português: ponto e vírgula, BOM e datas no fuso local
export async function occurrencesCsv(db: Db, f: Filters) {
  const counts = db('confirmations').select('occurrence_id').count({ cnt: '*' }).groupBy('occurrence_id').as('cf');
  const res = db('occurrence_resolutions').whereNull('superseded_at').select('occurrence_id').min({ at: 'created_at' }).groupBy('occurrence_id').as('r');
  const rows = (await applyFilters(db('occurrences as o'), f)
    .join('categories as c', 'c.id', 'o.category_id')
    .join('statuses as s', 's.slug', 'o.status')
    .leftJoin(counts, 'cf.occurrence_id', 'o.id')
    .leftJoin(res, 'r.occurrence_id', 'o.id')
    .orderBy('o.created_at', 'asc')
    .limit(50_000)
    .select('o.id', 'o.created_at', 'o.street', 'o.reference', 'o.category_detail', 'o.priority', 'o.reopened_count', 'o.duplicate_of', 'o.is_demo', 'c.name as category', 'o.scope', 'o.neighborhood_name as neighborhood', 'o.latitude', 'o.longitude', 's.name as status', 's.is_closed', 'r.at as resolved_at', db.raw('coalesce(cf.cnt, 0) as confirmations'))) as Row[];
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    // evita que planilhas interpretem o texto como fórmula
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Código', 'Registrada em', 'Categoria', 'Detalhe (Outros)', 'Abrangência', 'Bairro (como digitado)', 'Rua', 'Referência', 'Ponto no mapa', 'Status', 'Encerrada', 'Confirmações', 'Prioridade', 'Resolução informada em', 'Dias até a resolução', 'Reaberturas', 'Duplicata de', 'Dado de demonstração'];
  const lines = [header.map(cell).join(';')];
  for (const r of rows) {
    const days = r.resolved_at ? ((Date.parse(r.resolved_at) - Date.parse(r.created_at)) / 86_400_000).toFixed(1).replace('.', ',') : '';
    lines.push(
      [
        occCode(r.id), formatDateTimeBr(r.created_at), r.category, r.category_detail, r.scope === 'cidade' ? 'Cidade toda' : 'Bairro', r.neighborhood ?? '', r.street, r.reference, r.latitude === null ? 'não' : 'sim', r.status, r.is_closed ? 'sim' : 'não',
        Number(r.confirmations), r.priority ?? '', r.resolved_at ? formatDateTimeBr(r.resolved_at) : '', days, Number(r.reopened_count), r.duplicate_of ? occCode(r.duplicate_of) : '', r.is_demo ? 'sim' : 'não',
      ].map(cell).join(';'),
    );
  }
  return { csv: `﻿${lines.join('\r\n')}\r\n`, rows: rows.length };
}

const exploreSchema = z.object({
  lat: z.coerce.number().min(-24).max(-23).optional(),
  lng: z.coerce.number().min(-48).max(-47).optional(),
  neighborhood: z.string().trim().max(80).optional(),
});

const NEAR_RADIUS_M = 1500;

// página Explorar: só conteúdo público, sem notas internas nem dados pessoais
export async function explore(db: Db, viewer: SessionUser | undefined, query: unknown) {
  const parsed = exploreSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Localização inválida.');
  const q = parsed.data;
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const occBase = () =>
    db('occurrences as o')
      .join('categories as c', 'c.id', 'o.category_id')
      .join('statuses as s', 's.slug', 'o.status')
      .select('o.id', 'o.status', 'o.street', 'o.description', 'o.created_at', 'o.latitude', 'o.longitude', 'o.photo_path', 'o.is_demo', 'c.name as category', 'c.icon', 'o.neighborhood_name as neighborhood', 's.is_closed');
  const occDto = (r: Row, d?: number) => ({
    id: r.id as number, code: occCode(r.id), status: r.status as string, street: (r.street as string | null) ?? null, description: excerpt(r.description, 120),
    createdAt: r.created_at as string, category: r.category as string, icon: r.icon as string, neighborhood: (r.neighborhood as string | null) ?? 'Cidade toda',
    photoUrl: r.photo_path ? `/api/photos/${r.photo_path}` : null, isDemo: Boolean(r.is_demo), distanceM: d === undefined ? null : Math.round(d),
  });

  const recent = ((await occBase().orderBy('o.created_at', 'desc').limit(6)) as Row[]).map((r) => occDto(r));

  let near: ReturnType<typeof occDto>[] = [];
  let nearMode: 'local' | 'bairro' | null = null;
  if (q.lat !== undefined && q.lng !== undefined) {
    nearMode = 'local';
    const box = 0.02;
    const rows = (await occBase().where('s.is_closed', false).whereNotNull('o.latitude').whereBetween('o.latitude', [q.lat - box, q.lat + box]).whereBetween('o.longitude', [q.lng - box, q.lng + box])) as Row[];
    near = rows
      .map((r) => ({ r, d: distanceM({ latitude: q.lat!, longitude: q.lng! }, r as never) }))
      .filter((x) => x.d <= NEAR_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map((x) => occDto(x.r, x.d));
  } else if (q.neighborhood && placeKey(q.neighborhood)) {
    nearMode = 'bairro';
    near = ((await occBase().where('o.neighborhood_key', placeKey(q.neighborhood)).where('s.is_closed', false).orderBy('o.created_at', 'desc').limit(8)) as Row[]).map((r) => occDto(r));
  }

  const replies = db('discussion_comments').where({ target_type: 'topic' }).whereNull('deleted_at').whereNull('hidden_at').where('created_at', '>=', since30).select('target_id').count({ n: '*' }).groupBy('target_id').as('rc');
  const topics = ((await db('topics as t')
    .join('forums as f', 'f.id', 't.forum_id')
    .join(replies, 'rc.target_id', 't.id')
    .whereNull('t.hidden_at')
    .whereNull('f.hidden_at')
    .where({ 'f.active': true, 'f.status': 'ativo' })
    .orderBy('rc.n', 'desc')
    .orderBy('t.last_activity_at', 'desc')
    .limit(5)
    .select('t.id', 't.title', 't.last_activity_at', 't.is_institutional', 'f.name as forum', 'f.slug', 'rc.n as replies')) as Row[]).map((t) => ({
    id: t.id as number, title: t.title as string, forum: t.forum as string, forumSlug: t.slug as string, replies: Number(t.replies), lastActivityAt: t.last_activity_at as string, isInstitutional: Boolean(t.is_institutional),
  }));

  const proposals = ((await db('proposals as p')
    .join('proposal_statuses as ps', 'ps.slug', 'p.status')
    .whereNull('p.hidden_at')
    .where('ps.is_final', false)
    .select('p.id', 'p.title', 'p.status', 'p.neighborhood_name as neighborhood', db.raw('(select count(*) from proposal_votes v where v.proposal_id = p.id) as votes'))
    .orderBy('votes', 'desc')
    .orderBy('p.created_at', 'desc')
    .limit(5)) as Row[]).map((p) => ({ id: p.id as number, title: p.title as string, status: p.status as string, neighborhood: (p.neighborhood as string | null) ?? null, votes: Number(p.votes) }));

  // atividade por bairro nos últimos 30 dias: reclamações, discussões em fóruns que citam o bairro e propostas
  const act = new Map<string, { key: string; name: string; occurrences: number; topics: number; proposals: number }>();
  const bump = (key: string, name: string, k: 'occurrences' | 'topics' | 'proposals', n: number) => {
    const a = act.get(key) ?? { key, name, occurrences: 0, topics: 0, proposals: 0 };
    a[k] += n;
    act.set(key, a);
  };
  for (const r of (await db('occurrences').whereNotNull('neighborhood_key').where('created_at', '>=', since30).select('neighborhood_key as k', db.raw('min(neighborhood_name) as name')).count({ c: '*' }).groupBy('neighborhood_key')) as Row[]) bump(r.k, r.name, 'occurrences', Number(r.c));
  for (const r of (await db('topics as t').join('forums as f', 'f.id', 't.forum_id').whereNotNull('f.neighborhood_key').whereNull('t.hidden_at').where('t.created_at', '>=', since30).select('f.neighborhood_key as k', db.raw('min(f.neighborhood_name) as name')).count({ c: '*' }).groupBy('f.neighborhood_key')) as Row[]) bump(r.k, r.name, 'topics', Number(r.c));
  for (const r of (await db('proposals').whereNotNull('neighborhood_key').whereNull('hidden_at').where('created_at', '>=', since30).select('neighborhood_key as k', db.raw('min(neighborhood_name) as name')).count({ c: '*' }).groupBy('neighborhood_key')) as Row[]) bump(r.k, r.name, 'proposals', Number(r.c));
  const names = await placeNames(db, [...act.keys()]);
  const neighborhoods = [...act.values()]
    .map((a) => ({ ...a, name: names.get(a.key) ?? a.name, total: a.occurrences + a.topics + a.proposals }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 6);

  const resolutions = ((await db('occurrence_resolutions as r')
    .join('occurrences as o', 'o.id', 'r.occurrence_id')
    .join('categories as c', 'c.id', 'o.category_id')
    .whereNull('r.superseded_at')
    .orderBy('r.created_at', 'desc')
    .limit(6)
    .select('r.id', 'r.created_at', 'r.description', 'o.id as oid', 'o.street', 'c.name as category', 'c.icon', 'o.neighborhood_name as neighborhood', db.raw('(select count(*) from occurrence_evidence e where e.resolution_id = r.id) as evidences'), db.raw("(select count(*) from resolution_feedback f where f.resolution_id = r.id and f.verdict = 'resolvido') as ok"), db.raw("(select count(*) from resolution_feedback f where f.resolution_id = r.id and f.verdict = 'persiste') as nok"))) as Row[]).map((r) => ({
    occurrenceId: r.oid as number, code: occCode(r.oid), at: r.created_at as string, description: r.description ? excerpt(r.description, 140) : null, category: r.category as string, icon: r.icon as string,
    place: [r.street, r.neighborhood ?? 'Cidade toda'].filter(Boolean).join(', '), withEvidence: Number(r.evidences) > 0, communityConfirmed: Number(r.ok) >= 2 && Number(r.ok) > Number(r.nok),
  }));

  return { recent, near, nearMode, nearRadiusM: NEAR_RADIUS_M, topics, proposals, neighborhoods, resolutions, isLoggedIn: Boolean(viewer) };
}

const searchSchema = z.object({
  q: z.string({ error: 'Digite o que procura.' }).trim().min(2, 'Digite pelo menos 2 letras.').max(100, 'Use até 100 caracteres.'),
  type: z.enum(['todos', 'ocorrencias', 'propostas', 'topicos', 'foruns', 'publicacoes']).default('todos'),
  category: z.coerce.number().int().positive().optional(),
  neighborhood: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type SearchType = 'ocorrencias' | 'propostas' | 'topicos' | 'foruns' | 'publicacoes';

// busca global respeitando permissões: só conteúdo público (e o feed para quem está logado)
export async function globalSearch(db: Db, viewer: SessionUser | undefined, query: unknown) {
  const parsed = searchSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Busca inválida.');
  const s = parsed.data;
  if (s.type === 'publicacoes' && !viewer) throw badRequest('Entre na sua conta para buscar publicações da comunidade.');
  const term = likeTerm(s.q);
  const qKey = placeKey(s.q);
  const hoodKey = s.neighborhood ? placeKey(s.neighborhood) || null : null;
  const codeMatch = /^\s*ut-?0*(\d{1,7})\s*$/i.exec(s.q);
  const any = (qb: Knex.QueryBuilder, cols: string[]) =>
    qb.where((w) => {
      for (const c of cols) w.orWhereRaw(`lower(coalesce(${c}, '')) like ? escape '\\'`, [term]);
    });

  const builders: Record<SearchType, () => Knex.QueryBuilder | null> = {
    ocorrencias: () => {
      const qb = db('occurrences as o').join('categories as c', 'c.id', 'o.category_id');
      if (codeMatch) qb.where('o.id', Number(codeMatch[1]));
      else {
        qb.where((w) => {
          for (const c of ['o.description', 'o.street', 'o.reference', 'o.category_detail', 'c.name']) w.orWhereRaw(`lower(coalesce(${c}, '')) like ? escape '\\'`, [term]);
          // bairro comparado sem acento e sem diferenciar maiúsculas
          if (qKey) w.orWhereRaw(`coalesce(o.neighborhood_key, '') like ? escape '\\'`, [likeTerm(qKey)]);
        });
      }
      if (s.category) qb.where('o.category_id', s.category);
      if (hoodKey) qb.where('o.neighborhood_key', hoodKey);
      return qb;
    },
    propostas: () => {
      const qb = db('proposals as p').whereNull('p.hidden_at').where((w) => {
        for (const c of ['p.title', 'p.body']) w.orWhereRaw(`lower(coalesce(${c}, '')) like ? escape '\\'`, [term]);
        if (qKey) w.orWhereRaw(`coalesce(p.neighborhood_key, '') like ? escape '\\'`, [likeTerm(qKey)]);
      });
      if (s.category) qb.where('p.category_id', s.category);
      if (hoodKey) qb.where('p.neighborhood_key', hoodKey);
      return qb;
    },
    topicos: () => {
      const qb = any(db('topics as t').join('forums as f', 'f.id', 't.forum_id').whereNull('t.hidden_at').whereNull('f.hidden_at').where({ 'f.active': true, 'f.status': 'ativo' }), ['t.title', 't.body', 't.tags']);
      if (hoodKey) qb.where('f.neighborhood_key', hoodKey);
      if (s.category) return null;
      return qb;
    },
    foruns: () => {
      if (s.category) return null;
      const qb = db('forums as f').where({ 'f.active': true, 'f.status': 'ativo' }).whereNull('f.hidden_at').where((w) => {
        for (const c of ['f.name', 'f.description', 'f.tags']) w.orWhereRaw(`lower(coalesce(${c}, '')) like ? escape '\\'`, [term]);
        if (qKey) w.orWhereRaw(`coalesce(f.neighborhood_key, '') like ? escape '\\'`, [likeTerm(qKey)]).orWhereRaw(`f.name_key like ? escape '\\'`, [likeTerm(qKey)]);
      });
      if (hoodKey) qb.where('f.neighborhood_key', hoodKey);
      return qb;
    },
    publicacoes: () => {
      if (!viewer || s.category) return null;
      const qb = any(db('posts as p').whereNull('p.deleted_at').whereNull('p.hidden_at'), ['p.body']);
      if (hoodKey) qb.join('occurrences as o', 'o.id', 'p.occurrence_id').where('o.neighborhood_key', hoodKey);
      return qb;
    },
  };

  const fetch = async (type: SearchType, limit: number, offset: number) => {
    const qb = builders[type]();
    if (!qb) return { total: 0, items: [] as unknown[] };
    const total = Number((await qb.clone().clearSelect().count({ n: '*' }).first())?.n ?? 0);
    let items: unknown[] = [];
    if (type === 'ocorrencias') {
      items = ((await qb.select('o.id', 'o.description', 'o.street', 'o.status', 'o.created_at', 'c.name as category', 'c.icon', 'o.neighborhood_name as neighborhood').orderBy('o.created_at', 'desc').limit(limit).offset(offset)) as Row[]).map((r) => ({
        id: r.id, code: occCode(r.id), title: r.category, text: excerpt(r.description, 160), place: [r.street, r.neighborhood ?? 'Cidade toda'].filter(Boolean).join(', '), status: r.status, icon: r.icon, createdAt: r.created_at, link: `/ocorrencias/${r.id}`,
      }));
    } else if (type === 'propostas') {
      items = ((await qb.select('p.id', 'p.title', 'p.body', 'p.status', 'p.created_at', 'p.neighborhood_name as neighborhood').orderBy('p.created_at', 'desc').limit(limit).offset(offset)) as Row[]).map((r) => ({
        id: r.id, title: r.title, text: excerpt(r.body, 160), place: r.neighborhood ?? 'Cidade toda', status: r.status, createdAt: r.created_at, link: `/propostas/${r.id}`,
      }));
    } else if (type === 'topicos') {
      items = ((await qb.select('t.id', 't.title', 't.body', 't.is_institutional', 't.last_activity_at', 'f.name as forum').orderBy('t.last_activity_at', 'desc').limit(limit).offset(offset)) as Row[]).map((r) => ({
        id: r.id, title: r.title, text: excerpt(r.body, 160), place: r.forum, isInstitutional: Boolean(r.is_institutional), createdAt: r.last_activity_at, link: `/comunidade/discussoes/${r.id}`,
      }));
    } else if (type === 'foruns') {
      items = ((await qb.select('f.slug', 'f.name', 'f.description', 'f.kind', 'f.icon', 'f.neighborhood_name').orderBy('f.kind', 'desc').orderBy('f.name').limit(limit).offset(offset)) as Row[]).map((r) => ({
        id: r.slug, title: r.name, text: r.description, place: [r.kind === 'oficial' ? 'Fórum oficial' : 'Fórum da comunidade', r.neighborhood_name].filter(Boolean).join(' · '), icon: r.icon, link: `/comunidade/f/${r.slug}`,
      }));
    } else {
      items = ((await qb.join('users as u', 'u.id', 'p.author_id').select('p.id', 'p.body', 'p.created_at', 'u.name').orderBy('p.created_at', 'desc').limit(limit).offset(offset)) as Row[]).map((r) => ({
        id: r.id, title: `Publicação de ${publicName(r.name)}`, text: excerpt(r.body, 160), createdAt: r.created_at, link: '/comunidade',
      }));
    }
    return { total, items };
  };

  const types: SearchType[] = ['ocorrencias', 'propostas', 'topicos', 'foruns', 'publicacoes'];
  if (s.type === 'todos') {
    const groups: Record<string, { total: number; items: unknown[] }> = {};
    for (const t of types) groups[t] = await fetch(t, 5, 0);
    return { q: s.q, type: s.type, groups, publicOnly: !viewer };
  }
  const pageSize = 10;
  const r = await fetch(s.type, pageSize, (s.page - 1) * pageSize);
  return { q: s.q, type: s.type, page: s.page, pageSize, total: r.total, totalPages: Math.max(1, Math.ceil(r.total / pageSize)), items: r.items, publicOnly: !viewer };
}

// período padrão dos indicadores quando nenhum foi escolhido: últimos 30 dias
export const defaultPeriod = (f: Filters) => {
  const to = f.to ?? todayLocal();
  const from = f.from ?? addDays(to, -29);
  return { from, to };
};

