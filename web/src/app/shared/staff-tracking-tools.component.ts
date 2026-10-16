import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { RelativePipe } from '../core/format';
import { MAX_PHOTO_MB, PHOTO_TYPES, StaffOccurrenceDetail } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

type Files = { antes: File[]; depois: File[]; evid: File[] };

// ferramentas de acompanhamento da equipe: pedir informação, registrar resolução e anexar evidências
@Component({
  selector: 'ut-ferramentas-acompanhamento',
  imports: [IconComponent, RelativePipe],
  template: `
    @let o = occ();
    <details class="sub-bloco" [open]="!!o.infoRequest">
      <summary><h3>Pedir informação ao cidadão</h3></summary>
      @if (o.infoRequest; as q) {
        <div class="pendente">
          <p><strong>Aguardando resposta</strong> · enviado {{ q.createdAt | relativo }}</p>
          <p class="q">{{ q.question }}</p>
          <button type="button" class="btn btn-texto btn-sm" (click)="cancel(q.id)">Cancelar pedido</button>
        </div>
      } @else {
        <textarea class="entrada" rows="2" maxlength="500" aria-label="Pergunta para quem registrou" placeholder="Ex.: qual é o número da casa mais próxima?" [value]="question()" (input)="question.set($any($event.target).value)"></textarea>
        <p class="dica">Quem registrou recebe uma notificação. A pergunta não aparece para o público.</p>
        <button type="button" class="btn btn-secundario btn-sm" [disabled]="question().trim().length < 10 || busy()" (click)="ask()">Enviar pergunta</button>
      }
    </details>

    <details class="sub-bloco">
      <summary><h3>Registrar resolução</h3></summary>
      @if (resolvedStatuses().length === 0) {
        <p class="dica">Nenhum status ativo está marcado como "conta como resolvido". Um administrador pode configurar isso em Status.</p>
      } @else if (o.resolution) {
        <p class="dica">Já existe uma resolução registrada. Para corrigir, reabra a reclamação mudando o status com uma justificativa. Você ainda pode anexar fotos abaixo.</p>
      } @else {
        <div class="campo">
          <label for="res-st">Status</label>
          <select id="res-st" class="entrada" (change)="resStatus.set($any($event.target).value)">
            @for (s of resolvedStatuses(); track s.slug) { <option [value]="s.slug" [selected]="resStatus() === s.slug">{{ s.name }}</option> }
          </select>
        </div>
        <div class="campo">
          <label for="res-desc">O que foi feito</label>
          <textarea id="res-desc" class="entrada" rows="3" maxlength="1000" placeholder="Ex.: a regional informou que a equipe de tapa-buraco esteve no local em 10/10." [value]="resDesc()" (input)="resDesc.set($any($event.target).value)"></textarea>
          <span class="dica">Fica público. Diga quem fez e de onde veio a informação.</span>
        </div>
        <div class="fotos-par">
          <label class="btn btn-secundario btn-sm arquivo"><ut-icon name="camera" [size]="16" />Fotos de antes ({{ files().antes.length }}/3)<input type="file" class="sr-only" multiple accept="image/jpeg,image/png,image/webp" (change)="pick('antes', $any($event.target))" /></label>
          <label class="btn btn-secundario btn-sm arquivo"><ut-icon name="camera" [size]="16" />Fotos de depois ({{ files().depois.length }}/3)<input type="file" class="sr-only" multiple accept="image/jpeg,image/png,image/webp" (change)="pick('depois', $any($event.target))" /></label>
        </div>
        <p class="dica">Fotos são opcionais. Com fotos, a reclamação aparece como "resolução com evidências", o que é diferente de uma verificação independente.</p>
        <button type="button" class="btn btn-primario" [disabled]="busy() || resDesc().trim().length < 10" (click)="resolve()">{{ busy() ? 'Salvando…' : 'Registrar resolução' }}</button>
      }
    </details>

    <details class="sub-bloco">
      <summary><h3>Anexar evidência</h3></summary>
      <div class="campo">
        <label for="ev-tipo">Tipo</label>
        <select id="ev-tipo" class="entrada" (change)="evKind.set($any($event.target).value)">
          <option value="acompanhamento" [selected]="evKind() === 'acompanhamento'">Acompanhamento (durante a análise)</option>
          <option value="antes" [selected]="evKind() === 'antes'">Antes da intervenção</option>
          <option value="depois" [selected]="evKind() === 'depois'">Depois da intervenção</option>
        </select>
      </div>
      <input class="entrada" maxlength="200" aria-label="Legenda da evidência" placeholder="Legenda (opcional)" [value]="evCaption()" (input)="evCaption.set($any($event.target).value)" />
      <label class="btn btn-secundario btn-sm arquivo"><ut-icon name="camera" [size]="16" />Escolher fotos ({{ files().evid.length }}/3)<input type="file" class="sr-only" multiple accept="image/jpeg,image/png,image/webp" (change)="pick('evid', $any($event.target))" /></label>
      <p class="dica">Evidências ficam públicas no acompanhamento. Não fotografe pessoas nem placas de carro.</p>
      <button type="button" class="btn btn-secundario btn-sm" [disabled]="busy() || files().evid.length === 0" (click)="evidence()">Anexar</button>
    </details>
    @if (error()) { <p class="erro" role="alert">{{ error() }}</p> }
  `,
  styles: `
    :host { display: contents; }
    .sub-bloco { display: flex; flex-direction: column; gap: var(--s-3); border-top: 1px solid var(--linha); padding-top: var(--s-4); }
    .sub-bloco h3 { font-size: var(--t-md); font-family: var(--fonte); font-weight: 700; display: inline; }
    summary { cursor: pointer; min-height: 32px; display: flex; align-items: center; gap: 6px; }
    details[open] > summary { margin-bottom: var(--s-1); }
    details > :not(summary) { margin-top: var(--s-2); }
    .pendente { background: var(--faixa-clara); border-radius: var(--r-1); padding: 10px 12px; font-size: var(--t-sm); display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .q { white-space: pre-line; }
    .fotos-par { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .arquivo { cursor: pointer; align-self: flex-start; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .btn { align-self: flex-start; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffTrackingToolsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private catalog = inject(StatusCatalog);
  occ = input.required<StaffOccurrenceDetail>();
  updated = output<StaffOccurrenceDetail>();

  resolvedStatuses = computed(() => this.catalog.active().filter((s) => s.countsAsResolved));
  question = signal('');
  resStatus = signal('');
  resDesc = signal('');
  evKind = signal<'acompanhamento' | 'antes' | 'depois'>('acompanhamento');
  evCaption = signal('');
  files = signal<Files>({ antes: [], depois: [], evid: [] });
  busy = signal(false);
  error = signal<string | null>(null);

  pick(kind: keyof Files, el: HTMLInputElement) {
    const list = Array.from(el.files ?? []);
    el.value = '';
    const ok = list.filter((f) => PHOTO_TYPES.includes(f.type) && f.size <= MAX_PHOTO_MB * 1024 * 1024);
    if (ok.length < list.length) this.error.set(`Algumas fotos foram ignoradas: use JPG, PNG ou WebP de até ${MAX_PHOTO_MB} MB.`);
    else this.error.set(null);
    this.files.set({ ...this.files(), [kind]: [...this.files()[kind], ...ok].slice(0, 3) });
  }

  private done(o: StaffOccurrenceDetail, msg: string) {
    this.busy.set(false);
    this.updated.emit(o);
    this.toast.show(msg);
  }

  private fail(e: unknown) {
    this.busy.set(false);
    const err = toApiError(e);
    this.error.set(Object.values(err.fields)[0] ?? err.message);
  }

  ask() {
    this.busy.set(true);
    this.error.set(null);
    this.api.requestInfo(this.occ().id, this.question().trim()).subscribe({
      next: (o) => {
        this.question.set('');
        this.done(o, 'Pergunta enviada. Quem registrou foi notificado.');
      },
      error: (e) => this.fail(e),
    });
  }

  cancel(requestId: number) {
    this.api.cancelInfo(this.occ().id, requestId).subscribe({ next: (o) => this.done(o, 'Pedido cancelado.'), error: (e) => this.fail(e) });
  }

  resolve() {
    const fd = new FormData();
    fd.append('status', this.resStatus() || this.resolvedStatuses()[0].slug);
    fd.append('description', this.resDesc().trim());
    for (const f of this.files().antes) fd.append('antes', f);
    for (const f of this.files().depois) fd.append('depois', f);
    this.busy.set(true);
    this.error.set(null);
    this.api.resolve(this.occ().id, fd).subscribe({
      next: (o) => {
        this.resDesc.set('');
        this.files.set({ ...this.files(), antes: [], depois: [] });
        this.done(o, 'Resolução registrada. Quem registrou e quem confirmou foram avisados.');
      },
      error: (e) => this.fail(e),
    });
  }

  evidence() {
    const fd = new FormData();
    fd.append('kind', this.evKind());
    fd.append('caption', this.evCaption().trim());
    for (const f of this.files().evid) fd.append('photos', f);
    this.busy.set(true);
    this.error.set(null);
    this.api.addEvidence(this.occ().id, fd).subscribe({
      next: (o) => {
        this.evCaption.set('');
        this.files.set({ ...this.files(), evid: [] });
        this.done(o, 'Evidência anexada ao acompanhamento.');
      },
      error: (e) => this.fail(e),
    });
  }
}
