import type { Db } from '../db/knex.js';
import { likeTerm, placeKey } from '../lib/text.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// em empate, prefere a grafia com acentos e maiúsculas ("São" em vez de "Sao")
const richness = (s: string) => (s.match(/[^\x00-\x7f]/g)?.length ?? 0) * 2 + (s.match(/\p{Lu}/gu)?.length ?? 0);
export const pickSpelling = (names: Iterable<[string, number]>) =>
  [...names].sort((a, b) => b[1] - a[1] || richness(b[0]) - richness(a[0]) || a[0].localeCompare(b[0], 'pt-BR'))[0][0];

// nomes de bairro já digitados, com a grafia mais usada para cada chave
export async function suggestPlaces(db: Db, q: string, limit = 12) {
  const key = placeKey(q.slice(0, 80));
  const counts = new Map<string, { key: string; uses: number; names: Map<string, number> }>();
  const add = (rows: Row[]) => {
    for (const r of rows) {
      const c = counts.get(r.k) ?? { key: r.k, uses: 0, names: new Map() };
      c.uses += Number(r.n);
      c.names.set(r.name, (c.names.get(r.name) ?? 0) + Number(r.n));
      counts.set(r.k, c);
    }
  };
  for (const [table, extra] of [['occurrences', null], ['proposals', 'hidden_at'], ['forums', 'hidden_at']] as const) {
    const qb = db(table).whereNotNull('neighborhood_key').select('neighborhood_key as k', 'neighborhood_name as name').count({ n: '*' }).groupBy('neighborhood_key', 'neighborhood_name');
    if (extra) qb.whereNull(extra);
    if (key) qb.where('neighborhood_key', 'like', likeTerm(key));
    add((await qb) as Row[]);
  }
  return [...counts.values()]
    // quem começa com o que foi digitado aparece primeiro, depois os mais usados
    .sort((a, b) => Number(b.key.startsWith(key)) - Number(a.key.startsWith(key)) || b.uses - a.uses || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((c) => ({ key: c.key, name: pickSpelling(c.names.entries()), uses: c.uses }));
}

// grafia mais usada de cada chave, para mostrar nomes consistentes em listas e relatórios
export async function placeNames(db: Db, keys: string[]) {
  const out = new Map<string, string>();
  if (keys.length === 0) return out;
  const rows = (await db('occurrences').whereIn('neighborhood_key', keys).select('neighborhood_key as k', 'neighborhood_name as name').count({ n: '*' }).groupBy('neighborhood_key', 'neighborhood_name')) as Row[];
  const by = new Map<string, [string, number][]>();
  for (const r of rows) by.set(r.k, [...(by.get(r.k) ?? []), [r.name as string, Number(r.n)]]);
  for (const [k, names] of by) out.set(k, pickSpelling(names));
  return out;
}
