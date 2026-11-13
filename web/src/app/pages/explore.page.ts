import { TranslatePipe } from '@ngx-translate/core';
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
  imports: [AsyncPipe, NgTemplateOutlet, RouterLink, IconComponent, PageHeaderComponent, PaginationComponent, StatusBadgeComponent, PhaseBadgeComponent, EmptyStateComponent, ErrorStateComponent, RelativePipe, NeighborhoodInputComponent, TranslatePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina [title]="'auto.maf5aec0ee2' | translate" [description]="'auto.me3921bc5d4' | translate" />

      <form class="busca painel" role="search" (submit)="$event.preventDefault(); submit()">
        <div class="campo cresce">
          <label for="busca-g">{{ 'auto.mab0b414f8c' | translate }}</label>
          <div class="busca-wrap">
            <ut-icon name="search" [size]="20" />
            <input id="busca-g" class="entrada" type="search" maxlength="100" [placeholder]="'auto.m6138964b5e' | translate" [value]="q()" (input)="q.set($any($event.target).value)" />
          </div>
        </div>
        <div class="campo">
          <label for="b-tipo">{{ 'auto.mcd741b3fe8' | translate }}</label>
          <select id="b-tipo" class="entrada" (change)="type.set($any($event.target).value)">
            <option value="todos" [selected]="type() === 'todos'">{{ 'auto.mb3bafc8941' | translate }}</option>
            @for (t of types; track t.id) { <option [value]="t.id" [selected]="type() === t.id">{{ t.label }}</option> }
          </select>
        </div>
        <div class="campo">
          <label for="b-cat">{{ 'auto.m5966b0ce8b' | translate }}</label>
          <select id="b-cat" class="entrada" (change)="category.set(num($any($event.target).value))">
            <option value="">{{ 'auto.m8a3c344036' | translate }}</option>
            @for (c of api.categories$ | async; track c.id) { <option [value]="c.id" [selected]="category() === c.id">{{ c.name }}</option> }
          </select>
        </div>
        <div class="campo">
          <label for="b-bairro">{{ 'auto.m49f7179a65' | translate }}</label>
          <ut-bairro inputId="b-bairro" [placeholder]="'auto.m035fe17a1c' | translate" [value]="hood()" (valueChange)="hood.set($event)" />
        </div>
        <button type="submit" class="btn btn-primario" [disabled]="q().trim().length < 2">{{ 'auto.ma62405e2ce' | translate }}</button>
        @if (result()) { <button type="button" class="btn btn-texto" (click)="clear()">{{ 'auto.m5b93cd6139' | translate }}</button> }
        @if (searchError()) { <p class="erro" role="alert">{{ searchError() }}</p> }
      </form>

      @if (searching()) {
        <p class="carregando">{{ 'auto.m9870b9e569' | translate }}</p>
      } @else if (result(); as r) {
        <section aria-live="polite" aria-labelledby="res-t">
          <h2 id="res-t" class="sec">Resultados para “{{ r.q }}”</h2>
          @if (r.publicOnly) { <p class="dica">{{ 'auto.md0499c0d92' | translate }} <a routerLink="/entrar" [queryParams]="{ volta: '/explorar?q=' + r.q }">{{ 'auto.m4ea354d383' | translate }}</a> {{ 'auto.mf67a4986fe' | translate }}</p> }
          @if (r.groups; as g) {
            @if (totalAll(r) === 0) {
              <ut-vazio icon="search" [title]="'auto.m1ec4888562' | translate" [text]="'auto.ma77cb63289' | translate" />
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
              <ut-vazio icon="search" [title]="'auto.me32e9cac44' | translate" [text]="'auto.mc335b84641' | translate" />
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
              <h2 id="perto-t">{{ 'auto.m7d5eb6f83f' | translate }}</h2>
              <div class="perto-acoes">
                <button type="button" class="btn btn-secundario btn-sm" (click)="locate()" [disabled]="locating()"><ut-icon name="locate" [size]="16" />{{ locating() ? ('auto.m3993e04256' | translate) : ('auto.mb357f03435' | translate) }}</button>
                <label class="sr-only" for="perto-bairro">{{ 'auto.m381ef23e2d' | translate }}</label>
                <ut-bairro inputId="perto-bairro" class="perto-bairro" [placeholder]="'auto.m116dad9208' | translate" (committed)="nearHood($event)" />
              </div>
            </div>
            @if (geoError()) { <p class="erro">{{ geoError() }}</p> }
            @if (d.nearMode === null) {
              <p class="dica">Sua localização é usada só nesta busca, não é salva. Mostramos reclamações abertas num raio de {{ d.nearRadiusM / 1000 }} km.</p>
            } @else if (d.near.length === 0) {
              <p class="muted">Nenhuma reclamação aberta {{ d.nearMode === 'local' ? 'num raio de ' + d.nearRadiusM / 1000 + ' km' : ('auto.mdf306c9efe' | translate) }}.</p>
            } @else {
              <ul class="occs">@for (o of d.near; track o.id) { <li><ng-container *ngTemplateOutlet="occ; context: { $implicit: o }" /></li> }</ul>
            }
          </section>

          <section class="painel bloco" aria-labelledby="rec-t">
            <div class="b-topo"><h2 id="rec-t">{{ 'auto.m3f5dc804bc' | translate }}</h2><a routerLink="/mapa" class="btn btn-texto btn-sm">{{ 'auto.m45f3f64f78' | translate }}</a></div>
            @if (d.recent.length === 0) { <p class="muted">{{ 'auto.m7f5162cd64' | translate }}</p> }
            <ul class="occs">@for (o of d.recent; track o.id) { <li><ng-container *ngTemplateOutlet="occ; context: { $implicit: o }" /></li> }</ul>
          </section>

          <section class="painel bloco" aria-labelledby="res-r-t">
            <h2 id="res-r-t">{{ 'auto.mbaceeb36c7' | translate }}</h2>
            @if (d.resolutions.length === 0) { <p class="muted">{{ 'auto.mad5e43c56b' | translate }}</p> }
            <ul class="lista">
              @for (r of d.resolutions; track r.occurrenceId) {
                <li>
                  <a [routerLink]="['/ocorrencias', r.occurrenceId]"><ut-icon [name]="r.icon" [size]="16" />{{ r.category }} · {{ r.place }}</a>
                  <span class="selos"><span class="selo-texto">{{ 'auto.m339b0eaead' | translate }}</span>@if (r.withEvidence) { <span class="selo-texto">{{ 'auto.m21b0d83c91' | translate }}</span> }@if (r.communityConfirmed) { <span class="selo-texto publica">{{ 'auto.m768048accb' | translate }}</span> }</span>
                  <span class="dica">{{ r.at | relativo }}{{ r.description ? ' · ' + r.description : '' }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="painel bloco" aria-labelledby="disc-t">
            <div class="b-topo"><h2 id="disc-t">{{ 'auto.m96b204101d' | translate }}</h2><a routerLink="/comunidade/foruns" class="btn btn-texto btn-sm">{{ 'auto.m17f0d26d2c' | translate }}</a></div>
            @if (d.topics.length === 0) { <p class="muted">{{ 'auto.me3b915107d' | translate }}</p> }
            <ul class="lista">@for (t of d.topics; track t.id) { <li><a [routerLink]="['/comunidade/discussoes', t.id]">{{ t.title }}</a><span class="dica">{{ t.forum }} · {{ t.replies }} {{ t.replies === 1 ? ('auto.mb56f3b55b8' | translate) : ('auto.m622c3c83f9' | translate) }} em 30 dias</span></li> }</ul>
          </section>

          <section class="painel bloco" aria-labelledby="prop-t">
            <div class="b-topo"><h2 id="prop-t">{{ 'auto.m709aa9d1f3' | translate }}</h2><a routerLink="/propostas" class="btn btn-texto btn-sm">{{ 'auto.m8a3c344036' | translate }}</a></div>
            @if (d.proposals.length === 0) { <p class="muted">{{ 'auto.meead6c47ff' | translate }}</p> }
            <ul class="lista">@for (p of d.proposals; track p.id) { <li><a [routerLink]="['/propostas', p.id]">{{ p.title }}</a><span class="linha"><ut-fase [status]="p.status" /><span class="dica tabular">{{ p.votes }} apoios · {{ p.neighborhood ?? ('auto.mf42a4c41ae' | translate) }}</span></span></li> }</ul>
          </section>

          <section class="painel bloco" aria-labelledby="bai-t">
            <h2 id="bai-t">{{ 'auto.mf44e126c6c' | translate }}</h2>
            <p class="dica">{{ 'auto.m656c6aacd2' | translate }}</p>
            @if (d.neighborhoods.length === 0) { <p class="muted">{{ 'auto.ma022594dd0' | translate }}</p> }
            <ul class="lista">@for (n of d.neighborhoods; track n.key) { <li><a routerLink="/mapa" [queryParams]="{ bairro: n.name }">{{ n.name }}</a><span class="dica tabular">{{ n.occurrences }} reclamações · {{ n.topics }} discussões · {{ n.proposals }} propostas</span></li> }</ul>
          </section>
        </div>
      } @else {
        <p class="carregando">{{ 'auto.mbca482b745' | translate }}</p>
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
          @if (h.isInstitutional) { <span class="selo-texto publica">{{ 'auto.m330cd5f9ab' | translate }}</span> }
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
    .occs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 6px; }
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
