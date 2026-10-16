import type { Knex } from 'knex';
import { nowIso } from './dates.js';

// grava uma ação administrativa; details vira JSON
export async function audit(
  db: Knex,
  actorId: number | null,
  action: string,
  targetType: string,
  targetId: number | null,
  details?: Record<string, unknown>,
) {
  await db('audit_log').insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details ? JSON.stringify(details) : null,
    created_at: nowIso(),
  });
}
