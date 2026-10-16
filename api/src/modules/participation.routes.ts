import { Router } from 'express';
import type { Db } from '../db/knex.js';
import { filesOf, idParam, photoUpload, userLimiter } from '../lib/http.js';
import { removePhoto, storePhoto } from '../lib/photos.js';
import { requireAuth, requireCitizen, requireStaff } from '../middleware/auth.js';
import { createReport } from './moderation.service.js';
import { createComment, deleteComment, listComments, setCommentVote, setFollow, type Target } from './discussions.service.js';
import {
  communityExplore,
  createCommunityForum,
  createTopic,
  deleteTopic,
  getForum,
  getTopic,
  listForums,
  listTopics,
  myParticipation,
  myPlaces,
  setForumFollow,
  setInterests,
  setTopicFlags,
  setTopicVote,
  updateCommunityForum,
} from './forums.service.js';
import {
  MAX_PROPOSAL_IMAGES,
  changeProposalStatus,
  createProposal,
  deleteOwnProposal,
  getProposal,
  linkOccurrence,
  listProposalStatuses,
  listProposals,
  setVote,
} from './proposals.service.js';

// fóruns, grupos de bairro, discussões e propostas; leitura pública, participação com conta
export function participationRoutes(db: Db, uploadDir: string) {
  const router = Router();
  const topicLimiter = userLimiter(10, 5, 'Você abriu muitas discussões em pouco tempo. Tente de novo em alguns minutos.');
  const commentLimiter = userLimiter(10, 30, 'Muitos comentários em pouco tempo. Tente de novo em alguns minutos.');
  const proposalLimiter = userLimiter(60, 5, 'Você publicou muitas propostas na última hora. Tente mais tarde.');
  const voteLimiter = userLimiter(10, 120, 'Muitas ações de voto em pouco tempo. Tente de novo em alguns minutos.');

  const forumLimiter = userLimiter(60, 6, 'Muitas tentativas de criar fórum em pouco tempo. Tente mais tarde.');

  // fóruns: oficiais e criados pela comunidade; leitura pública
  router.get('/forums', async (req, res) => {
    res.json(await listForums(db, req.user, req.query));
  });
  router.post('/forums', requireAuth, forumLimiter, async (req, res) => {
    res.status(201).json(await createCommunityForum(db, req.user!, req.body));
  });
  router.get('/forums/:slug', async (req, res) => {
    res.json(await getForum(db, String(req.params.slug), req.user));
  });
  router.patch('/forums/:slug', requireAuth, async (req, res) => {
    res.json(await updateCommunityForum(db, req.user!, String(req.params.slug), req.body));
  });
  router.put('/forums/:slug/follow', requireAuth, async (req, res) => {
    res.json(await setForumFollow(db, req.user!, String(req.params.slug), true));
  });
  router.delete('/forums/:slug/follow', requireAuth, async (req, res) => {
    res.json(await setForumFollow(db, req.user!, String(req.params.slug), false));
  });
  router.get('/forums/:slug/topics', async (req, res) => {
    res.json(await listTopics(db, String(req.params.slug), req.user, req.query));
  });
  router.post('/forums/:slug/topics', requireAuth, topicLimiter, async (req, res) => {
    res.status(201).json(await createTopic(db, req.user!, String(req.params.slug), req.body));
  });
  router.get('/community-explore', async (req, res) => {
    res.json(await communityExplore(db, req.user));
  });
  router.get('/me/participation', requireAuth, async (req, res) => {
    res.json(await myParticipation(db, req.user!));
  });

  router.get('/topics/:id', async (req, res) => {
    res.json(await getTopic(db, idParam(req.params.id, 'Discussão não encontrada.'), req.user));
  });
  router.delete('/topics/:id', requireAuth, async (req, res) => {
    await deleteTopic(db, req.user!, idParam(req.params.id, 'Discussão não encontrada.'));
    res.status(204).end();
  });
  router.patch('/topics/:id/flags', requireAuth, async (req, res) => {
    res.json(await setTopicFlags(db, req.user!, idParam(req.params.id, 'Discussão não encontrada.'), req.body));
  });
  router.put('/topics/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    res.json(await setTopicVote(db, req.user!, idParam(req.params.id, 'Discussão não encontrada.'), true));
  });
  router.delete('/topics/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    res.json(await setTopicVote(db, req.user!, idParam(req.params.id, 'Discussão não encontrada.'), false));
  });
  router.put('/discussions/comments/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    res.json(await setCommentVote(db, req.user!, idParam(req.params.id, 'Comentário não encontrado.'), true));
  });
  router.delete('/discussions/comments/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    res.json(await setCommentVote(db, req.user!, idParam(req.params.id, 'Comentário não encontrado.'), false));
  });

  // comentários e acompanhamento, iguais para tópicos e propostas
  for (const [path, type] of [['topics', 'topic'], ['proposals', 'proposal']] as [string, Target][]) {
    const what = type === 'topic' ? 'Discussão não encontrada.' : 'Proposta não encontrada.';
    router.get(`/${path}/:id/comments`, async (req, res) => {
      res.json(await listComments(db, type, idParam(req.params.id, what), req.user, req.query));
    });
    router.post(`/${path}/:id/comments`, requireAuth, commentLimiter, async (req, res) => {
      res.status(201).json(await createComment(db, req.user!, type, idParam(req.params.id, what), req.body));
    });
    router.put(`/${path}/:id/follow`, requireAuth, async (req, res) => {
      res.json(await setFollow(db, req.user!, type, idParam(req.params.id, what), true));
    });
    router.delete(`/${path}/:id/follow`, requireAuth, async (req, res) => {
      res.json(await setFollow(db, req.user!, type, idParam(req.params.id, what), false));
    });
  }
  router.delete('/discussions/comments/:id', requireAuth, async (req, res) => {
    await deleteComment(db, req.user!, idParam(req.params.id, 'Comentário não encontrado.'));
    res.status(204).end();
  });

  router.get('/proposal-statuses', async (_req, res) => {
    res.json({ statuses: await listProposalStatuses(db) });
  });
  router.get('/proposals', async (req, res) => {
    res.json(await listProposals(db, req.user, req.query));
  });
  router.get('/proposals/:id', async (req, res) => {
    res.json(await getProposal(db, idParam(req.params.id, 'Proposta não encontrada.'), req.user));
  });
  router.post('/proposals', requireCitizen, proposalLimiter, photoUpload('images', MAX_PROPOSAL_IMAGES), async (req, res) => {
    const stored: string[] = [];
    try {
      for (const f of filesOf(req)) stored.push(await storePhoto(uploadDir, f.buffer));
      res.status(201).json(await createProposal(db, req.user!, req.body, stored));
    } catch (err) {
      for (const p of stored) await removePhoto(uploadDir, p);
      throw err;
    }
  });
  router.delete('/proposals/:id', requireAuth, async (req, res) => {
    await deleteOwnProposal(db, req.user!, idParam(req.params.id, 'Proposta não encontrada.'));
    res.status(204).end();
  });
  router.put('/proposals/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    res.json(await setVote(db, req.user!, idParam(req.params.id, 'Proposta não encontrada.'), true));
  });
  router.delete('/proposals/:id/vote', requireAuth, voteLimiter, async (req, res) => {
    res.json(await setVote(db, req.user!, idParam(req.params.id, 'Proposta não encontrada.'), false));
  });
  router.patch('/proposals/:id/status', requireStaff, async (req, res) => {
    res.json(await changeProposalStatus(db, req.user!, idParam(req.params.id, 'Proposta não encontrada.'), req.body));
  });
  router.put('/proposals/:id/occurrences/:occ', requireAuth, async (req, res) => {
    res.json(await linkOccurrence(db, req.user!, idParam(req.params.id, 'Proposta não encontrada.'), idParam(req.params.occ, 'Ocorrência não encontrada.'), true));
  });
  router.delete('/proposals/:id/occurrences/:occ', requireAuth, async (req, res) => {
    res.json(await linkOccurrence(db, req.user!, idParam(req.params.id, 'Proposta não encontrada.'), idParam(req.params.occ, 'Ocorrência não encontrada.'), false));
  });

  const reportLimiter = userLimiter(60, 30, 'Muitas denúncias em pouco tempo. Tente de novo mais tarde.');
  router.post('/reports', requireAuth, reportLimiter, async (req, res) => {
    res.status(201).json(await createReport(db, req.user!, req.body));
  });

  router.get('/me/interests', requireAuth, async (req, res) => {
    res.json({ neighborhoods: await myPlaces(db, req.user) });
  });
  router.put('/me/interests', requireAuth, async (req, res) => {
    res.json(await setInterests(db, req.user!, req.body));
  });

  return router;
}
