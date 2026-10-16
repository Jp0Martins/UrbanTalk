import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'ut-toasts',
  imports: [IconComponent],
  template: `
    <div class="pilha" aria-live="polite" aria-atomic="false">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [attr.data-kind]="t.kind" [attr.role]="t.kind === 'erro' ? 'alert' : 'status'">
          <ut-icon [name]="t.kind === 'erro' ? 'alert' : t.kind === 'sucesso' ? 'check' : 'info'" [size]="18" />
          <span>{{ t.text }}</span>
          <button type="button" (click)="toast.dismiss(t.id)"><ut-icon name="x" [size]="16" /><span class="sr-only">Fechar aviso</span></button>
        </div>
      }
    </div>
  `,
  styles: `
    .pilha { position: fixed; right: var(--s-5); bottom: var(--s-5); z-index: 3000; display: flex; flex-direction: column; gap: var(--s-2); max-width: min(420px, calc(100vw - 32px)); }
    .toast {
      display: flex; gap: var(--s-3); align-items: flex-start;
      background: var(--asfalto); color: var(--texto-inverso);
      padding: 12px 12px 12px 14px; border-radius: var(--r-1);
      border-left: 4px solid var(--texto-inverso-2);
      box-shadow: 0 6px 20px rgb(34 39 44 / 0.25);
      font-size: var(--t-sm);
    }
    .toast[data-kind='sucesso'] { border-left-color: #3fbf8f; }
    .toast[data-kind='erro'] { border-left-color: #ff7a6b; }
    .toast span { flex: 1; padding-top: 1px; }
    button { background: none; border: 0; color: inherit; cursor: pointer; padding: 2px; border-radius: 2px; }
    @media (max-width: 640px) { .pilha { left: var(--s-4); right: var(--s-4); bottom: var(--s-4); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastsComponent {
  toast = inject(ToastService);
}
