import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../core/admin.api';
import { toApiError } from '../core/api-error';
import { RelativePipe } from '../core/format';
import { PRIORITY_NAMES, Priority, SimilarOccurrence, StaffMember, StaffOccurrenceDetail } from '../core/models';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { StatusBadgeComponent } from './badges';
import { IconComponent } from './icon.component';

// triagem: responsável, prioridade justificada e possíveis duplicatas
@Component({
  selector: 'ut-triagem',
  imports: [RouterLink, IconComponent, StatusBadgeComponent, RelativePipe],
  template: `
    @let o = occ();
    <div class="sub-bloco">
      <h3>Responsável</h3>
      <p>
        @if (o.assignee; as a) { <strong>{{ a.name }}</strong> <span class="dica">desde {{ a.since | relativo }}</span> } @else { <span class="muted">Ninguém atribuído.</span> }
      </p>
      <div class="linha">
        <label class="sr-only" for="resp">Atribuir a</label>
        <select id="resp" class="entrada" (change)="assignTo.set($any($event.target).value)">
          <option value="">Escolha um funcionário…</option>
          @for (m of members(); track m.id) { <option [value]="m.id" [disabled]="m.id === o.assignee?.id">{{ m.name }}{{ m.id === session.user()?.id ? ' (você)' : '' }}</option> }
        </select>
        <button type="button" class="btn btn-secundario btn-sm" [disabled]="!assignTo() || busy()" (click)="assign(+assignTo())">Atribuir</button>
      </div>
      <div class="linha">
        @if (o.assignee?.id !== session.user()?.id) { <button type="button" class="btn btn-texto btn-sm" [disabled]="busy()" (click)="assign(session.user()!.id)">Atribuir a mim</button> }
        @if (o.assignee) { <button type="button" class="btn btn-texto btn-sm" [disabled]="busy()" (click)="assign(null)">Remover responsável</button> }
      </div>
    </div>

    <div class="sub-bloco">
      <h3>Prioridade</h3>
      <p>
        @if (o.priority) { <strong>{{ names[o.priority] }}</strong> @if (o.priorityReason) { <span class="dica">· {{ o.priorityReason }}</span> } }
        @else { <span class="muted">Ainda não avaliada.</span> }
      </p>
      <div class="campo">
        <label for="prio-n">Nova prioridade</label>
        <select id="prio-n" class="entrada" (change)="prio.set($any($event.target).value)">
          <option value="">Escolha…</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
          @if (o.priority) { <option value="nenhuma">Remover prioridade</option> }
        </select>
      </div>
      @if (prio() && prio() !== 'nenhuma') {
        <div class="campo">
          <label for="prio-m">Motivo (obrigatório)</label>
          <textarea id="prio-m" class="entrada" rows="2" maxlength="300" placeholder="Com base no que foi verificado: fotos, vistoria, resposta do cidadão…" [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea>
          <span class="dica">Fica só para a equipe. Não chame de perigoso ou urgente sem evidência.</span>
        </div>
      }
      <button type="button" class="btn btn-secundario btn-sm" [disabled]="!prio() || busy() || (prio() !== 'nenhuma' && reason().trim().length < 10)" (click)="savePriority()">Salvar prioridade</button>
    </div>

    <div class="sub-bloco">
      <h3>Possíveis duplicatas</h3>
      @if (o.duplicateOf; as d) {
        <p class="aviso aviso-info"><ut-icon name="list" [size]="16" /><span>Marcada como duplicata de <a [routerLink]="['/ocorrencias', d]">UT-{{ pad(d) }}</a>. Nada foi apagado.</span></p>
        <button type="button" class="btn btn-texto btn-sm" [disabled]="busy()" (click)="dup(null)">Desfazer marcação</button>
      }
      @if (similar() === null) {
        <p class="carregando">Procurando reclamações parecidas…</p>
      } @else if (similar()!.length === 0) {
        <p class="dica">Nenhuma reclamação da mesma categoria a até 200 m, registrada em até 90 dias de diferença.</p>
      } @else {
        <p class="dica">Mesma categoria, a até 200 m e registradas em até 90 dias de diferença. É só uma sugestão: confira antes de marcar.</p>
        <ul class="similares">
          @for (s of similar(); track s.id) {
            <li>
              <a [routerLink]="['/ocorrencias', s.id]"><strong>{{ s.code }}</strong> · {{ s.distanceM }} m · {{ s.createdAt | relativo }}</a>
              <ut-status [status]="s.status" />
              <span class="desc">{{ s.description }}</span>
              <span class="dica">{{ s.confirmations }} confirmações{{ s.duplicateOf ? ' · já é duplicata de UT-' + pad(s.duplicateOf) : '' }}</span>
              @if (!o.duplicateOf && !s.duplicateOf) {
                <button type="button" class="btn btn-texto btn-sm" [disabled]="busy()" (click)="dup(s.id)">Esta é duplicata de {{ s.code }}</button>
              }
            </li>
          }
        </ul>
      }
    </div>
    @if (error()) { <p class="erro" role="alert">{{ error() }}</p> }
  `,
  styles: `
    :host { display: contents; }
    .sub-bloco { display: flex; flex-direction: column; gap: var(--s-2); border-top: 1px solid var(--linha); padding-top: var(--s-4); }
    .sub-bloco h3 { font-size: var(--t-md); font-family: var(--fonte); font-weight: 700; }
    .linha { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
    .linha .entrada { flex: 1; min-width: 160px; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .similares { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 360px; overflow-y: auto; }
    .similares li { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; background: var(--superficie-2); border-radius: var(--r-1); padding: 8px 10px; font-size: var(--t-sm); }
    .desc { color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .btn { align-self: flex-start; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffTriageComponent {
  private api = inject(AdminApi);
  private toast = inject(ToastService);
  session = inject(SessionStore);
  occ = input.required<StaffOccurrenceDetail>();
  updated = output<StaffOccurrenceDetail>();
  names = PRIORITY_NAMES;
  members = signal<StaffMember[]>([]);
  similar = signal<SimilarOccurrence[] | null>(null);
  assignTo = signal('');
  prio = signal('');
  reason = signal('');
  busy = signal(false);
  error = signal<string | null>(null);
  pad = (n: number) => String(n).padStart(5, '0');
  private loadedFor = 0;

  constructor() {
    this.api.staffMembers().subscribe({ next: (r) => this.members.set(r.members), error: () => undefined });
    effect(() => {
      const id = this.occ().id;
      untracked(() => {
        if (id !== this.loadedFor) {
          this.loadedFor = id;
          this.loadSimilar();
        }
      });
    });
  }

  loadSimilar() {
    this.similar.set(null);
    this.api.similar(this.occ().id).subscribe({ next: (r) => this.similar.set(r.items), error: () => this.similar.set([]) });
  }

  private run(obs: ReturnType<AdminApi['assign']>, msg: string, after?: () => void) {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: (o) => {
        this.busy.set(false);
        this.updated.emit(o);
        after?.();
        this.toast.show(msg);
      },
      error: (e) => {
        this.busy.set(false);
        const err = toApiError(e);
        this.error.set(Object.values(err.fields)[0] ?? err.message);
      },
    });
  }

  assign(userId: number | null) {
    this.run(this.api.assign(this.occ().id, userId), userId ? 'Responsável atribuído.' : 'Responsável removido.', () => this.assignTo.set(''));
  }

  savePriority() {
    const p = this.prio() === 'nenhuma' ? null : (this.prio() as Priority);
    this.run(this.api.priority(this.occ().id, p, this.reason().trim()), 'Prioridade atualizada.', () => {
      this.prio.set('');
      this.reason.set('');
    });
  }

  dup(of: number | null) {
    this.run(this.api.duplicate(this.occ().id, of), of ? 'Marcada como duplicata. Nada foi apagado.' : 'Marcação desfeita.', () => this.loadSimilar());
  }
}
