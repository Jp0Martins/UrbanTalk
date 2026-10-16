import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { FeedFilter, OccurrenceDetail, Post } from '../core/models';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { StatusBadgeComponent } from '../shared/badges';
import { IconComponent } from '../shared/icon.component';
import { PostCardComponent } from '../shared/post-card.component';
import { ErrorStateComponent } from '../shared/states';

const MAX = 500;

@Component({
  selector: 'ut-comunidade',
  imports: [RouterLink, AvatarComponent, IconComponent, StatusBadgeComponent, PostCardComponent, ErrorStateComponent],
  template: `
    @if (!session.user()) {
      <div class="convite-entrar">
        <ut-icon name="chat" [size]="28" />
        <div>
          <p class="vazio-titulo">O feed é o mural rápido de quem usa o UrbanTalk</p>
          <p class="muted">Entre para ler e publicar alertas, dúvidas e boas notícias. Os fóruns podem ser lidos sem conta.</p>
          <div class="acoes-convite">
            <a routerLink="/entrar" [queryParams]="{ volta: '/comunidade' }" class="btn btn-primario">Entrar</a>
            <a routerLink="/cadastro" class="btn btn-secundario">Criar conta</a>
            <a routerLink="/comunidade/foruns" class="btn btn-texto">Ver os fóruns</a>
          </div>
        </div>
      </div>
    } @else {
    <div>
      <div class="grade">
        <div class="coluna">
          <form class="compor" (submit)="$event.preventDefault(); publish()" aria-labelledby="compor-t">
            <h2 id="compor-t" class="sr-only">Nova publicação</h2>
            <div class="compor-topo">
              <ut-avatar [name]="session.user()!.name" [initials]="myInitials()" [staff]="session.isStaff()" />
              <div class="campo cresce">
                <label for="texto-post" class="sr-only">O que está acontecendo no seu bairro?</label>
                <textarea id="texto-post" class="entrada" rows="3" [attr.maxlength]="max" placeholder="O que está acontecendo no seu bairro?" [value]="draft()" (input)="draft.set($any($event.target).value)" [attr.aria-invalid]="!!composeError()" aria-describedby="contador"></textarea>
              </div>
            </div>

            @if (linked(); as o) {
              <div class="ligada">
                <ut-icon [name]="o.category.icon" [size]="20" />
                <span class="lig-texto"><strong>Sobre {{ o.code }}</strong> · {{ o.category.name }}, {{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood?.name ?? 'Cidade toda' }}</span>
                <ut-status [status]="o.status" />
                <button type="button" class="btn btn-texto btn-sm" (click)="unlink()">Remover<span class="sr-only"> ligação com a reclamação</span></button>
              </div>
            } @else if (linking()) {
              <div class="ligar">
                <label for="codigo" class="rotulo">Código da reclamação</label>
                <div class="ligar-linha">
                  <input id="codigo" class="entrada" placeholder="Ex.: UT-00012" maxlength="12" [value]="code()" (input)="code.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); findOccurrence()" />
                  <button type="button" class="btn btn-secundario btn-sm" (click)="findOccurrence()">Ligar</button>
                  <button type="button" class="btn btn-texto btn-sm" (click)="linking.set(false)">Cancelar</button>
                </div>
                @if (linkError()) {
                  <p class="erro" role="alert">{{ linkError() }}</p>
                }
                <p class="dica">O código aparece na página de cada reclamação, como UT-00012.</p>
              </div>
            }

            @if (composeError()) {
              <p class="erro" role="alert">{{ composeError() }}</p>
            }
            <div class="compor-rodape">
              @if (!linked() && !linking()) {
                <button type="button" class="btn btn-texto btn-sm" (click)="linking.set(true)"><ut-icon name="pin" [size]="16" />Ligar a uma reclamação</button>
              }
              <span id="contador" class="contador tabular" [class.alerta]="remaining() < 40">{{ remaining() }}</span>
              <button type="submit" class="btn btn-primario" [disabled]="draft().trim().length < 3 || publishing() || remaining() < 0">
                <ut-icon name="send" [size]="18" />{{ publishing() ? 'Publicando…' : 'Publicar' }}
              </button>
            </div>
          </form>

          @if (occurrenceFilter(); as id) {
            <div class="aviso aviso-info filtro-ativo" role="status">
              <ut-icon name="info" />
              <span>Mostrando só as conversas sobre a reclamação UT-{{ pad(id) }}.</span>
              <button type="button" class="btn btn-texto btn-sm" (click)="clearOccurrenceFilter()">Ver todas</button>
            </div>
          } @else {
            <div class="segmentado abas" role="tablist" aria-label="Filtrar publicações">
              @for (t of tabs; track t.id) {
                <button type="button" role="tab" [attr.aria-selected]="filter() === t.id" (click)="setFilter(t.id)">{{ t.label }}</button>
              }
            </div>
          }

          <section class="feed" aria-live="polite" [attr.aria-busy]="loading()">
            @if (loading()) {
              @for (i of [1, 2, 3]; track i) {
                <div class="post-falso" aria-hidden="true">
                  <span class="esqueleto bola"></span>
                  <span class="linhas"><span class="esqueleto l1"></span><span class="esqueleto l2"></span><span class="esqueleto l3"></span></span>
                </div>
              }
              <p class="sr-only">Carregando publicações…</p>
            } @else if (error(); as e) {
              <ut-erro [message]="e" (retry)="load()" />
            } @else if (posts().length === 0) {
              <div class="vazio-feed">
                <div>
                  <p class="vazio-titulo">{{ emptyTitle() }}</p>
                  <p class="muted">{{ emptyText() }}</p>
                </div>
              </div>
            } @else {
              @for (p of posts(); track p.id) {
                <ut-publicacao [post]="p" (changed)="replace($event)" (removed)="drop($event)" />
              }
              @if (nextBefore()) {
                <button type="button" class="btn btn-secundario mais" [disabled]="loadingMore()" (click)="loadMore()">
                  {{ loadingMore() ? 'Carregando…' : 'Carregar publicações anteriores' }}
                </button>
              } @else {
                <p class="fim">Você chegou ao começo da conversa.</p>
              }
            }
          </section>
        </div>

        <aside class="lado">
          <section class="painel regras" aria-labelledby="regras-t">
            <h2 id="regras-t">Combinados da comunidade</h2>
            <ul>
              <li>Fale do problema, não da pessoa. Respeito sempre.</li>
              <li>Nada de dados pessoais: telefone, endereço de alguém, placa de carro.</li>
              <li>Publicação não é reclamação oficial. Para a equipe acompanhar, <a routerLink="/registrar">registre uma reclamação</a>.</li>
              <li>A equipe pode remover conteúdo que fuja desses combinados.</li>
            </ul>
          </section>
          <a class="painel atalho" routerLink="/comunidade/foruns">
            <span class="at-ico"><ut-icon name="users" [size]="22" /></span>
            <span><strong>Fóruns</strong><span>Discussões organizadas por tema, com votos e respostas.</span></span>
          </a>
        </aside>
      </div>
    </div>
    }
  `,
  styles: `
    :host { display: block; }
    .convite-entrar { display: flex; gap: var(--s-4); align-items: flex-start; padding: var(--s-6) var(--s-5); border: 1px dashed var(--linha-forte); border-radius: var(--r-2); background: var(--superficie-2); max-width: 760px; }
    .convite-entrar ut-icon { color: var(--placa); }
    .acoes-convite { display: flex; gap: var(--s-2); flex-wrap: wrap; margin-top: var(--s-4); }
    .grade { display: grid; grid-template-columns: minmax(0, 680px) minmax(0, 300px); gap: var(--s-6); align-items: start; }
    .coluna { display: flex; flex-direction: column; gap: var(--s-4); min-width: 0; }
    .compor { background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-4) var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); box-shadow: var(--sombra-2); }
    .compor-topo { display: flex; gap: var(--s-3); align-items: flex-start; }
    .cresce { flex: 1; }
    .compor textarea { border: 0; padding: 8px 0; min-height: 84px; font-size: 1.0625rem; background: transparent; resize: vertical; }
    .compor textarea:focus-visible { box-shadow: none; outline: none; }
    .compor:focus-within { border-color: var(--linha-forte); }
    .compor-rodape { display: flex; align-items: center; gap: var(--s-3); border-top: 1px solid var(--linha); padding-top: var(--s-3); flex-wrap: wrap; }
    .contador { margin-left: auto; font-size: var(--t-xs); color: var(--texto-3); }
    .contador.alerta { color: var(--perigo); font-weight: 600; }
    .ligada { display: flex; align-items: center; gap: var(--s-2); padding: 8px 12px; background: var(--placa-clara); border-radius: var(--r-1); flex-wrap: wrap; }
    .ligada ut-icon { color: var(--placa); }
    .lig-texto { flex: 1; min-width: 160px; font-size: var(--t-sm); }
    .ligar { display: flex; flex-direction: column; gap: 6px; background: var(--superficie-2); padding: var(--s-3); border-radius: var(--r-1); }
    .ligar-linha { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
    .ligar-linha .entrada { max-width: 180px; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .abas { align-self: flex-start; }
    .filtro-ativo { align-items: center; }
    .feed { display: flex; flex-direction: column; gap: var(--s-3); }
    .mais { align-self: center; }
    .fim { text-align: center; color: var(--texto-3); font-size: var(--t-sm); padding: var(--s-3) 0; }
    .post-falso { display: flex; gap: var(--s-3); padding: var(--s-5); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); }
    .bola { width: 42px; height: 42px; border-radius: 50%; flex: none; }
    .linhas { flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .l1 { height: 14px; width: 30%; } .l2 { height: 14px; width: 92%; } .l3 { height: 14px; width: 70%; }
    .vazio-feed { display: flex; gap: var(--s-5); align-items: center; padding: var(--s-5); background: var(--superficie); border: 1.5px dashed var(--linha-forte); border-radius: var(--r-2); }
    .vazio-titulo { font-family: var(--fonte-titulo); font-size: var(--t-lg); font-weight: 600; }
    .lado { display: flex; flex-direction: column; gap: var(--s-4); position: sticky; top: var(--s-5); }
    .regras { padding: var(--s-5); }
    .regras h2 { font-size: var(--t-lg); margin-bottom: var(--s-3); }
    .regras ul { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 8px; color: var(--texto-2); font-size: var(--t-sm); }
    .atalho { display: flex; gap: var(--s-3); align-items: center; padding: var(--s-4); text-decoration: none; color: inherit; }
    .atalho:hover { color: inherit; border-color: var(--linha-forte); }
    .at-ico { width: 44px; height: 44px; border-radius: 50%; background: var(--placa); color: #fff; display: grid; place-items: center; flex: none; }
    .atalho strong { display: block; }
    .atalho span span { font-size: var(--t-sm); color: var(--texto-2); }
    @media (max-width: 1000px) {
      .grade { grid-template-columns: 1fr; }
      .lado { position: static; order: -1; }
      .regras, .atalho { display: none; }
    }
    @media (max-width: 560px) {
      .compor { padding: var(--s-3) var(--s-4); }
      .compor-topo ut-avatar { display: none; }
      .vazio-feed { flex-direction: column; text-align: center; }
      .abas { align-self: stretch; display: grid; grid-template-columns: repeat(3, 1fr); }
      .abas button { padding: 0 8px; font-size: var(--t-sm); justify-content: center; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  session = inject(SessionStore);

  max = MAX;
  tabs: { id: FeedFilter; label: string }[] = [
    { id: 'recentes', label: 'Recentes' },
    { id: 'ocorrencias', label: 'Sobre reclamações' },
    { id: 'minhas', label: 'Minhas' },
  ];
  filter = signal<FeedFilter>('recentes');
  occurrenceFilter = signal<number | null>(null);
  posts = signal<Post[]>([]);
  nextBefore = signal<number | null>(null);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);

  draft = signal('');
  publishing = signal(false);
  composeError = signal<string | null>(null);
  linked = signal<OccurrenceDetail | null>(null);
  linking = signal(false);
  code = signal('');
  linkError = signal<string | null>(null);

  remaining = computed(() => MAX - this.draft().length);
  myInitials = computed(() => {
    const p = (this.session.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  });
  emptyTitle = computed(() =>
    this.occurrenceFilter()
      ? 'Ninguém conversou sobre esta reclamação ainda'
      : this.filter() === 'minhas'
        ? 'Você ainda não publicou nada'
        : this.filter() === 'ocorrencias'
          ? 'Nenhuma conversa ligada a reclamações'
          : 'A conversa ainda não começou',
  );
  emptyText = computed(() =>
    this.filter() === 'minhas' && !this.occurrenceFilter()
      ? 'Conte o que você tem visto no seu bairro. Sua publicação aparece aqui.'
      : 'Escreva a primeira publicação. Pode ser uma dúvida, um alerta ou uma boa notícia do bairro.',
  );

  pad = (id: number) => String(id).padStart(5, '0');

  ngOnInit() {
    if (!this.session.user()) return;
    const f = this.route.snapshot.queryParamMap.get('filtro');
    if (f === 'minhas' || f === 'ocorrencias') this.filter.set(f);
    const id = Number(this.route.snapshot.queryParamMap.get('ocorrencia'));
    if (Number.isInteger(id) && id > 0) {
      this.occurrenceFilter.set(id);
      this.link(id);
    }
    this.load();
  }

  setFilter(f: FeedFilter) {
    if (this.filter() === f) return;
    this.filter.set(f);
    this.load();
  }

  clearOccurrenceFilter() {
    this.occurrenceFilter.set(null);
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: {} });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.api.feed(this.filter(), null, this.occurrenceFilter()).subscribe({
      next: (r) => {
        this.posts.set(r.items);
        this.nextBefore.set(r.nextBefore);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loading.set(false);
      },
    });
  }

  loadMore() {
    this.loadingMore.set(true);
    this.api.feed(this.filter(), this.nextBefore(), this.occurrenceFilter()).subscribe({
      next: (r) => {
        // evita repetir itens se alguém publicou no meio do caminho
        const seen = new Set(this.posts().map((p) => p.id));
        this.posts.set([...this.posts(), ...r.items.filter((p) => !seen.has(p.id))]);
        this.nextBefore.set(r.nextBefore);
        this.loadingMore.set(false);
      },
      error: (e) => {
        this.loadingMore.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  findOccurrence() {
    const m = /(\d{1,7})\s*$/.exec(this.code().trim());
    if (!m) {
      this.linkError.set('Digite o código no formato UT-00012.');
      return;
    }
    this.link(Number(m[1]));
  }

  private link(id: number) {
    this.linkError.set(null);
    this.api.get(id).subscribe({
      next: (o) => {
        this.linked.set(o);
        this.linking.set(false);
        this.code.set('');
      },
      error: (e) => {
        const err = toApiError(e);
        this.linkError.set(err.status === 404 ? 'Não encontramos uma reclamação com esse código.' : err.message);
        this.linking.set(true);
      },
    });
  }

  unlink() {
    this.linked.set(null);
  }

  publish() {
    const body = this.draft().trim();
    if (body.length < 3 || this.publishing()) return;
    this.publishing.set(true);
    this.composeError.set(null);
    this.api.createPost(body, this.linked()?.id ?? null).subscribe({
      next: (p) => {
        this.publishing.set(false);
        this.draft.set('');
        // a publicação só entra no feed depois de salva no servidor
        if (!this.occurrenceFilter() || p.occurrence?.id === this.occurrenceFilter()) this.posts.set([p, ...this.posts()]);
        if (!this.occurrenceFilter()) this.linked.set(null);
        this.toast.show('Publicado. Obrigado por compartilhar!');
      },
      error: (e) => {
        this.publishing.set(false);
        this.composeError.set(toApiError(e).message);
      },
    });
  }

  replace(p: Post) {
    this.posts.set(this.posts().map((x) => (x.id === p.id ? p : x)));
  }

  drop(id: number) {
    this.posts.set(this.posts().filter((x) => x.id !== id));
  }
}
