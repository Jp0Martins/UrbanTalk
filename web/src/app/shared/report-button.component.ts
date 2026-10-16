import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { toApiError } from '../core/api-error';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

export type ReportTarget = 'post' | 'post_comment' | 'proposal' | 'topic' | 'comment' | 'forum';

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'spam', label: 'Spam ou propaganda' },
  { id: 'ofensivo', label: 'Ofensivo ou desrespeitoso' },
  { id: 'odio', label: 'Discurso de ódio ou discriminação' },
  { id: 'dados_pessoais', label: 'Expõe dados pessoais' },
  { id: 'falso', label: 'Informação falsa ou enganosa' },
  { id: 'fora_do_tema', label: 'Fora do tema' },
  { id: 'outro', label: 'Outro motivo' },
];

// botão "Denunciar" com diálogo de motivos padronizados
@Component({
  selector: 'ut-denunciar',
  imports: [IconComponent],
  template: `
    <button type="button" class="btn btn-texto btn-sm denunciar" [disabled]="done()" (click)="open()">
      <ut-icon name="alert" [size]="15" />{{ done() ? 'Denunciado' : 'Denunciar' }}
    </button>
    <dialog #dlg class="dialogo" (close)="error.set(null)" aria-labelledby="den-t">
      <form method="dialog" (submit)="$event.preventDefault(); send()">
        <h2 id="den-t">Denunciar conteúdo</h2>
        <p>A equipe revisa cada denúncia. Quem publicou não fica sabendo quem denunciou.</p>
        <fieldset class="motivos">
          <legend class="rotulo">Motivo</legend>
          @for (r of reasons; track r.id) {
            <label class="opcao"><input type="radio" name="motivo" [value]="r.id" [checked]="reason() === r.id" (change)="reason.set(r.id)" />{{ r.label }}</label>
          }
        </fieldset>
        <div class="campo">
          <label [for]="'den-det-' + uid">Detalhes {{ reason() === 'outro' ? '(obrigatório)' : '(opcional)' }}</label>
          <textarea class="entrada" rows="2" maxlength="300" [id]="'den-det-' + uid" [value]="details()" (input)="details.set($any($event.target).value)"></textarea>
        </div>
        @if (error()) {
          <p class="erro" role="alert">{{ error() }}</p>
        }
        <div class="dlg-acoes">
          <button type="button" class="btn btn-secundario" (click)="dlg.close()">Cancelar</button>
          <button type="submit" class="btn btn-primario" [disabled]="!reason() || sending()">{{ sending() ? 'Enviando…' : 'Enviar denúncia' }}</button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .denunciar { color: var(--texto-2); }
    .motivos { border: 0; padding: 0; margin: var(--s-3) 0; display: flex; flex-direction: column; gap: 6px; }
    .opcao { display: flex; gap: 8px; align-items: center; min-height: 32px; cursor: pointer; }
    .opcao input { width: 18px; height: 18px; }
    .erro { color: var(--perigo); font-size: var(--t-sm); margin-top: var(--s-2); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportButtonComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  type = input.required<ReportTarget>();
  targetId = input.required<number>();
  dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  reasons = REPORT_REASONS;
  uid = Math.random().toString(36).slice(2, 8);
  reason = signal('');
  details = signal('');
  sending = signal(false);
  error = signal<string | null>(null);
  done = signal(false);

  open() {
    this.dlg().nativeElement.showModal();
  }

  send() {
    this.sending.set(true);
    this.error.set(null);
    this.http.post(`${environment.apiUrl}/reports`, { targetType: this.type(), targetId: this.targetId(), reason: this.reason(), details: this.details() }).subscribe({
      next: () => {
        this.sending.set(false);
        this.done.set(true);
        this.dlg().nativeElement.close();
        this.toast.show('Denúncia enviada. Obrigado por ajudar a manter a conversa saudável.');
      },
      error: (e) => {
        this.sending.set(false);
        const err = toApiError(e);
        if (err.code === 'already_reported') {
          this.done.set(true);
          this.dlg().nativeElement.close();
          this.toast.show(err.message, 'info');
          return;
        }
        this.error.set(Object.values(err.fields)[0] ?? err.message);
      },
    });
  }
}
