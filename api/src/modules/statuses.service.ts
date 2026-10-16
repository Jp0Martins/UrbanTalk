import type { Knex } from 'knex';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { badRequest, conflict, fromZod, notFound } from '../lib/errors.js';
import { STATUS_COLORS, type SessionUser } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export interface StatusDto {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  isClosed: boolean;
  countsAsResolved: boolean;
  isInitial: boolean;
  active: boolean;
  sortOrder: number;
}

export const toStatusDto = (r: AnyRow): StatusDto => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  color: r.color,
  isClosed: Boolean(r.is_closed),
  countsAsResolved: Boolean(r.counts_as_resolved),
  isInitial: Boolean(r.is_initial),
  active: Boolean(r.active),
  sortOrder: r.sort_order,
});

export async function listStatuses(db: Knex) {
  const rows = (await db('statuses').orderBy('sort_order').orderBy('id')) as AnyRow[];
  return rows.map(toStatusDto);
}

// status em uso por ocorrências ou presentes no histórico
export async function statusUsage(db: Knex) {
  const occ = (await db('occurrences').select('status').count({ c: '*' }).groupBy('status')) as AnyRow[];
  const hist = (await db('status_history').select('to_status as status').count({ c: '*' }).groupBy('to_status')) as AnyRow[];
  const out = new Map<string, { occurrences: number; history: number }>();
  for (const r of occ) out.set(r.status, { occurrences: Number(r.c), history: 0 });
  for (const r of hist) {
    const cur = out.get(r.status) ?? { occurrences: 0, history: 0 };
    cur.history = Number(r.c);
    out.set(r.status, cur);
  }
  return out;
}

export async function initialStatus(db: Knex) {
  const row = await db('statuses').where({ is_initial: true, active: true }).first('slug');
  return (row?.slug as string | undefined) ?? 'registrada';
}

// slug gerado do nome, sem acentos; garante que não repete
export async function makeSlug(db: Knex, name: string) {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34) || 'status';
  let slug = base;
  for (let i = 2; await db('statuses').where({ slug }).first('id'); i++) slug = `${base}-${i}`;
  return slug;
}

const nameField = z
  .string({ error: 'Dê um nome ao status.' })
  .trim()
  .min(3, 'O nome precisa ter pelo menos 3 letras.')
  .max(40, 'O nome pode ter até 40 caracteres.');
const descField = z.string().trim().max(240, 'A descrição pode ter até 240 caracteres.');
const colorField = z.enum(STATUS_COLORS, { error: 'Escolha uma das cores disponíveis.' });

const createSchema = z.object({
  name: nameField,
  description: descField.default(''),
  color: colorField.default('cinza'),
  isClosed: z.boolean().default(false),
  countsAsResolved: z.boolean().default(false),
}).refine((v) => !v.countsAsResolved || v.isClosed, { message: 'Só status de encerramento podem contar como resolvidos.', path: ['countsAsResolved'] });

const updateSchema = z
  .object({
    name: nameField.optional(),
    description: descField.optional(),
    color: colorField.optional(),
    isClosed: z.boolean().optional(),
    countsAsResolved: z.boolean().optional(),
    active: z.boolean().optional(),
    isInitial: z.literal(true, { error: 'Para trocar o status inicial, marque outro status como inicial.' }).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para alterar.' });

async function ensureUniqueName(db: Knex, name: string, exceptId?: number) {
  const q = db('statuses').whereRaw('lower(name) = ?', [name.toLowerCase()]);
  if (exceptId) q.whereNot('id', exceptId);
  if (await q.first('id')) throw badRequest('Já existe um status com esse nome.', { name: 'Já existe um status com esse nome.' });
}

export async function createStatus(db: Knex, actor: SessionUser, body: unknown) {
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const v = parsed.data;
  await ensureUniqueName(db, v.name);
  const slug = await makeSlug(db, v.name);
  const last = await db('statuses').max({ m: 'sort_order' }).first();
  const ts = nowIso();
  const [id] = await db('statuses').insert({
    slug,
    name: v.name,
    description: v.description,
    color: v.color,
    is_closed: v.isClosed,
    counts_as_resolved: v.countsAsResolved,
    is_initial: false,
    active: true,
    sort_order: Number(last?.m ?? 0) + 10,
    created_at: ts,
    updated_at: ts,
  });
  await audit(db, actor.id, 'status.criar', 'status', id, { slug, name: v.name });
  return toStatusDto(await db('statuses').where({ id }).first());
}

export async function updateStatus(db: Knex, actor: SessionUser, id: number, body: unknown) {
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const v = parsed.data;
  const cur = await db('statuses').where({ id }).first();
  if (!cur) throw notFound('Status não encontrado.');
  if (v.name) await ensureUniqueName(db, v.name, id);

  const willBeActive = v.active ?? Boolean(cur.active);
  if (cur.is_initial && v.active === false) {
    throw conflict('initial_status', 'Este é o status inicial das novas reclamações. Escolha outro status inicial antes de desativá-lo.');
  }
  if (v.isInitial && !willBeActive) throw conflict('inactive_initial', 'Um status desativado não pode ser o inicial.');
  if (v.isInitial && (v.isClosed ?? cur.is_closed)) {
    throw conflict('closed_initial', 'Um status de encerramento não pode ser o inicial.');
  }
  // "conta como resolvido" só faz sentido em status de encerramento
  if ((v.countsAsResolved ?? Boolean(cur.counts_as_resolved)) && !(v.isClosed ?? Boolean(cur.is_closed))) {
    throw badRequest('Só status de encerramento podem contar como resolvidos.', { countsAsResolved: 'Marque também como encerramento.' });
  }
  if (cur.is_initial && v.isClosed === true) {
    throw conflict('closed_initial', 'O status inicial não pode ser de encerramento.');
  }

  await db.transaction(async (trx) => {
    if (v.isInitial) await trx('statuses').where({ is_initial: true }).update({ is_initial: false });
    await trx('statuses')
      .where({ id })
      .update({
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.description !== undefined ? { description: v.description } : {}),
        ...(v.color !== undefined ? { color: v.color } : {}),
        ...(v.isClosed !== undefined ? { is_closed: v.isClosed } : {}),
        ...(v.countsAsResolved !== undefined ? { counts_as_resolved: v.countsAsResolved } : {}),
        ...(v.active !== undefined ? { active: v.active } : {}),
        ...(v.isInitial ? { is_initial: true } : {}),
        updated_at: nowIso(),
      });
    await audit(trx, actor.id, 'status.editar', 'status', id, { slug: cur.slug, ...v });
  });
  return toStatusDto(await db('statuses').where({ id }).first());
}

// excluir só é permitido para status nunca usados; os demais devem ser desativados
export async function deleteStatus(db: Knex, actor: SessionUser, id: number) {
  const cur = await db('statuses').where({ id }).first();
  if (!cur) throw notFound('Status não encontrado.');
  if (cur.is_initial) throw conflict('initial_status', 'O status inicial não pode ser excluído.');
  const usage = (await statusUsage(db)).get(cur.slug);
  if (usage && (usage.occurrences > 0 || usage.history > 0)) {
    throw conflict(
      'status_in_use',
      `"${cur.name}" já foi usado em ${usage.occurrences + usage.history} registros e não pode ser excluído sem apagar o histórico. Desative-o: ele deixa de aparecer para novas alterações e continua legível no histórico.`,
    );
  }
  await db('statuses').where({ id }).delete();
  await audit(db, actor.id, 'status.excluir', 'status', id, { slug: cur.slug, name: cur.name });
}

const orderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) });

export async function reorderStatuses(db: Knex, actor: SessionUser, body: unknown) {
  const parsed = orderSchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error, 'Ordem inválida.');
  const all = (await db('statuses').select('id')) as AnyRow[];
  const ids = parsed.data.ids;
  if (ids.length !== all.length || new Set(ids).size !== ids.length || !all.every((r) => ids.includes(r.id))) {
    throw badRequest('Envie todos os status, cada um uma vez.');
  }
  await db.transaction(async (trx) => {
    for (let i = 0; i < ids.length; i++) await trx('statuses').where({ id: ids[i] }).update({ sort_order: (i + 1) * 10 });
    await audit(trx, actor.id, 'status.ordenar', 'status', null, { ids });
  });
  return listStatuses(db);
}
