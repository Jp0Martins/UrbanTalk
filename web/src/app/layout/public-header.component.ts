import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { LogoComponent } from './logo.component';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../core/i18n';

@Component({
  selector: 'ut-cabecalho-publico',
  imports: [RouterLink, RouterLinkActive, LogoComponent, TranslatePipe],
  template: `
    <header class="cab">
      <div class="dentro">
        <ut-logo />
        <nav [aria-label]="'auto.mf3b86b13db' | translate" class="nav">
          <a routerLink="/explorar" routerLinkActive="ativo" class="esconde-mobile">{{ 'nav.explore' | translate }}</a>
          <a routerLink="/mapa" routerLinkActive="ativo">{{ 'nav.map' | translate }}</a>
          <a routerLink="/propostas" routerLinkActive="ativo" class="esconde-mobile">{{ 'nav.proposals' | translate }}</a>
          <a routerLink="/comunidade" routerLinkActive="ativo" class="esconde-mobile">{{ 'nav.community' | translate }}</a>

          @if (session.user()) {
            <a [routerLink]="session.homePath()" class="btn btn-primario btn-sm">{{ (session.isStaff() ? 'nav.staff' : 'nav.home') | translate }}</a>
          } @else {
            <a routerLink="/entrar" routerLinkActive="ativo">{{ 'nav.login' | translate }}</a>
            <a routerLink="/cadastro" class="btn btn-primario btn-sm">{{ 'nav.register' | translate }}</a>
          }
          <label class="idioma"><span class="sr-only">{{ 'auto.md896e16f8f' | translate }}</span><select [value]="language.language()" (change)="language.set($any($event.target).value)" aria-label="Idioma / Language"><option value="pt">{{ 'auto.m7c4c910b08' | translate }}</option><option value="en">{{ 'auto.m734a78cd06' | translate }}</option></select></label>
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
    .nav { display: flex; align-items: center; gap: var(--s-4); min-width: 0; }
    .nav a:not(.btn) { color: var(--texto); text-decoration: none; font-weight: 500; padding: 6px 0; border-bottom: 2px solid transparent; }
    .nav a:not(.btn):hover { border-bottom-color: var(--linha-forte); }
    .nav a.ativo { border-bottom-color: var(--faixa); }
    .idioma select { padding: 6px; border: 1px solid var(--linha-forte); background: var(--superficie); color: var(--texto); }
    @media (max-width: 900px) {
      .dentro { padding: 10px var(--s-4); }
      .nav { gap: var(--s-3); font-size: var(--t-sm); }
      .esconde-mobile { display: none; }
    }
    @media (max-width: 420px) {
      .nav a[routerLink='/mapa'] { display: none; }
      .nav a[routerLink='/cadastro'] { display: none; }
      .nav { gap: var(--s-2); }
      .idioma select { max-width: 82px; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicHeaderComponent {
  session = inject(SessionStore);
  language = inject(LanguageService);
}
