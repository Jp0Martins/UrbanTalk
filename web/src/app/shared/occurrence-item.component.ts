import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RelativePipe } from '../core/format';
import { Occurrence, addressLine } from '../core/models';
import { CategoryLabelComponent, PlacaComponent, StatusBadgeComponent } from './badges';
import { IconComponent } from './icon.component';

// linha de ocorrência usada nas listas (mapa, painel, histórico, página inicial)
@Component({
  selector: 'ut-ocorrencia-item',
  imports: [RouterLink, CategoryLabelComponent, PlacaComponent, StatusBadgeComponent, IconComponent, RelativePipe],
  template: `
    @let o = item();
    <a class="item" [routerLink]="['/ocorrencias', o.id]" [class.compacto]="compact()" [class.destacada]="highlight()">
      @if (o.photoUrl && !compact()) {
        <img class="foto" [src]="o.photoUrl" alt="" loading="lazy" width="72" height="72" />
      }
      <div class="corpo">
        <div class="topo">
          <ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" />
          <ut-status [status]="o.status" />
        </div>
        <p class="descricao">{{ o.description }}</p>
        <div class="meta">
          <ut-placa>{{ address(o) }}</ut-placa>
          <span class="tabular">{{ o.code }}</span>
          <span>{{ o.createdAt | relativo }}</span>
          <span class="confirmacoes" [attr.aria-label]="o.confirmations + ' confirmações'">
            <ut-icon name="hand" [size]="16" /><span class="tabular">{{ o.confirmations }}</span>
          </span>
          @if (o.isDemo) {
            <span class="demo">Demonstração</span>
          }
        </div>
      </div>
    </a>
  `,
  styles: `
    .item {
      display: flex; gap: var(--s-4); padding: var(--s-4); text-decoration: none; color: inherit;
      border-bottom: 1px solid var(--linha);
    }
    .item:hover { background: var(--superficie-2); color: inherit; }
    .compacto { padding: var(--s-3) var(--s-4); }
    .destacada { background: linear-gradient(90deg, var(--placa-clara), transparent 60%); }
    .foto { width: 72px; height: 72px; object-fit: cover; border-radius: var(--r-1); flex: none; background: var(--concreto); }
    .corpo { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .topo { display: flex; justify-content: space-between; gap: var(--s-3); align-items: center; font-weight: 600; }
    .descricao {
      color: var(--texto-2); font-size: var(--t-sm);
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .compacto .descricao { -webkit-line-clamp: 1; }
    .meta { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; font-size: var(--t-xs); color: var(--texto-3); }
    .confirmacoes { display: inline-flex; gap: 4px; align-items: center; }
    .demo { border: 1px solid var(--linha-forte); border-radius: var(--r-1); padding: 0 8px; color: var(--texto-2); }
    @media (max-width: 520px) {
      .topo { flex-direction: column; align-items: flex-start; gap: 4px; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OccurrenceItemComponent {
  item = input.required<Occurrence>();
  compact = input(false);
  highlight = input(false);
  address = addressLine;
}
