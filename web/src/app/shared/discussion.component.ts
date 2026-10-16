import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe } from '../core/format';
import { DiscussionComment } from '../core/models';
import { CommentTarget, ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from './avatar.component';
import { IconComponent } from './icon.component';
import { ReportButtonComponent } from './report-button.component';
import { UsefulVoteComponent } from './useful-vote.component';

// conversa de uma discussão ou de uma proposta: respostas em árvore, voto de útil, exclusão e denúncia
@Component({
  selector: 'ut-discussao',
  imports: [RouterLink, NgTemplateOutlet, AvatarComponent, IconComponent, RelativePipe, DatePipe, ReportButtonComponent, UsefulVoteComponent],
  template: `
    <section class="discussao" [attr.aria-labelledby]="'disc-t-' + targetId()">
      <h2 [id]="'disc-t-' + targetId()">{{ heading() }} <span class="muted tabular">({{ total() }})</span></h2>

      @if (loading()) {
        <p class="carregando">Carregando a conversa…</p>
      } @else if (error(); as e) {
        <p class="erro">{{ e }} <button type="button" class="btn btn-texto btn-sm" (click)="load()">Tentar de novo</button></p>
      } @else {
        @if (items().length === 0) {
          <p class="vazio">{{ emptyText() }}</p>
        }
        @if (votable() && items().length > 1) {
          <div class="segmentado ordem" role="group" aria-label="Ordenar comentários">
            <button type="button" [attr.aria-pressed]="order() === 'conversa'" (click)="order.set('conversa')">Ordem da conversa</button>
            <button type="button" [attr.aria-pressed]="order() === 'uteis'" (click)="order.set('uteis')">Mais úteis</button>
          </div>
        }
        <ol class="lista">
          @for (n of thread(); track n.c.id) {
            @let c = n.c;
            <li [id]="'c-' + c.id" [style.--nivel]="n.depth" [class.resposta]="n.depth > 0">
              @if (votable()) {
                <ut-voto-util target="comment" [compact]="true" [targetId]="c.id" [votes]="c.votes ?? 0" [voted]="!!c.votedByMe" [canVote]="!!c.canVote" (changed)="voted(c.id, $event)" />
              }
              <ut-avatar [name]="c.author.name" [initials]="c.author.initials" [staff]="c.author.isStaff" [size]="34" />
              <div class="balao">
                <p class="topo">
                  <strong>{{ c.author.isMe ? c.author.name + ' (você)' : c.author.name }}</strong>
                  @if (c.author.isStaff) { <span class="selo-texto equipe">Equipe</span> }
                  @if (c.author.isDemo) { <span class="selo-texto">Demonstração</span> }
                  <time class="quando" [attr.datetime]="c.createdAt" [title]="c.createdAt | data: true">{{ c.createdAt | relativo }}</time>
                </p>
                @if (c.replyTo && !n.nested) {
                  <p class="citacao"><ut-icon name="arrow-right" [size]="14" />Em resposta a {{ c.replyTo.name ?? 'um comentário' }}{{ c.replyTo.excerpt ? ': “' + c.replyTo.excerpt + '”' : ' (removido)' }}</p>
                }
                <p class="texto">{{ c.body }}</p>
                <div class="acoes">
                  @if (session.user() && !locked()) {
                    <button type="button" class="btn btn-texto btn-sm" (click)="startReply(c)">Responder<span class="sr-only"> a {{ c.author.name }}</span></button>
                  }
                  @if (c.canReport) {
                    <ut-denunciar type="comment" [targetId]="c.id" />
                  }
                  @if (c.canDelete) {
                    <button type="button" class="btn btn-texto btn-sm apagar" (click)="remove(c)">{{ c.author.isMe ? 'Apagar' : 'Remover' }}<span class="sr-only"> comentário</span></button>
                  }
                </div>
                @if (replyTo()?.id === c.id) {
                  <ng-container *ngTemplateOutlet="form; context: { $implicit: c }" />
                }
              </div>
            </li>
          }
        </ol>
        @if (nextAfter()) {
          <button type="button" class="btn btn-secundario btn-sm" (click)="load(true)">Ver mais comentários</button>
        }
      }

      @if (locked()) {
        <p class="aviso"><ut-icon name="lock" [size]="18" />Esta conversa foi encerrada pela moderação e não recebe novas respostas.</p>
      } @else if (!session.user()) {
        <p class="aviso aviso-info"><ut-icon name="info" [size]="18" /><span><a routerLink="/entrar" [queryParams]="{ volta: returnUrl() }">Entre</a> ou <a routerLink="/cadastro">crie uma conta</a> para participar da conversa.</span></p>
      } @else {
        @if (!replyTo()) {
          <ng-container *ngTemplateOutlet="form; context: { $implicit: null }" />
        }
      }

      <ng-template #form let-parent>
        <form class="compor" [class.inline]="!!parent" (submit)="$event.preventDefault(); send()">
          @if (parent) {
            <p class="respondendo">Respondendo a <strong>{{ parent.author.name }}</strong>
              <button type="button" class="btn btn-texto btn-sm" (click)="replyTo.set(null)">Cancelar</button>
            </p>
          }
          <label class="sr-only" [for]="'novo-' + targetId()">Escreva seu comentário</label>
          <textarea class="entrada" rows="3" maxlength="1000" [id]="'novo-' + targetId()" [placeholder]="parent ? 'Escreva sua resposta…' : 'Escreva seu comentário…'" [value]="draft()" (input)="draft.set($any($event.target).value)" [attr.aria-invalid]="!!sendError()"></textarea>
          @if (sendError()) {
            <p class="erro" role="alert">{{ sendError() }}</p>
          }
          <div class="rodape">
            <span class="dica">Sem dados pessoais de outras pessoas. Respeito sempre.</span>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="!draft().trim() || sending()"><ut-icon name="send" [size]="16" />{{ sending() ? 'Enviando…' : parent ? 'Responder' : 'Comentar' }}</button>
          </div>
        </form>
      </ng-template>
    </section>
  `,
  styles: `
    .discussao { display: flex; flex-direction: column; gap: var(--s-3); }
    h2 { font-size: var(--t-lg); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }
    .lista li { display: flex; gap: 10px; align-items: flex-start; margin-left: calc(min(var(--nivel, 0), 3) * 28px); }
    .lista li.resposta { position: relative; }
    .lista li.resposta::before { content: ''; position: absolute; left: -16px; top: 0; bottom: 0; border-left: 2px solid var(--linha); }
    .ordem { align-self: flex-start; }
    .compor.inline { margin-top: var(--s-3); }
    @media (max-width: 560px) { .lista li { margin-left: calc(min(var(--nivel, 0), 2) * 14px); } .lista li.resposta::before { left: -8px; } .lista ut-avatar { display: none; } }
    .lista li:target .balao { outline: 2px solid var(--faixa); }
    .balao { flex: 1; min-width: 0; background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: 10px 14px; }
    .topo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: var(--t-sm); }
    .quando { color: var(--texto-3); font-size: var(--t-xs); }
    .citacao { display: flex; gap: 4px; align-items: center; font-size: var(--t-xs); color: var(--texto-2); margin-top: 4px; border-left: 3px solid var(--linha-forte); padding-left: 8px; }
    .texto { white-space: pre-line; overflow-wrap: anywhere; margin-top: 4px; }
    .acoes { display: flex; gap: 4px; margin: 4px 0 -4px -8px; flex-wrap: wrap; align-items: center; }
    .apagar { color: var(--texto-2); }
    .vazio { color: var(--texto-2); }
    .compor { display: flex; flex-direction: column; gap: var(--s-2); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-3); }
    .respondendo { font-size: var(--t-sm); display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; background: var(--placa-clara); padding: 4px 10px; border-radius: var(--r-1); }
    .rodape { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .aviso { align-items: center; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscussionComponent implements OnInit {
  private api = inject(ParticipationApi);
  private toast = inject(ToastService);
  session = inject(SessionStore);

  target = input.required<CommentTarget>();
  targetId = input.required<number>();
  locked = input(false);
  heading = input('Conversa');
  emptyText = input('Ainda não há comentários. Comece a conversa.');
  initialTotal = input(0);
  totalChange = output<number>();

  items = signal<DiscussionComment[]>([]);
  nextAfter = signal<number | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  total = signal(0);
  draft = signal('');
  sending = signal(false);
  sendError = signal<string | null>(null);
  replyTo = signal<DiscussionComment | null>(null);
  // votos de "útil" só existem nas discussões dos fóruns
  votable = input(false);
  order = signal<'conversa' | 'uteis'>('conversa');

  // respostas ficam logo abaixo do comentário respondido; os soltos (pai removido) voltam para o nível de cima
  thread = computed(() => {
    const all = this.items();
    const ids = new Set(all.map((c) => c.id));
    const kids = new Map<number, DiscussionComment[]>();
    const roots: DiscussionComment[] = [];
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId)) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c]);
      else roots.push(c);
    }
    if (this.order() === 'uteis') roots.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.id - b.id);
    const out: { c: DiscussionComment; depth: number; nested: boolean }[] = [];
    const walk = (c: DiscussionComment, depth: number) => {
      out.push({ c, depth, nested: depth > 0 });
      for (const k of kids.get(c.id) ?? []) walk(k, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  });

  returnUrl = () => (typeof location !== 'undefined' ? location.pathname : '/');

  ngOnInit() {
    this.total.set(this.initialTotal());
    this.load();
  }

  load(more = false) {
    if (!more) this.loading.set(true);
    this.error.set(null);
    this.api.comments(this.target(), this.targetId(), more ? this.nextAfter() : null).subscribe({
      next: (r) => {
        this.items.set(more ? [...this.items(), ...r.items] : r.items);
        this.nextAfter.set(r.nextAfter);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(toApiError(e).message);
      },
    });
  }

  startReply(c: DiscussionComment) {
    this.replyTo.set(c);
    this.sendError.set(null);
    setTimeout(() => document.getElementById(`novo-${this.targetId()}`)?.focus());
  }

  voted(id: number, r: { votes: number; votedByMe: boolean }) {
    this.items.set(this.items().map((c) => (c.id === id ? { ...c, votes: r.votes, votedByMe: r.votedByMe } : c)));
  }

  send() {
    const body = this.draft().trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.api.comment(this.target(), this.targetId(), body, this.replyTo()?.id ?? null).subscribe({
      next: (c) => {
        this.sending.set(false);
        this.draft.set('');
        this.replyTo.set(null);
        // só entra na lista o que o servidor salvou
        if (!this.nextAfter()) this.items.set([...this.items(), c]);
        this.setTotal(this.total() + 1);
        this.toast.show('Comentário publicado.');
      },
      error: (e) => {
        this.sending.set(false);
        this.sendError.set(toApiError(e).message);
      },
    });
  }

  remove(c: DiscussionComment) {
    if (!confirm(c.author.isMe ? 'Apagar seu comentário?' : 'Remover este comentário por moderação?')) return;
    this.api.deleteComment(c.id).subscribe({
      next: () => {
        this.items.set(this.items().filter((x) => x.id !== c.id));
        this.setTotal(Math.max(0, this.total() - 1));
        this.toast.show('Comentário removido.', 'info');
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }

  private setTotal(n: number) {
    this.total.set(n);
    this.totalChange.emit(n);
  }
}
