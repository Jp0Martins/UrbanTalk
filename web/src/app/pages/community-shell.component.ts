import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SessionStore } from '../core/session.store';
import { IconComponent } from '../shared/icon.component';

type Tab = 'feed' | 'foruns' | 'explorar' | 'minhas';

// Comunidade: feed, fóruns, explorar e minhas participações dentro de uma só área
@Component({
  selector: 'ut-comunidade-area',
  imports: [RouterOutlet, RouterLink, IconComponent, TranslatePipe],
  template: `
    <div class="pagina">
      <header class="cab">
        <div>
          <h1>{{ 'auto.m3cc52f916c' | translate }}</h1>
          <p class="desc">{{ 'auto.maa0296fe1e' | translate }} <a routerLink="/registrar">{{ 'auto.m144a514c70' | translate }}</a>.</p>
        </div>
        @if (tab() === 'foruns' && session.user()) {
          <a routerLink="/comunidade/foruns/novo" class="btn btn-primario"><ut-icon name="plus" [size]="18" />{{ 'auto.ma97e989a61' | translate }}</a>
        }
      </header>
      <nav class="abas-area" [aria-label]="'auto.ma4a085ba84' | translate">
        @for (t of tabs; track t.id) {
          <a [routerLink]="t.link" [attr.aria-current]="tab() === t.id ? 'page' : null" [class.ativa]="tab() === t.id">
            <ut-icon [name]="t.icon" [size]="18" /><span class="longo">{{ t.label }}</span><span class="curto" aria-hidden="true">{{ t.short }}</span>
          </a>
        }
      </nav>
      <router-outlet />
    </div>
  `,
  styles: `
    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-4); }
    .cab > div { max-width: 72ch; }
    .desc { color: var(--texto-2); margin-top: 6px; }
    .abas-area { display: flex; gap: var(--s-1); border-bottom: 1px solid var(--linha-forte); margin-bottom: var(--s-5); overflow-x: auto; scrollbar-width: none; }
    .abas-area::-webkit-scrollbar { display: none; }
    .abas-area a {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; min-height: 44px; white-space: nowrap;
      color: var(--texto-2); font-weight: 600; text-decoration: none; border-bottom: 3px solid transparent; margin-bottom: -1px;
    }
    .abas-area a:hover { color: var(--texto); background: var(--superficie-2); }
    .abas-area a.ativa { color: var(--placa); border-bottom-color: var(--placa); }
    .curto { display: none; }
    @media (max-width: 560px) {
      .abas-area a { padding: 10px 10px; font-size: var(--t-sm); }
      .abas-area ut-icon { display: none; }
      .abas-area .longo { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .abas-area .curto { display: inline; }
      .cab .btn { width: 100%; justify-content: center; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityShellComponent {
  private router = inject(Router);
  session = inject(SessionStore);

  tabs: { id: Tab; label: string; short: string; link: string; icon: string }[] = [
    { id: 'feed', label: 'Feed', short: 'Feed', link: '/comunidade', icon: 'chat' },
    { id: 'foruns', label: 'Fóruns', short: 'Fóruns', link: '/comunidade/foruns', icon: 'users' },
    { id: 'explorar', label: 'Explorar', short: 'Explorar', link: '/comunidade/explorar', icon: 'search' },
    { id: 'minhas', label: 'Minhas participações', short: 'Minhas', link: '/comunidade/minhas', icon: 'user' },
  ];

  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  // fórum e discussão abertos ficam sob a aba Fóruns
  tab = computed<Tab>(() => {
    const path = this.url().split(/[?#]/)[0];
    if (/^\/comunidade\/(foruns|f\/|discussoes\/)/.test(path)) return 'foruns';
    if (path.startsWith('/comunidade/explorar')) return 'explorar';
    if (path.startsWith('/comunidade/minhas')) return 'minhas';
    return 'feed';
  });
}
