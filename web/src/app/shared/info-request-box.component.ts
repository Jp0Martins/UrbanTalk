import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { DatePipe } from '../core/format';
import { MAX_PHOTO_MB, OccurrenceDetail, PHOTO_TYPES } from '../core/models';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

// pergunta da equipe para quem registrou, com resposta e foto opcional
@Component({
  selector: 'ut-pedido-info',
  imports: [IconComponent, DatePipe],
  template: `
    @if (occ().infoRequest; as q) {
      <section id="pedido" class="pedido" aria-labelledby="pedido-t">
        <h2 id="pedido-t"><ut-icon name="info" [size]="20" />A equipe precisa de mais informações</h2>
        <p class="pergunta">{{ q.question }}</p>
        <p class="quando">Perguntado em {{ q.createdAt | data: true }}. Só você e a equipe veem esta conversa.</p>
        <form (submit)="$event.preventDefault(); send(q.id)">
          <div class="campo">
            <label for="resp-txt">Sua resposta</label>
            <textarea id="resp-txt" class="entrada" rows="3" maxlength="1000" [value]="answer()" (input)="answer.set($any($event.target).value)" [attr.aria-invalid]="!!error()"></textarea>
          </div>
          <label class="btn btn-secundario btn-sm arquivo"><ut-icon name="camera" [size]="16" />{{ photo() ? 'Trocar foto' : 'Anexar foto (opcional)' }}<input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" (change)="pick($any($event.target))" /></label>
          @if (photo(); as p) { <span class="arquivo-nome">{{ p.name }} <button type="button" class="btn btn-texto btn-sm" (click)="photo.set(null)">Remover</button></span> }
          @if (error()) { <p class="erro" role="alert">{{ error() }}</p> }
          <button type="submit" class="btn btn-primario" [disabled]="sending() || answer().trim().length < 3">{{ sending() ? 'Enviando…' : 'Enviar resposta' }}</button>
        </form>
      </section>
    }
  `,
  styles: `
    .pedido { background: var(--faixa-clara); border: 1px solid #edd9a3; border-left: 6px solid var(--faixa); border-radius: var(--r-2); padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
    h2 { font-size: var(--t-lg); display: flex; gap: 8px; align-items: center; }
    .pergunta { font-size: 1.0625rem; font-weight: 500; white-space: pre-line; }
    .quando { font-size: var(--t-xs); color: var(--texto-2); }
    form { display: flex; flex-direction: column; gap: var(--s-3); align-items: flex-start; }
    form .campo { align-self: stretch; }
    .arquivo { cursor: pointer; }
    .arquivo-nome { font-size: var(--t-sm); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoRequestBoxComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  occ = input.required<OccurrenceDetail>();
  updated = output<OccurrenceDetail>();
  answer = signal('');
  photo = signal<File | null>(null);
  sending = signal(false);
  error = signal<string | null>(null);

  pick(el: HTMLInputElement) {
    const f = el.files?.[0] ?? null;
    el.value = '';
    if (f && !PHOTO_TYPES.includes(f.type)) return this.error.set('Use uma foto JPG, PNG ou WebP.');
    if (f && f.size > MAX_PHOTO_MB * 1024 * 1024) return this.error.set(`A foto pode ter até ${MAX_PHOTO_MB} MB.`);
    this.error.set(null);
    this.photo.set(f);
  }

  send(requestId: number) {
    const fd = new FormData();
    fd.append('answer', this.answer().trim());
    const p = this.photo();
    if (p) fd.append('photo', p);
    this.sending.set(true);
    this.error.set(null);
    this.api.answerInfo(this.occ().id, requestId, fd).subscribe({
      next: (o) => {
        this.sending.set(false);
        this.answer.set('');
        this.photo.set(null);
        this.updated.emit(o);
        this.toast.show('Resposta enviada para a equipe.');
      },
      error: (e) => {
        this.sending.set(false);
        const err = toApiError(e);
        this.error.set(Object.values(err.fields)[0] ?? err.message);
      },
    });
  }
}
