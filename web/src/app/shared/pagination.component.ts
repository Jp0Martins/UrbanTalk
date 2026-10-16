import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ut-paginacao',
  imports: [IconComponent],
  template: `
    @if (totalPages() > 1) {
      <nav class="pag" aria-label="Paginação">
        <button type="button" class="btn btn-secundario btn-sm" [disabled]="page() <= 1" (click)="go.emit(page() - 1)">
          <ut-icon name="chevron-left" [size]="16" />Anterior
        </button>
        <span class="info tabular" aria-live="polite">Página {{ page() }} de {{ totalPages() }}</span>
        <button type="button" class="btn btn-secundario btn-sm" [disabled]="page() >= totalPages()" (click)="go.emit(page() + 1)">
          Próxima<ut-icon name="chevron-right" [size]="16" />
        </button>
      </nav>
    }
  `,
  styles: `
    .pag { display: flex; align-items: center; gap: var(--s-3); justify-content: flex-end; padding-top: var(--s-4); }
    .info { color: var(--texto-2); font-size: var(--t-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  page = input.required<number>();
  totalPages = input.required<number>();
  go = output<number>();
}
