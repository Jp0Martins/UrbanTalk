import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/dates.js';
import { fromZod } from '../lib/errors.js';
import type { SessionUser } from '../types.js';

const n = (min: number, max: number) => z.coerce.number({ error: 'Informe um número.' }).int('Use números inteiros.').min(min, `Mínimo ${min}.`).max(max, `Máximo ${max}.`);

// critérios da Fila de Análise; cada ponto aparece explicado para a equipe
export const prioritySchema = z.object({
  priorityAlta: n(0, 100),
  priorityMedia: n(0, 100),
  priorityBaixa: n(0, 100),
  priorityNone: n(0, 100),
  perConfirmation: n(0, 20),
  maxConfirmations: n(0, 50),
  perDay: n(0, 10),
  maxDays: n(0, 365),
  staleBonus: n(0, 100),
  staleDays: n(1, 90),
  reviewBonus: n(0, 100),
  overdueDays: n(1, 365),
});

export type PrioritySettings = z.output<typeof prioritySchema>;

export const DEFAULT_PRIORITY: PrioritySettings = {
  priorityAlta: 40,
  priorityMedia: 20,
  priorityBaixa: 0,
  priorityNone: 10,
  perConfirmation: 3,
  // confirmações ajudam, mas têm teto para não dominar a fila
  maxConfirmations: 10,
  perDay: 1,
  maxDays: 30,
  staleBonus: 10,
  staleDays: 7,
  reviewBonus: 15,
  overdueDays: 30,
};

export async function getPrioritySettings(db: Db): Promise<PrioritySettings> {
  const row = await db('settings').where({ key: 'priority' }).first('value');
  if (!row) return { ...DEFAULT_PRIORITY };
  try {
    const parsed = prioritySchema.safeParse({ ...DEFAULT_PRIORITY, ...JSON.parse(row.value) });
    return parsed.success ? parsed.data : { ...DEFAULT_PRIORITY };
  } catch {
    return { ...DEFAULT_PRIORITY };
  }
}

export async function updatePrioritySettings(db: Db, admin: SessionUser, body: unknown) {
  const parsed = prioritySchema.safeParse(body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const before = await getPrioritySettings(db);
  await db.transaction(async (trx) => {
    await trx('settings')
      .insert({ key: 'priority', value: JSON.stringify(parsed.data), updated_by: admin.id, updated_at: nowIso() })
      .onConflict('key')
      .merge();
    await audit(trx, admin.id, 'config.priorizacao', 'settings', null, { antes: before, depois: parsed.data });
  });
  return parsed.data;
}
