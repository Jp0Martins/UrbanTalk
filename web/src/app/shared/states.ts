import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

// estado vazio: diz o que falta e qual o próximo passo
@Component({
  selector: 'ut-vazio',
  imports: [IconComponent],
  template: `
    <div class="vazio">
      <ut-icon [name]="icon()" [size]="28" />
      <div>
        <p class="titulo">{{ title() }}</p>
        @if (text()) {
          <p class="texto">{{ text() }}</p>
        }
        <div class="acoes"><ng-content /></div>
      </div>
    </div>
  `,
  styles: `
    .vazio {
      display: flex;
      gap: var(--s-4);
      align-items: flex-start;
      padding: var(--s-6) var(--s-5);
      border: 1px dashed var(--linha-forte);
      border-radius: var(--r-2);
      background: var(--superficie-2);
    }
    ut-icon { color: var(--texto-3); margin-top: 2px; }
    .titulo { font-weight: 600; }
    .texto { color: var(--texto-2); margin-top: 4px; max-width: 60ch; }
    .acoes:not(:empty) { margin-top: var(--s-4); display: flex; gap: var(--s-2); flex-wrap: wrap; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  icon = input('info');
  title = input.required<string>();
  text = input<string>('');
}

// falha de carregamento com opção de tentar de novo
@Component({
  selector: 'ut-erro',
  imports: [IconComponent],
  template: `
    <div class="aviso aviso-erro" role="alert">
      <ut-icon name="alert" />
      <div class="corpo">
        <p>{{ message() }}</p>
        @if (retryable()) {
          <button type="button" class="btn btn-secundario btn-sm" (click)="retry.emit()">
            <ut-icon name="refresh" [size]="16" />Tentar de novo
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .corpo { display: flex; flex-direction: column; gap: var(--s-3); align-items: flex-start; }
    ut-icon { color: var(--perigo); }
    button ut-icon { color: inherit; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  message = input.required<string>();
  retryable = input(true);
  retry = output<void>();
}
