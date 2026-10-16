import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ut-cabecalho-pagina',
  template: `
    <header class="cab">
      <div class="textos">
        <h1>{{ title() }}</h1>
        @if (description()) {
          <p class="desc">{{ description() }}</p>
        }
      </div>
      <div class="acoes"><ng-content /></div>
    </header>
  `,
  styles: `
    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s-4); margin-bottom: var(--s-5); flex-wrap: wrap; }
    .textos { min-width: 0; max-width: 72ch; }
    .desc { color: var(--texto-2); margin-top: 6px; }
    .acoes { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .acoes:empty { display: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  title = input.required<string>();
  description = input<string>('');
}
