import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { StatusCatalog } from '../core/status-catalog';

// legenda das cores do mapa, montada com os status ativos
@Component({
  selector: 'ut-legenda-status',
  template: `
    @for (s of catalog.active(); track s.slug) {
      <span [attr.data-color]="s.color"><i aria-hidden="true"></i>{{ s.name }}</span>
    }
    @if (hint()) {
      <span class="dica">{{ hint() }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: 4px var(--s-3); font-size: var(--t-xs); font-weight: 600; }
    span { display: inline-flex; align-items: center; gap: 6px; }
    i { width: 10px; height: 10px; border-radius: 50%; background: var(--cor); display: inline-block; }
    .dica { color: var(--texto-2); font-weight: 400; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusLegendComponent {
  catalog = inject(StatusCatalog);
  hint = input('');
}
