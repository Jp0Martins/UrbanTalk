import { Routes } from '@angular/router';
import { authGuard, citizenGuard, guestGuard, managerGuard, staffGuard } from './core/guards';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'UrbanTalk – problemas urbanos em Sorocaba', loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: 'entrar', title: 'Entrar – UrbanTalk', canActivate: [guestGuard], loadComponent: () => import('./pages/auth.pages').then((m) => m.LoginPage) },
      { path: 'cadastro', title: 'Criar conta – UrbanTalk', canActivate: [guestGuard], loadComponent: () => import('./pages/auth.pages').then((m) => m.RegisterPage) },
      { path: 'mapa', title: 'Mapa de ocorrências – UrbanTalk', loadComponent: () => import('./pages/map.page').then((m) => m.MapPage) },
      { path: 'ocorrencias/:id', title: 'Reclamação – UrbanTalk', loadComponent: () => import('./pages/detail.page').then((m) => m.DetailPage) },
      { path: 'explorar', title: 'Explorar – UrbanTalk', loadComponent: () => import('./pages/explore.page').then((m) => m.ExplorePage) },
      // endereços antigos dos fóruns continuam funcionando
      { path: 'foruns', pathMatch: 'full', redirectTo: 'comunidade/foruns' },
      { path: 'foruns/:slug', redirectTo: 'comunidade/f/:slug' },
      { path: 'topicos/:id', redirectTo: 'comunidade/discussoes/:id' },
      { path: 'propostas', title: 'Ideias e propostas – UrbanTalk', loadComponent: () => import('./pages/proposals.page').then((m) => m.ProposalsPage) },
      { path: 'propostas/nova', title: 'Nova proposta – UrbanTalk', canActivate: [citizenGuard], loadComponent: () => import('./pages/proposal-form.page').then((m) => m.ProposalFormPage) },
      { path: 'propostas/:id', title: 'Proposta – UrbanTalk', loadComponent: () => import('./pages/proposal.page').then((m) => m.ProposalPage) },
      {
        path: 'comunidade',
        loadComponent: () => import('./pages/community-shell.component').then((m) => m.CommunityShellComponent),
        children: [
          { path: '', pathMatch: 'full', title: 'Comunidade – UrbanTalk', loadComponent: () => import('./pages/community.page').then((m) => m.CommunityPage) },
          { path: 'foruns', title: 'Fóruns – Comunidade – UrbanTalk', loadComponent: () => import('./pages/forums.page').then((m) => m.ForumsPage) },
          { path: 'foruns/novo', title: 'Criar fórum – UrbanTalk', canActivate: [authGuard], loadComponent: () => import('./pages/forum-form.page').then((m) => m.ForumFormPage) },
          { path: 'explorar', title: 'Explorar a Comunidade – UrbanTalk', loadComponent: () => import('./pages/community-explore.page').then((m) => m.CommunityExplorePage) },
          { path: 'minhas', title: 'Minhas participações – UrbanTalk', canActivate: [authGuard], loadComponent: () => import('./pages/my-participation.page').then((m) => m.MyParticipationPage) },
          { path: 'f/:slug', title: 'Fórum – UrbanTalk', loadComponent: () => import('./pages/forum.page').then((m) => m.ForumPage) },
          { path: 'f/:slug/editar', title: 'Editar fórum – UrbanTalk', canActivate: [authGuard], loadComponent: () => import('./pages/forum-form.page').then((m) => m.ForumFormPage) },
          { path: 'discussoes/:id', title: 'Discussão – UrbanTalk', loadComponent: () => import('./pages/topic.page').then((m) => m.TopicPage) },
        ],
      },
      { path: 'notificacoes', title: 'Notificações – UrbanTalk', canActivate: [authGuard], loadComponent: () => import('./pages/notifications.page').then((m) => m.NotificationsPage) },
      { path: 'perfil', title: 'Meu perfil – UrbanTalk', canActivate: [authGuard], loadComponent: () => import('./pages/profile.page').then((m) => m.ProfilePage) },

      // cliente
      { path: 'painel', title: 'Início – UrbanTalk', canActivate: [citizenGuard], loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'registrar', title: 'Registrar reclamação – UrbanTalk', canActivate: [citizenGuard], loadComponent: () => import('./pages/report.page').then((m) => m.ReportPage) },
      { path: 'minhas-ocorrencias', title: 'Minhas reclamações – UrbanTalk', canActivate: [citizenGuard], loadComponent: () => import('./pages/my-occurrences.page').then((m) => m.MyOccurrencesPage) },

      // funcionário
      { path: 'admin', title: 'Painel da equipe – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-overview.page').then((m) => m.AdminOverviewPage) },
      { path: 'admin/fila', title: 'Fila de Análise – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-queue.page').then((m) => m.AdminQueuePage) },
      { path: 'admin/moderacao', title: 'Moderação – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-moderation.page').then((m) => m.AdminModerationPage) },
      { path: 'admin/configuracoes', title: 'Configurações – UrbanTalk', canActivate: [managerGuard], loadComponent: () => import('./pages/admin-settings.page').then((m) => m.AdminSettingsPage) },
      { path: 'admin/auditoria', title: 'Histórico administrativo – UrbanTalk', canActivate: [managerGuard], loadComponent: () => import('./pages/admin-audit.page').then((m) => m.AdminAuditPage) },
      { path: 'admin/reclamacoes', title: 'Todas as reclamações – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-occurrences.page').then((m) => m.AdminOccurrencesPage) },
      { path: 'admin/status', title: 'Status – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-statuses.page').then((m) => m.AdminStatusesPage) },
      { path: 'admin/indicadores', title: 'Indicadores – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-indicators.page').then((m) => m.AdminIndicatorsPage) },
      { path: 'admin/relatorios', title: 'Relatórios – UrbanTalk', canActivate: [staffGuard], loadComponent: () => import('./pages/admin-reports.page').then((m) => m.AdminReportsPage) },
      { path: 'admin/equipe', title: 'Equipe – UrbanTalk', canActivate: [managerGuard], loadComponent: () => import('./pages/admin-team.page').then((m) => m.AdminTeamPage) },

      { path: '**', title: 'Página não encontrada – UrbanTalk', loadComponent: () => import('./pages/not-found.page').then((m) => m.NotFoundPage) },
    ],
  },
];
