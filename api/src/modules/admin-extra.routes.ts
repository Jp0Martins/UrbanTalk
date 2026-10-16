import { Router } from 'express';
import type { Db } from '../db/knex.js';
import { idParam } from '../lib/http.js';
import { requireManager, requireStaff } from '../middleware/auth.js';
import { CATEGORY_ICONS, createCategory, listCategoriesAdmin, updateCategory } from './categories.service.js';
import { adminForumList, createCommunityForum, createInstitutionalTopic, getForumSettings, pendingForums, reviewForum, setForumApproval, slugById, updateCommunityForum } from './forums.service.js';
import { auditLog, communityActivity, decideReports, hiddenContent, reportQueue, setHidden, spamSignals } from './moderation.service.js';
import { getOccurrenceForStaff } from './occurrences.service.js';
import { createProposalStatus, listProposalStatuses, updateProposalStatus } from './proposals.service.js';
import { assignOccurrence, listQueue, markDuplicate, setPriority, similarOccurrences, staffMembers } from './queue.service.js';
import { DEFAULT_PRIORITY, getPrioritySettings, updatePrioritySettings } from './settings.service.js';

// fila de análise, moderação e configurações; tudo conferido no servidor
export function adminExtraRoutes(db: Db) {
  const router = Router();
  router.use(requireStaff);
  const occ = (raw: string | string[]) => idParam(raw, 'Ocorrência não encontrada.');

  // fila de análise (qualquer funcionário)
  router.get('/queue', async (req, res) => {
    res.json(await listQueue(db, req.user!, req.query as Record<string, unknown>));
  });
  router.get('/staff-members', async (_req, res) => {
    res.json({ members: await staffMembers(db) });
  });
  router.get('/occurrences/:id/similar', async (req, res) => {
    res.json({ items: await similarOccurrences(db, occ(req.params.id)) });
  });
  router.patch('/occurrences/:id/assignee', async (req, res) => {
    const id = occ(req.params.id);
    await assignOccurrence(db, req.user!, id, req.body);
    res.json(await getOccurrenceForStaff(db, id, req.user!));
  });
  router.patch('/occurrences/:id/priority', async (req, res) => {
    const id = occ(req.params.id);
    await setPriority(db, req.user!, id, req.body);
    res.json(await getOccurrenceForStaff(db, id, req.user!));
  });
  router.patch('/occurrences/:id/duplicate', async (req, res) => {
    const id = occ(req.params.id);
    await markDuplicate(db, req.user!, id, req.body);
    res.json(await getOccurrenceForStaff(db, id, req.user!));
  });

  // moderação de conteúdo (qualquer funcionário)
  router.get('/moderation/reports', async (req, res) => {
    res.json(await reportQueue(db, req.query));
  });
  router.post('/moderation/decide', async (req, res) => {
    res.json(await decideReports(db, req.user!, req.body));
  });
  router.post('/moderation/visibility', async (req, res) => {
    res.json(await setHidden(db, req.user!, req.body));
  });
  router.get('/moderation/hidden', async (_req, res) => {
    res.json({ items: await hiddenContent(db) });
  });
  router.get('/moderation/spam', async (_req, res) => {
    res.json(await spamSignals(db));
  });
  router.get('/moderation/activity', async (_req, res) => {
    res.json(await communityActivity(db));
  });

  // configurações globais: leitura para a equipe, alteração só por administradores
  router.get('/settings/priority', async (req, res) => {
    res.json({ settings: await getPrioritySettings(db), defaults: DEFAULT_PRIORITY, canManage: req.user!.role === 'admin' });
  });
  router.put('/settings/priority', requireManager, async (req, res) => {
    res.json({ settings: await updatePrioritySettings(db, req.user!, req.body) });
  });

  router.get('/audit', requireManager, async (req, res) => {
    res.json(await auditLog(db, req.query));
  });

  router.get('/categories', requireManager, async (_req, res) => {
    res.json({ categories: await listCategoriesAdmin(db), icons: CATEGORY_ICONS });
  });
  router.post('/categories', requireManager, async (req, res) => {
    res.status(201).json(await createCategory(db, req.user!, req.body));
  });
  router.patch('/categories/:id', requireManager, async (req, res) => {
    res.json(await updateCategory(db, req.user!, idParam(req.params.id, 'Categoria não encontrada.'), req.body));
  });

  router.get('/forums', requireManager, async (_req, res) => {
    res.json({ forums: await adminForumList(db) });
  });
  // fórum oficial, criado pela administração
  router.post('/forums', requireManager, async (req, res) => {
    res.status(201).json(await createCommunityForum(db, req.user!, req.body, true));
  });
  router.patch('/forums/:id', requireManager, async (req, res) => {
    const slug = await slugById(db, idParam(req.params.id, 'Fórum não encontrado.'));
    res.json(await updateCommunityForum(db, req.user!, slug, req.body));
  });
  router.post('/forums/:slug/institutional-topics', requireManager, async (req, res) => {
    res.status(201).json(await createInstitutionalTopic(db, req.user!, String(req.params.slug), req.body));
  });
  // aprovação de fóruns: qualquer funcionário revisa; ligar ou desligar a exigência é do administrador
  router.get('/forums-pending', async (_req, res) => {
    res.json({ forums: await pendingForums(db) });
  });
  router.post('/forums/:id/review', async (req, res) => {
    res.json(await reviewForum(db, req.user!, idParam(req.params.id, 'Fórum não encontrado.'), req.body));
  });
  router.get('/settings/forums', async (req, res) => {
    res.json({ ...(await getForumSettings(db)), canManage: req.user!.role === 'admin' });
  });
  router.put('/settings/forums', requireManager, async (req, res) => {
    res.json(await setForumApproval(db, req.user!, req.body));
  });

  router.get('/proposal-statuses', async (_req, res) => {
    res.json({ statuses: await listProposalStatuses(db) });
  });
  router.post('/proposal-statuses', requireManager, async (req, res) => {
    res.status(201).json(await createProposalStatus(db, req.user!, req.body));
  });
  router.patch('/proposal-statuses/:id', requireManager, async (req, res) => {
    res.json(await updateProposalStatus(db, req.user!, idParam(req.params.id, 'Fase não encontrada.'), req.body));
  });

  return router;
}
