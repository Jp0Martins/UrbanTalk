import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe, plural } from '../core/format';
import { ForumDetail, Topic, TopicSort, parseOccurrenceCode } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { PaginationComponent } from '../shared/pagination.component';
import { ReportButtonComponent } from '../shared/report-button.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';
import { UsefulVoteComponent } from '../shared/useful-vote.component';

// selo dos tópicos de apoio, reaproveitado na página da discussão
export const INSTITUTIONAL_LABEL = 'Conteúdo do UrbanTalk';

// separa tags digitadas com vírgula ou espaço, sem repetir
export const splitTags = (s: string) => [...new Set(s.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))];

@Component({
  selector: 'ut-forum',
  imports: [RouterLink, IconComponent, PaginationComponent, EmptyStateComponent, ErrorStateComponent, RelativePipe, DatePipe, ReportButtonComponent, UsefulVoteComponent],
  template: `
    <nav class="trilha" aria-label="Você está em"><a routerLink="/comunidade/foruns">Fóruns</a><span aria-hidden="true" class="sep"> › </span><span>{{ forum()?.name ?? '…' }}</span></nav>

    @if (error(); as e) {
      <ut-erro [message]="e" (retry)="load()" />
    } @else if (forum(); as f) {
      @if (f.status === 'pendente') {
        <p class="aviso aviso-atencao"><ut-icon name="clock" [size]="18" /><span>Este fórum está aguardando aprovação da equipe. Só você e a equipe conseguem vê-lo por enquanto; as discussões ficam liberadas depois da aprovação.</span></p>
      } @else if (f.status === 'recusado') {
        <p class="aviso aviso-erro"><ut-icon name="alert" [size]="18" /><span>A equipe não aprovou este fórum. Ele não aparece para outras pessoas.</span></p>
      }
      @if (f.hidden) { <p class="aviso aviso-erro"><ut-icon name="shield" [size]="18" /><span>Fórum ocultado pela moderação. Só a equipe vê.</span></p> }

      <header class="cab">
        <span class="ico" [class.oficial]="f.kind === 'oficial'"><ut-icon [name]="f.icon" [size]="26" /></span>
        <div class="cab-txt">
          <p class="tipo">{{ f.kind === 'oficial' ? 'Fórum oficial' : 'Fórum da comunidade' }} · {{ f.theme.name }}</p>
          <h1>{{ f.name }}</h1>
          <p class="desc">{{ f.description }}</p>
          <p class="meta">
            @if (f.neighborhoodName) { <span class="lugar"><ut-icon name="pin" [size]="14" />{{ f.neighborhoodName }}</span> }
            @for (t of f.tags; track t) { <button type="button" class="tag" (click)="setTag(t)">#{{ t }}</button> }
          </p>
        </div>
        <div class="cab-acoes">
          @if (session.user()) {
            @if (f.status === 'ativo') {
              <button type="button" class="btn" [class.btn-primario]="!f.following" [class.btn-secundario]="f.following" [attr.aria-pressed]="f.following" [disabled]="busyFollow()" (click)="toggleFollow()">
                <ut-icon [name]="f.following ? 'check' : 'plus'" [size]="18" />{{ f.following ? 'Seguindo' : 'Seguir' }}
              </button>
            }
            @if (f.canEdit) { <a class="btn btn-secundario" [routerLink]="['/comunidade/f', f.slug, 'editar']"><ut-icon name="edit" [size]="18" />Editar</a> }
            @if (f.canReport) { <ut-denunciar type="forum" [targetId]="f.id" /> }
          } @else {
            <a class="btn btn-primario" routerLink="/entrar" [queryParams]="{ volta: '/comunidade/f/' + f.slug }">Entre para participar</a>
          }
        </div>
      </header>

      <div class="grade">
        <div class="coluna">
          <div class="barra">
            <div class="segmentado ordem" role="group" aria-label="Ordenar discussões">
              @for (s of sorts; track s.id) {
                <button type="button" [attr.aria-pressed]="sort() === s.id" (click)="setSort(s.id)">{{ s.label }}</button>
              }
            </div>
            @if (f.canPost) {
              <button type="button" class="btn btn-primario" (click)="composing.set(!composing())" [attr.aria-expanded]="composing()"><ut-icon name="plus" [size]="18" />Nova discussão</button>
            }
          </div>
          <form class="busca" role="search" aria-label="Procurar neste fórum" (submit)="$event.preventDefault(); search()">
            <label for="tq" class="sr-only">Procurar neste fórum</label>
            <input id="tq" class="entrada" type="search" maxlength="80" placeholder="Procurar neste fórum" [value]="q()" (input)="q.set($any($event.target).value)" (search)="search()" />
            <button type="submit" class="btn btn-secundario"><ut-icon name="search" [size]="18" /><span class="sr-only">Buscar</span></button>
          </form>
          @if (tag()) {
            <p class="filtro-tag">Mostrando discussões com <strong>#{{ tag() }}</strong> <button type="button" class="btn btn-texto btn-sm" (click)="setTag(null)">Ver todas</button></p>
          }

          @if (composing()) {
            <form class="painel novo" (submit)="$event.preventDefault(); create()" novalidate aria-labelledby="novo-t">
              <h2 id="novo-t">Nova discussão</h2>
              <div class="campo">
                <label for="t-titulo">Título</label>
                <input id="t-titulo" class="entrada" maxlength="140" [value]="title()" (input)="title.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['title']" />
                @if (fields()['title']) { <span class="erro">{{ fields()['title'] }}</span> }
              </div>
              <div class="campo">
                <label for="t-texto">Texto</label>
                <textarea id="t-texto" class="entrada" rows="5" maxlength="3000" [value]="body()" (input)="body.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['body']"></textarea>
                <span class="dica">Conte o contexto. Não publique endereço, telefone ou foto que identifique moradores.</span>
                @if (fields()['body']) { <span class="erro">{{ fields()['body'] }}</span> }
              </div>
              <div class="duas">
                <div class="campo">
                  <label for="t-tags">Tags <span class="muted">(opcional)</span></label>
                  <input id="t-tags" class="entrada" maxlength="120" placeholder="Ex.: calçada, escola" [value]="tagsText()" (input)="tagsText.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['tags']" />
                  <span class="dica">Até 5, separadas por vírgula.</span>
                  @if (fields()['tags']) { <span class="erro">{{ fields()['tags'] }}</span> }
                </div>
                <div class="campo">
                  <label for="t-occ">Reclamação relacionada <span class="muted">(opcional)</span></label>
                  <input id="t-occ" class="entrada" maxlength="12" placeholder="Ex.: UT-00012" [value]="occText()" (input)="occText.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['occurrenceId']" />
                  <span class="dica">Liga a discussão a uma reclamação que já existe, sem criar outra.</span>
                  @if (fields()['occurrenceId']) { <span class="erro">{{ fields()['occurrenceId'] }}</span> }
                </div>
              </div>
              @if (formError()) { <p class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ formError() }}</p> }
              <div class="acoes">
                <button type="button" class="btn btn-secundario" (click)="composing.set(false)">Cancelar</button>
                <button type="submit" class="btn btn-primario" [disabled]="saving()">{{ saving() ? 'Publicando…' : 'Publicar discussão' }}</button>
              </div>
            </form>
          }

          @if (loadingTopics()) {
            <p class="carregando">Carregando discussões…</p>
          } @else if (topics().length === 0) {
            <ut-vazio icon="chat" [title]="q() || tag() ? 'Nenhuma discussão encontrada' : 'Nenhuma discussão por aqui ainda'" [text]="q() || tag() ? 'Tente outras palavras ou veja todas as discussões.' : 'Abra a primeira conversa: uma dúvida, um alerta ou uma sugestão.'">
              @if (f.canPost && !composing()) { <button type="button" class="btn btn-primario" (click)="composing.set(true)"><ut-icon name="plus" [size]="18" />Abrir a primeira discussão</button> }
            </ut-vazio>
          } @else {
            <ul class="topicos">
              @for (t of topics(); track t.id) {
                <li class="topico" [class.inst]="t.isInstitutional">
                  @if (!t.isInstitutional) {
                    <ut-voto-util target="topic" [targetId]="t.id" [votes]="t.votes" [voted]="t.votedByMe" [canVote]="t.canVote" (changed)="voted(t.id, $event)" />
                  }
                  <a class="t-corpo" [routerLink]="['/comunidade/discussoes', t.id]">
                    <span class="t-linha">
                      @if (t.pinned) { <span class="selo-texto"><ut-icon name="pin" [size]="12" />Fixada</span> }
                      @if (t.isInstitutional) { <span class="selo-texto publica">{{ institutional }}</span> }
                      @if (t.locked) { <span class="selo-texto"><ut-icon name="lock" [size]="12" />Encerrada</span> }
                      @if (t.occurrenceCode) { <span class="selo-texto"><ut-icon name="file" [size]="12" />{{ t.occurrenceCode }}</span> }
                    </span>
                    <span class="t-titulo">{{ t.title }}</span>
                    <span class="t-trecho">{{ t.excerpt }}</span>
                    <span class="t-meta">
                      @if (t.author; as a) { {{ a.isMe ? 'Você' : a.name }}@if (a.isStaff) { (equipe)} · }
                      {{ replies(t) }} · {{ t.lastActivityAt | relativo }}
                      @for (g of t.tags; track g) { <span class="t-tag">#{{ g }}</span> }
                    </span>
                  </a>
                </li>
              }
            </ul>
            <ut-paginacao [page]="page()" [totalPages]="totalPages()" (go)="loadTopics($event)" />
          }
        </div>

        <aside class="lado" aria-label="Sobre o fórum">
          <section class="painel sobre">
            <h2>Sobre</h2>
            <dl class="numeros">
              <div><dt>Discussões</dt><dd class="tabular">{{ f.topics }}</dd></div>
              <div><dt>Participantes</dt><dd class="tabular">{{ f.participants }}</dd></div>
              <div><dt>Seguidores</dt><dd class="tabular">{{ f.followers }}</dd></div>
            </dl>
            <p class="nota">
              @if (f.creator; as c) { Criado por {{ c.isMe ? 'você' : c.name }} em {{ f.createdAt | data }}. } @else { Fórum mantido pela equipe do UrbanTalk. }
              @if (f.lastActivity) { Última atividade {{ f.lastActivity | relativo }}. }
            </p>
            @if (f.neighborhoodName) {
              <div class="links-bairro">
                <a class="btn btn-secundario btn-sm" routerLink="/mapa" [queryParams]="{ bairro: f.neighborhoodName }"><ut-icon name="map" [size]="16" />Reclamações do bairro</a>
                <a class="btn btn-texto btn-sm" routerLink="/propostas" [queryParams]="{ bairro: f.neighborhoodName }">Propostas do bairro</a>
              </div>
            }
          </section>
          <section class="painel sobre">
            <h2>Regras</h2>
            @if (f.rules) {
              <p class="regras">{{ f.rules }}</p>
            }
            <ul class="combinados">
              <li>Fale do problema, não da pessoa.</li>
              <li>Nada de dados pessoais de ninguém.</li>
              <li>Discussão não é reclamação oficial: para a equipe acompanhar, <a routerLink="/registrar">registre uma reclamação</a>.</li>
            </ul>
          </section>
        </aside>
      </div>
    } @else {
      <p class="carregando">Carregando…</p>
    }
  `,
  styles: `
    :host { display: block; }
    .trilha { font-size: var(--t-sm); color: var(--texto-2); margin-bottom: var(--s-4); }
    .sep { white-space: pre; }
    .aviso { margin-bottom: var(--s-4); }
    .cab { display: flex; gap: var(--s-4); align-items: flex-start; margin-bottom: var(--s-5); flex-wrap: wrap; }
    .cab-txt { flex: 1 1 320px; min-width: 0; }
    .cab-acoes { display: flex; gap: var(--s-2); flex-wrap: wrap; align-items: center; }
    .ico { width: 52px; height: 52px; flex: none; border-radius: var(--r-2); background: var(--placa-clara); color: var(--placa); display: grid; place-items: center; }
    .ico.oficial { background: var(--placa); color: #fff; }
    .tipo { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--texto-2); }
    .desc { color: var(--texto-2); margin-top: 4px; max-width: 70ch; }
    .meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; font-size: var(--t-sm); }
    .lugar { display: inline-flex; gap: 4px; align-items: center; color: var(--texto-2); }
    .tag { border: 0; background: var(--placa-clara); color: var(--placa); font-weight: 600; border-radius: var(--r-1); padding: 2px 8px; cursor: pointer; font: inherit; font-size: var(--t-xs); font-weight: 600; }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 320px); gap: var(--s-6); align-items: start; }
    .coluna { display: flex; flex-direction: column; gap: var(--s-3); min-width: 0; }
    .barra { display: flex; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; align-items: center; }
    .ordem { flex-wrap: wrap; }
    .busca { display: flex; gap: var(--s-2); }
    .busca .entrada { flex: 1; }
    .filtro-tag { font-size: var(--t-sm); color: var(--texto-2); }
    .novo { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
    .novo h2 { font-size: var(--t-lg); }
    .duas { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .acoes { display: flex; justify-content: flex-end; gap: var(--s-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .topicos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
    .topico { display: flex; gap: var(--s-3); padding: var(--s-3) var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); align-items: flex-start; }
    .topico:hover { border-color: var(--linha-forte); }
    .topico.inst { border-left: 4px solid var(--placa); }
    .t-corpo { display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: inherit; min-width: 0; flex: 1; }
    .t-corpo:hover { color: inherit; }
    .t-corpo:hover .t-titulo { color: var(--placa); }
    .t-linha { display: flex; gap: 6px; flex-wrap: wrap; }
    .t-linha:empty { display: none; }
    .t-titulo { font-family: var(--fonte-titulo); font-weight: 600; font-size: var(--t-lg); line-height: 1.2; }
    .t-trecho { color: var(--texto-2); font-size: var(--t-sm); overflow-wrap: anywhere; }
    .t-meta { color: var(--texto-3); font-size: var(--t-xs); display: flex; gap: 6px; flex-wrap: wrap; }
    .t-tag { color: var(--placa); font-weight: 600; }
    .lado { display: flex; flex-direction: column; gap: var(--s-4); }
    .sobre { padding: var(--s-4) var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
    .sobre h2 { font-size: var(--t-lg); }
    .numeros { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-2); margin: 0; }
    .numeros div { background: var(--superficie-2); border-radius: var(--r-1); padding: 8px 10px; }
    .numeros dt { font-size: var(--t-xs); color: var(--texto-2); }
    .numeros dd { margin: 0; font-family: var(--fonte-titulo); font-size: var(--t-xl); font-weight: 700; }
    .nota { font-size: var(--t-xs); color: var(--texto-2); }
    .links-bairro { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .regras { white-space: pre-line; font-size: var(--t-sm); }
    .combinados { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 6px; font-size: var(--t-sm); color: var(--texto-2); }
    @media (max-width: 1000px) { .grade { grid-template-columns: 1fr; } }
    @media (max-width: 560px) {
      .duas { grid-template-columns: 1fr; }
      .cab-acoes { width: 100%; }
      .topico { padding: var(--s-3); }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumPage {
  private api = inject(ParticipationApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  session = inject(SessionStore);
  slug = input.required<string>();

  institutional = INSTITUTIONAL_LABEL;
  sorts: { id: TopicSort; label: string }[] = [
    { id: 'atividade', label: 'Ativas' },
    { id: 'populares', label: 'Populares' },
    { id: 'recentes', label: 'Novas' },
    { id: 'respostas', label: 'Mais respondidas' },
  ];
  forum = signal<ForumDetail | null>(null);
  error = signal<string | null>(null);
  topics = signal<Topic[]>([]);
  loadingTopics = signal(true);
  sort = signal<TopicSort>('atividade');
  q = signal('');
  tag = signal<string | null>(null);
  page = signal(1);
  totalPages = signal(1);
  busyFollow = signal(false);

  composing = signal(false);
  title = signal('');
  body = signal('');
  tagsText = signal('');
  occText = signal('');
  saving = signal(false);
  fields = signal<Record<string, string>>({});
  formError = signal<string | null>(null);

  replies = (t: Topic) => plural(t.replies, 'resposta', 'respostas');

  constructor() {
    // a mesma página é reaproveitada ao trocar de fórum: recarrega quando o endereço muda
    effect(() => {
      this.slug();
      untracked(() => {
        this.forum.set(null);
        this.composing.set(false);
        this.q.set('');
        this.tag.set(null);
        this.load();
      });
    });
  }

  load() {
    this.error.set(null);
    this.api.forum(this.slug()).subscribe({
      next: (f) => {
        this.forum.set(f);
        this.loadTopics(1);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  setSort(s: TopicSort) {
    this.sort.set(s);
    this.loadTopics(1);
  }

  setTag(t: string | null) {
    this.tag.set(t);
    this.loadTopics(1);
  }

  search() {
    this.loadTopics(1);
  }

  loadTopics(page: number) {
    this.loadingTopics.set(true);
    this.api.topics(this.slug(), { sort: this.sort(), q: this.q().trim() || null, tag: this.tag(), page }).subscribe({
      next: (r) => {
        this.topics.set(r.items);
        this.page.set(r.page);
        this.totalPages.set(r.totalPages);
        this.loadingTopics.set(false);
      },
      error: (e) => {
        this.loadingTopics.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  voted(id: number, r: { votes: number; votedByMe: boolean }) {
    this.topics.set(this.topics().map((t) => (t.id === id ? { ...t, votes: r.votes, votedByMe: r.votedByMe } : t)));
  }

  toggleFollow() {
    const f = this.forum();
    if (!f) return;
    this.busyFollow.set(true);
    this.api.followForum(f.slug, !f.following).subscribe({
      next: (r) => {
        this.busyFollow.set(false);
        this.forum.set({ ...f, following: r.following, followers: r.followers });
        this.toast.show(r.following ? 'Você vai ser avisado sobre novas discussões.' : 'Você deixou de seguir este fórum.', 'info');
      },
      error: (e) => {
        this.busyFollow.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  create() {
    const code = this.occText().trim();
    const occurrenceId = code ? parseOccurrenceCode(code) : null;
    if (code && !occurrenceId) {
      this.fields.set({ occurrenceId: 'Use o código no formato UT-00012.' });
      return;
    }
    this.saving.set(true);
    this.fields.set({});
    this.formError.set(null);
    this.api.createTopic(this.slug(), { title: this.title(), body: this.body(), tags: splitTags(this.tagsText()), occurrenceId }).subscribe({
      next: (t) => {
        this.saving.set(false);
        this.toast.show('Discussão publicada. Você vai ser avisado quando alguém responder.');
        this.router.navigate(['/comunidade/discussoes', t.id]);
      },
      error: (e) => {
        this.saving.set(false);
        const err = toApiError(e);
        this.fields.set(err.fields);
        if (!Object.keys(err.fields).length) this.formError.set(err.message);
      },
    });
  }
}
