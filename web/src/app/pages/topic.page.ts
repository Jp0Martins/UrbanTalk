import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { DatePipe } from '../core/format';
import { TopicDetail } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { StatusBadgeComponent } from '../shared/badges';
import { DiscussionComponent } from '../shared/discussion.component';
import { IconComponent } from '../shared/icon.component';
import { PhaseBadgeComponent } from '../shared/phase-badge.component';
import { ReportButtonComponent } from '../shared/report-button.component';
import { ErrorStateComponent } from '../shared/states';
import { INSTITUTIONAL_LABEL } from './forum.page';
import { UsefulVoteComponent } from '../shared/useful-vote.component';

@Component({
  selector: 'ut-topico',
  imports: [RouterLink, AvatarComponent, IconComponent, StatusBadgeComponent, PhaseBadgeComponent, DiscussionComponent, ReportButtonComponent, ErrorStateComponent, DatePipe, UsefulVoteComponent, TranslatePipe],
  template: `
    <div>
      @if (error(); as e) {
        <ut-erro [message]="e" [retryable]="notFound() === false" (retry)="load()" />
        <p><a routerLink="/comunidade/foruns">{{ 'auto.m08ef2cbf6e' | translate }}</a></p>
      } @else if (topic(); as t) {
        <nav class="trilha" [aria-label]="'auto.m8fb521bd83' | translate"><a routerLink="/comunidade/foruns">{{ 'auto.m17f0d26d2c' | translate }}</a><span aria-hidden="true" class="sep"> › </span><a [routerLink]="['/comunidade/f', t.forum.slug]">{{ t.forum.name }}</a></nav>
        <article class="topico" [class.inst]="t.isInstitutional">
          @if (!t.isInstitutional) {
            <div class="voto-lado"><ut-voto-util target="topic" [targetId]="t.id" [votes]="t.votes" [voted]="t.votedByMe" [canVote]="t.canVote" (changed)="topic.set({ ...t, votes: $event.votes, votedByMe: $event.votedByMe })" /></div>
          }
          <div class="conteudo">
          <div class="selos">
            @if (t.isInstitutional) { <span class="selo-texto publica"><ut-icon name="info" [size]="12" />{{ institutional }}</span> }
            @if (t.pinned) { <span class="selo-texto">{{ 'auto.m3cd092ac55' | translate }}</span> }
            @if (t.locked) { <span class="selo-texto"><ut-icon name="lock" [size]="12" />{{ 'auto.m621d09d9ca' | translate }}</span> }
          </div>
          <h1>{{ t.title }}</h1>
          <p class="autor">
            @if (t.author; as a) {
              <ut-avatar [name]="a.name" [initials]="a.initials" [staff]="a.isStaff" [size]="30" />
              <span><strong>{{ a.isMe ? a.name + ' (você)' : a.name }}</strong>@if (a.isStaff) { <span class="selo-texto equipe">{{ 'auto.me03e3996dc' | translate }}</span> } · {{ t.createdAt | data: true }}</span>
            } @else {
              <span class="muted">{{ 'auto.mcb860ea9cf' | translate }}</span>
            }
          </p>
          <p class="corpo">{{ t.body }}</p>
          @if (t.tags.length) {
            <p class="tags">@for (g of t.tags; track g) { <span class="tag">#{{ g }}</span> }</p>
          }

          @if (t.occurrence; as o) {
            <a class="ligado" [routerLink]="['/ocorrencias', o.id]"><ut-icon [name]="o.icon" />Reclamação relacionada: {{ o.category }} · {{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood }} <span class="muted tabular">{{ o.code }}</span><ut-status [status]="o.status" /></a>
          }
          @if (t.proposal; as p) {
            <a class="ligado" [routerLink]="['/propostas', p.id]"><ut-icon name="sparkle" />Proposta: {{ p.title }} <ut-fase [status]="p.status" /></a>
          }

          <div class="acoes">
            @if (session.user()) {
              <button type="button" class="btn btn-secundario btn-sm" [attr.aria-pressed]="t.following" (click)="toggleFollow()">
                <ut-icon [name]="t.following ? 'check' : 'plus'" [size]="16" />{{ t.following ? ('auto.m037c9cb05d' | translate) : ('auto.m577b8c5e00' | translate) }}
              </button>
            }
            @if (t.canReport) { <ut-denunciar type="topic" [targetId]="t.id" /> }
            @if (t.canModerate) {
              <button type="button" class="btn btn-texto btn-sm" (click)="flags({ pinned: !t.pinned })">{{ t.pinned ? ('auto.m400d46699b' | translate) : ('auto.m3787069895' | translate) }}</button>
              <button type="button" class="btn btn-texto btn-sm" (click)="flags({ locked: !t.locked })">{{ t.locked ? ('auto.mbb398a8112' | translate) : ('auto.m53a0fd0b77' | translate) }}</button>
            }
            @if (t.canDelete) {
              <button type="button" class="btn btn-texto btn-sm apagar" (click)="remove()">{{ t.author?.isMe ? ('auto.mebfc13a989' | translate) : ('auto.m9b15b1047d' | translate) }}</button>
            }
          </div>
          </div>
        </article>

        <ut-discussao target="topics" [votable]="true" [targetId]="t.id" [locked]="t.locked" [initialTotal]="t.replies" heading="Respostas" [emptyText]="'auto.mfe3f0d30b2' | translate" />
      } @else {
        <p class="carregando">{{ 'auto.m1aa0f82f07' | translate }}</p>
      }
    </div>
  `,
  styles: `
    :host { display: block; max-width: 860px; }
    .trilha { font-size: var(--t-sm); color: var(--texto-2); margin-bottom: var(--s-4); }
    .sep { white-space: pre; }
    .topico { background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5); display: flex; gap: var(--s-4); margin-bottom: var(--s-6); align-items: flex-start; }
    .conteudo { display: flex; flex-direction: column; gap: var(--s-3); min-width: 0; flex: 1; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: var(--placa-clara); color: var(--placa); font-weight: 600; border-radius: var(--r-1); padding: 2px 8px; font-size: var(--t-xs); }
    @media (max-width: 560px) { .topico { padding: var(--s-4); gap: var(--s-3); } }
    .topico.inst { border-left: 4px solid var(--placa); }
    .selos { display: flex; gap: 6px; flex-wrap: wrap; }
    .selos:empty { display: none; }
    .autor { display: flex; gap: var(--s-2); align-items: center; font-size: var(--t-sm); flex-wrap: wrap; }
    .corpo { white-space: pre-line; overflow-wrap: anywhere; font-size: 1.0625rem; line-height: 1.6; }
    .ligado { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; padding: 10px 12px; border: 1px solid var(--linha); border-radius: var(--r-1); background: var(--superficie-2); text-decoration: none; color: inherit; }
    .acoes { display: flex; gap: var(--s-2); flex-wrap: wrap; align-items: center; border-top: 1px solid var(--linha); padding-top: var(--s-3); }
    .apagar { color: var(--perigo); margin-left: auto; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicPage {
  private api = inject(ParticipationApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  session = inject(SessionStore);
  id = input.required<string>();

  institutional = INSTITUTIONAL_LABEL;
  topic = signal<TopicDetail | null>(null);
  error = signal<string | null>(null);
  notFound = signal(false);

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  load() {
    const id = Number(this.id());
    this.error.set(null);
    this.topic.set(null);
    this.api.topic(id).subscribe({
      next: (t) => this.topic.set(t),
      error: (e) => {
        const err = toApiError(e);
        this.notFound.set(err.status === 404);
        this.error.set(err.message);
      },
    });
  }

  toggleFollow() {
    const t = this.topic()!;
    this.api.follow('topics', t.id, !t.following).subscribe({
      next: (r) => {
        this.topic.set({ ...t, following: r.following });
        this.toast.show(r.following ? 'Você vai receber aviso de novas respostas.' : 'Você deixou de acompanhar esta discussão.', 'info');
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }

  flags(f: { pinned?: boolean; locked?: boolean }) {
    this.api.topicFlags(this.topic()!.id, f).subscribe({
      next: (t) => {
        this.topic.set(t);
        this.toast.show('Discussão atualizada.');
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }

  remove() {
    const t = this.topic()!;
    if (!confirm(t.author?.isMe ? 'Remover sua discussão? As respostas também deixam de aparecer.' : 'Remover esta discussão por moderação? A ação fica registrada.')) return;
    this.api.deleteTopic(t.id).subscribe({
      next: () => {
        this.toast.show('Discussão removida.', 'info');
        this.router.navigate(['/comunidade/f', t.forum.slug]);
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }
}
