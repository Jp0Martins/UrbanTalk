import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { RelativePipe, plural } from '../core/format';
import { Proposal, ProposalFilters, ProposalSort } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { ProposalCatalog } from '../core/proposal-catalog';
import { SessionStore } from '../core/session.store';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';
import { PaginationComponent } from '../shared/pagination.component';
import { PhaseBadgeComponent } from '../shared/phase-badge.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';
import { VoteButtonComponent } from '../shared/vote-button.component';
import { VoteExplainerComponent } from '../shared/vote-explainer.component';

@Component({
  selector: 'ut-propostas',
  imports: [NeighborhoodInputComponent, AsyncPipe, RouterLink, IconComponent, PageHeaderComponent, PaginationComponent, PhaseBadgeComponent, EmptyStateComponent, ErrorStateComponent, VoteButtonComponent, VoteExplainerComponent, RelativePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Ideias e propostas" description="Sugestões de moradores para melhorar a cidade. Apoie as que fazem sentido para você e ajude a melhorar as outras nos comentários.">
        @if (session.isCitizen()) {
          <a class="btn btn-primario" routerLink="/propostas/nova"><ut-icon name="plus" [size]="18" />Nova proposta</a>
        } @else if (!session.user()) {
          <a class="btn btn-secundario" routerLink="/entrar" [queryParams]="{ volta: '/propostas/nova' }">Entre para propor</a>
        }
      </ut-cabecalho-pagina>

      <ut-explica-voto />

      <form class="filtros painel" (submit)="$event.preventDefault(); apply()" aria-label="Filtrar propostas">
        <div class="campo cresce">
          <label for="p-q">Buscar</label>
          <input id="p-q" class="entrada" type="search" maxlength="100" placeholder="Palavra no título ou na descrição" [value]="f().q ?? ''" (input)="patch({ q: $any($event.target).value })" />
        </div>
        <div class="campo">
          <label for="p-cat">Categoria</label>
          <select id="p-cat" class="entrada" [value]="f().category ?? ''" (change)="patch({ category: num($any($event.target).value) })">
            <option value="">Todas</option>
            @for (c of api.categories$ | async; track c.id) { <option [value]="c.id" [selected]="f().category === c.id">{{ c.name }}</option> }
          </select>
        </div>
        <div class="campo">
          <label for="p-onde">Onde se aplica</label>
          <select id="p-onde" class="entrada" (change)="setMode($any($event.target).value)">
            <option value="" [selected]="mode() === ''">Todas</option>
            <option value="cidade" [selected]="mode() === 'cidade'">Cidade toda</option>
            <option value="bairro" [selected]="mode() === 'bairro'">Um bairro</option>
          </select>
        </div>
        @if (mode() === 'bairro') {
          <div class="campo">
            <label for="p-bairro">Bairro</label>
            <ut-bairro inputId="p-bairro" placeholder="Digite o nome do bairro" [value]="f().neighborhood ?? ''" (committed)="patch({ neighborhood: $event.trim() || null })" />
          </div>
        }
        <div class="campo">
          <label for="p-fase">Fase</label>
          <select id="p-fase" class="entrada" [value]="phaseValue()" (change)="setPhase($any($event.target).value)">
            <option value="">Todas</option>
            <option value="sit:abertas">Em andamento</option>
            <option value="sit:finais">Concluídas (aceita, recusada…)</option>
            @for (s of catalog.all(); track s.id) { <option [value]="s.slug" [selected]="f().status === s.slug">{{ s.name }}</option> }
          </select>
        </div>
        <div class="filtro-acoes">
          <button type="submit" class="btn btn-primario">Filtrar</button>
          @if (hasFilters()) { <button type="button" class="btn btn-texto" (click)="clear()">Limpar</button> }
        </div>
      </form>

      <div class="barra">
        <div class="segmentado" role="tablist" aria-label="Ordenar propostas">
          @for (s of sorts; track s.id) {
            <button type="button" role="tab" [attr.aria-selected]="(f().sort ?? 'votos') === s.id" (click)="setSort(s.id)">{{ s.label }}</button>
          }
        </div>
        <p class="muted tabular" aria-live="polite">{{ totalLabel() }}</p>
      </div>

      @if (loading()) {
        <p class="carregando">Carregando propostas…</p>
      } @else if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (items().length === 0) {
        <ut-vazio icon="sparkle" [title]="hasFilters() ? 'Nenhuma proposta com esses filtros' : 'Ainda não há propostas'" [text]="hasFilters() ? 'Tente outro bairro ou categoria.' : 'Tem uma ideia para a cidade? Descreva o problema que ela resolve e onde se aplica.'">
          @if (session.isCitizen()) { <a class="btn btn-primario btn-sm" routerLink="/propostas/nova">Criar a primeira proposta</a> }
        </ut-vazio>
      } @else {
        <ul class="lista">
          @for (p of items(); track p.id) {
            <li class="item">
              <ut-apoio [proposalId]="p.id" [votes]="p.votes" [voted]="p.votedByMe" [canVote]="p.canVote" [isFinal]="p.isFinal" (changed)="update(p.id, $event)" />
              <a class="corpo" [routerLink]="['/propostas', p.id]">
                <span class="linha"><ut-fase [status]="p.status" />
                  @if (p.neighborhood) { <span class="selo-texto"><ut-icon name="pin" [size]="12" />{{ p.neighborhood.name }}</span> } @else { <span class="selo-texto">Cidade toda</span> }
                  @if (p.category) { <span class="selo-texto">{{ p.category.name }}</span> }
                </span>
                <span class="titulo">{{ p.title }}</span>
                <span class="trecho">{{ p.excerpt }}</span>
                <span class="meta">{{ p.author.name }} · {{ p.createdAt | relativo }} · {{ commentsLabel(p) }}</span>
              </a>
              @if (p.imageUrl) { <img class="miniatura" [src]="p.imageUrl" alt="" loading="lazy" /> }
            </li>
          }
        </ul>
        <ut-paginacao [page]="page()" [totalPages]="totalPages()" (go)="load($event)" />
      }
    </div>
  `,
  styles: `
    ut-explica-voto { display: block; margin-bottom: var(--s-4); }
    .filtros { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: flex-end; padding: var(--s-4); margin-bottom: var(--s-4); }
    .filtros .campo { min-width: 160px; }
    .cresce { flex: 1; min-width: 220px; }
    .filtro-acoes { display: flex; gap: var(--s-2); }
    .barra { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-3); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
    .item { display: flex; gap: var(--s-4); align-items: flex-start; padding: var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); }
    .corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: inherit; }
    .corpo:hover .titulo { color: var(--placa); }
    .linha { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .titulo { font-family: var(--fonte-titulo); font-weight: 600; font-size: var(--t-lg); line-height: 1.2; }
    .trecho { color: var(--texto-2); font-size: var(--t-sm); }
    .meta { color: var(--texto-3); font-size: var(--t-xs); }
    .miniatura { width: 112px; height: 84px; object-fit: cover; border-radius: var(--r-1); flex: none; }
    @media (max-width: 640px) { .miniatura { display: none; } .item { gap: var(--s-3); padding: var(--s-3); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalsPage implements OnInit {
  api = inject(ApiService);
  private part = inject(ParticipationApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  catalog = inject(ProposalCatalog);
  session = inject(SessionStore);

  sorts: { id: ProposalSort; label: string }[] = [
    { id: 'votos', label: 'Mais apoiadas' },
    { id: 'em-alta', label: 'Em alta' },
    { id: 'recentes', label: 'Recentes' },
  ];
  f = signal<ProposalFilters>({ sort: 'votos' });
  items = signal<Proposal[]>([]);
  page = signal(1);
  totalPages = signal(1);
  total = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);

  num = (v: string) => (v ? Number(v) : null);
  // "cidade" no filtro significa propostas sem bairro; qualquer outro texto é um nome de bairro
  mode = signal<'' | 'cidade' | 'bairro'>('');

  setMode(v: string) {
    const m = (v === 'cidade' || v === 'bairro' ? v : '') as '' | 'cidade' | 'bairro';
    this.mode.set(m);
    if (m === 'cidade') this.patch({ neighborhood: 'cidade' });
    else if (this.f().neighborhood) this.patch({ neighborhood: null });
  }
  commentsLabel = (p: Proposal) => plural(p.comments, 'comentário', 'comentários');
  totalLabel = () => plural(this.total(), 'proposta', 'propostas');
  hasFilters = () => {
    const f = this.f();
    return Boolean(f.q || f.category || f.neighborhood || f.status || f.situation);
  };
  phaseValue = () => (this.f().situation ? `sit:${this.f().situation}` : (this.f().status ?? ''));

  ngOnInit() {
    this.catalog.ensure();
    const q = this.route.snapshot.queryParamMap;
    const bairro = q.get('bairro');
    this.f.set({ sort: (q.get('ordem') as ProposalSort) || 'votos', neighborhood: bairro || null, q: q.get('q') });
    this.mode.set(bairro === 'cidade' ? 'cidade' : bairro ? 'bairro' : '');
    this.load();
  }

  patch(p: Partial<ProposalFilters>) {
    this.f.set({ ...this.f(), ...p });
  }

  setPhase(v: string) {
    if (v.startsWith('sit:')) this.patch({ situation: v.slice(4) as 'abertas' | 'finais', status: null });
    else this.patch({ status: v || null, situation: null });
  }

  setSort(s: ProposalSort) {
    this.patch({ sort: s });
    this.load();
  }

  apply() {
    this.load();
  }

  clear() {
    this.f.set({ sort: this.f().sort });
    this.load();
  }

  load(page = 1) {
    this.loading.set(true);
    this.error.set(null);
    const f = this.f();
    // filtros ficam no endereço para poder compartilhar a busca
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { ordem: f.sort !== 'votos' ? f.sort : null, bairro: f.neighborhood ?? null, q: f.q || null } });
    this.part.proposals(f, page).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.page.set(r.page);
        this.totalPages.set(r.totalPages);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loading.set(false);
      },
    });
  }

  update(id: number, r: { votes: number; votedByMe: boolean }) {
    this.items.set(this.items().map((p) => (p.id === id ? { ...p, votes: r.votes, votedByMe: r.votedByMe } : p)));
  }
}
