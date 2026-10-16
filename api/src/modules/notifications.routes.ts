import { Router } from 'express';
import type { Db } from '../db/knex.js';
import { idParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { ensureStaleNotice, listNotifications, markAllRead, markRead, unreadCount } from './notifications.service.js';
import { getPrioritySettings } from './settings.service.js';

// central de notificações: cada pessoa só vê e altera as próprias
export function notificationRoutes(db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    await ensureStaleNotice(db, req.user!, (await getPrioritySettings(db)).staleDays);
    res.json(await listNotifications(db, req.user!, req.query));
  });
  router.get('/unread-count', async (req, res) => {
    res.json({ unread: await unreadCount(db, req.user!.id) });
  });
  router.post('/:id/read', async (req, res) => {
    res.json(await markRead(db, req.user!, idParam(req.params.id, 'Notificação não encontrada.')));
  });
  router.post('/read-all', async (req, res) => {
    res.json(await markAllRead(db, req.user!));
  });
  return router;
}
