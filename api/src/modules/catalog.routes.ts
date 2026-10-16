import { Router } from 'express';
import type { Db } from '../db/knex.js';
import { listStatuses } from './statuses.service.js';
import { suggestPlaces } from './places.service.js';

export function catalogRoutes(db: Db) {
  const router = Router();

  router.get('/categories', async (_req, res) => {
    const rows = await db('categories')
      .select('id', 'slug', 'name', 'description', 'icon', 'requires_detail')
      .where({ active: true })
      .orderBy('sort_order');
    res.json({
      categories: rows.map(({ requires_detail, ...c }) => ({ ...c, requiresDetail: Boolean(requires_detail) })),
    });
  });

  // sugestões de bairro: só nomes já usados em reclamações, propostas ou fóruns. não é uma lista fechada
  router.get('/neighborhoods', async (req, res) => {
    res.json({ neighborhoods: await suggestPlaces(db, String(req.query['q'] ?? ''), 12) });
  });

  // lista completa, inclusive desativados: o histórico antigo precisa dos nomes
  router.get('/statuses', async (_req, res) => {
    res.json({ statuses: await listStatuses(db) });
  });

  return router;
}
