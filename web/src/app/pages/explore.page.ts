import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { RelativePipe } from '../core/format';
import { ExploreData, SearchHit, SearchResult, SearchType } from '../core/models';
import { SessionStore } from '../core/session.store';
import { StatusBadgeComponent } from '../shared/badges';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { PhaseBadgeComponent } from '../shared/phase-badge.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';

const TYPES: { id: Exclude<SearchType, 'todos'>; label: string }[] = [
  { id: 'ocorrencias', label: 'Reclamações' },
  { id: 'propostas', label: 'Propostas' },
  { id: 'topicos', label: 'Discussões' },
  { id: 'foruns', label: 'Fóruns' },
  { id: 'publicacoes', label: 'Publicações' },
];

@Component({
  selector: 'ut-explorar',
  imports: [AsyncPipe, NgTemplateOutlet, RouterLink, IconComponent, PageHeaderComponent, PaginationComponent, StatusBadgeComponent, PhaseBadgeComponent, EmptyStateComponent, ErrorStateComponent, RelativePipe, NeighborhoodInputComponent],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Explorar" description="O que está acontecendo em Sorocaba: reclamações, discussões, propostas e resoluções recentes." />

      <form class="busca painel" role="search" (submit)="$event.preventDefault(); submit()">
        <div class="campo cresce">
          <label for="busca-g">Buscar no UrbanTalk</label>
          <div class="busca-wrap">
            <ut-icon name="search" [size]="20" />
            <input id="busca-g" class="entrada" type="search" maxlength="100" placeholder="Ex.: poste apagado, ciclovia, UT-00012" [value]="q()" (input)="q.set($any($event.target).value)" />
          </div>
        </div>
        <div class="campo">
          <label for="b-tipo">Em</label>
          <select id="b-tipo" class="entrada" (change)="type.set($any($event.target).value)">
            <option value="todos" [selected]="type() === 'todos'">Tudo</option>
            @for (t of types; track t.id) { <option [value]="t.id" [selected]="type() === t.id">{{ t.label }}</option> }
          </select>
        </div>
        <div class="campo">
          <label for="b-cat">Categoria</label>
          <select id="b-cat" class="entrada" (change)="category.set(num($any($event.target).value))">
            <option value="">Todas</option>
            @for (c of api.categories$ | async; track c.id) { <option [value]="c.id" [selected]="category() === c.id">{{ c.name }}</option> }
          </select>
        </div>
        <div class="campo">
          <label for="b-bairro">Bairro</label>
          <ut-bairro inputId="b-bairro" placeholder="Qualquer bairro" [value]="hood()" (valueChange)="hood.set($event)" />
        </div>
        <button type="submit" class="btn btn-primario" [disabled]="q().trim().length < 2">Buscar</button>
        @if (result()) { <button type="button" class="btn btn-texto" (click)="clear()">Voltar ao Explorar</button> }
        @if (searchError()) { <p class="erro" role="alert">{{ searchError() }}</p> }
      </form>

      @if (searching()) {
        <p class="carregando">Buscando…</p>
      } @else if (result(); as r) {
        <section aria-live="polite" aria-labelledby="res-t">
          <h2 id="res-t" class="sec">Resultados para “{{ r.q }}”</h2>
          @if (r.publicOnly) { <p class="dica">Você está vendo só conteúdo público. <a routerLink="/entrar" [queryParams]="{ volta: '/explorar?q=' + r.q }">Entre</a> para buscar também nas publicações da comunidade.</p> }
          @if (r.groups; as g) {
            @if (totalAll(r) === 0) {
              <ut-vazio icon="search" title="Nada encontrado" text="Tente outra palavra, tire o filtro de bairro ou categoria, ou procure pelo código da reclamação (ex.: UT-00012)." />
            }
            @for (t of types; track t.id) {
              @if (g[t.id].total > 0) {
                <div class="grupo">
                  <h3>{{ t.label }} <span class="muted tabular">({{ g[t.id].total }})</span></h3>
                  <ul class="hits">@for (h of g[t.id].items; track h.id) { <li><ng-container *ngTemplateOutlet="hit; context: { $implicit: h, t: t.id }" /></li> }</ul>
                  @if (g[t.id].total > g[t.id].items.length) { <button type="button" class="btn btn-texto btn-sm" (click)="type.set(t.id); run(1)">Ver todos os {{ g[t.id].total }} em {{ t.label }}</button> }
                </div>
              }
            }
          } @else {
            @if (!r.items?.length) {
              <ut-vazio icon="search" title="Nada encontrado nesta categoria" text="Tente buscar em Tudo ou use outras palavras." />
            } @else {
              <ul class="hits">@for (h of r.items; track h.id) { <li><ng-container *ngTemplateOutlet="hit; context: { $implicit: h, t: r.type }" /></li> }</ul>
              <ut-paginacao [page]="r.page!" [totalPages]="r.totalPages!" (go)="run($event)" />
            }
          }
        </section>
      } @else if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (data(); as d) {
        <div class="grade">
          <section class="painel bloco perto" aria-labelledby="perto-t">
            <div class="b-topo">
              <h2 id="perto-t">Problemas perto de você</h2>
              <div class="perto-acoes">
                <button type="button" class="btn btn-secundario btn-sm" (click)="locate()" [disabled]="locating()"><ut-icon name="locate" [size]="16" />{{ locating() ? 'Localizando…' : 'Usar minha localização' }}</button>
                <label class="sr-only" for="perto-bairro">Ou digite um bairro</label>
                <ut-bairro inputId="perto-bairro" class="perto-bairro" placeholder="Ou digite um bairro…" (committed)="nearHood($event)" />
              </div>
            </div>
            @if (geoError()) { <p class="erro">{{ geoError() }}</p> }
            @if (d.nearMode === null) {
              <p class="dica">Sua localização é usada só nesta busca, não é salva. Mostramos reclamações abertas num raio de {{ d.nearRadiusM / 1000 }} km.</p>
            } @else if (d.near.length === 0) {
              <p class="muted">Nenhuma reclamação aberta {{ d.nearMode === 'local' ? 'num raio de ' + d.nearRadiusM / 1000 + ' km' : 'neste bairro' }}.</p>
            } @else {
              <ul class="occs">@for (o of d.near; track o.id) { <li><ng-container *ngTemplateOutlet="occ; context: { $implicit: o }" /></li> }</ul>
            }
          </section>

          <section class="painel bloco" aria-labelledby="rec-t">
            <div class="b-topo"><h2 id="rec-t">Reclamações recentes</h2><a routerLink="/mapa" class="btn btn-texto btn-sm">Ver no mapa</a></div>
            @if (d.recent.length === 0) { <p class="muted">Ainda não há reclamações registradas.</p> }
            <ul class="occs">@for (o of d.recent; track o.id) { <li><ng-container *ngTemplateOutlet="occ; context: { $implicit: o }" /></li> }</ul>
          </section>

          <section class="painel bloco" aria-labelledby="res-r-t">
            <h2 id="res-r-t">Resoluções informadas recentemente</h2>
            @if (d.resolutions.length === 0) { <p class="muted">Nenhuma resolução registrada ainda.</p> }
            <ul class="lista">
              @for (r of d.resolutions; track r.occurrenceId) {
                <li>
                  <a [routerLink]="['/ocorrencias', r.occurrenceId]"><ut-icon [name]="r.icon" [size]="16" />{{ r.category }} · {{ r.place }}</a>
                  <span class="selos"><span class="selo-texto">Resolução informada</span>@if (r.withEvidence) { <span class="selo-texto">com evidências</span> }@if (r.communityConfirmed) { <span class="selo-texto publica">confirmada pela comunidade</span> }</span>
                  <span class="dica">{{ r.at | relativo }}{{ r.description ? ' · ' + r.description : '' }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="painel bloco" aria-labelledby="disc-t">
            <div class="b-topo"><h2 id="disc-t">Discussões populares</h2><a routerLink="/comunidade/foruns" class="btn btn-texto btn-sm">Fóruns</a></div>
            @if (d.topics.length === 0) { <p class="muted">Nenhuma discussão com respostas nos últimos 30 dias.</p> }
            <ul class="lista">@for (t of d.topics; track t.id) { <li><a [routerLink]="['/comunidade/discussoes', t.id]">{{ t.title }}</a><span class="dica">{{ t.forum }} · {{ t.replies }} {{ t.replies === 1 ? 'resposta' : 'respostas' }} em 30 dias</span></li> }</ul>
          </section>

          <section class="painel bloco" aria-labelledby="prop-t">
            <div class="b-topo"><h2 id="prop-t">Propostas com mais apoio</h2><a routerLink="/propostas" class="btn btn-texto btn-sm">Todas</a></div>
            @if (d.proposals.length === 0) { <p class="muted">Nenhuma proposta em andamento.</p> }
            <ul class="lista">@for (p of d.proposals; track p.id) { <li><a [routerLink]="['/propostas', p.id]">{{ p.title }}</a><span class="linha"><ut-fase [status]="p.status" /><span class="dica tabular">{{ p.votes }} apoios · {{ p.neighborhood ?? 'Cidade toda' }}</span></span></li> }</ul>
          </section>

          <section class="painel bloco" aria-labelledby="bai-t">
            <h2 id="bai-t">Bairros com mais atividade</h2>
            <p class="dica">Últimos 30 dias: reclamações, discussões em fóruns que citam o bairro e propostas.</p>
            @if (d.neighborhoods.length === 0) { <p class="muted">Sem atividade nos últimos 30 dias.</p> }
            <ul class="lista">@for (n of d.neighborhoods; track n.key) { <li><a routerLink="/mapa" [queryParams]="{ bairro: n.name }">{{ n.name }}</a><span class="dica tabular">{{ n.occurrences }} reclamações · {{ n.topics }} discussões · {{ n.proposals }} propostas</span></li> }</ul>
          </section>
        </div>
      } @else {
        <p class="carregando">Carregando…</p>
      }
    </div>

    <ng-template #occ let-o>
      <a class="occ" [routerLink]="['/ocorrencias', o.id]">
        @if (o.photoUrl) { <img [src]="o.photoUrl" alt="" loading="lazy" /> } @else { <span class="ico"><ut-icon [name]="o.icon" [size]="20" /></span> }
        <span class="o-txt">
          <strong>{{ o.category }}</strong>
          <span>{{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood }}{{ o.distanceM !== null ? ' · ' + dist(o.distanceM) : '' }} · {{ o.createdAt | relativo }}</span>
        </span>
        <ut-status [status]="o.status" />
      </a>
    </ng-template>

    <ng-template #hit let-h let-t="t">
      <a class="hit" [routerLink]="path(h.link)">
        <span class="h-topo">
          @if (h.icon) { <ut-icon [name]="h.icon" [size]="16" /> }
          <strong>{{ h.title }}</strong>
          @if (h.code) { <span class="muted tabular">{{ h.code }}</span> }
          @if (h.isInstitutional) { <span class="selo-texto publica">Conteúdo do UrbanTalk</span> }
          @if (h.status && t === 'ocorrencias') { <ut-status [status]="h.status" /> }
          @if (h.status && t === 'propostas') { <ut-fase [status]="h.status" /> }
        </span>
        <span class="h-txt">{{ h.text }}</span>
        @if (h.place || h.createdAt) { <span class="dica">{{ h.place }}{{ h.place && h.createdAt ? ' · ' : '' }}{{ h.createdAt ? (h.createdAt | relativo) : '' }}</span> }
      </a>
    </ng-template>
  `,
  styles: `
    .busca { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: flex-end; padding: var(--s-4); margin-bottom: var(--s-5); }
    .busca .campo { min-width: 150px; }
    .cresce { flex: 1; min-width: 240px !important; }
    .busca-wrap { position: relative; }
    .busca-wrap ut-icon { position: absolute; left: 12px; top: 12px; color: var(--texto-3); }
    .busca-wrap .entrada { padding-left: 40px; }
    .erro { color: var(--perigo); font-size: var(--t-sm); width: 100%; }
    .sec { font-size: var(--t-xl); margin-bottom: var(--s-2); }
    .grupo { margin-top: var(--s-4); }
    .grupo h3 { font-size: var(--t-lg); margin-bottom: var(--s-2); }
    .hits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .hit { display: flex; flex-direction: column; gap: 2px; padding: var(--s-3) var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); text-decoration: none; color: inherit; }
    .hit:hover { border-color: var(--linha-forte); color: inherit; }
    .h-topo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .h-txt { color: var(--texto-2); font-size: var(--t-sm); }
    .grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4); }
    .bloco { padding: var(--s-4) var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
    .bloco h2 { font-size: var(--t-lg); }
    .largo, .perto { grid-column: 1 / -1; }
    .b-topo { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
    .perto-acoes { display: flex; gap: var(--s-2); flex-wrap: wrap; align-items: center; }
    .perto-acoes ut-bairro { flex: 1 1 200px; }
    .perto-acoes ut-bairro ::ng-deep .entrada { min-height: 36px; padding-top: 6px; padding-bottom: 6px; }
    .occs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px; }
    .occ { display: flex; gap: var(--s-3); align-items: center; padding: 8px; border: 1px solid var(--linha); border-radius: var(--r-1); text-decoration: none; color: inherit; flex-wrap: wrap; }
    .occ:hover { background: var(--superficie-2); color: inherit; }
    .occ img, .ico { width: 52px; height: 52px; border-radius: var(--r-1); object-fit: cover; flex: none; }
    .ico { background: var(--placa-clara); color: var(--placa); display: grid; place-items: center; }
    .o-txt { flex: 1; min-width: 140px; display: flex; flex-direction: column; font-size: var(--t-sm); }
    .o-txt span { color: var(--texto-2); font-size: var(--t-xs); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
    .lista li { display: flex; flex-direction: column; gap: 2px; }
    .lista a { display: inline-flex; gap: 6px; align-items: center; font-weight: 500; }
    .selos, .linha { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    @media (max-width: 900px) { .grade { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorePage implements OnInit {
  api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  session = inject(SessionStore);
  types = TYPES;
  data = signal<ExploreData | null>(null);
  error = signal<string | null>(null);
  q = signal('');
  type = signal<SearchType>('todos');
  category = signal<number | null>(null);
  hood = signal('');
  result = signal<SearchResult | null>(null);
  searching = signal(false);
  searchError = signal<string | null>(null);
  locating = signal(false);
  geoError = signal<string | null>(null);

  num = (v: string) => (v ? Number(v) : null);
  path = (link: string) => link.split('#')[0];
  dist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
  totalAll = (r: SearchResult) => Object.values(r.groups ?? {}).reduce((a, g) => a + g.total, 0);

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    const q = qp.get('q');
    if (q) {
      this.q.set(q);
      this.type.set((qp.get('tipo') as SearchType) || 'todos');
      this.run(1);
    }
    this.load();
  }

  load(params: { lat?: number; lng?: number; neighborhood?: string | null } = {}) {
    this.error.set(null);
    this.api.explore(params).subscribe({ next: (d) => this.data.set(d), error: (e) => this.error.set(toApiError(e).message) });
  }

  locate() {
    this.geoError.set(null);
    if (!('geolocation' in navigator)) {
      this.geoError.set('Seu navegador não informa a localização. Digite um bairro.');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.locating.set(false);
        const { latitude, longitude } = p.coords;
        if (latitude < -24 || latitude > -23 || longitude < -48 || longitude > -47) {
          this.geoError.set('Você parece estar fora de Sorocaba. Digite um bairro.');
          return;
        }
        this.load({ lat: latitude, lng: longitude });
      },
      () => {
        this.locating.set(false);
        this.geoError.set('Não foi possível obter sua localização (permissão negada ou sinal fraco). Digite um bairro.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  nearHood(v: string) {
    if (v.trim()) this.load({ neighborhood: v.trim() });
  }

  submit() {
    this.run(1);
  }

  run(page: number) {
    if (this.q().trim().length < 2) return;
    this.searching.set(true);
    this.searchError.set(null);
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { q: this.q().trim(), tipo: this.type() !== 'todos' ? this.type() : null } });
    this.api.search(this.q().trim(), this.type(), { category: this.category(), neighborhood: this.hood().trim() || null, page }).subscribe({
      next: (r) => {
        this.result.set(r);
        this.searching.set(false);
      },
      error: (e) => {
        this.searching.set(false);
        const err = toApiError(e);
        this.searchError.set(Object.values(err.fields)[0] ?? err.message);
      },
    });
  }

  clear() {
    this.result.set(null);
    this.q.set('');
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: {} });
  }
}
