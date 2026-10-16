import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../core/api-error';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

// voto de relevância ("útil") em discussão ou comentário; separado de confirmações e de apoio a propostas
@Component({
  selector: 'ut-voto-util',
  imports: [IconComponent],
  template: `
    <button type="button" class="voto" [class.ativo]="voted()" [class.compacto]="compact()" [attr.aria-pressed]="voted()" [disabled]="busy() || (!!session.user() && !canVote() && !voted())" (click)="toggle()" [title]="title()">
      <ut-icon name="arrow-up" [size]="compact() ? 15 : 18" />
      <span class="n tabular">{{ votes() }}</span>
      <span class="sr-only">{{ votes() === 1 ? 'voto' : 'votos' }} de útil. {{ title() }}</span>
    </button>
  `,
  styles: `
    .voto {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
      min-width: 44px; min-height: 52px; padding: 4px; border-radius: var(--r-1);
      border: 1px solid var(--linha); background: var(--superficie); color: var(--texto-2); cursor: pointer;
    }
    .voto:hover:not(:disabled) { border-color: var(--placa); color: var(--placa); }
    .voto.ativo { background: var(--placa-clara); border-color: var(--placa); color: var(--placa); }
    .voto:disabled { cursor: default; opacity: 0.75; }
    .n { font-weight: 700; font-size: var(--t-sm); line-height: 1.1; }
    .compacto { flex-direction: row; gap: 4px; min-height: 32px; min-width: 0; padding: 2px 8px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsefulVoteComponent {
  private api = inject(ParticipationApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  session = inject(SessionStore);
  target = input.required<'topic' | 'comment'>();
  targetId = input.required<number>();
  votes = input.required<number>();
  voted = input.required<boolean>();
  canVote = input.required<boolean>();
  compact = input(false);
  // para voltar à página certa depois do login
  returnTo = input<string>('');
  changed = output<{ votes: number; votedByMe: boolean }>();
  busy = signal(false);

  title() {
    if (!this.session.user()) return 'Entre para votar';
    if (!this.canVote() && !this.voted()) return 'Não dá para votar no próprio conteúdo';
    return this.voted() ? 'Clique para retirar seu voto' : 'Marcar como útil';
  }

  toggle() {
    if (!this.session.user()) {
      this.router.navigate(['/entrar'], { queryParams: { volta: this.returnTo() || this.router.url } });
      return;
    }
    this.busy.set(true);
    const call = this.target() === 'topic' ? this.api.topicVote(this.targetId(), !this.voted()) : this.api.commentVote(this.targetId(), !this.voted());
    call.subscribe({
      next: (r) => {
        this.busy.set(false);
        this.changed.emit(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }
}
