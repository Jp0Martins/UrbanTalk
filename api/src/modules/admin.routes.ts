import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/knex.js';
import { audit } from '../lib/audit.js';
import { daysBetween, todayLocal } from '../lib/dates.js';
import { badRequest, conflict, fromZod, notFound } from '../lib/errors.js';
import { requireManager, requireStaff } from '../middleware/auth.js';
import { ROLES, type Role } from '../types.js';
import { computeIndicators, otherDetails, topOpen } from './indicators.service.js';
import {
  addNote,
  addressSchema,
  changeStatus,
  deleteOccurrence,
  getOccurrenceForStaff,
  listOccurrences,
  noteSchema,
  parseFilters,
  parsePaging,
  staffOverview,
  statusSchema,
  updateAddress,
} from './occurrences.service.js';
import { buildReportPdf } from './report.pdf.js';
import { defaultPeriod, extraIndicators, occurrencesCsv } from './insights.service.js';
import { fieldFiles, filesOf, photoFields, photoUpload } from '../lib/http.js';
import { removePhoto, storePhoto } from '../lib/photos.js';
import { addEvidence, cancelInfoRequest, requestInfo, resolveOccurrence } from './tracking.service.js';
import { createStatus, deleteStatus, listStatuses, reorderStatuses, statusUsage, updateStatus } from './statuses.service.js';

const parseId = (raw: string | string[], what = 'Ocorrência não encontrada.') => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id < 1) throw notFound(what);
  return id;
};

// área dos funcionários; toda rota aqui exige papel staff ou admin, conferido no banco
export function adminRoutes(db: Db, uploadDir: string) {
  const router = Router();
  router.use(requireStaff);

  router.get('/overview', async (_req, res) => {
    res.json(await staffOverview(db));
  });

  const granularityOf = (raw: unknown) => (raw === 'semana' ? 'week' : raw === 'mes' ? 'month' : raw === 'dia' ? 'day' : undefined);

  router.get('/indicators', async (req, res) => {
    const filters = parseFilters(req.query);
    const ind = await computeIndicators(db, filters, granularityOf(req.query['granularity']));
    res.json({ ...ind, extra: await extraIndicators(db, filters, ind.period) });
  });

  router.get('/reports/occurrences.csv', async (req, res) => {
    const filters = parseFilters(req.query);
    const { from, to } = defaultPeriod(filters);
    const { csv } = await occurrencesCsv(db, { ...filters, from, to });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="urbantalk-ocorrencias-${from}-a-${to}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  });

  // mesma tabela de ocorrências do cidadão, com filtro por rua
  router.get('/occurrences', async (req, res) => {
    res.json(await listOccurrences(db, parseFilters(req.query), parsePaging(req.query), req.user));
  });

  router.get('/occurrences/:id', async (req, res) => {
    res.json(await getOccurrenceForStaff(db, parseId(req.params.id), req.user!));
  });

  // só administradores excluem reclamações; as fotos saem do disco depois do commit
  router.delete('/occurrences/:id', requireManager, async (req, res) => {
    const { photos } = await deleteOccurrence(db, req.user!, parseId(req.params.id));
    for (const p of photos) await removePhoto(uploadDir, p);
    res.status(204).end();
  });

  router.patch('/occurrences/:id/status', async (req, res) => {
    const id = parseId(req.params.id);
    const parsed = statusSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    await changeStatus(db, req.user!, id, parsed.data);
    res.json(await getOccurrenceForStaff(db, id, req.user!));
  });

  router.post('/occurrences/:id/notes', async (req, res) => {
    const id = parseId(req.params.id);
    const parsed = noteSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    await addNote(db, req.user!, id, parsed.data);
    res.status(201).json(await getOccurrenceForStaff(db, id, req.user!));
  });

  router.patch('/occurrences/:id/address', async (req, res) => {
    const id = parseId(req.params.id);
    const parsed = addressSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    await updateAddress(db, req.user!, id, parsed.data);
    res.json(await getOccurrenceForStaff(db, id, req.user!));
  });

  router.post('/occurrences/:id/info-requests', async (req, res) => {
    const id = parseId(req.params.id);
    await requestInfo(db, req.user!, id, req.body);
    res.status(201).json(await getOccurrenceForStaff(db, id, req.user!));
  });
  router.delete('/occurrences/:id/info-requests/:rid', async (req, res) => {
    const id = parseId(req.params.id);
    await cancelInfoRequest(db, req.user!, id, parseId(req.params.rid, 'Pedido não encontrado.'));
    res.json(await getOccurrenceForStaff(db, id, req.user!));
  });

  // fotos são gravadas antes da transação; se algo falhar, são apagadas
  const storeAll = async (files: Express.Multer.File[], stored: string[]) => {
    for (const f of files) stored.push(await storePhoto(uploadDir, f.buffer));
  };
  router.post('/occurrences/:id/evidence', photoUpload('photos', 3), async (req, res) => {
    const id = parseId(req.params.id);
    const stored: string[] = [];
    try {
      await storeAll(filesOf(req), stored);
      await addEvidence(db, req.user!, id, req.body, stored);
    } catch (err) {
      for (const p of stored) await removePhoto(uploadDir, p);
      throw err;
    }
    res.status(201).json(await getOccurrenceForStaff(db, id, req.user!));
  });
  router.post('/occurrences/:id/resolution', photoFields([{ name: 'antes', maxCount: 3 }, { name: 'depois', maxCount: 3 }]), async (req, res) => {
    const id = parseId(req.params.id);
    const antes: string[] = [];
    const depois: string[] = [];
    try {
      await storeAll(fieldFiles(req, 'antes'), antes);
      await storeAll(fieldFiles(req, 'depois'), depois);
      await resolveOccurrence(db, req.user!, id, req.body, { antes, depois });
    } catch (err) {
      for (const p of [...antes, ...depois]) await removePhoto(uploadDir, p);
      throw err;
    }
    res.status(201).json(await getOccurrenceForStaff(db, id, req.user!));
  });

  // status: leitura para toda a equipe, alterações só para administradores
  router.get('/statuses', async (_req, res) => {
    const [items, usage] = await Promise.all([listStatuses(db), statusUsage(db)]);
    res.json({
      statuses: items.map((s) => ({ ...s, usage: usage.get(s.slug) ?? { occurrences: 0, history: 0 } })),
      canManage: _req.user!.role === 'admin',
    });
  });
  router.post('/statuses', requireManager, async (req, res) => {
    res.status(201).json(await createStatus(db, req.user!, req.body));
  });
  router.put('/statuses/order', requireManager, async (req, res) => {
    res.json({ statuses: await reorderStatuses(db, req.user!, req.body) });
  });
  router.patch('/statuses/:id', requireManager, async (req, res) => {
    res.json(await updateStatus(db, req.user!, parseId(req.params.id, 'Status não encontrado.'), req.body));
  });
  router.delete('/statuses/:id', requireManager, async (req, res) => {
    await deleteStatus(db, req.user!, parseId(req.params.id, 'Status não encontrado.'));
    res.status(204).end();
  });

  // equipe: promover contas existentes, nunca criar senha padrão
  const teamSchema = z.object({
    email: z.string({ error: 'Informe o e-mail.' }).trim().toLowerCase().pipe(z.email({ error: 'Informe um e-mail válido.' })),
    role: z.enum(['staff', 'admin'], { error: 'Escolha o tipo de acesso.' }),
  });
  const roleSchema = z.object({ role: z.enum(ROLES as [Role, ...Role[]], { error: 'Papel inválido.' }) });

  router.get('/team', requireManager, async (_req, res) => {
    const rows = await db('users').whereIn('role', ['staff', 'admin']).orderBy('name').select('id', 'name', 'email', 'role', 'created_at as createdAt');
    res.json({ members: rows });
  });

  router.post('/team', requireManager, async (req, res) => {
    const parsed = teamSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    const user = await db('users').where({ email: parsed.data.email }).first('id', 'role', 'name');
    if (!user) {
      throw badRequest('Não existe conta com esse e-mail. Peça para a pessoa criar a conta pelo site e depois conceda o acesso.', {
        email: 'Conta não encontrada.',
      });
    }
    if (user.role === parsed.data.role) throw conflict('same_role', `${user.name} já tem esse acesso.`);
    await db.transaction(async (trx) => {
      await trx('users').where({ id: user.id }).update({ role: parsed.data.role });
      await audit(trx, req.user!.id, 'equipe.conceder', 'user', user.id, { antes: user.role, depois: parsed.data.role });
    });
    res.status(201).json({ id: user.id, role: parsed.data.role });
  });

  router.patch('/team/:id', requireManager, async (req, res) => {
    const id = parseId(req.params.id, 'Conta não encontrada.');
    const parsed = roleSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    if (id === req.user!.id) throw conflict('self_role', 'Você não pode mudar o próprio acesso. Peça a outro administrador.');
    const user = await db('users').where({ id }).first('id', 'role');
    if (!user) throw notFound('Conta não encontrada.');
    await db.transaction(async (trx) => {
      await trx('users').where({ id }).update({ role: parsed.data.role });
      await audit(trx, req.user!.id, 'equipe.alterar', 'user', id, { antes: user.role, depois: parsed.data.role });
    });
    res.json({ id, role: parsed.data.role });
  });

  router.get('/reports/occurrences.pdf', async (req, res) => {
    const filters = parseFilters(req.query);
    if (!filters.from || !filters.to) {
      throw badRequest('Escolha a data inicial e a data final do relatório.', {
        ...(filters.from ? {} : { from: 'Informe a data inicial.' }),
        ...(filters.to ? {} : { to: 'Informe a data final.' }),
      });
    }
    if (filters.to > todayLocal()) throw badRequest('A data final não pode estar no futuro.', { to: 'Data no futuro.' });
    if (daysBetween(filters.from, filters.to) > 366 * 3) throw badRequest('O relatório cobre no máximo 3 anos.', { from: 'Período longo demais.' });

    const [ind, priorities, others, , cat, st, extra] = await Promise.all([
      computeIndicators(db, filters, granularityOf(req.query['granularity'])),
      topOpen(db, filters),
      otherDetails(db, filters),
      null,
      filters.category ? db('categories').where({ id: filters.category }).first('name') : null,
      filters.status ? db('statuses').where({ slug: filters.status }).first('name') : null,
      extraIndicators(db, filters, { from: filters.from, to: filters.to }),
    ]);
    if (filters.category && !cat) throw badRequest('Categoria inexistente.', { category: 'Categoria inexistente.' });
    if (filters.status && !st) throw badRequest('Status inexistente.', { status: 'Status inexistente.' });

    const pdf = await buildReportPdf(
      ind,
      {
        // o nome é mostrado como foi digitado no filtro
        neighborhood: filters.neighborhood ?? null,
        scope: filters.scope ?? null,
        category: cat?.name ?? null,
        status: st?.name ?? null,
        situation: filters.situation ?? null,
        street: filters.street ?? null,
        q: filters.q ?? null,
      },
      priorities,
      others,
      extra,
    );
    const fileName = `urbantalk-relatorio-${filters.from}-a-${filters.to}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  });

  return router;
}
