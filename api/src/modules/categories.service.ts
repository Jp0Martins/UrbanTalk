import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { conflict, fromZod, notFound } from '../lib/errors.js';
import type { SessionUser } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ícones disponíveis no front para categorias
export const CATEGORY_ICONS = ['pothole', 'streetlight', 'sidewalk', 'trash', 'sign', 'bus', 'other', 'pin', 'alert', 'users', 'sparkle', 'info'] as const;

const dto = (r: Row, usage = 0) => ({
  id: r.id as number,
  slug: r.slug as string,
  name: r.name as string,
  description: r.description as string,
  icon: r.icon as string,
  requiresDetail: Boolean(r.requires_detail),
  active: Boolean(r.active),
  sortOrder: r.sort_order as number,
  usage,
});

export async function listCategoriesAdmin(db: Db) {
  const rows = (await db('categories').orderBy('sort_order').orderBy('id')) as Row[];
  const usage = (await db('occurrences').select('category_id').count({ n: '*' }).groupBy('category_id')) as Row[];
  const map = new Map(usage.map((u) => [u.category_id as number, Number(u.n)]));
  return rows.map((r) => dto(r, map.get(r.id) ?? 0));
}

const schema = z.object({
  name: z.string({ error: 'Informe o nome.' }).trim().min(3, 'Use pelo menos 3 caracteres.').max(80, 'Use até 80 caracteres.'),
  description: z.string().trim().max(200, 'Use até 200 caracteres.').default(''),
  icon: z.enum(CATEGORY_ICONS, { error: 'Escolha um ícone da lista.' }).default('other'),
  requiresDetail: z.boolean().default(false),
});

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34) || 'categoria';

export async function createCategory(db: Db, admin: SessionUser, body: unknown) {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const d = parsed.data;
  if (await db('categories').whereRaw('lower(name) = ?', [d.name.toLowerCase()]).first('id')) throw conflict('duplicate', 'Já existe uma categoria com esse nome.');
  let slug = slugify(d.name);
  for (let i = 2; await db('categories').where({ slug }).first('id'); i++) slug = `${slugify(d.name)}-${i}`;
  // novas categorias entram antes de "Outros"
  const max = await db('categories').whereNot({ slug: 'outros' }).max({ m: 'sort_order' }).first();
  const id = await db.transaction(async (trx) => {
    const [nid] = await trx('categories').insert({ slug, name: d.name, description: d.description, icon: d.icon, requires_detail: d.requiresDetail, active: true, sort_order: Number(max?.m ?? 0) + 1 });
    await audit(trx, admin.id, 'categoria.criar', 'category', nid, { nome: d.name });
    return nid as number;
  });
  return dto(await db('categories').where({ id }).first());
}

export async function updateCategory(db: Db, admin: SessionUser, id: number, body: unknown) {
  const parsed = schema.partial().extend({ active: z.boolean().optional() }).safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const cur = await db('categories').where({ id }).first();
  if (!cur) throw notFound('Categoria não encontrada.');
  const d = parsed.data;
  if (d.name && (await db('categories').whereRaw('lower(name) = ?', [d.name.toLowerCase()]).whereNot({ id }).first('id'))) throw conflict('duplicate', 'Já existe uma categoria com esse nome.');
  if (d.active === false && (await db('categories').where({ active: true }).whereNot({ id }).count({ n: '*' }).first())?.n === 0) {
    throw conflict('last_category', 'Mantenha pelo menos uma categoria ativa.');
  }
  const changes: Row = {};
  if (d.name !== undefined) changes['name'] = d.name;
  if (d.description !== undefined) changes['description'] = d.description;
  if (d.icon !== undefined) changes['icon'] = d.icon;
  if (d.requiresDetail !== undefined) changes['requires_detail'] = d.requiresDetail;
  if (d.active !== undefined) changes['active'] = d.active;
  if (Object.keys(changes).length === 0) return dto(cur);
  await db.transaction(async (trx) => {
    await trx('categories').where({ id }).update(changes);
    await audit(trx, admin.id, 'categoria.alterar', 'category', id, { antes: dto(cur), depois: changes });
  });
  return dto(await db('categories').where({ id }).first());
}
