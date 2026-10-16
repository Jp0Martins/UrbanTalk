import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../core/api.service';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { NotificationsService } from '../core/notifications.service';
import { IconComponent } from '../shared/icon.component';
import { LogoComponent } from './logo.component';
import { PublicHeaderComponent } from './public-header.component';

// moldura das páginas internas: barra lateral para quem está logado, cabeçalho simples para visitantes
@Component({
  selector: 'ut-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, LogoComponent, PublicHeaderComponent],
  template: `
    <a class="pular" href="#conteudo">Pular para o conteúdo</a>
    @if (session.user(); as user) {
      <div class="app">
        <aside class="lateral" [class.aberta]="menuOpen()" aria-label="Navegação">
          <div class="lateral-topo">
            <ut-logo [link]="session.homePath()" [onDark]="true" />
            <button type="button" class="menu-btn" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-controls="menu-principal">
              <ut-icon [name]="menuOpen() ? 'x' : 'menu'" />
              <span class="sr-only">{{ menuOpen() ? 'Fechar menu' : 'Abrir menu' }}</span>
            </button>
          </div>
          <nav id="menu-principal" class="menu">
            @if (session.isStaff()) {
              <p class="perfil-atual"><ut-icon name="shield" [size]="16" />Área da equipe</p>
              <a routerLink="/admin" routerLinkActive="ativo" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page"><ut-icon name="home" />Painel administrativo</a>
              <a routerLink="/admin/fila" routerLinkActive="ativo" ariaCurrentWhenActive="page">
                <ut-icon name="list" />Fila de Análise
                @if (waiting() > 0) {
                  <span class="contador" [attr.aria-label]="waiting() + ' aguardando análise'">{{ waiting() > 99 ? '99+' : waiting() }}</span>
                }
              </a>
              <a routerLink="/admin/reclamacoes" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="inbox" />Todas as reclamações</a>
              <a routerLink="/admin/moderacao" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="shield" />Moderação</a>
              <a routerLink="/admin/relatorios" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="file" />Relatórios</a>
              <a routerLink="/admin/indicadores" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="chart" />Indicadores</a>
              <p class="grupo">{{ session.isManager() ? 'Administração' : 'Consulta' }}</p>
              <a routerLink="/admin/status" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="sliders" />Status</a>
              @if (session.isManager()) {
                <a routerLink="/admin/equipe" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="users" />Equipe</a>
                <a routerLink="/admin/configuracoes" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="edit" />Configurações</a>
                <a routerLink="/admin/auditoria" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="history" />Histórico administrativo</a>
              }
              <p class="grupo">Cidade</p>
              <a routerLink="/explorar" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="search" />Explorar</a>
              <a routerLink="/mapa" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="map" />Mapa de ocorrências</a>
              <a routerLink="/comunidade" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="chat" />Comunidade</a>
              <a routerLink="/propostas" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="sparkle" />Ideias e propostas</a>
            } @else {
              <a routerLink="/registrar" class="registrar">
                <ut-icon name="plus" />Registrar reclamação
              </a>
              <a routerLink="/painel" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="home" />Início</a>
              <a routerLink="/explorar" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="search" />Explorar</a>
              <a routerLink="/mapa" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="map" />Mapa de ocorrências</a>
              <a routerLink="/minhas-ocorrencias" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="history" />Minhas reclamações</a>
              <a routerLink="/comunidade" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="chat" />Comunidade</a>
              <a routerLink="/propostas" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="sparkle" />Ideias e propostas</a>
            }
            <a routerLink="/notificacoes" routerLinkActive="ativo" ariaCurrentWhenActive="page">
              <ut-icon name="inbox" />Notificações
              @if (notes.unread() > 0) {
                <span class="contador alerta" [attr.aria-label]="notes.unread() + ' não lidas'">{{ notes.unread() > 99 ? '99+' : notes.unread() }}</span>
              }
            </a>
            <a routerLink="/perfil" routerLinkActive="ativo" ariaCurrentWhenActive="page"><ut-icon name="user" />Meu perfil</a>
            <div class="conta">
              <div class="quem">
                <span class="avatar" [class.equipe]="session.isStaff()" aria-hidden="true">{{ initials() }}</span>
                <span class="quem-textos">
                  <span class="nome">{{ user.name }}</span>
                  <span class="email">{{ roleLabel() }}</span>
                </span>
              </div>
              <button type="button" class="sair" (click)="logout()"><ut-icon name="logout" [size]="18" />Sair</button>
            </div>
          </nav>
        </aside>
        <main id="conteudo" class="principal" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    } @else {
      <ut-cabecalho-publico />
      <main id="conteudo" class="principal publico" tabindex="-1">
        <router-outlet />
      </main>
    }
  `,
  styles: `
    .pular {
      position: absolute; left: 8px; top: -60px; z-index: 2000;
      background: var(--asfalto); color: #fff; padding: 8px 12px; border-radius: var(--r-1);
    }
    .pular:focus { top: 8px; }
    .app { display: grid; grid-template-columns: var(--sidebar) 1fr; min-height: 100dvh; }
    .lateral {
      background: var(--asfalto); color: var(--texto-inverso);
      position: sticky; top: 0; height: 100dvh; overflow-y: auto;
      display: flex; flex-direction: column; padding: var(--s-5) var(--s-4) var(--s-4);
    }
    .lateral-topo { display: flex; justify-content: space-between; align-items: center; padding: 0 var(--s-2) var(--s-6); }
    .menu-btn { display: none; background: none; border: 0; color: inherit; padding: 8px; border-radius: var(--r-1); cursor: pointer; }
    .menu { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .menu a {
      display: flex; align-items: center; gap: var(--s-3);
      padding: 10px var(--s-3); border-radius: var(--r-1);
      color: var(--texto-inverso-2); text-decoration: none; font-weight: 500;
      border-left: 3px solid transparent;
    }
    .menu a:hover { background: var(--asfalto-2); color: #fff; }
    .menu a.ativo { background: var(--asfalto-2); color: #fff; border-left-color: var(--faixa); }
    .menu .registrar {
      background: var(--placa); color: #fff; margin-bottom: var(--s-5); justify-content: center; font-weight: 600;
      border-left: 0; min-height: 44px;
    }
    .menu .registrar:hover { background: var(--placa-escura); color: #fff; }
    .grupo { margin: var(--s-5) 0 var(--s-1); padding: 0 var(--s-3); font-size: var(--t-xs); color: var(--texto-inverso-2); font-weight: 600; }
    .conta { margin-top: auto; padding-top: var(--s-4); border-top: 1px solid var(--asfalto-3); display: flex; flex-direction: column; gap: var(--s-3); }
    .quem { display: flex; align-items: center; gap: var(--s-3); padding: 0 var(--s-2); min-width: 0; }
    .avatar { width: 38px; height: 38px; background: var(--asfalto-3); color: #fff; box-shadow: none; }
    .perfil-atual {
      display: flex; align-items: center; gap: 6px; margin: 0 0 var(--s-3); padding: 6px var(--s-3);
      font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      color: var(--asfalto); background: var(--faixa); border-radius: var(--r-1); align-self: flex-start;
    }
    .contador {
      margin-left: auto; min-width: 24px; height: 22px; padding: 0 7px; border-radius: var(--r-1);
      background: var(--placa); color: #fff; font-size: 0.75rem; font-weight: 700;
      display: inline-grid; place-items: center; font-variant-numeric: tabular-nums;
    }
    .contador.alerta { background: var(--faixa); color: var(--asfalto); }
    .quem-textos { display: flex; flex-direction: column; min-width: 0; }
    .nome { font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .email { font-size: var(--t-xs); color: var(--texto-inverso-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sair {
      display: flex; align-items: center; gap: var(--s-2); background: none; border: 1px solid var(--asfalto-3);
      color: var(--texto-inverso); padding: 8px var(--s-3); border-radius: var(--r-1); cursor: pointer; font-weight: 500;
    }
    .sair:hover { background: var(--asfalto-2); }
    .principal { min-width: 0; outline: none; }
    .publico { min-height: calc(100dvh - 70px); }

    @media (max-width: 900px) {
      .app { grid-template-columns: 1fr; }
      .lateral { position: sticky; top: 0; height: auto; z-index: 1000; padding: 10px var(--s-4); }
      .lateral-topo { padding: 0; }
      .menu-btn { display: inline-flex; }
      .menu { display: none; padding: var(--s-4) 0 var(--s-2); }
      .lateral.aberta .menu { display: flex; }
      .lateral.aberta { max-height: 100dvh; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  session = inject(SessionStore);
  private router = inject(Router);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  notes = inject(NotificationsService);
  menuOpen = signal(false);
  waiting = signal(0);
  roleLabel = computed(() => {
    const r = this.session.user()?.role;
    return r === 'admin' ? 'Administrador(a)' : r === 'staff' ? 'Funcionário(a)' : 'Cidadão(ã)';
  });
  initials = computed(() => {
    const parts = (this.session.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  constructor() {
    // fecha o menu móvel ao navegar
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuOpen.set(false));
    effect(() => {
      if (!this.session.user()) this.menuOpen.set(false);
    });
    // contador de reclamações aguardando análise, atualizado a cada minuto
    const tick = () => {
      this.notes.refreshCount();
      if (!this.session.isStaff() || document.visibilityState !== 'visible') return;
      this.api.overview().subscribe({ next: (o) => this.waiting.set(o.waiting), error: () => undefined });
    };
    effect(() => {
      if (this.session.isStaff()) tick();
      else this.waiting.set(0);
    });
    const timer = setInterval(tick, 60_000);
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => tick());
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async logout() {
    await this.session.logout();
    this.toast.show('Você saiu da sua conta.', 'info');
    this.router.navigate(['/']);
  }
}
