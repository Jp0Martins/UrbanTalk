import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminApi } from '../core/admin.api';
import { toApiError } from '../core/api-error';
import { autoRefresh } from '../core/auto-refresh';
import { RelativePipe, plural } from '../core/format';
import { Filters, PRIORITY_NAMES, Priority, QueueFilters, QueuePage } from '../core/models';
import { SessionStore } from '../core/session.store';
import { StatusBadgeComponent } from '../shared/badges';
import { FilterBarComponent } from '../shared/filter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

type Flag = NonNullable<QueueFilters['flag']>;

@Component({
  selector: 'ut-fila',
  imports: [RouterLink, IconComponent, PageHeaderComponent, PaginationComponent, StatusBadgeComponent, FilterBarComponent, EmptyStateComponent, ErrorStateComponent, RelativePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Fila de Análise" description="Reclamações abertas organizadas por critérios transparentes. A pontuação ajuda a ordenar o trabalho; ela não diz que um problema é perigoso ou urgente." />

      <div class="topo">
        <div class="segmentado" role="tablist" aria-label="Visão da fila">
          <button type="button" role="tab" [attr.aria-selected]="f().view === 'todas'" (click)="patch({ view: 'todas' })">Todas <span class="n">{{ data()?.summary?.total ?? '' }}</span></button>
          <button type="button" role="tab" [attr.aria-selected]="f().view === 'minhas'" (click)="patch({ view: 'minhas' })">Minhas tarefas</button>
          <button type="button" role="tab" [attr.aria-selected]="f().view === 'sem-responsavel'" (click)="patch({ view: 'sem-responsavel' })">Sem responsável</button>
        </div>
        <div class="campo ordem">
          <label for="ordem">Ordenar por</label>
          <select id="ordem" class="entrada" (change)="patch({ sort: $any($event.target).value })">
            @for (o of sorts; track o.id) { <option [value]="o.id" [selected]="f().sort === o.id">{{ o.label }}</option> }
          </select>
        </div>
      </div>

      <div class="atalhos" role="group" aria-label="Filtros rápidos">
        @for (fl of flags; track fl.id) {
          <button type="button" class="chip" [attr.aria-pressed]="f().flag === fl.id" (click)="patch({ flag: f().flag === fl.id ? null : fl.id })">
            <ut-icon [name]="fl.icon" [size]="15" />{{ fl.label }}
          </button>
        }
        <div class="campo prioridade">
          <label for="prio" class="sr-only">Prioridade</label>
          <select id="prio" class="entrada" (change)="patch({ priority: $any($event.target).value || null })">
            <option value="" [selected]="!f().priority">Qualquer prioridade</option>
            <option value="alta" [selected]="f().priority === 'alta'">Prioridade alta</option>
            <option value="media" [selected]="f().priority === 'media'">Prioridade média</option>
            <option value="baixa" [selected]="f().priority === 'baixa'">Prioridade baixa</option>
            <option value="nenhuma" [selected]="f().priority === 'nenhuma'">Ainda não avaliada</option>
          </select>
        </div>
      </div>

      <ut-filtros label="Filtrar a fila" [value]="baseFilters()" [showStreet]="true" [showSearch]="true" (changed)="patchFilters($event)" />

      @if (data(); as d) {
        <p class="resumo" aria-live="polite">
          {{ total(d) }} · {{ d.summary.unassigned }} sem responsável · {{ d.summary.overdue }} com mais de {{ d.settings.overdueDays }} dias · {{ d.summary.stale }} paradas há {{ d.settings.staleDays }}+ dias · {{ d.summary.review }} com pedido de reavaliação
        </p>
      }

      @if (loading() && !data()) {
        <p class="carregando">Carregando a fila…</p>
      } @else if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (data(); as d) {
        @if (d.items.length === 0) {
          <ut-vazio icon="check" [title]="f().view === 'minhas' ? 'Nenhuma tarefa atribuída a você' : 'Nada na fila com esses filtros'" text="Mude os filtros ou volte mais tarde. Reclamações novas aparecem aqui automaticamente." />
        } @else {
          <ol class="fila" [attr.start]="(d.page - 1) * d.pageSize + 1">
            @for (it of d.items; track it.id; let i = $index) {
              <li class="item" [class.reav]="it.reviewRequested">
                <div class="pont" [attr.aria-label]="'Pontuação ' + it.score">
                  <span class="pos tabular">{{ (d.page - 1) * d.pageSize + i + 1 }}º</span>
                  <span class="pts tabular">{{ it.score }}</span>
                  <span class="pts-rot">pontos</span>
                </div>
                <div class="corpo">
                  <p class="linha1">
                    <a [routerLink]="['/ocorrencias', it.id]" class="titulo"><ut-icon [name]="it.category.icon" [size]="18" />{{ it.category.name }}{{ it.categoryDetail ? ': ' + it.categoryDetail : '' }}</a>
                    <span class="codigo tabular">{{ it.code }}</span>
                    <ut-status [status]="it.status" />
                    @if (it.priority) { <span class="selo-texto prio" [attr.data-p]="it.priority" [title]="it.priorityReason ?? ''">Prioridade {{ prioName(it.priority) }}</span> }
                    @if (it.isDemo) { <span class="selo-texto">Demonstração</span> }
                  </p>
                  <p class="end"><ut-icon name="pin" [size]="14" />{{ it.street ? it.street + ', ' : '' }}{{ it.neighborhood?.name ?? 'Cidade toda' }}</p>
                  <p class="desc">{{ it.description }}</p>
                  <p class="meta">
                    <span>{{ it.confirmations }} {{ it.confirmations === 1 ? 'confirmação' : 'confirmações' }}</span>
                    <span [class.alerta]="it.overdue">aberta há {{ plural(it.daysOpen, 'dia', 'dias') }}</span>
                    <span [class.alerta]="it.stale">última movimentação {{ it.updatedAt | relativo }}</span>
                    <span>{{ it.assignee ? 'Responsável: ' + it.assignee.name : 'Sem responsável' }}</span>
                  </p>
                  <p class="sinais">
                    @if (it.reviewRequested) { <span class="selo-texto alerta-s"><ut-icon name="alert" [size]="12" />Morador disse que continua</span> }
                    @if (it.pendingInfo) { <span class="selo-texto">Aguardando resposta do cidadão</span> }
                    @if (it.similar > 0) { <span class="selo-texto">{{ it.similar }} {{ it.similar === 1 ? 'possível duplicata' : 'possíveis duplicatas' }} por perto</span> }
                    @if (it.duplicateOf) { <span class="selo-texto">Marcada como duplicata de UT-{{ pad(it.duplicateOf) }}</span> }
                  </p>
                  <details class="porque">
                    <summary>Por que esta posição?</summary>
                    <ul>
                      @for (p of it.scoreParts; track p.label) { <li><span class="tabular">+{{ p.points }}</span> {{ p.label }}</li> }
                    </ul>
                  </details>
                </div>
              </li>
            }
          </ol>
          <ut-paginacao [page]="d.page" [totalPages]="d.totalPages" (go)="load($event)" />
        }

        <details class="painel explica">
          <summary><ut-icon name="info" [size]="18" />Como a pontuação é calculada</summary>
          <ul>
            <li>Prioridade definida pela equipe (sempre com justificativa): alta +{{ d.settings.priorityAlta }}, média +{{ d.settings.priorityMedia }}, baixa +{{ d.settings.priorityBaixa }}, ainda não avaliada +{{ d.settings.priorityNone }}.</li>
            <li>Confirmações de moradores: +{{ d.settings.perConfirmation }} cada, contando no máximo {{ d.settings.maxConfirmations }}. Ajudam, mas não decidem sozinhas.</li>
            <li>Tempo desde o registro: +{{ d.settings.perDay }} por dia, até {{ d.settings.maxDays }} dias.</li>
            <li>Sem movimentação há {{ d.settings.staleDays }} dias ou mais: +{{ d.settings.staleBonus }}.</li>
            <li>Morador informou que o problema continua depois da resolução: +{{ d.settings.reviewBonus }}.</li>
          </ul>
          @if (session.isManager()) { <a routerLink="/admin/configuracoes">Ajustar os pesos em Configurações</a> } @else { <p class="muted">Os pesos são definidos pela administração.</p> }
        </details>
      }
    </div>
  `,
  styles: `
    .topo { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-3); }
    .n { font-variant-numeric: tabular-nums; color: var(--texto-3); }
    .ordem { min-width: 220px; }
    .atalhos { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: var(--s-3); }
    .chip { display: inline-flex; gap: 6px; align-items: center; min-height: 36px; padding: 0 12px; border-radius: var(--r-1); border: 1px solid var(--linha-forte); background: var(--superficie); cursor: pointer; font-weight: 500; font-size: var(--t-sm); }
    .chip[aria-pressed='true'] { background: var(--asfalto); color: #fff; border-color: var(--asfalto); }
    .prioridade { min-width: 200px; }
    .prioridade .entrada { min-height: 36px; padding-top: 6px; padding-bottom: 6px; font-size: var(--t-sm); }
    .resumo { font-size: var(--t-sm); color: var(--texto-2); margin: var(--s-3) 0; }
    .fila { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
    .item { display: flex; gap: var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-4); }
    .item.reav { border-left: 4px solid var(--st-vermelho); }
    .pont { flex: none; width: 64px; display: flex; flex-direction: column; align-items: center; background: var(--superficie-2); border-radius: var(--r-1); padding: 6px 4px; align-self: flex-start; }
    .pos { font-size: var(--t-xs); color: var(--texto-3); }
    .pts { font-family: var(--fonte-titulo); font-size: var(--t-xl); font-weight: 700; line-height: 1.1; }
    .pts-rot { font-size: 0.7rem; color: var(--texto-2); }
    .corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .linha1 { display: flex; gap: 6px var(--s-2); align-items: center; flex-wrap: wrap; }
    .titulo { display: inline-flex; gap: 6px; align-items: center; font-weight: 700; color: var(--texto); text-decoration: none; }
    .titulo:hover { color: var(--placa); text-decoration: underline; }
    .codigo { color: var(--texto-3); font-size: var(--t-sm); }
    .prio[data-p='alta'] { background: var(--st-vermelho-fundo); color: var(--st-vermelho); border-color: #f2c4bf; }
    .prio[data-p='media'] { background: var(--st-laranja-fundo); color: var(--st-laranja); border-color: #f0cdb8; }
    .end { display: flex; gap: 4px; align-items: center; font-size: var(--t-sm); }
    .desc { color: var(--texto-2); font-size: var(--t-sm); }
    .meta { display: flex; gap: 4px var(--s-3); flex-wrap: wrap; font-size: var(--t-xs); color: var(--texto-2); }
    .meta .alerta { color: var(--perigo); font-weight: 600; }
    .sinais { display: flex; gap: 6px; flex-wrap: wrap; }
    .sinais:empty { display: none; }
    .alerta-s { background: var(--st-vermelho-fundo); color: var(--st-vermelho); border-color: #f2c4bf; }
    .porque summary { cursor: pointer; font-size: var(--t-xs); color: var(--placa); font-weight: 600; }
    .porque ul { margin: 4px 0 0; padding-left: 1.1em; font-size: var(--t-sm); color: var(--texto-2); }
    .explica { margin-top: var(--s-5); padding: var(--s-4); font-size: var(--t-sm); }
    .explica summary { display: flex; gap: 6px; align-items: center; cursor: pointer; font-weight: 600; }
    .explica ul { margin: var(--s-2) 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: 4px; }
    @media (max-width: 640px) { .item { flex-direction: column; gap: var(--s-2); } .pont { flex-direction: row; width: auto; gap: 6px; align-items: baseline; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQueuePage implements OnInit {
  private api = inject(AdminApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  session = inject(SessionStore);

  sorts = [
    { id: 'pontuacao', label: 'Pontuação (padrão)' },
    { id: 'antigas', label: 'Mais antigas primeiro' },
    { id: 'recentes', label: 'Mais recentes primeiro' },
    { id: 'confirmacoes', label: 'Mais confirmações' },
    { id: 'parada', label: 'Há mais tempo sem movimentação' },
    { id: 'categoria', label: 'Categoria' },
    { id: 'bairro', label: 'Bairro e rua' },
    { id: 'status', label: 'Status' },
  ];
  flags: { id: Flag; label: string; icon: string }[] = [
    { id: 'atrasadas', label: 'Atrasadas', icon: 'clock' },
    { id: 'paradas', label: 'Sem movimentação', icon: 'history' },
    { id: 'reavaliacao', label: 'Reavaliação pedida', icon: 'alert' },
    { id: 'pedido-pendente', label: 'Aguardando cidadão', icon: 'info' },
    { id: 'duplicatas', label: 'Marcadas como duplicata', icon: 'list' },
  ];
  f = signal<QueueFilters>({ view: 'todas', sort: 'pontuacao' });
  data = signal<QueuePage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  private page = 1;

  plural = plural;
  // só os campos que a barra de filtros conhece
  baseFilters = () => {
    const { category, neighborhood, scope, status, street, q, from, to } = this.f();
    return { category, neighborhood, scope, status, street, q, from, to } as Filters;
  };
  prioName = (p: Priority) => PRIORITY_NAMES[p].toLowerCase();
  pad = (n: number) => String(n).padStart(5, '0');
  total = (d: QueuePage) => plural(d.total, 'reclamação na fila', 'reclamações na fila');

  constructor() {
    autoRefresh(() => this.load(this.page, true), 30_000);
  }

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const flag = q.get('parada') ? 'paradas' : (q.get('filtro') as Flag | null);
    this.f.set({ view: (q.get('visao') as QueueFilters['view']) || 'todas', sort: q.get('ordem') || 'pontuacao', flag: flag ?? null });
    this.load();
  }

  patch(p: Partial<QueueFilters>) {
    this.f.set({ ...this.f(), ...p });
    const f = this.f();
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { visao: f.view !== 'todas' ? f.view : null, ordem: f.sort !== 'pontuacao' ? f.sort : null, filtro: f.flag ?? null } });
    this.load(1);
  }

  patchFilters(v: Filters) {
    this.patch({ category: v.category ?? null, neighborhood: v.neighborhood ?? null, scope: v.scope ?? null, status: v.status ?? null, street: v.street ?? null, q: v.q ?? null, from: v.from ?? null, to: v.to ?? null });
  }

  load(page = 1, quiet = false) {
    this.page = page;
    if (!quiet) this.loading.set(true);
    this.api.queue(this.f(), page).subscribe({
      next: (d) => {
        this.data.set(d);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        if (!quiet) this.error.set(toApiError(e).message);
      },
    });
  }
}

