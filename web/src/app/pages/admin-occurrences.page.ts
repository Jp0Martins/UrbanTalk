import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Sort } from '../core/api.service';
import { autoRefresh } from '../core/auto-refresh';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe } from '../core/format';
import { Filters, Occurrence, Page } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { CategoryLabelComponent, PlacaComponent, StatusBadgeComponent } from '../shared/badges';
import { FilterBarComponent } from '../shared/filter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

type Quick = 'todas' | 'aguardando' | 'abertas' | 'encerradas';

@Component({
  selector: 'ut-admin-reclamacoes',
  imports: [
    RouterLink,
    PageHeaderComponent,
    FilterBarComponent,
    PaginationComponent,
    StatusBadgeComponent,
    CategoryLabelComponent,
    PlacaComponent,
    IconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    DatePipe,
    RelativePipe,
  ],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Todas as reclamações" description="Tudo o que os cidadãos registraram, no mesmo registro que eles acompanham. Abra uma reclamação para mudar o status, anotar ou corrigir o endereço.">
        <a routerLink="/admin/relatorios" class="btn btn-secundario"><ut-icon name="file" />Relatório PDF</a>
      </ut-cabecalho-pagina>

      <div class="segmentado rapidos" role="group" aria-label="Atalhos">
        @for (q of quicks; track q.id) {
          <button type="button" [attr.aria-pressed]="quick() === q.id" (click)="setQuick(q.id)">{{ q.label }}</button>
        }
      </div>

      <ut-filtros [value]="filters()" [showSearch]="true" [showDates]="true" [showStreet]="true" (changed)="apply($event)" label="Filtrar reclamações" />

      @if (newCount() > 0) {
        <div class="aviso aviso-info novas" role="status">
          <ut-icon name="sparkle" />
          <span>{{ newCount() === 1 ? 'Chegou 1 reclamação nova' : 'Chegaram ' + newCount() + ' reclamações novas' }} desde que você abriu a lista.</span>
          <button type="button" class="btn btn-secundario btn-sm" (click)="showNew()">Mostrar</button>
        </div>
      }

      <div class="topo">
        <p aria-live="polite">
          @if (page(); as p) {
            <strong class="tabular">{{ p.total.toLocaleString('pt-BR') }}</strong> {{ p.total === 1 ? 'reclamação' : 'reclamações' }}
          }
          @if (updatedAt(); as t) {
            <span class="atualizado">· atualizado {{ t | relativo }}, a lista se atualiza sozinha</span>
          }
        </p>
        <div class="campo ordem">
          <label for="ordem" class="sr-only">Ordenar por</label>
          <select id="ordem" class="entrada" (change)="setSort($any($event.target).value)">
            <option value="recent" [selected]="sort() === 'recent'">Mais recentes primeiro</option>
            <option value="oldest" [selected]="sort() === 'oldest'">Mais antigas primeiro</option>
            <option value="confirmations" [selected]="sort() === 'confirmations'">Mais confirmadas primeiro</option>
          </select>
        </div>
      </div>

      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load(currentPage())" />
      } @else if (!page()) {
        <p class="carregando">Carregando reclamações…</p>
      } @else if (page()!.items.length === 0) {
        <ut-vazio icon="inbox" title="Nenhuma reclamação aqui" [text]="hasFilters() ? 'Nada corresponde aos filtros escolhidos. Tente remover algum.' : 'Quando um cidadão registrar uma reclamação, ela aparece nesta lista automaticamente.'" />
      } @else {
        @let p = page()!;
        <div class="painel tabela-caixa">
          <table class="tabela">
            <caption class="sr-only">Reclamações registradas pelos cidadãos</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Reclamação</th>
                <th scope="col">Endereço</th>
                <th scope="col">Status</th>
                <th scope="col" class="num">Conf.</th>
                <th scope="col">Registro</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (o of p.items; track o.id) {
                <tr [class.recente]="isNew(o)">
                  <td class="tabular codigo">
                    {{ o.code }}
                    @if (isNew(o)) {
                      <span class="selo-texto nova">Nova</span>
                    }
                  </td>
                  <td class="desc-col">
                    <ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" />
                    <span class="resumo">{{ o.description }}</span>
                  </td>
                  <td>
                    @if (o.street) {
                      <span class="rua">{{ o.street }}</span>
                    } @else {
                      <span class="sem-rua">Rua não informada</span>
                    }
                    <ut-placa>{{ o.neighborhood?.name ?? 'Cidade toda' }}</ut-placa>
                  </td>
                  <td><ut-status [status]="o.status" /></td>
                  <td class="num">{{ o.confirmations }}</td>
                  <td class="tabular quando" [title]="o.createdAt | data: true">{{ o.createdAt | relativo }}</td>
                  <td class="acao"><a [routerLink]="['/ocorrencias', o.id]" class="btn btn-secundario btn-sm">Abrir<span class="sr-only"> {{ o.code }}</span></a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ul class="cartoes">
          @for (o of p.items; track o.id) {
            <li>
              <a [routerLink]="['/ocorrencias', o.id]" class="cartao" [class.recente]="isNew(o)">
                <div class="c-topo"><ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" /><ut-status [status]="o.status" /></div>
                <p class="c-end">{{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood?.name ?? 'Cidade toda' }}</p>
                <div class="c-meta">
                  <span class="tabular">{{ o.code }}</span><span>{{ o.createdAt | relativo }}</span><span>{{ o.confirmations }} conf.</span>
                  @if (isNew(o)) { <span class="selo-texto nova">Nova</span> }
                </div>
              </a>
            </li>
          }
        </ul>
        <ut-paginacao [page]="p.page" [totalPages]="p.totalPages" (go)="load($event)" />
      }
    </div>
  `,
  styles: `
    .rapidos { margin-bottom: var(--s-4); flex-wrap: wrap; border-radius: var(--r-2); }
    ut-filtros { display: block; margin-bottom: var(--s-4); }
    .novas { margin-bottom: var(--s-4); align-items: center; }
    .novas ut-icon { color: var(--encaminhada); }
    .topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s-3); gap: var(--s-3); flex-wrap: wrap; }
    .atualizado { color: var(--texto-3); font-size: var(--t-xs); }
    .ordem { width: 240px; }
    .tabela-caixa { overflow-x: auto; }
    .codigo { font-weight: 600; white-space: nowrap; }
    .codigo .selo-texto { margin-left: 4px; }
    .desc-col { max-width: 360px; }
    .resumo { display: block; font-size: var(--t-xs); color: var(--texto-2); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px; }
    .rua { display: block; font-weight: 500; }
    .sem-rua { display: block; font-size: var(--t-xs); color: var(--texto-3); }
    .quando { white-space: nowrap; color: var(--texto-2); }
    .acao { text-align: right; white-space: nowrap; }
    tr.recente td { background: var(--placa-clara); }
    .cartoes { display: none; list-style: none; margin: 0; padding: 0; }
    .cartao { display: flex; flex-direction: column; gap: 6px; padding: var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); color: inherit; text-decoration: none; }
    .cartao.recente { border-color: var(--placa); }
    .cartoes li + li { margin-top: var(--s-2); }
    .c-topo { display: flex; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; font-weight: 600; }
    .c-end { font-size: var(--t-sm); color: var(--texto-2); }
    .c-meta { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: center; font-size: var(--t-xs); color: var(--texto-3); }
    @media (max-width: 860px) {
      .tabela-caixa { display: none; }
      .cartoes { display: block; }
      .ordem { width: 100%; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOccurrencesPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private catalog = inject(StatusCatalog);

  quicks: { id: Quick; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'aguardando', label: 'Aguardando análise' },
    { id: 'abertas', label: 'Em aberto' },
    { id: 'encerradas', label: 'Encerradas' },
  ];
  filters = signal<Filters>({});
  sort = signal<Sort>('recent');
  page = signal<Page<Occurrence> | null>(null);
  currentPage = signal(1);
  error = signal<string | null>(null);
  updatedAt = signal<string | null>(null);
  // maior id visto ao abrir a lista: o que vier depois ganha o selo "Nova"
  baseline = signal<number | null>(null);
  latest = signal(0);
  newCount = computed(() => {
    const b = this.baseline();
    if (b === null) return 0;
    const shown = new Set((this.page()?.items ?? []).map((o) => o.id));
    // conta só as novas que ainda não estão na tela
    let n = 0;
    for (let id = b + 1; id <= this.latest(); id++) if (!shown.has(id)) n++;
    return n;
  });

  quick = computed<Quick>(() => {
    const f = this.filters();
    if (f.situation === 'abertas') return 'abertas';
    if (f.situation === 'encerradas') return 'encerradas';
    if (f.status && f.status === this.initialSlug()) return 'aguardando';
    return 'todas';
  });
  private initialSlug = computed(() => this.catalog.all().find((s) => s.isInitial)?.slug ?? 'registrada');

  constructor() {
    autoRefresh(() => this.load(this.currentPage(), true), 20_000);
  }

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const f: Filters = {};
    const st = q.get('status');
    if (st) f.status = st;
    const sit = q.get('situacao');
    if (sit === 'abertas' || sit === 'encerradas') f.situation = sit;
    this.filters.set(f);
    this.load(1);
  }

  hasFilters() {
    return Object.values(this.filters()).some((v) => v !== null && v !== undefined && v !== '');
  }

  isNew(o: Occurrence) {
    const b = this.baseline();
    return b !== null && o.id > b;
  }

  setQuick(q: Quick) {
    const base: Filters = { ...this.filters(), status: null, situation: null };
    if (q === 'aguardando') base.status = this.initialSlug();
    if (q === 'abertas') base.situation = 'abertas';
    if (q === 'encerradas') base.situation = 'encerradas';
    this.apply(base);
  }

  apply(f: Filters) {
    this.filters.set(f);
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { status: f.status ?? null, situacao: f.situation ?? null } });
    this.load(1);
  }

  setSort(s: Sort) {
    this.sort.set(s);
    this.load(1);
  }

  showNew() {
    this.sort.set('recent');
    this.load(1);
  }

  load(page: number, silent = false) {
    if (!silent) this.error.set(null);
    this.api.staffList(this.filters(), page, 20, this.sort()).subscribe({
      next: (p) => {
        this.page.set(p);
        this.currentPage.set(p.page);
        this.latest.set(p.latestId ?? 0);
        if (this.baseline() === null) this.baseline.set(p.latestId ?? 0);
        this.updatedAt.set(new Date().toISOString());
        this.error.set(null);
      },
      error: (e) => {
        // falha na atualização automática não apaga a lista já carregada
        if (!silent || !this.page()) this.error.set(toApiError(e).message);
      },
    });
  }
}
