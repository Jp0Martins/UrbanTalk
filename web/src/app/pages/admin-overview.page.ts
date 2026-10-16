import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { autoRefresh } from '../core/auto-refresh';
import { toApiError } from '../core/api-error';
import { Occurrence, StaffOverview } from '../core/models';
import { SessionStore } from '../core/session.store';
import { StatusCatalog } from '../core/status-catalog';
import { IconComponent } from '../shared/icon.component';
import { OccurrenceItemComponent } from '../shared/occurrence-item.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';
import { saudacao } from './dashboard.page';

@Component({
  selector: 'ut-admin-painel',
  imports: [RouterLink, IconComponent, OccurrenceItemComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <div class="pagina">
      <header class="cab">
        <div>
          <span class="sobretitulo">Área da equipe</span>
          <h1>{{ greeting }}, {{ session.firstName() }}</h1>
          <p class="muted">{{ subtitle() }}</p>
        </div>
        <a routerLink="/admin/reclamacoes" class="btn btn-primario"><ut-icon name="inbox" />Ver todas as reclamações</a>
      </header>

      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (!ov()) {
        <p class="carregando">Carregando o painel…</p>
      } @else {
        @let o = ov()!;
        <section class="cartoes" aria-label="Resumo">
          <a class="cartao destaque" routerLink="/admin/reclamacoes" [queryParams]="{ status: o.initialStatus }">
            <span class="ico"><ut-icon name="sparkle" [size]="22" /></span>
            <span class="num tabular">{{ o.waiting }}</span>
            <span class="rot">aguardando análise <span class="muted">({{ catalog.name(o.initialStatus) }})</span></span>
          </a>
          <a class="cartao" routerLink="/admin/reclamacoes" [queryParams]="{ situacao: 'abertas' }">
            <span class="ico"><ut-icon name="status-encaminhada" [size]="22" /></span>
            <span class="num tabular">{{ o.open }}</span>
            <span class="rot">em aberto no total</span>
          </a>
          <a class="cartao" routerLink="/admin/reclamacoes" [queryParams]="{ situacao: 'abertas' }">
            <span class="ico"><ut-icon name="clock" [size]="22" /></span>
            <span class="num tabular">{{ o.stale }}</span>
            <span class="rot">abertas sem movimento há mais de 7 dias</span>
          </a>
          <div class="cartao">
            <span class="ico"><ut-icon name="plus" [size]="22" /></span>
            <span class="num tabular">{{ o.lastDay }}</span>
            <span class="rot">registradas nas últimas 24 horas</span>
          </div>
        </section>

        <div class="colunas">
          <section class="painel bloco" aria-labelledby="novas-t">
            <div class="bloco-topo">
              <h2 id="novas-t">Chegaram por último</h2>
              <a routerLink="/admin/reclamacoes">Ver lista completa</a>
            </div>
            @if (recent().length === 0) {
              <div class="pad">
                <ut-vazio icon="inbox" title="Nenhuma reclamação ainda" text="Quando um cidadão registrar algo, aparece aqui na hora em que for salvo." />
              </div>
            } @else {
              @for (r of recent(); track r.id) {
                <ut-ocorrencia-item [item]="r" [compact]="true" [highlight]="r.status === o.initialStatus" />
              }
            }
            <p class="dica">Esta página se atualiza sozinha a cada 30 segundos.</p>
          </section>

          <section class="painel bloco atalhos" aria-labelledby="atalhos-t">
            <h2 id="atalhos-t">Atalhos</h2>
            <a routerLink="/admin/reclamacoes" [queryParams]="{ status: o.initialStatus }"><ut-icon name="inbox" />Triar as que aguardam análise</a>
            <a routerLink="/admin/relatorios"><ut-icon name="file" />Gerar relatório em PDF</a>
            <a routerLink="/admin/indicadores"><ut-icon name="chart" />Ver indicadores</a>
            <a routerLink="/admin/status"><ut-icon name="sliders" />{{ session.isManager() ? 'Configurar status' : 'Consultar status disponíveis' }}</a>
            @if (session.isManager()) {
              <a routerLink="/admin/equipe"><ut-icon name="users" />Gerenciar equipe</a>
            }
            <a routerLink="/comunidade"><ut-icon name="chat" />Acompanhar a comunidade</a>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s-4); margin-bottom: var(--s-5); flex-wrap: wrap; }
    .cab p { margin-top: 6px; }
    .cartoes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-4); margin-bottom: var(--s-5); }
    .cartao {
      background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5);
      display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; box-shadow: var(--sombra);
    }
    a.cartao:hover { border-color: var(--linha-forte); color: inherit; }
    .cartao .ico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--superficie-2); color: var(--texto-2); }
    .destaque { border-color: var(--placa); }
    .destaque .num { color: var(--placa); }
    .num { font-family: var(--fonte-titulo); font-weight: 700; font-size: 2.25rem; line-height: 1; margin-top: 6px; }
    .rot { font-size: var(--t-sm); color: var(--texto-2); }
    .colunas { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--s-5); align-items: start; }
    .bloco { overflow: hidden; }
    .bloco-topo { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); padding: var(--s-4) var(--s-5) var(--s-3); border-bottom: 1px solid var(--linha); }
    .bloco h2 { font-size: var(--t-lg); }
    .pad { padding: var(--s-4); }
    .dica { font-size: var(--t-xs); color: var(--texto-3); padding: var(--s-3) var(--s-5); }
    .atalhos { padding: var(--s-5); display: flex; flex-direction: column; gap: 4px; }
    .atalhos h2 { margin-bottom: var(--s-2); }
    .atalhos a { display: flex; gap: var(--s-3); align-items: center; padding: 10px var(--s-3); border-radius: var(--r-1); color: var(--texto); text-decoration: none; font-weight: 500; }
    .atalhos a:hover { background: var(--superficie-2); }
    .atalhos ut-icon { color: var(--placa); }
    @media (max-width: 1100px) {
      .cartoes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .colunas { grid-template-columns: 1fr; }
    }
    @media (max-width: 520px) {
      .cartoes { grid-template-columns: 1fr; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOverviewPage implements OnInit {
  private api = inject(ApiService);
  session = inject(SessionStore);
  catalog = inject(StatusCatalog);
  greeting = saudacao(new Date().getHours());
  ov = signal<StaffOverview | null>(null);
  recent = signal<Occurrence[]>([]);
  error = signal<string | null>(null);

  subtitle = computed(() => {
    const o = this.ov();
    if (!o) return 'Veja o que chegou e o que precisa de atenção.';
    if (o.waiting === 0) return 'Nenhuma reclamação esperando análise agora. Bom trabalho!';
    return o.waiting === 1 ? 'Tem 1 reclamação esperando alguém olhar.' : `Tem ${o.waiting} reclamações esperando alguém olhar.`;
  });

  constructor() {
    autoRefresh(() => this.load(true), 30_000);
  }

  ngOnInit() {
    this.load();
  }

  load(silent = false) {
    if (!silent) this.error.set(null);
    forkJoin({ ov: this.api.overview(), list: this.api.staffList({}, 1, 6) }).subscribe({
      next: (r) => {
        this.ov.set(r.ov);
        this.recent.set(r.list.items);
      },
      error: (e) => {
        if (!silent || !this.ov()) this.error.set(toApiError(e).message);
      },
    });
  }
}
