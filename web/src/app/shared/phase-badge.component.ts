import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ProposalCatalog } from '../core/proposal-catalog';

// fase da proposta, com a cor configurada; a descrição aparece ao passar o mouse
@Component({
  selector: 'ut-fase',
  template: `<span class="fase" [attr.data-color]="def().color" [title]="def().description">{{ def().name }}</span>`,
  styles: `
    .fase {
      display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-xs); font-weight: 600; white-space: nowrap;
      padding: 3px 10px; border-radius: var(--r-1); background: var(--cor-fundo, var(--superficie-2)); color: var(--texto);
      border-left: 3px solid var(--cor, var(--texto-3));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhaseBadgeComponent {
  private catalog = inject(ProposalCatalog);
  status = input.required<string>();
  def = computed(() => this.catalog.get(this.status()));
  constructor() {
    this.catalog.ensure();
  }
}
