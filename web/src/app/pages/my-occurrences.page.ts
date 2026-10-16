import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Sort } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { DatePipe } from '../core/format';
import { Filters, Occurrence, Page } from '../core/models';
import { CategoryLabelComponent, PlacaComponent, StatusBadgeComponent } from '../shared/badges';
import { FilterBarComponent } from '../shared/filter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

@Component({
  selector: 'ut-minhas',
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
  ],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Minhas reclamações" description="Tudo o que você registrou, com o status atual, os recados da equipe e as confirmações de outras pessoas.">
        <a routerLink="/registrar" class="btn btn-primario"><ut-icon name="plus" />Registrar reclamação</a>
      </ut-cabecalho-pagina>

      @if (filters().situation) {
        <div class="aviso aviso-info situacao" role="status"><ut-icon name="info" />Mostrando só as {{ filters().situation === 'abertas' ? 'reclamações em andamento' : 'reclamações encerradas' }}.<button type="button" class="btn btn-texto btn-sm" (click)="apply({})">Ver todas</button></div>
      }
      <ut-filtros [value]="filters()" [showSearch]="true" [showDates]="true" (changed)="apply($event)" label="Filtrar minhas reclamações" />

      <div class="topo">
        <p aria-live="polite">
          @if (page(); as p) {
            <strong class="tabular">{{ p.total }}</strong> {{ p.total === 1 ? 'reclamação' : 'reclamações' }}
          }
        </p>
        <div class="campo ordem">
          <label for="ordem" class="sr-only">Ordenar por</label>
          <select id="ordem" class="entrada" (change)="setSort($any($event.target).value)">
            <option value="recent">Mais recentes primeiro</option>
            <option value="oldest">Mais antigas primeiro</option>
            <option value="confirmations">Mais confirmadas primeiro</option>
          </select>
        </div>
      </div>

      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load(1)" />
      } @else if (loading()) {
        <p class="carregando">Carregando…</p>
      } @else if (page(); as p) {
        @if (p.items.length === 0) {
          @if (hasFilters()) {
            <ut-vazio icon="search" title="Nenhuma reclamação com esses filtros" text="Remova algum filtro para ver mais resultados." />
          } @else {
            <ut-vazio icon="pin" title="Você ainda não registrou reclamações" text="Quando registrar um problema, ele aparece aqui para você acompanhar cada novidade.">
              <a routerLink="/registrar" class="btn btn-primario btn-sm">Registrar reclamação</a>
            </ut-vazio>
          }
        } @else {
          <div class="painel tabela-caixa">
            <table class="tabela">
              <caption class="sr-only">Reclamações registradas por você</caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Registro</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Confirmações</th>
                  <th scope="col"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (o of p.items; track o.id) {
                  <tr>
                    <td class="tabular codigo">{{ o.code }}</td>
                    <td><ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" /></td>
                    <td>@if (o.street) {<span class="rua">{{ o.street }}</span>}<ut-placa>{{ o.neighborhood?.name ?? 'Cidade toda' }}</ut-placa></td>
                    <td class="tabular">{{ o.createdAt | data }}</td>
                    <td><ut-status [status]="o.status" /></td>
                    <td class="num">{{ o.confirmations }}</td>
                    <td class="acao"><a [routerLink]="['/ocorrencias', o.id]">Detalhes<span class="sr-only"> de {{ o.code }}</span></a></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ul class="cartoes">
            @for (o of p.items; track o.id) {
              <li>
                <a [routerLink]="['/ocorrencias', o.id]" class="cartao">
                  <div class="c-topo"><ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" /><ut-status [status]="o.status" /></div>
                  <div class="c-meta"><ut-placa>{{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood?.name ?? 'Cidade toda' }}</ut-placa><span>{{ o.code }}</span><span>{{ o.createdAt | data }}</span><span>{{ o.confirmations }} conf.</span></div>
                </a>
              </li>
            }
          </ul>
          <ut-paginacao [page]="p.page" [totalPages]="p.totalPages" (go)="load($event)" />
        }
      }
    </div>
  `,
  styles: `
    ut-filtros { display: block; margin-bottom: var(--s-4); }
    .situacao { margin-bottom: var(--s-4); align-items: center; }
    .rua { display: block; font-weight: 500; font-size: var(--t-sm); }
    .topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s-3); gap: var(--s-3); flex-wrap: wrap; }
    .ordem { width: 240px; }
    .tabela-caixa { overflow-x: auto; }
    .codigo { font-weight: 600; white-space: nowrap; }
    .acao { text-align: right; white-space: nowrap; }
    .cartoes { display: none; list-style: none; margin: 0; padding: 0; }
    .cartao { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); color: inherit; text-decoration: none; }
    .cartoes li + li { margin-top: var(--s-2); }
    .c-topo { display: flex; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; font-weight: 600; }
    .c-meta { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: center; font-size: var(--t-xs); color: var(--texto-3); }
    @media (max-width: 760px) {
      .tabela-caixa { display: none; }
      .cartoes { display: block; }
      .ordem { width: 100%; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOccurrencesPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  filters = signal<Filters>({});
  sort = signal<Sort>('recent');
  page = signal<Page<Occurrence> | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const st = q.get('status');
    const sit = q.get('situacao');
    this.filters.set({
      ...(st ? { status: st } : {}),
      ...(sit === 'abertas' || sit === 'encerradas' ? { situation: sit } : {}),
    });
    this.load(1);
  }

  hasFilters() {
    return Object.values(this.filters()).some((v) => v !== null && v !== undefined && v !== '');
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

  load(page: number) {
    this.loading.set(true);
    this.error.set(null);
    this.api.mine(this.filters(), page, 15, this.sort()).subscribe({
      next: (p) => {
        this.page.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loading.set(false);
      },
    });
  }
}
