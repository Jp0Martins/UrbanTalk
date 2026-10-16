import type { Knex } from 'knex';
import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { nowIso } from '../lib/dates.js';
import { badRequest, conflict, forbidden, fromZod, notFound } from '../lib/errors.js';
import { cleanText, excerpt } from '../lib/text.js';
import { isStaffRole, type SessionUser } from '../types.js';
import { confirmerIds, notify, staffIds } from './notifications.service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type Audience = 'publico' | 'autor' | 'equipe';

// eventos da linha do tempo que não cabem em status_history nem em occurrence_notes
export async function addEvent(
  db: Knex,
  occurrenceId: number,
  actorId: number | null,
  kind: string,
  visibility: 'interna' | 'publica',
  body?: string | null,
  data?: Record<string, unknown>,
  at = nowIso(),
) {
  await db('occurrence_events').insert({
    occurrence_id: occurrenceId,
    actor_id: actorId,
    kind,
    visibility,
    body: body ?? null,
    data: data ? JSON.stringify(data) : null,
    created_at: at,
  });
}

const parseData = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export interface TimelineItem {
  key: string;
  kind: string;
  at: string;
  actor: 'cidadao' | 'equipe' | 'comunidade' | 'sistema';
  actorName: string | null;
  visibility: 'publica' | 'interna' | 'autor';
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

const photoUrl = (p: string | null) => (p ? `/api/photos/${p}` : null);

// linha do tempo única: o que cada público vê é decidido aqui, no servidor
export async function buildTimeline(db: Db, occurrenceId: number, audience: Audience): Promise<TimelineItem[]> {
  const [statuses, history, notes, events, requests] = await Promise.all([
    db('statuses').select('slug', 'name') as Promise<Row[]>,
    db('status_history as h').leftJoin('users as u', 'u.id', 'h.changed_by').where('h.occurrence_id', occurrenceId).select('h.*', 'u.name as actor_name', 'u.role as actor_role') as Promise<Row[]>,
    db('occurrence_notes as n').leftJoin('users as u', 'u.id', 'n.author_id').where('n.occurrence_id', occurrenceId).select('n.*', 'u.name as actor_name') as Promise<Row[]>,
    db('occurrence_events as e').leftJoin('users as u', 'u.id', 'e.actor_id').where('e.occurrence_id', occurrenceId).select('e.*', 'u.name as actor_name', 'u.role as actor_role') as Promise<Row[]>,
    db('occurrence_info_requests as r').leftJoin('users as u', 'u.id', 'r.requested_by').where('r.occurrence_id', occurrenceId).select('r.*', 'u.name as actor_name') as Promise<Row[]>,
  ]);
  const statusName = (slug: string | null) => statuses.find((s) => s.slug === slug)?.name ?? slug ?? '';
  const staffView = audience === 'equipe';
  const name = (r: Row) => (staffView ? ((r.actor_name as string | null) ?? null) : null);
  const items: TimelineItem[] = [];

  for (const h of history) {
    const first = h.from_status === null;
    items.push({
      key: `s${h.id}`,
      kind: first ? 'registro' : 'status',
      at: h.created_at,
      actor: first ? 'cidadao' : isStaffRole(h.actor_role) ? 'equipe' : 'sistema',
      actorName: first ? null : name(h),
      visibility: 'publica',
      title: first ? 'Reclamação registrada' : `Status alterado para "${statusName(h.to_status)}"`,
      body: h.note ?? null,
      data: { from: h.from_status, to: h.to_status },
    });
  }
  for (const n of notes) {
    if (n.visibility === 'interna' && !staffView) continue;
    items.push({
      key: `n${n.id}`,
      kind: n.visibility === 'interna' ? 'nota_interna' : 'atualizacao_publica',
      at: n.created_at,
      actor: 'equipe',
      actorName: name(n),
      visibility: n.visibility,
      title: n.visibility === 'interna' ? 'Nota interna' : 'Atualização da equipe',
      body: n.body,
      data: null,
    });
  }
  for (const e of events) {
    if (e.visibility === 'interna' && !staffView) continue;
    const data = parseData(e.data);
    // avaliações de moradores: o comentário fica só para a equipe
    const isFeedback = e.kind === 'avaliacao';
    items.push({
      key: `e${e.id}`,
      kind: e.kind,
      at: e.created_at,
      actor: isFeedback ? 'comunidade' : isStaffRole(e.actor_role) ? 'equipe' : e.actor_id ? 'cidadao' : 'sistema',
      actorName: name(e),
      visibility: e.visibility,
      title: eventTitle(e.kind, data),
      body: isFeedback && !staffView ? null : (e.body ?? null),
      data: staffView ? data : publicData(e.kind, data),
    });
  }
  // pedidos de informação: só a equipe e quem registrou veem
  if (audience !== 'publico') {
    for (const r of requests) {
      items.push({
        key: `r${r.id}`,
        kind: 'pedido_info',
        at: r.created_at,
        actor: 'equipe',
        actorName: name(r),
        visibility: 'autor',
        title: r.cancelled_at ? 'Pedido de informação (cancelado)' : 'A equipe pediu mais informações',
        body: r.question,
        data: null,
      });
      if (r.answered_at) {
        items.push({
          key: `ra${r.id}`,
          kind: 'resposta_cidadao',
          at: r.answered_at,
          actor: 'cidadao',
          actorName: null,
          visibility: 'autor',
          title: 'Resposta de quem registrou',
          body: r.answer,
          data: { photoUrl: photoUrl(r.answer_photo) },
        });
      }
    }
  }
  // no mesmo instante: status primeiro, depois notas, eventos e pedidos
  const rank: Record<string, number> = { s: 0, n: 1, e: 2, r: 3 };
  return items.sort((a, b) => a.at.localeCompare(b.at) || (rank[a.key[0]] ?? 9) - (rank[b.key[0]] ?? 9) || a.key.localeCompare(b.key, undefined, { numeric: true }));
}

function eventTitle(kind: string, data: Record<string, unknown> | null) {
  switch (kind) {
    case 'atribuicao':
      return data?.['to'] ? `Atribuída a ${data['toName'] ?? 'um responsável'}` : 'Responsável removido';
    case 'prioridade':
      return data?.['to'] ? `Prioridade definida como ${PRIORITY_LABEL[data['to'] as string] ?? data['to']}` : 'Prioridade removida';
    case 'evidencia':
      return `Evidência adicionada (${EVIDENCE_LABEL[(data?.['kind'] as string) ?? 'acompanhamento'] ?? 'foto'})`;
    case 'resolucao':
      return 'Resolução informada pela equipe';
    case 'avaliacao':
      return data?.['verdict'] === 'persiste' ? 'Um morador informou que o problema continua' : 'Um morador indicou que o problema parece resolvido';
    case 'reaberta':
      return 'Reclamação reaberta para reavaliação';
    case 'duplicata':
      return data?.['of'] ? `Marcada como possível duplicata de UT-${String(data['of']).padStart(5, '0')}` : 'Marcação de duplicata removida';
    case 'endereco':
      return 'Endereço corrigido pela equipe';
    case 'pedido_cancelado':
      return 'Pedido de informação cancelado';
    default:
      return 'Atualização';
  }
}

// dados de evento seguros para o público (sem nomes nem ids de pessoas)
function publicData(kind: string, data: Record<string, unknown> | null) {
  if (!data) return null;
  if (kind === 'evidencia') return { kind: data['kind'], photos: data['photos'] };
  if (kind === 'avaliacao') return { verdict: data['verdict'] };
  if (kind === 'reaberta') return { to: data['to'] };
  return null;
}

export const PRIORITY_LABEL: Record<string, string> = { baixa: 'baixa', media: 'média', alta: 'alta' };
export const EVIDENCE_LABEL: Record<string, string> = { antes: 'antes', depois: 'depois', acompanhamento: 'acompanhamento' };

// resolução atual (a mais recente não substituída) com evidências e avaliações
export async function resolutionSummary(db: Db, occurrenceId: number, viewer: SessionUser | undefined, audience: Audience) {
  const res = (await db('occurrence_resolutions as r')
    .leftJoin('users as u', 'u.id', 'r.resolved_by')
    .where('r.occurrence_id', occurrenceId)
    .whereNull('r.superseded_at')
    .orderBy('r.id', 'desc')
    .first('r.*', 'u.name as resolver_name')) as Row | undefined;
  const previous = Number((await db('occurrence_resolutions').where({ occurrence_id: occurrenceId }).whereNotNull('superseded_at').count({ n: '*' }).first())?.n ?? 0);
  if (!res) return { current: null, previousResolutions: previous };
  const [evidence, feedback] = await Promise.all([
    db('occurrence_evidence').where({ resolution_id: res.id }).orderBy('id').select('id', 'kind', 'photo_path', 'caption', 'created_at') as Promise<Row[]>,
    db('resolution_feedback as f').join('users as u', 'u.id', 'f.user_id').where('f.resolution_id', res.id).select('f.*', 'u.name as user_name') as Promise<Row[]>,
  ]);
  const ok = feedback.filter((f) => f.verdict === 'resolvido').length;
  const persists = feedback.filter((f) => f.verdict === 'persiste').length;
  const mine = viewer ? feedback.find((f) => f.user_id === viewer.id) : undefined;
  const ev = (k: string) => evidence.filter((e) => e.kind === k).map((e) => ({ id: e.id as number, url: photoUrl(e.photo_path)!, caption: (e.caption as string | null) ?? null, createdAt: e.created_at as string }));
  return {
    previousResolutions: previous,
    current: {
      id: res.id as number,
      status: res.status as string,
      description: (res.description as string | null) ?? null,
      createdAt: res.created_at as string,
      resolvedBy: audience === 'equipe' ? ((res.resolver_name as string | null) ?? null) : null,
      evidence: { antes: ev('antes'), depois: ev('depois') },
      // três situações diferentes, nunca tratadas como equivalentes
      levels: {
        informada: true,
        comEvidencias: evidence.length > 0,
        confirmadaPelaComunidade: ok >= 2 && ok > persists,
      },
      feedback: {
        resolvido: ok,
        persiste: persists,
        mine: (mine?.verdict as 'resolvido' | 'persiste' | undefined) ?? null,
        comments: audience === 'equipe' ? feedback.filter((f) => f.comment).map((f) => ({ verdict: f.verdict as string, comment: f.comment as string, name: f.user_name as string, createdAt: f.created_at as string })) : [],
      },
      canGiveFeedback: Boolean(viewer && viewer.role === 'user' && !mine),
    },
  };
}

// pedido de informação em aberto (visível para quem registrou e para a equipe)
export async function openInfoRequest(db: Db, occurrenceId: number) {
  const r = (await db('occurrence_info_requests').where({ occurrence_id: occurrenceId }).whereNull('answered_at').whereNull('cancelled_at').orderBy('id', 'desc').first()) as Row | undefined;
  return r ? { id: r.id as number, question: r.question as string, createdAt: r.created_at as string } : null;
}

// avisa quem registrou e quem confirmou sobre uma novidade relevante
export async function notifyOccurrenceUpdate(db: Db, occurrenceId: number, actorId: number, title: string, body: string | null) {
  const occ = await db('occurrences').where({ id: occurrenceId }).first('user_id');
  if (!occ) return;
  const code = `UT-${String(occurrenceId).padStart(5, '0')}`;
  await notify(db, [occ.user_id], { kind: 'ocorrencia.atualizacao', title: `${code}: ${title}`, body, link: `/ocorrencias/${occurrenceId}`, dedupeKey: `ocorrencia:${occurrenceId}` }, actorId);
  const confirmers = (await confirmerIds(db, occurrenceId)).filter((u) => u !== occ.user_id);
  await notify(db, confirmers, { kind: 'ocorrencia.confirmada', title: `Uma reclamação que você confirmou foi atualizada (${code})`, body: title, link: `/ocorrencias/${occurrenceId}`, dedupeKey: `confirmada:${occurrenceId}` }, actorId);
}

// responsável pela ocorrência, ou toda a equipe quando ninguém foi atribuído
export async function responsibleStaff(db: Db, occurrenceId: number) {
  const occ = await db('occurrences').where({ id: occurrenceId }).first('assigned_to');
  if (occ?.assigned_to) return [occ.assigned_to as number];
  return staffIds(db);
}

const questionSchema = z.object({
  question: z
    .string({ error: 'Escreva a pergunta.' })
    .transform(cleanText)
    .pipe(z.string().min(10, 'Escreva pelo menos 10 caracteres.').max(500, 'Use até 500 caracteres.')),
});

export async function requestInfo(db: Db, staff: SessionUser, occurrenceId: number, body: unknown) {
  const parsed = questionSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const occ = await db('occurrences').where({ id: occurrenceId }).first('id', 'user_id');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  if (await openInfoRequest(db, occurrenceId)) throw conflict('pending_request', 'Já existe um pedido de informação aguardando resposta. Cancele-o antes de fazer outro.');
  const now = nowIso();
  const id = await db.transaction(async (trx) => {
    const [rid] = await trx('occurrence_info_requests').insert({ occurrence_id: occurrenceId, requested_by: staff.id, question: parsed.data.question, created_at: now });
    await trx('occurrences').where({ id: occurrenceId }).update({ updated_at: now });
    return rid as number;
  });
  const code = `UT-${String(occurrenceId).padStart(5, '0')}`;
  await notify(db, [occ.user_id], {
    kind: 'ocorrencia.pedido_info',
    title: `A equipe pediu mais informações sobre ${code}`,
    body: excerpt(parsed.data.question, 160),
    link: `/ocorrencias/${occurrenceId}#pedido`,
    dedupeKey: `pedido:${id}`,
  }, staff.id);
  return id;
}

export async function cancelInfoRequest(db: Db, staff: SessionUser, occurrenceId: number, requestId: number) {
  const r = await db('occurrence_info_requests').where({ id: requestId, occurrence_id: occurrenceId }).first('id', 'answered_at', 'cancelled_at');
  if (!r) throw notFound('Pedido não encontrado.');
  if (r.answered_at || r.cancelled_at) throw conflict('closed_request', 'Este pedido já foi respondido ou cancelado.');
  await db('occurrence_info_requests').where({ id: requestId }).update({ cancelled_at: nowIso() });
  await addEvent(db, occurrenceId, staff.id, 'pedido_cancelado', 'interna', null, { pedido: requestId });
}

const answerSchema = z.object({
  answer: z
    .string({ error: 'Escreva sua resposta.' })
    .transform(cleanText)
    .pipe(z.string().min(3, 'Escreva pelo menos 3 caracteres.').max(1000, 'Use até 1000 caracteres.')),
});

// só quem registrou responde ao pedido da equipe
export async function answerInfo(db: Db, viewer: SessionUser, occurrenceId: number, requestId: number, body: unknown, photo: string | null) {
  const parsed = answerSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const occ = await db('occurrences').where({ id: occurrenceId }).first('id', 'user_id');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  if (occ.user_id !== viewer.id) throw forbidden('Só quem registrou a reclamação pode responder a este pedido.');
  const r = await db('occurrence_info_requests').where({ id: requestId, occurrence_id: occurrenceId }).first('id', 'answered_at', 'cancelled_at', 'requested_by');
  if (!r) throw notFound('Pedido não encontrado.');
  if (r.answered_at || r.cancelled_at) throw conflict('closed_request', 'Este pedido já foi respondido ou cancelado.');
  const now = nowIso();
  // a condição na própria atualização impede duas respostas ao mesmo pedido
  const updated = await db('occurrence_info_requests').where({ id: requestId }).whereNull('answered_at').whereNull('cancelled_at').update({ answer: parsed.data.answer, answer_photo: photo, answered_at: now });
  if (updated === 0) throw conflict('closed_request', 'Este pedido já foi respondido.');
  await db('occurrences').where({ id: occurrenceId }).update({ updated_at: now });
  const people = new Set<number>(await responsibleStaff(db, occurrenceId));
  if (r.requested_by) people.add(r.requested_by);
  await notify(db, people, {
    kind: 'equipe.resposta_cidadao',
    title: `Cidadão respondeu ao pedido de informação de UT-${String(occurrenceId).padStart(5, '0')}`,
    body: excerpt(parsed.data.answer, 160),
    link: `/ocorrencias/${occurrenceId}`,
    dedupeKey: `resposta-cidadao:${occurrenceId}`,
  }, viewer.id);
}

const evidenceSchema = z.object({
  kind: z.enum(['antes', 'depois', 'acompanhamento'], { error: 'Escolha o tipo da evidência.' }),
  caption: z.string().trim().max(200, 'Use até 200 caracteres.').optional().transform((v) => v || null),
});

async function activeResolution(db: Knex, occurrenceId: number) {
  return (await db('occurrence_resolutions').where({ occurrence_id: occurrenceId }).whereNull('superseded_at').orderBy('id', 'desc').first('id')) as Row | undefined;
}

// fotos anexadas pela equipe; uma foto não é verificação independente
export async function addEvidence(db: Db, staff: SessionUser, occurrenceId: number, body: unknown, photos: string[]) {
  const parsed = evidenceSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  if (photos.length === 0) throw badRequest('Anexe pelo menos uma foto.', { photos: 'Nenhuma foto enviada.' });
  const occ = await db('occurrences').where({ id: occurrenceId }).first('id');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    const res = parsed.data.kind === 'acompanhamento' ? undefined : await activeResolution(trx, occurrenceId);
    await trx('occurrence_evidence').insert(photos.map((p) => ({ occurrence_id: occurrenceId, resolution_id: res?.id ?? null, author_id: staff.id, kind: parsed.data.kind, photo_path: p, caption: parsed.data.caption, created_at: now })));
    await addEvent(trx, occurrenceId, staff.id, 'evidencia', 'publica', parsed.data.caption, { kind: parsed.data.kind, photos: photos.map((p) => photoUrl(p)) }, now);
    await trx('occurrences').where({ id: occurrenceId }).update({ updated_at: now });
  });
  await notifyOccurrenceUpdate(db, occurrenceId, staff.id, 'A equipe anexou novas fotos de acompanhamento', parsed.data.caption);
}

export const resolveSchema = z.object({
  status: z.string({ error: 'Escolha o status de resolução.' }).trim().min(1, 'Escolha o status de resolução.').max(40),
  description: z
    .string({ error: 'Descreva o que foi feito.' })
    .transform(cleanText)
    .pipe(z.string().min(10, 'Descreva a solução com pelo menos 10 caracteres.').max(1000, 'Use até 1000 caracteres.')),
});

// resolução com descrição e, se houver, fotos de antes e depois; tudo numa transação
export async function resolveOccurrence(db: Db, staff: SessionUser, occurrenceId: number, body: unknown, photos: { antes: string[]; depois: string[] }) {
  const parsed = resolveSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const occ = await db('occurrences').where({ id: occurrenceId }).first('id', 'status');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const target = await db('statuses').where({ slug: parsed.data.status }).first('slug', 'name', 'active', 'counts_as_resolved');
  if (!target || !target.active) throw badRequest('Escolha um status ativo.', { status: 'Status inválido.' });
  if (!target.counts_as_resolved) throw badRequest(`"${target.name}" não está configurado como status de resolução.`, { status: 'Escolha um status que conta como resolvido.' });
  if (occ.status === target.slug && (await activeResolution(db, occurrenceId))) throw conflict('already_resolved', 'Esta reclamação já tem uma resolução registrada. Para corrigir, reabra antes.');
  const now = nowIso();
  await db.transaction(async (trx) => {
    if (occ.status !== target.slug) {
      await trx('occurrences').where({ id: occurrenceId }).update({ status: target.slug, updated_at: now, review_requested_at: null });
      // a descrição vai no evento de resolução, para não aparecer duas vezes
      await trx('status_history').insert({ occurrence_id: occurrenceId, from_status: occ.status, to_status: target.slug, changed_by: staff.id, note: null, created_at: now });
    }
    await trx('occurrence_resolutions').whereNull('superseded_at').where({ occurrence_id: occurrenceId }).update({ superseded_at: now });
    const [rid] = await trx('occurrence_resolutions').insert({ occurrence_id: occurrenceId, resolved_by: staff.id, status: target.slug, description: parsed.data.description, created_at: now });
    const rows = [
      ...photos.antes.map((p) => ({ kind: 'antes', photo_path: p })),
      ...photos.depois.map((p) => ({ kind: 'depois', photo_path: p })),
    ].map((r) => ({ ...r, occurrence_id: occurrenceId, resolution_id: rid, author_id: staff.id, caption: null, created_at: now }));
    if (rows.length) await trx('occurrence_evidence').insert(rows);
    await addEvent(trx, occurrenceId, staff.id, 'resolucao', 'publica', parsed.data.description, {
      status: target.slug,
      evidencias: rows.length,
      photos: rows.map((r) => photoUrl(r.photo_path)),
    }, now);
  });
  await notifyOccurrenceUpdate(db, occurrenceId, staff.id, `marcada como "${target.name}"`, `${excerpt(parsed.data.description, 120)} Diga se o problema foi mesmo resolvido.`);
}

const feedbackSchema = z.object({
  verdict: z.enum(['resolvido', 'persiste'], { error: 'Escolha uma opção.' }),
  comment: z.string().trim().max(500, 'Use até 500 caracteres.').optional().transform((v) => (v ? cleanText(v) : null)),
});

// moradores dizem se a solução informada parece ter funcionado
export async function giveFeedback(db: Db, viewer: SessionUser, occurrenceId: number, body: unknown) {
  if (viewer.role !== 'user') throw forbidden('A avaliação da solução é feita pelos moradores.');
  const parsed = feedbackSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const occ = await db('occurrences as o').join('statuses as s', 's.slug', 'o.status').where('o.id', occurrenceId).first('o.id', 's.is_closed');
  if (!occ) throw notFound('Ocorrência não encontrada.');
  const res = await activeResolution(db, occurrenceId);
  if (!res || !occ.is_closed) throw conflict('no_resolution', 'Esta reclamação não tem uma resolução informada para avaliar.');
  if (parsed.data.verdict === 'persiste' && (!parsed.data.comment || parsed.data.comment.length < 5)) {
    throw badRequest('Conte o que você viu no local.', { comment: 'Obrigatório quando o problema continua (pelo menos 5 caracteres).' });
  }
  const now = nowIso();
  try {
    await db.transaction(async (trx) => {
      await trx('resolution_feedback').insert({ resolution_id: res.id, occurrence_id: occurrenceId, user_id: viewer.id, verdict: parsed.data.verdict, comment: parsed.data.comment, created_at: now });
      await addEvent(trx, occurrenceId, viewer.id, 'avaliacao', 'publica', parsed.data.comment, { verdict: parsed.data.verdict }, now);
      // problema continua: entra na fila de reavaliação, sem reabrir sozinho
      if (parsed.data.verdict === 'persiste') await trx('occurrences').where({ id: occurrenceId }).update({ review_requested_at: now });
    });
  } catch (err) {
    if (String((err as Error).message).includes('UNIQUE')) throw conflict('already_rated', 'Você já avaliou esta resolução.');
    throw err;
  }
  if (parsed.data.verdict === 'persiste') {
    await notify(db, await responsibleStaff(db, occurrenceId), {
      kind: 'equipe.persiste',
      title: `Cidadão informou que UT-${String(occurrenceId).padStart(5, '0')} continua sem solução`,
      body: excerpt(parsed.data.comment ?? '', 160),
      link: `/ocorrencias/${occurrenceId}`,
      dedupeKey: `persiste:${occurrenceId}`,
    }, viewer.id);
  }
}
