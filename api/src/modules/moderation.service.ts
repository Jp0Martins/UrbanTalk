import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { badRequest, conflict, forbidden, fromZod, notFound } from '../lib/errors.js';
import { excerpt, normalizeForCompare } from '../lib/text.js';
import type { SessionUser } from '../types.js';
import { publicName } from './community.service.js';
import { notify, staffIds } from './notifications.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const REPORT_REASONS = {
  spam: 'Spam ou propaganda',
  ofensivo: 'Ofensivo ou desrespeitoso',
  odio: 'Discurso de ódio ou discriminação',
  dados_pessoais: 'Expõe dados pessoais',
  falso: 'Informação falsa ou enganosa',
  fora_do_tema: 'Fora do tema',
  outro: 'Outro motivo',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

// motivos padronizados usados pela equipe ao ocultar conteúdo
export const HIDE_REASONS = { ...REPORT_REASONS, removido_autor: 'Removido pelo autor', moderacao: 'Removido pela moderação' } as const;

export type ContentType = 'post' | 'post_comment' | 'proposal' | 'topic' | 'comment' | 'forum';

// tabela, coluna de autor e link de cada tipo de conteúdo moderável
const CONTENT: Record<ContentType, { table: string; label: string; text: string; link: (r: Row) => string }> = {
  post: { table: 'posts', label: 'Publicação do feed', text: 'body', link: () => '/comunidade' },
  post_comment: { table: 'post_comments', label: 'Comentário no feed', text: 'body', link: () => '/comunidade' },
  proposal: { table: 'proposals', label: 'Proposta', text: 'title', link: (r) => `/propostas/${r.id}` },
  topic: { table: 'topics', label: 'Discussão', text: 'title', link: (r) => `/comunidade/discussoes/${r.id}` },
  forum: { table: 'forums', label: 'Fórum da comunidade', text: 'name', link: (r) => `/comunidade/f/${r.slug}` },
  comment: {
    table: 'discussion_comments',
    label: 'Comentário em discussão',
    text: 'body',
    link: (r) => (r.target_type === 'topic' ? `/comunidade/discussoes/${r.target_id}#c-${r.id}` : `/propostas/${r.target_id}#c-${r.id}`),
  },
};

const typeSchema = z.enum(['post', 'post_comment', 'proposal', 'topic', 'comment', 'forum'], { error: 'Tipo de conteúdo inválido.' });

async function loadContent(db: Db, type: ContentType, id: number) {
  const c = CONTENT[type];
  const row = (await db(c.table).where({ id }).first()) as Row | undefined;
  if (!row) throw notFound('Conteúdo não encontrado.');
  return row;
}

// fóruns guardam o criador em created_by; os demais conteúdos em author_id
const authorColumn = (row: Row) => ((row.author_id ?? row.created_by) as number | null | undefined) ?? null;

const reportSchema = z.object({
  targetType: typeSchema,
  targetId: z.coerce.number().int().positive(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]], { error: 'Escolha o motivo da denúncia.' }),
  details: z.string().trim().max(300, 'Use até 300 caracteres.').optional().transform((v) => v || null),
});

// qualquer pessoa logada pode denunciar; uma denúncia por pessoa para cada conteúdo
export async function createReport(db: Db, viewer: SessionUser, body: unknown) {
  const parsed = reportSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const { targetType, targetId, reason, details } = parsed.data;
  if (reason === 'outro' && (!details || details.length < 5)) throw badRequest('Conte em poucas palavras o motivo.', { details: 'Obrigatório quando o motivo é "Outro".' });
  const row = await loadContent(db, targetType, targetId);
  if (row.hidden_at || row.deleted_at) throw notFound('Este conteúdo já foi removido.');
  if (targetType === 'topic' && row.is_institutional) throw forbidden('Conteúdos de apoio do UrbanTalk não podem ser denunciados. Use o fórum de dúvidas.');
  if (targetType === 'forum' && row.kind === 'oficial') throw forbidden('Fóruns oficiais não podem ser denunciados. Denuncie a discussão ou o comentário específico.');
  if (authorColumn(row) === viewer.id) throw forbidden('Você não pode denunciar o próprio conteúdo.');
  try {
    await db('content_reports').insert({ reporter_id: viewer.id, target_type: targetType, target_id: targetId, reason, details, status: 'aberta', created_at: nowIso() });
  } catch (err) {
    if (String((err as Error).message).includes('UNIQUE')) throw conflict('already_reported', 'Você já denunciou este conteúdo. A equipe vai analisar.');
    throw err;
  }
  await notify(db, await staffIds(db), {
    kind: 'equipe.denuncias',
    title: 'Novas denúncias aguardando revisão',
    body: `${CONTENT[targetType].label}: ${REPORT_REASONS[reason]}`,
    link: '/admin/moderacao',
    dedupeKey: 'denuncias',
  }, viewer.id);
  return { ok: true };
}

function contentPreview(type: ContentType, row: Row, author?: Row) {
  const text = String(row[CONTENT[type].text] ?? '');
  return {
    type,
    id: row.id as number,
    label: CONTENT[type].label,
    text: excerpt(text, 280),
    // para a equipe o nome completo ajuda a identificar reincidência; e-mail continua fora
    authorName: author?.name ? (author.name as string) : null,
    authorPublic: author?.name ? publicName(author.name) : null,
    authorId: authorColumn(row),
    createdAt: row.created_at as string,
    hiddenAt: (row.hidden_at as string | null) ?? (row.deleted_at as string | null) ?? null,
    hiddenReason: (row.hidden_reason as string | null) ?? (row.deleted_at ? 'removido' : null),
    link: CONTENT[type].link(row),
  };
}

const queueSchema = z.object({
  status: z.enum(['aberta', 'procedente', 'improcedente']).default('aberta'),
  page: z.coerce.number().int().min(1).default(1),
});

// fila de denúncias agrupada por conteúdo: várias pessoas denunciando o mesmo item viram uma linha
export async function reportQueue(db: Db, query: unknown) {
  const parsed = queueSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const { status, page } = parsed.data;
  const pageSize = 15;
  const groups = (await db('content_reports')
    .where({ status })
    .select('target_type', 'target_id')
    .count({ n: '*' })
    .min({ first: 'created_at' })
    .max({ last: 'created_at' })
    .groupBy('target_type', 'target_id')
    .orderBy([{ column: 'n', order: 'desc' }, { column: 'first', order: 'asc' }])
    .limit(pageSize)
    .offset((page - 1) * pageSize)) as Row[];
  const totalRow = (await db.from(db('content_reports').where({ status }).distinct('target_type', 'target_id').as('g')).count({ n: '*' }).first()) as Row | undefined;
  const items = [];
  for (const g of groups) {
    const type = g.target_type as ContentType;
    const row = (await db(CONTENT[type].table).where({ id: g.target_id }).first()) as Row | undefined;
    if (!row) continue;
    const author = authorColumn(row) ? await db('users').where({ id: authorColumn(row) }).first('name') : undefined;
    const reasons = (await db('content_reports')
      .where({ status, target_type: type, target_id: g.target_id })
      .select('reason')
      .count({ n: '*' })
      .groupBy('reason')) as Row[];
    const details = (await db('content_reports')
      .where({ status, target_type: type, target_id: g.target_id })
      .whereNotNull('details')
      .orderBy('created_at', 'desc')
      .limit(3)
      .pluck('details')) as string[];
    items.push({
      content: contentPreview(type, row, author),
      reports: Number(g.n),
      firstAt: g.first as string,
      lastAt: g.last as string,
      reasons: reasons.map((r) => ({ reason: r.reason as ReportReason, label: REPORT_REASONS[r.reason as ReportReason], count: Number(r.n) })),
      details,
    });
  }
  const total = Number(totalRow?.n ?? 0);
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), reasons: REPORT_REASONS };
}

const decisionSchema = z.object({
  targetType: typeSchema,
  targetId: z.coerce.number().int().positive(),
  decision: z.enum(['ocultar', 'manter'], { error: 'Escolha ocultar ou manter.' }),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]).optional(),
  note: z.string().trim().max(300, 'Use até 300 caracteres.').optional().transform((v) => v || null),
});

// decide todas as denúncias abertas de um conteúdo de uma vez
export async function decideReports(db: Db, staff: SessionUser, body: unknown) {
  const parsed = decisionSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const d = parsed.data;
  if (d.decision === 'ocultar' && !d.reason) throw badRequest('Escolha o motivo para ocultar.', { reason: 'Obrigatório para ocultar.' });
  const row = await loadContent(db, d.targetType, d.targetId);
  const open = await db('content_reports').where({ target_type: d.targetType, target_id: d.targetId, status: 'aberta' }).count({ n: '*' }).first();
  if (Number(open?.n ?? 0) === 0) throw conflict('no_reports', 'Não há denúncias abertas para este conteúdo.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    if (d.decision === 'ocultar' && !row.hidden_at) {
      await trx(CONTENT[d.targetType].table).where({ id: d.targetId }).update({ hidden_at: now, hidden_by: staff.id, hidden_reason: d.reason });
    }
    await trx('content_reports')
      .where({ target_type: d.targetType, target_id: d.targetId, status: 'aberta' })
      .update({ status: d.decision === 'ocultar' ? 'procedente' : 'improcedente', resolved_by: staff.id, resolved_at: now, resolution_note: d.note });
    await audit(trx, staff.id, d.decision === 'ocultar' ? 'moderacao.ocultar' : 'moderacao.manter', d.targetType, d.targetId, {
      motivo: d.reason ?? null,
      nota: d.note,
      denuncias: Number(open?.n ?? 0),
      trecho: excerpt(String(row[CONTENT[d.targetType].text] ?? ''), 120),
    });
  });
  return { ok: true };
}

const hideSchema = z.object({
  targetType: typeSchema,
  targetId: z.coerce.number().int().positive(),
  hidden: z.boolean(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]).optional(),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});

// ocultar ou restaurar diretamente (sem denúncia); o conteúdo nunca é apagado do banco
export async function setHidden(db: Db, staff: SessionUser, body: unknown) {
  const parsed = hideSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const d = parsed.data;
  if (d.hidden && !d.reason) throw badRequest('Escolha o motivo para ocultar.', { reason: 'Obrigatório para ocultar.' });
  const row = await loadContent(db, d.targetType, d.targetId);
  if (d.targetType === 'topic' && row.is_institutional && d.hidden) throw conflict('institutional', 'Conteúdo de apoio é gerenciado nas configurações de fóruns.');
  if (Boolean(row.hidden_at) === d.hidden) throw conflict('same_state', d.hidden ? 'Este conteúdo já está oculto.' : 'Este conteúdo já está visível.');
  if (!d.hidden && row.hidden_reason === 'removido_autor') throw conflict('author_removed', 'O próprio autor removeu este conteúdo; ele não pode ser restaurado pela equipe.');
  await db.transaction(async (trx) => {
    await trx(CONTENT[d.targetType].table)
      .where({ id: d.targetId })
      .update(d.hidden ? { hidden_at: nowIso(), hidden_by: staff.id, hidden_reason: d.reason } : { hidden_at: null, hidden_by: null, hidden_reason: null });
    await audit(trx, staff.id, d.hidden ? 'moderacao.ocultar' : 'moderacao.restaurar', d.targetType, d.targetId, { motivo: d.reason ?? null, nota: d.note, motivoAnterior: row.hidden_reason ?? null });
  });
  return { ok: true };
}

// conteúdo ocultado pela moderação, para revisão e eventual restauração
export async function hiddenContent(db: Db) {
  const out = [];
  for (const type of Object.keys(CONTENT) as ContentType[]) {
    const rows = (await db(`${CONTENT[type].table} as x`)
      .leftJoin('users as u', 'u.id', type === 'forum' ? 'x.created_by' : 'x.author_id')
      .leftJoin('users as m', 'm.id', 'x.hidden_by')
      .whereNotNull('x.hidden_at')
      .whereNot('x.hidden_reason', 'removido_autor')
      .orderBy('x.hidden_at', 'desc')
      .limit(30)
      .select('x.*', 'u.name as author_name', 'm.name as moderator_name')) as Row[];
    for (const r of rows) out.push({ ...contentPreview(type, r, { name: r.author_name }), moderatorName: (r.moderator_name as string | null) ?? null });
  }
  return out.sort((a, b) => String(b.hiddenAt).localeCompare(String(a.hiddenAt))).slice(0, 60);
}

// sinais de spam: o mesmo texto repetido e muitas publicações em pouco tempo
export async function spamSignals(db: Db) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const sources: { type: ContentType; rows: Row[] }[] = [];
  for (const type of ['post', 'post_comment', 'comment', 'topic', 'proposal'] as ContentType[]) {
    const t = CONTENT[type];
    const textCol = type === 'topic' || type === 'proposal' ? 'body' : 'body';
    const rows = (await db(`${t.table} as x`)
      .join('users as u', 'u.id', 'x.author_id')
      .where('x.created_at', '>=', since)
      .whereNull('x.hidden_at')
      .modify((qb) => {
        if (type === 'post' || type === 'post_comment' || type === 'comment') qb.whereNull('x.deleted_at');
      })
      .select('x.id', `x.${textCol} as text`, 'x.created_at', 'x.author_id', 'u.name as author_name', ...(type === 'comment' ? ['x.target_type', 'x.target_id'] : []))) as Row[];
    sources.push({ type, rows });
  }
  // textos iguais (ignorando acentos, pontuação e maiúsculas) com 12+ caracteres
  const byText = new Map<string, { type: ContentType; row: Row }[]>();
  for (const s of sources) {
    for (const r of s.rows) {
      const key = normalizeForCompare(String(r.text));
      if (key.length < 12) continue;
      const list = byText.get(key) ?? [];
      list.push({ type: s.type, row: r });
      byText.set(key, list);
    }
  }
  const repeated = [...byText.values()]
    .filter((l) => l.length >= 3 || new Set(l.map((x) => x.row.author_id)).size >= 2)
    .filter((l) => l.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 20)
    .map((l) => ({
      text: excerpt(String(l[0].row.text), 200),
      count: l.length,
      authors: [...new Set(l.map((x) => x.row.author_name as string))].slice(0, 5),
      items: l.slice(0, 6).map((x) => ({ type: x.type, id: x.row.id as number, label: CONTENT[x.type].label, link: CONTENT[x.type].link(x.row), createdAt: x.row.created_at as string })),
    }));
  // contas com muitas publicações na mesma hora
  const perHour = new Map<string, { name: string; userId: number; hour: string; count: number }>();
  for (const s of sources) {
    for (const r of s.rows) {
      const hour = String(r.created_at).slice(0, 13);
      const key = `${r.author_id}|${hour}`;
      const cur = perHour.get(key) ?? { name: r.author_name as string, userId: r.author_id as number, hour, count: 0 };
      cur.count++;
      perHour.set(key, cur);
    }
  }
  const bursts = [...perHour.values()].filter((b) => b.count >= 10).sort((a, b) => b.count - a.count).slice(0, 10).map((b) => ({ name: b.name, count: b.count, hourStart: `${b.hour}:00:00.000Z` }));
  return { since, repeated, bursts };
}

// atividade da comunidade em números reais, últimos 7 e 30 dias
export async function communityActivity(db: Db) {
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const count = async (table: string, days: number, extra?: (qb: ReturnType<Db>) => void) => {
    const qb = db(table).where('created_at', '>=', ago(days));
    extra?.(qb);
    return Number((await qb.count({ n: '*' }).first())?.n ?? 0);
  };
  const people = async (days: number) => {
    const ids = new Set<number>();
    for (const t of ['posts', 'post_comments', 'discussion_comments', 'proposals']) {
      for (const r of (await db(t).where('created_at', '>=', ago(days)).distinct('author_id')) as Row[]) ids.add(r.author_id as number);
    }
    for (const r of (await db('topics').where('created_at', '>=', ago(days)).whereNotNull('author_id').distinct('author_id')) as Row[]) ids.add(r.author_id as number);
    for (const r of (await db('proposal_votes').where('created_at', '>=', ago(days)).distinct('user_id')) as Row[]) ids.add(r.user_id as number);
    return ids.size;
  };
  const block = async (days: number) => ({
    days,
    posts: await count('posts', days),
    topics: await count('topics', days, (qb) => qb.where({ is_institutional: false })),
    comments: (await count('post_comments', days)) + (await count('discussion_comments', days)),
    proposals: await count('proposals', days),
    votes: await count('proposal_votes', days),
    reports: await count('content_reports', days),
    activePeople: await people(days),
  });
  const openReports = Number((await db('content_reports').where({ status: 'aberta' }).count({ n: '*' }).first())?.n ?? 0);
  return { week: await block(7), month: await block(30), openReports };
}

const auditSchema = z.object({
  action: z.string().trim().regex(/^[a-z_.]{0,40}$/, 'Ação inválida.').optional(),
  page: z.coerce.number().int().min(1).default(1),
});

// histórico de ações administrativas, só para administradores
export async function auditLog(db: Db, query: unknown) {
  const parsed = auditSchema.safeParse(query ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Filtro inválido.');
  const { action, page } = parsed.data;
  const pageSize = 30;
  const base = () => {
    const qb = db('audit_log as a');
    if (action) qb.where('a.action', 'like', `${action}%`);
    return qb;
  };
  const total = Number((await base().count({ n: '*' }).first())?.n ?? 0);
  const rows = (await base()
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .orderBy('a.id', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .select('a.id', 'a.action', 'a.target_type', 'a.target_id', 'a.details', 'a.created_at', 'u.name as actor_name', 'u.role as actor_role')) as Row[];
  const actions = ((await db('audit_log').distinct('action').orderBy('action')) as Row[]).map((r) => r.action as string);
  return {
    items: rows.map((r) => {
      let details: unknown = null;
      try {
        details = r.details ? JSON.parse(r.details) : null;
      } catch {
        details = r.details;
      }
      return { id: r.id as number, action: r.action as string, targetType: r.target_type as string, targetId: (r.target_id as number | null) ?? null, details, createdAt: r.created_at as string, actorName: (r.actor_name as string | null) ?? 'Sistema', actorRole: (r.actor_role as string | null) ?? null };
    }),
    actions,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
