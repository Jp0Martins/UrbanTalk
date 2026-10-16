import { placeNames } from './places.service.js';
import type { Db } from '../db/knex.js';
import { addDays, daysBetween, localDay, todayLocal } from '../lib/dates.js';
import type { Status } from '../types.js';
import { applyFilters, occCode, type Filters } from './occurrences.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export type Granularity = 'day' | 'week' | 'month';

function bucketOf(day: string, g: Granularity) {
  if (g === 'day') return day;
  if (g === 'month') return `${day.slice(0, 7)}-01`;
  // semana começando na segunda-feira
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

function nextBucket(bucket: string, g: Granularity) {
  if (g === 'day') return addDays(bucket, 1);
  if (g === 'week') return addDays(bucket, 7);
  const [y, m] = bucket.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

// todos os números saem de contagens reais sobre o mesmo conjunto filtrado
export async function computeIndicators(db: Db, filters: Filters, forced?: Granularity) {
  const scoped = () => applyFilters(db('occurrences as o'), filters);

  const totalRow = await scoped().count({ cnt: '*' }).first();
  const total = Number(totalRow?.cnt ?? 0);

  const statusRows = (await scoped().select('o.status').count({ cnt: '*' }).groupBy('o.status')) as AnyRow[];
  const statusMap = new Map(statusRows.map((r) => [r.status as Status, Number(r.cnt)]));
  // status ativos sempre aparecem; desativados só se ainda houver ocorrências neles
  const statusDefs = (await db('statuses').orderBy('sort_order').orderBy('id').select('slug', 'name', 'color', 'is_closed', 'active', 'counts_as_resolved')) as AnyRow[];
  const byStatus = statusDefs
    .filter((s) => s.active || statusMap.has(s.slug))
    .map((s) => ({ status: s.slug as Status, name: s.name as string, color: s.color as string, closed: Boolean(s.is_closed), resolved: Boolean(s.counts_as_resolved), count: statusMap.get(s.slug) ?? 0 }));
  const closed = byStatus.filter((s) => s.closed).reduce((a, s) => a + s.count, 0);

  const catRows = (await scoped().select('o.category_id').count({ cnt: '*' }).groupBy('o.category_id')) as AnyRow[];
  const catMap = new Map(catRows.map((r) => [r.category_id as number, Number(r.cnt)]));
  const categories = (await db('categories').select('id', 'slug', 'name', 'icon', 'sort_order').orderBy('sort_order')) as AnyRow[];
  const byCategory = categories
    .map((c) => ({ id: c.id as number, slug: c.slug as string, name: c.name as string, icon: c.icon as string, count: catMap.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));

  // agrupado pela chave normalizada; reclamações da cidade toda ficam numa linha própria
  const hoodRows = (await scoped()
    .select('o.neighborhood_key as key', db.raw('min(o.neighborhood_name) as name'))
    .count({ cnt: '*' })
    .groupBy('o.neighborhood_key')) as AnyRow[];
  const spelled = await placeNames(db, hoodRows.filter((r) => r.key).map((r) => r.key as string));
  const byNeighborhood = hoodRows
    .map((r) => ({ key: (r.key as string | null) ?? null, name: r.key ? (spelled.get(r.key) ?? (r.name as string)) : 'Cidade toda', count: Number(r.cnt) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));

  const confRow = await scoped().join('confirmations as cf', 'cf.occurrence_id', 'o.id').count({ cnt: '*' }).first();
  const demoRow = await scoped().where('o.is_demo', true).count({ cnt: '*' }).first();

  // série temporal no fuso de Sorocaba, com zeros nos períodos sem registros
  const dates = (await scoped().select('o.created_at')) as AnyRow[];
  const days = dates.map((d) => localDay(d.created_at as string)).sort();
  const to = filters.to ?? todayLocal();
  const from = filters.from ?? days[0] ?? addDays(to, -29);
  const span = daysBetween(from, to) + 1;
  // quem pede semana ou mês recebe; dia só em períodos curtos para o gráfico continuar legível
  const granularity: Granularity = forced && !(forced === 'day' && span > 120) ? forced : span <= 62 ? 'day' : span <= 730 ? 'week' : 'month';
  const counts = new Map<string, number>();
  for (const d of days) {
    const b = bucketOf(d, granularity);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const timeline: { start: string; count: number }[] = [];
  for (let b = bucketOf(from, granularity); b <= to; b = nextBucket(b, granularity)) {
    timeline.push({ start: b, count: counts.get(b) ?? 0 });
  }

  return {
    period: { from, to, explicit: Boolean(filters.from || filters.to) },
    total,
    resolved: byStatus.filter((s) => s.resolved).reduce((a, s) => a + s.count, 0),
    closed,
    open: total - closed,
    confirmations: Number(confRow?.cnt ?? 0),
    demoCount: Number(demoRow?.cnt ?? 0),
    byStatus,
    byCategory,
    byNeighborhood,
    granularity,
    timeline,
  };
}

export type Indicators = Awaited<ReturnType<typeof computeIndicators>>;

// ocorrências ainda abertas com mais confirmações: base para priorizar
export async function topOpen(db: Db, filters: Filters, limit = 10) {
  const counts = db('confirmations').select('occurrence_id').count({ cnt: '*' }).groupBy('occurrence_id').as('cf');
  const rows = (await applyFilters(db('occurrences as o'), filters)
    .join('statuses as s', 's.slug', 'o.status')
    .where('s.is_closed', false)
    .join('categories as c', 'c.id', 'o.category_id')
    .leftJoin(counts, 'cf.occurrence_id', 'o.id')
    .select('o.id', 'o.status', 's.name as status_name', 'o.created_at', 'o.reference', 'o.street', 'o.category_detail', 'c.name as category', 'o.neighborhood_name as neighborhood', db.raw('coalesce(cf.cnt, 0) as confirmations'))
    .orderBy([{ column: 'confirmations', order: 'desc' }, { column: 'o.created_at', order: 'asc' }])
    .limit(limit)) as AnyRow[];
  return rows.map((r) => ({
    id: r.id as number,
    code: occCode(r.id),
    status: r.status as Status,
    statusName: r.status_name as string,
    createdAt: r.created_at as string,
    reference: r.reference as string | null,
    street: r.street as string | null,
    category: r.category_detail ? `${r.category}: ${r.category_detail}` : (r.category as string),
    neighborhood: (r.neighborhood as string | null) ?? 'Cidade toda',
    confirmations: Number(r.confirmations),
  }));
}

// o que as pessoas escreveram em "Outros", agrupado sem diferenciar maiúsculas
export async function otherDetails(db: Db, filters: Filters, limit = 10) {
  const rows = (await applyFilters(db('occurrences as o'), filters)
    .join('categories as c', 'c.id', 'o.category_id')
    .where('c.requires_detail', true)
    .whereNotNull('o.category_detail')
    .select(db.raw('lower(trim(o.category_detail)) as k'), db.raw('min(o.category_detail) as label'))
    .count({ cnt: '*' })
    .groupBy('k')
    .orderBy([{ column: 'cnt', order: 'desc' }, { column: 'k', order: 'asc' }])
    .limit(limit)) as AnyRow[];
  return rows.map((r) => ({ label: r.label as string, count: Number(r.cnt) }));
}
