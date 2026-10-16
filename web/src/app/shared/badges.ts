import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatusCatalog } from '../core/status-catalog';
import { IconComponent } from './icon.component';

// placa de rua azul, usada para bairros e endereços
@Component({
  selector: 'ut-placa',
  template: `<span class="placa" [class.grande]="size() === 'lg'"><ng-content /></span>`,
  styles: `
    :host { display: inline-flex; max-width: 100%; }
    .placa {
      display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: var(--placa); color: #fff; font-family: var(--fonte-titulo); font-weight: 600;
      font-size: var(--t-xs); line-height: 1; padding: 5px 9px 5px; border-radius: var(--r-1);
      box-shadow: inset 0 0 0 2px var(--placa), inset 0 0 0 3px #fff; letter-spacing: 0.01em;
    }
    .grande { font-size: var(--t-sm); padding: 7px 12px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlacaComponent {
  size = input<'sm' | 'lg'>('sm');
}

// etiqueta de status: nome em texto, ícone com forma própria e cor da configuração
@Component({
  selector: 'ut-status',
  imports: [IconComponent],
  template: `<span class="status" [attr.data-status]="status()" [attr.data-color]="def().color" [title]="def().description">
    <ut-icon [name]="icon()" [size]="16" />{{ def().name }}
  </span>`,
  styles: `
    .status {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: var(--t-xs); font-weight: 600; color: var(--texto);
      white-space: nowrap; padding: 3px 10px 3px 7px; border-radius: var(--r-1);
      background: var(--cor-fundo, var(--superficie-2));
    }
    ut-icon { color: var(--cor, var(--texto-2)); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  private catalog = inject(StatusCatalog);
  status = input.required<string>();
  def = computed(() => this.catalog.get(this.status()));
  icon = computed(() => this.catalog.icon(this.status()));
  label = computed(() => this.def().name);
}

@Component({
  selector: 'ut-categoria',
  imports: [IconComponent],
  template: `<span class="cat"><ut-icon [name]="icon()" [size]="18" /><span>{{ name() }}@if (detail()) {<span class="det">: {{ detail() }}</span>}</span></span>`,
  styles: `
    .cat { display: inline-flex; align-items: center; gap: 6px; color: var(--texto); min-width: 0; }
    ut-icon { color: var(--texto-2); }
    .cat > span { overflow: hidden; text-overflow: ellipsis; }
    .det { font-weight: 500; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryLabelComponent {
  icon = input.required<string>();
  name = input.required<string>();
  detail = input<string | null>(null);
}
