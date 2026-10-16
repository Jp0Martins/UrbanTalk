import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../core/api-error';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

// apoio a uma proposta: o número mostrado é sempre o devolvido pelo servidor
@Component({
  selector: 'ut-apoio',
  imports: [IconComponent],
  template: `
    <button type="button" class="apoio" [class.ativo]="voted()" [class.grande]="size() === 'lg'" [attr.aria-pressed]="voted()" [disabled]="busy() || (session.user() && !canVote() && !voted())" (click)="toggle()" [title]="title()">
      <ut-icon [name]="voted() ? 'check' : 'arrow-up'" [size]="size() === 'lg' ? 22 : 18" />
      <span class="n tabular">{{ votes() }}</span>
      <span class="rot">{{ voted() ? 'Apoiada' : 'Apoiar' }}</span>
    </button>
  `,
  styles: `
    .apoio {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
      min-width: 64px; min-height: 64px; padding: 6px 8px; border-radius: var(--r-2);
      border: 1px solid var(--linha-forte); background: var(--superficie); color: var(--texto); cursor: pointer;
    }
    .apoio:hover:not(:disabled) { border-color: var(--placa); }
    .apoio.ativo { background: var(--placa); border-color: var(--placa); color: #fff; }
    .apoio:disabled { cursor: not-allowed; opacity: 0.7; }
    .n { font-family: var(--fonte-titulo); font-weight: 700; font-size: var(--t-lg); line-height: 1.1; }
    .rot { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .grande { min-width: 96px; min-height: 88px; }
    .grande .n { font-size: var(--t-2xl); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoteButtonComponent {
  private api = inject(ParticipationApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  session = inject(SessionStore);
  proposalId = input.required<number>();
  votes = input.required<number>();
  voted = input.required<boolean>();
  canVote = input.required<boolean>();
  isFinal = input(false);
  size = input<'md' | 'lg'>('md');
  changed = output<{ votes: number; votedByMe: boolean }>();
  busy = signal(false);

  title() {
    if (!this.session.user()) return 'Entre para apoiar';
    if (this.session.isStaff()) return 'Contas de funcionário não votam';
    if (this.isFinal()) return 'Votação encerrada';
    return this.voted() ? 'Clique para retirar seu apoio' : 'Apoiar esta proposta';
  }

  toggle() {
    if (!this.session.user()) {
      this.router.navigate(['/entrar'], { queryParams: { volta: `/propostas/${this.proposalId()}` } });
      return;
    }
    this.busy.set(true);
    this.api.vote(this.proposalId(), !this.voted()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.changed.emit(r);
        this.toast.show(r.votedByMe ? 'Apoio registrado.' : 'Apoio retirado.', 'info');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }
}
