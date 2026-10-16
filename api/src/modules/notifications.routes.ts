import { Router } from 'express';
import type { Db } from '../db/knex.js';
import { idParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { onUserChange } from '../lib/realtime.js';
import { ensureStaleNotice, listNotifications, liveSnapshot, markAllRead, markRead, unreadCount } from './notifications.service.js';
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
  // canal em tempo real (Server-Sent Events): manda contador e último aviso sempre que algo muda para esta pessoa
  router.get('/stream', (req, res) => {
    const userId = req.user!.id;
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 5000\n\n');

    let closed = false;
    let timer: NodeJS.Timeout | null = null;
    const send = async () => {
      try {
        const snap = await liveSnapshot(db, userId);
        if (!closed) res.write(`event: notificacoes\ndata: ${JSON.stringify(snap)}\n\n`);
      } catch {
        // banco ocupado ou conexão encerrada: o próximo evento ou a reconexão corrige
      }
    };
    // várias mudanças seguidas viram um envio só
    const schedule = () => {
      if (timer || closed) return;
      timer = setTimeout(() => {
        timer = null;
        void send();
      }, 150);
    };
    const off = onUserChange(userId, schedule);
    // comentário periódico para proxies não derrubarem a conexão parada
    const ping = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, 25_000);
    void send();
    req.on('close', () => {
      closed = true;
      off();
      clearInterval(ping);
      if (timer) clearTimeout(timer);
    });
  });

  router.post('/:id/read', async (req, res) => {
    res.json(await markRead(db, req.user!, idParam(req.params.id, 'Notificação não encontrada.')));
  });
  router.post('/read-all', async (req, res) => {
    res.json(await markAllRead(db, req.user!));
  });
  return router;
}
