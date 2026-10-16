import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { LogoComponent } from './logo.component';

@Component({
  selector: 'ut-cabecalho-publico',
  imports: [RouterLink, RouterLinkActive, LogoComponent],
  template: `
    <header class="cab">
      <div class="dentro">
        <ut-logo />
        <nav aria-label="Principal" class="nav">
          <a routerLink="/explorar" routerLinkActive="ativo" class="esconde-mobile">Explorar</a>
          <a routerLink="/mapa" routerLinkActive="ativo">Mapa de ocorrências</a>
          <a routerLink="/propostas" routerLinkActive="ativo" class="esconde-mobile">Propostas</a>
          <a routerLink="/comunidade" routerLinkActive="ativo" class="esconde-mobile">Comunidade</a>

          @if (session.user()) {
            <a [routerLink]="session.homePath()" class="btn btn-primario btn-sm">{{ session.isStaff() ? 'Área da equipe' : 'Ir para o início' }}</a>
          } @else {
            <a routerLink="/entrar" routerLinkActive="ativo">Entrar</a>
            <a routerLink="/cadastro" class="btn btn-primario btn-sm">Criar conta</a>
          }
        </nav>
      </div>
    </header>
  `,
  styles: `
    .cab { background: var(--superficie); border-bottom: 1px solid var(--linha); }
    .dentro {
      max-width: 1280px; margin: 0 auto; padding: 12px var(--s-6);
      display: flex; align-items: center; justify-content: space-between; gap: var(--s-4);
    }
    .nav { display: flex; align-items: center; gap: var(--s-5); }
    .nav a:not(.btn) { color: var(--texto); text-decoration: none; font-weight: 500; padding: 6px 0; border-bottom: 2px solid transparent; }
    .nav a:not(.btn):hover { border-bottom-color: var(--linha-forte); }
    .nav a.ativo { border-bottom-color: var(--faixa); }
    @media (max-width: 720px) {
      .dentro { padding: 10px var(--s-4); }
      .nav { gap: var(--s-3); font-size: var(--t-sm); }
      .esconde-mobile { display: none; }
    }
    @media (max-width: 420px) {
      .nav a[routerLink='/mapa'] { display: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicHeaderComponent {
  session = inject(SessionStore);
}
