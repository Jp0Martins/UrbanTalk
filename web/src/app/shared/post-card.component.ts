import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe } from '../core/format';
import { Post, PostComment } from '../core/models';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from './avatar.component';
import { StatusBadgeComponent } from './badges';
import { IconComponent } from './icon.component';
import { ReportButtonComponent } from './report-button.component';

// uma publicação do feed, com curtida, comentários e exclusão
@Component({
  selector: 'ut-publicacao',
  imports: [RouterLink, AvatarComponent, IconComponent, StatusBadgeComponent, RelativePipe, DatePipe, ReportButtonComponent],
  template: `
    @let p = post();
    <article class="post" [attr.aria-labelledby]="'autor-' + p.id">
      <ut-avatar [name]="p.author.name" [initials]="p.author.initials" [staff]="p.author.isStaff" />
      <div class="corpo">
        <header class="topo">
          <span class="nome" [id]="'autor-' + p.id">{{ p.author.isMe ? p.author.name + ' (você)' : p.author.name }}</span>
          @if (p.author.isStaff) {
            <span class="selo-texto equipe">Equipe UrbanTalk</span>
          }
          @if (p.author.isDemo) {
            <span class="selo-texto">Demonstração</span>
          }
          <time class="quando" [attr.datetime]="p.createdAt" [title]="p.createdAt | data: true">{{ p.createdAt | relativo }}</time>
        </header>
        <p class="texto">{{ p.body }}</p>

        @if (p.occurrence; as o) {
          <a class="ocorrencia" [routerLink]="['/ocorrencias', o.id]">
            <span class="oc-ico"><ut-icon [name]="o.categoryIcon" [size]="20" /></span>
            <span class="oc-textos">
              <span class="oc-titulo">{{ o.categoryName }} <span class="tabular muted">· {{ o.code }}</span></span>
              <span class="oc-local">{{ o.street ? o.street + ', ' : '' }}{{ o.neighborhoodName }}</span>
            </span>
            <ut-status [status]="o.status" />
          </a>
        } @else if (p.author.isMe && session.isCitizen()) {
          <a class="transformar" routerLink="/registrar" [queryParams]="{ descricao: p.body }">
            <ut-icon name="plus" [size]="16" />É um problema na rua? Transforme em reclamação para a equipe acompanhar
          </a>
        }

        <div class="acoes">
          <button type="button" class="acao" [class.ativo]="p.likedByMe" [attr.aria-pressed]="p.likedByMe" [disabled]="liking()" (click)="toggleLike()">
            <ut-icon [name]="p.likedByMe ? 'heart-fill' : 'heart'" [size]="18" />
            <span class="tabular">{{ p.likes }}</span>
            <span class="sr-only">{{ p.likedByMe ? 'Remover apoio' : 'Apoiar' }}</span>
            <span class="rot" aria-hidden="true">{{ p.likedByMe ? 'Apoiado' : 'Apoiar' }}</span>
          </button>
          <button type="button" class="acao" [attr.aria-expanded]="open()" [attr.aria-controls]="'coment-' + p.id" (click)="toggleComments()">
            <ut-icon name="chat" [size]="18" />
            <span class="tabular">{{ p.comments }}</span>
            <span class="rot">{{ p.comments === 1 ? 'comentário' : 'comentários' }}</span>
          </button>
          @if (p.canReport) {
            <ut-denunciar type="post" [targetId]="p.id" />
          }
          @if (p.canDelete) {
            @if (!confirmDelete()) {
              <button type="button" class="acao apagar" (click)="confirmDelete.set(true)">
                <ut-icon name="delete" [size]="18" /><span class="rot">{{ p.author.isMe ? 'Apagar' : 'Remover' }}</span>
              </button>
            } @else {
              <span class="confirma" role="group" aria-label="Confirmar exclusão">
                <span>{{ p.author.isMe ? 'Apagar sua publicação?' : 'Remover por moderação?' }}</span>
                <button type="button" class="btn btn-texto btn-sm" (click)="confirmDelete.set(false)">Não</button>
                <button type="button" class="btn btn-perigo btn-sm" (click)="remove()">Sim, apagar</button>
              </span>
            }
          }
        </div>

        @if (open()) {
          <section class="comentarios" [id]="'coment-' + p.id" aria-label="Comentários">
            @if (loadingComments()) {
              <p class="carregando">Carregando comentários…</p>
            } @else if (commentsError(); as e) {
              <p class="erro">{{ e }} <button type="button" class="btn btn-texto btn-sm" (click)="loadComments()">Tentar de novo</button></p>
            } @else {
              @if (comments().length === 0) {
                <p class="vazio">Ainda sem comentários. Seja a primeira pessoa a responder.</p>
              }
              <ol>
                @for (c of comments(); track c.id) {
                  <li>
                    <ut-avatar [name]="c.author.name" [initials]="c.author.initials" [staff]="c.author.isStaff" [size]="32" />
                    <div class="balao">
                      <p class="c-topo">
                        <strong>{{ c.author.name }}</strong>
                        @if (c.author.isStaff) { <span class="selo-texto equipe">Equipe</span> }
                        <span class="quando">{{ c.createdAt | relativo }}</span>
                        @if (c.canReport) {
                          <ut-denunciar class="c-apagar" type="post_comment" [targetId]="c.id" />
                        }
                        @if (c.canDelete) {
                          <button type="button" class="btn btn-texto btn-sm c-apagar" (click)="removeComment(c)">Apagar<span class="sr-only"> comentário</span></button>
                        }
                      </p>
                      <p class="c-texto">{{ c.body }}</p>
                    </div>
                  </li>
                }
              </ol>
              @if (nextAfter()) {
                <button type="button" class="btn btn-texto btn-sm" (click)="loadComments(true)">Ver mais comentários</button>
              }
            }
            <form class="responder" (submit)="$event.preventDefault(); sendComment()">
              <label class="sr-only" [for]="'novo-c-' + p.id">Escreva um comentário</label>
              <input class="entrada" [id]="'novo-c-' + p.id" maxlength="300" placeholder="Escreva um comentário…" [value]="draft()" (input)="draft.set($any($event.target).value)" />
              <button type="submit" class="btn btn-primario btn-sm" [disabled]="draft().trim().length === 0 || sending()">
                <ut-icon name="send" [size]="16" />{{ sending() ? 'Enviando…' : 'Comentar' }}
              </button>
            </form>
            @if (commentError()) {
              <p class="erro" role="alert">{{ commentError() }}</p>
            }
          </section>
        }
      </div>
    </article>
  `,
  styles: `
    .post { display: flex; gap: var(--s-3); padding: var(--s-5); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); box-shadow: var(--sombra); }
    .corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--s-2); }
    .topo { display: flex; align-items: center; gap: 6px var(--s-2); flex-wrap: wrap; }
    .nome { font-weight: 700; }
    .quando { color: var(--texto-3); font-size: var(--t-xs); }
    .texto { white-space: pre-line; overflow-wrap: anywhere; font-size: 1.0625rem; line-height: 1.55; }
    .ocorrencia {
      display: flex; align-items: center; gap: var(--s-3); padding: 10px 12px; margin-top: 4px;
      border: 1px solid var(--linha); border-radius: var(--r-1); background: var(--superficie-2);
      text-decoration: none; color: inherit; flex-wrap: wrap;
    }
    .ocorrencia:hover { border-color: var(--linha-forte); color: inherit; background: var(--concreto); }
    .oc-ico { width: 38px; height: 38px; border-radius: 10px; background: var(--placa-clara); color: var(--placa); display: grid; place-items: center; flex: none; }
    .oc-textos { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .oc-titulo { font-weight: 600; font-size: var(--t-sm); }
    .oc-local { font-size: var(--t-xs); color: var(--texto-2); }
    .transformar { display: inline-flex; gap: 6px; align-items: center; font-size: var(--t-sm); font-weight: 500; margin-top: 2px; }
    .acoes { display: flex; gap: var(--s-1); align-items: center; flex-wrap: wrap; margin: 2px 0 0 -10px; }
    .acao {
      display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 10px; border: 0; border-radius: var(--r-1);
      background: transparent; color: var(--texto-2); cursor: pointer; font-size: var(--t-sm); font-weight: 500;
    }
    .acao:hover:not(:disabled) { background: var(--superficie-2); color: var(--texto); }
    .acao.ativo { color: var(--placa); }
    .acao.ativo .rot { font-weight: 600; }
    .acao.apagar { margin-left: auto; }
    .confirma { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; font-size: var(--t-sm); flex-wrap: wrap; }
    .comentarios { border-top: 1px solid var(--linha); margin-top: var(--s-2); padding-top: var(--s-3); display: flex; flex-direction: column; gap: var(--s-3); }
    .comentarios ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }
    .comentarios li { display: flex; gap: 10px; }
    .balao { background: var(--superficie-2); border-radius: var(--r-1); padding: 8px 12px; min-width: 0; flex: 1; }
    .c-topo { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: var(--t-sm); }
    .c-apagar { margin-left: auto; min-height: 28px; }
    .c-texto { white-space: pre-line; overflow-wrap: anywhere; font-size: var(--t-sm); }
    .vazio { color: var(--texto-2); font-size: var(--t-sm); }
    .responder { display: flex; gap: var(--s-2); }
    .responder .entrada { min-height: 40px; border-radius: var(--r-1); padding: 8px 16px; }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    @media (max-width: 560px) {
      .post { padding: var(--s-4); }
      .post > ut-avatar { display: none; }
      .rot { display: none; }
      .responder { flex-direction: column; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostCardComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  session = inject(SessionStore);

  post = input.required<Post>();
  // aberta a partir de um aviso: já mostra os comentários
  startOpen = input(false);
  changed = output<Post>();
  removed = output<number>();

  open = signal(false);
  liking = signal(false);
  confirmDelete = signal(false);
  comments = signal<PostComment[]>([]);
  nextAfter = signal<number | null>(null);
  loadingComments = signal(false);
  commentsError = signal<string | null>(null);
  draft = signal('');
  sending = signal(false);
  commentError = signal<string | null>(null);
  hasMore = computed(() => this.nextAfter() !== null);

  ngOnInit() {
    if (this.startOpen()) this.toggleComments();
  }

  toggleLike() {
    const p = this.post();
    const want = !p.likedByMe;
    this.liking.set(true);
    // o número mostrado é sempre o que o servidor devolveu
    this.api.like(p.id, want).subscribe({
      next: (r) => {
        this.liking.set(false);
        this.changed.emit({ ...p, likes: r.likes, likedByMe: r.likedByMe });
      },
      error: (e) => {
        this.liking.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  toggleComments() {
    this.open.set(!this.open());
    if (this.open() && this.comments().length === 0) this.loadComments();
  }

  loadComments(more = false) {
    this.loadingComments.set(!more);
    this.commentsError.set(null);
    this.api.comments(this.post().id, more ? this.nextAfter() : null).subscribe({
      next: (r) => {
        this.comments.set(more ? [...this.comments(), ...r.items] : r.items);
        this.nextAfter.set(r.nextAfter);
        this.loadingComments.set(false);
      },
      error: (e) => {
        this.loadingComments.set(false);
        this.commentsError.set(toApiError(e).message);
      },
    });
  }

  sendComment() {
    const body = this.draft().trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    this.commentError.set(null);
    this.api.comment(this.post().id, body).subscribe({
      next: (c) => {
        this.sending.set(false);
        this.draft.set('');
        this.comments.set([...this.comments(), c]);
        this.changed.emit({ ...this.post(), comments: this.post().comments + 1 });
      },
      error: (e) => {
        this.sending.set(false);
        this.commentError.set(toApiError(e).message);
      },
    });
  }

  removeComment(c: PostComment) {
    this.api.deleteComment(c.id).subscribe({
      next: () => {
        this.comments.set(this.comments().filter((x) => x.id !== c.id));
        this.changed.emit({ ...this.post(), comments: Math.max(0, this.post().comments - 1) });
        this.toast.show('Comentário apagado.', 'info');
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }

  remove() {
    const p = this.post();
    this.api.deletePost(p.id).subscribe({
      next: () => {
        this.removed.emit(p.id);
        this.toast.show(p.author.isMe ? 'Publicação apagada.' : 'Publicação removida por moderação.', 'info');
      },
      error: (e) => {
        this.confirmDelete.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }
}
