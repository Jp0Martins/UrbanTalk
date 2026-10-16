import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, Sort } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { DatePipe, addDays, formatDay, todayLocal } from '../core/format';
import { Filters, Indicators, Occurrence, Page } from '../core/models';
import { CategoryLabelComponent, PlacaComponent, StatusBadgeComponent } from '../shared/badges';
import { BarItem, BarListComponent, TimelineChartComponent } from '../shared/charts';
import { FilterBarComponent } from '../shared/filter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';


@Component({
  selector: 'ut-admin-indicadores',
  imports: [
    RouterLink,
    PageHeaderComponent,
    FilterBarComponent,
    BarListComponent,
    TimelineChartComponent,
    IconComponent,
    PaginationComponent,
    StatusBadgeComponent,
    CategoryLabelComponent,
    PlacaComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    DatePipe,
  ],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Indicadores" description="Visão consolidada das ocorrências para priorizar o que encaminhar. Todos os números vêm dos registros no banco.">
        <a routerLink="/admin/relatorios" [queryParams]="reportParams()" class="btn btn-primario"><ut-icon name="file" />Gerar relatório PDF</a>
      </ut-cabecalho-pagina>

      <div class="periodos" role="group" aria-label="Atalhos de período">
        @for (p of presets; track p.days) {
          <button type="button" class="btn btn-sm" [class.btn-primario]="activePreset() === p.days" [class.btn-secundario]="activePreset() !== p.days" (click)="preset(p.days)" [attr.aria-pressed]="activePreset() === p.days">{{ p.label }}</button>
        }
      </div>
      <ut-filtros [value]="filters()" [showDates]="true" [showStreet]="true" (changed)="apply($event)" label="Filtrar indicadores" />

      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (!ind()) {
        <p class="carregando">Calculando indicadores…</p>
      } @else {
        @let d = ind()!;
        <p class="periodo">Período: {{ fmt(d.period.from) }} a {{ fmt(d.period.to) }}</p>

        @if (d.demoCount > 0) {
          <div class="aviso aviso-atencao demo" role="note">
            <ut-icon name="info" />
            <span>{{ d.demoCount }} {{ d.demoCount === 1 ? 'ocorrência deste recorte é fictícia' : 'ocorrências deste recorte são fictícias' }}, criadas para demonstração. Remova com <code>npm run demo:reset</code> antes de usar com dados reais.</span>
          </div>
        }

        @if (d.total === 0) {
          <ut-vazio icon="chart" title="Sem ocorrências neste período" text="Não há registros para os filtros escolhidos, então não há números a mostrar. Amplie o período ou remova filtros." />
        } @else {
          <section class="numeros" aria-label="Números principais">
            <div class="n-principal">
              <span class="valor tabular">{{ d.total.toLocaleString('pt-BR') }}</span>
              <span class="rot">ocorrências no período</span>
            </div>
            <div>
              <span class="valor tabular">{{ d.open.toLocaleString('pt-BR') }}</span>
              <span class="rot">em aberto (status que não encerram)</span>
            </div>
            <div>
              <span class="valor tabular">{{ resolvedPct() }}</span>
              <span class="rot">encerradas ({{ d.closed }} de {{ d.total }}, sendo {{ d.resolved }} {{ d.resolved === 1 ? 'resolvida' : 'resolvidas' }})</span>
            </div>
            <div>
              <span class="valor tabular">{{ d.confirmations.toLocaleString('pt-BR') }}</span>
              <span class="rot">confirmações de cidadãos</span>
            </div>
          </section>

          @if (d.extra; as x) {
            <section class="painel bloco largo comp" aria-labelledby="comp-t">
              <h2 id="comp-t">Comparação com o período anterior</h2>
              <p class="dica">Período anterior de mesmo tamanho: {{ fmt(x.comparison.previous.from) }} a {{ fmt(x.comparison.previous.to) }}, com os mesmos filtros. Mais registros pode indicar mais participação dos moradores, não necessariamente mais problemas na cidade.</p>
              <table class="tabela">
                <thead><tr><th>Indicador</th><th class="num">Este período</th><th class="num">Anterior</th><th class="num">Diferença</th></tr></thead>
                <tbody>
                  @for (row of [{ l: 'Registradas', d: x.comparison.total }, { l: 'Resolvidas (status atual)', d: x.comparison.resolved }, { l: 'Em aberto (status atual)', d: x.comparison.open }]; track row.l) {
                    <tr><td>{{ row.l }}</td><td class="num">{{ row.d.current }}</td><td class="num">{{ row.d.previous }}</td><td class="num">{{ diff(row.d.diff) }} {{ row.d.pct === null ? '' : '(' + pct(row.d.pct) + ')' }}</td></tr>
                  }
                </tbody>
              </table>
              <div class="extras">
                <div>
                  <h3>Tempo entre registro e resolução</h3>
                  @if (x.resolutionTime.enough) {
                    <p><strong class="grande tabular">{{ num(x.resolutionTime.medianDays!) }}</strong> dias de mediana · média de {{ num(x.resolutionTime.meanDays!) }} dias</p>
                    <p class="dica">Amostra: {{ x.resolutionTime.sample }} reclamações com resolução informada, registradas no período.</p>
                  } @else {
                    <p class="dica">Dados insuficientes: {{ x.resolutionTime.sample }} {{ x.resolutionTime.sample === 1 ? 'resolução' : 'resoluções' }} no recorte (mínimo de {{ x.resolutionTime.minSample }} para calcular média e mediana).</p>
                  }
                </div>
                <div>
                  <h3>Reabertas e não resolvidas</h3>
                  <p><strong class="grande tabular">{{ x.reopened }}</strong> reabertas · <strong class="tabular">{{ x.reportedUnresolved }}</strong> informadas por moradores como não resolvidas</p>
                </div>
                <div>
                  <h3>Propostas com mais apoio</h3>
                  @if (x.topProposals.length === 0) { <p class="dica">Nenhuma proposta com apoio nestes filtros.</p> }
                  <ol class="props">@for (p of x.topProposals; track p.id) { <li><a [routerLink]="['/propostas', p.id]">{{ p.title }}</a> <span class="dica">{{ p.votes }} apoios · {{ p.statusName }}</span></li> }</ol>
                </div>
              </div>
            </section>
          }

          <section class="painel bloco largo" aria-labelledby="evo-t">
            <div class="evo-topo">
              <h2 id="evo-t">Registros por {{ unit() }}</h2>
              <div class="segmentado" role="group" aria-label="Agrupar por">
                @for (g of grans; track g.id) { <button type="button" [attr.aria-pressed]="(gran() ?? '') === g.id" (click)="setGran(g.id)">{{ g.label }}</button> }
              </div>
            </div>
            <ut-serie [points]="d.timeline" [granularity]="d.granularity" />
          </section>

          <div class="grade">
            <section class="painel bloco" aria-labelledby="st-t">
              <h2 id="st-t">Por status</h2>
              <ut-barras [items]="statusItems()" [total]="d.total" caption="Ocorrências por status" />
            </section>
            <section class="painel bloco" aria-labelledby="cat-t">
              <h2 id="cat-t">Por categoria</h2>
              <ut-barras [items]="categoryItems()" [total]="d.total" caption="Ocorrências por categoria" />
            </section>
            <section class="painel bloco" aria-labelledby="ba-t">
              <h2 id="ba-t">Por bairro</h2>
              <ut-barras [items]="hoodItems()" [total]="d.total" [limit]="8" caption="Ocorrências por bairro" />
            </section>
          </div>

          <section class="painel registros" aria-labelledby="reg-t">
            <div class="reg-topo">
              <h2 id="reg-t">Registros do recorte</h2>
              <div class="campo ordem">
                <label for="ordem-adm" class="sr-only">Ordenar por</label>
                <select id="ordem-adm" class="entrada" (change)="setSort($any($event.target).value)">
                  <option value="confirmations">Mais confirmadas primeiro</option>
                  <option value="recent">Mais recentes primeiro</option>
                  <option value="oldest">Mais antigas primeiro</option>
                </select>
              </div>
            </div>
            @if (rows(); as p) {
              <div class="tabela-caixa">
                <table class="tabela">
                  <caption class="sr-only">Ocorrências que compõem os indicadores</caption>
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
                        <td class="tabular cod">{{ o.code }}</td>
                        <td><ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" /></td>
                        <td><ut-placa>{{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood?.name ?? 'Cidade toda' }}</ut-placa></td>
                        <td class="tabular">{{ o.createdAt | data }}</td>
                        <td><ut-status [status]="o.status" /></td>
                        <td class="num">{{ o.confirmations }}</td>
                        <td class="acao"><a [routerLink]="['/ocorrencias', o.id]">Abrir<span class="sr-only"> {{ o.code }}</span></a></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="pag-pad"><ut-paginacao [page]="p.page" [totalPages]="p.totalPages" (go)="loadRows($event)" /></div>
            }
          </section>
        }
      }
    </div>
  `,
  styles: `
    .periodos { display: flex; gap: var(--s-2); flex-wrap: wrap; margin-bottom: var(--s-3); }
    ut-filtros { display: block; margin-bottom: var(--s-4); }
    .periodo { color: var(--texto-2); font-size: var(--t-sm); margin-bottom: var(--s-3); }
    .demo { margin-bottom: var(--s-4); }
    .demo ut-icon { color: #8a6a00; }
    code { font-size: 0.9em; background: rgb(0 0 0 / 0.06); padding: 1px 5px; border-radius: 3px; }

    .numeros {
      display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); background: var(--superficie);
      border: 1px solid var(--linha); border-radius: var(--r-2); margin-bottom: var(--s-4);
    }
    .numeros > div { padding: var(--s-5); }
    .numeros > div + div { border-left: 1px solid var(--linha); }
    .valor { display: block; font-family: var(--fonte-titulo); font-weight: 700; font-size: 2.25rem; line-height: 1; }
    .n-principal .valor { font-size: 3rem; color: var(--placa); }
    .rot { display: block; color: var(--texto-2); font-size: var(--t-sm); margin-top: 8px; }

    .bloco { padding: var(--s-5); }
    .bloco h2 { font-size: var(--t-lg); margin-bottom: var(--s-4); }
    .largo { margin-bottom: var(--s-4); }
    .largo h2 { margin-bottom: var(--s-6); }
    .evo-topo { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-5); }
    .evo-topo h2 { margin-bottom: 0 !important; }
    .comp h2 { margin-bottom: var(--s-2); }
    .comp .tabela { margin: var(--s-3) 0 var(--s-4); max-width: 720px; }
    .extras { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
    .extras h3 { font-size: var(--t-md); margin-bottom: 6px; }
    .grande { font-family: var(--fonte-titulo); font-size: var(--t-2xl); }
    .props { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: 4px; font-size: var(--t-sm); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    @media (max-width: 900px) { .extras { grid-template-columns: 1fr; } }
    .grade { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); margin-bottom: var(--s-4); align-items: start; }

    .registros { overflow: hidden; }
    .reg-topo { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); padding: var(--s-4) var(--s-5); flex-wrap: wrap; }
    .reg-topo h2 { font-size: var(--t-lg); }
    .ordem { width: 240px; }
    .tabela-caixa { overflow-x: auto; }
    .cod { font-weight: 600; white-space: nowrap; }
    .acao { text-align: right; }
    .pag-pad { padding: 0 var(--s-5) var(--s-4); }

    @media (max-width: 1100px) {
      .grade { grid-template-columns: 1fr 1fr; }
      .numeros { grid-template-columns: 1fr 1fr; }
      .numeros > div:nth-child(3) { border-left: 0; }
      .numeros > div:nth-child(n + 3) { border-top: 1px solid var(--linha); }
    }
    @media (max-width: 700px) {
      .grade { grid-template-columns: 1fr; }
      .valor { font-size: 1.875rem; }
      .n-principal .valor { font-size: 2.25rem; }
      .numeros > div { padding: var(--s-4); }
      .bloco { padding: var(--s-4); }
      .ordem { width: 100%; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminIndicatorsPage implements OnInit {
  private api = inject(ApiService);
  presets = [
    { days: 7, label: 'Últimos 7 dias' },
    { days: 30, label: 'Últimos 30 dias' },
    { days: 90, label: 'Últimos 90 dias' },
    { days: 365, label: 'Último ano' },
  ];
  filters = signal<Filters>({ from: addDays(todayLocal(), -29), to: todayLocal() });
  sort = signal<Sort>('confirmations');
  ind = signal<Indicators | null>(null);
  rows = signal<Page<Occurrence> | null>(null);
  error = signal<string | null>(null);

  activePreset = computed(() => {
    const f = this.filters();
    if (f.to !== todayLocal() || !f.from) return null;
    return this.presets.find((p) => addDays(todayLocal(), -(p.days - 1)) === f.from)?.days ?? null;
  });
  resolvedPct = computed(() => {
    const d = this.ind();
    if (!d || d.total === 0) return '0%';
    return `${Math.round((d.closed / d.total) * 100)}%`;
  });
  unit = computed(() => ({ day: 'dia', week: 'semana', month: 'mês' })[this.ind()?.granularity ?? 'day']);
  statusItems = computed<BarItem[]>(() => (this.ind()?.byStatus ?? []).map((s) => ({ label: s.closed ? `${s.name} (encerra)` : s.name, value: s.count, color: `var(--st-${s.color})` })));
  categoryItems = computed<BarItem[]>(() => (this.ind()?.byCategory ?? []).map((c) => ({ label: c.name, value: c.count })));
  hoodItems = computed<BarItem[]>(() => (this.ind()?.byNeighborhood ?? []).map((n) => ({ label: n.name, value: n.count })));
  reportParams = computed(() => {
    const f = this.filters();
    return { de: f.from ?? null, ate: f.to ?? null, categoria: f.category ?? null, bairro: f.neighborhood ?? null, onde: f.scope ?? null, status: f.status ?? null };
  });

  fmt = formatDay;
  grans = [
    { id: '', label: 'Automático' },
    { id: 'semana', label: 'Semana' },
    { id: 'mes', label: 'Mês' },
  ];
  gran = signal<string | null>(null);
  diff = (n: number) => (n > 0 ? `+${n}` : String(n));
  pct = (p: number) => `${p > 0 ? '+' : ''}${String(p).replace('.', ',')}%`;
  num = (n: number) => String(n).replace('.', ',');

  setGran(g: string) {
    this.gran.set(g || null);
    this.api.indicators(this.filters(), this.gran()).subscribe({ next: (r) => this.ind.set(r), error: (e) => this.error.set(toApiError(e).message) });
  }

  ngOnInit() {
    this.load();
  }

  preset(days: number) {
    this.apply({ ...this.filters(), from: addDays(todayLocal(), -(days - 1)), to: todayLocal() });
  }

  apply(f: Filters) {
    this.filters.set(f);
    this.load();
  }

  setSort(s: Sort) {
    this.sort.set(s);
    this.loadRows(1);
  }

  load() {
    this.error.set(null);
    this.ind.set(null);
    forkJoin({ ind: this.api.indicators(this.filters(), this.gran()), rows: this.api.staffList(this.filters(), 1, 10, this.sort()) }).subscribe({
      next: (r) => {
        this.ind.set(r.ind);
        this.rows.set(r.rows);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  loadRows(page: number) {
    this.api.staffList(this.filters(), page, 10, this.sort()).subscribe({
      next: (r) => this.rows.set(r),
      error: (e) => this.error.set(toApiError(e).message),
    });
  }
}
