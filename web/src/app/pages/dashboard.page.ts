import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { MapMarker, Occurrence, UserSummary } from '../core/models';
import { SessionStore } from '../core/session.store';
import { IconComponent } from '../shared/icon.component';
import { MapComponent } from '../shared/map.component';
import { OccurrenceItemComponent } from '../shared/occurrence-item.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

@Component({
  selector: 'ut-painel',
  imports: [RouterLink, IconComponent, MapComponent, OccurrenceItemComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <div class="pagina">
      <header class="cab">
        <div>
          <h1>Olá, {{ session.firstName() }}</h1>
          <p class="muted">{{ subtitle() }}</p>
        </div>
        <a routerLink="/registrar" class="btn btn-primario"><ut-icon name="plus" />Registrar reclamação</a>
      </header>

      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (!summary()) {
        <p class="carregando">Carregando seu painel…</p>
      } @else {
        @let s = summary()!;
        <section class="faixa" aria-label="Resumo das suas ocorrências">
          <div class="total">
            <span class="num tabular">{{ s.total }}</span>
            <span class="rot">{{ s.total === 1 ? 'reclamação registrada por você' : 'reclamações registradas por você' }}</span>
          </div>
          <ul class="por-status">
            <li data-color="azul">
              <a routerLink="/minhas-ocorrencias" [queryParams]="{ situacao: 'abertas' }">
                <ut-icon name="status-encaminhada" [size]="20" />
                <span class="num tabular">{{ s.open }}</span>
                <span class="rot">em andamento</span>
              </a>
            </li>
            <li data-color="verde">
              <a routerLink="/minhas-ocorrencias" [queryParams]="{ status: 'resolvida' }">
                <ut-icon name="status-resolvida" [size]="20" />
                <span class="num tabular">{{ s.resolved }}</span>
                <span class="rot">{{ s.resolved === 1 ? 'resolvida' : 'resolvidas' }}</span>
              </a>
            </li>
            <li data-color="cinza">
              <a routerLink="/minhas-ocorrencias" [queryParams]="{ situacao: 'encerradas' }">
                <ut-icon name="status-encerrada" [size]="20" />
                <span class="num tabular">{{ s.closed - s.resolved }}</span>
                <span class="rot">encerradas de outra forma</span>
              </a>
            </li>
          </ul>
          <div class="conf">
            <span class="num tabular">{{ s.confirmationsReceived }}</span>
            <span class="rot">{{ s.confirmationsReceived === 1 ? 'confirmação recebida' : 'confirmações recebidas' }} de outras pessoas</span>
          </div>
        </section>

        <div class="colunas">
          <section class="painel bloco" aria-labelledby="rec-t">
            <div class="bloco-topo">
              <h2 id="rec-t">Suas reclamações recentes</h2>
              @if (s.total > 0) {
                <a routerLink="/minhas-ocorrencias">Ver histórico completo</a>
              }
            </div>
            @if (mine().length === 0) {
              <div class="vazio-pad">
                <ut-vazio icon="pin" title="Você ainda não registrou nenhuma reclamação" text="Viu um buraco, um poste apagado ou lixo acumulado? Registre com foto e local, leva menos de dois minutos.">
                  <a routerLink="/registrar" class="btn btn-primario btn-sm">Registrar o primeiro</a>
                </ut-vazio>
              </div>
            } @else {
              @for (o of mine(); track o.id) {
                <ut-ocorrencia-item [item]="o" [compact]="true" />
              }
            }
          </section>

          <section class="painel bloco" aria-labelledby="cid-t">
            <div class="bloco-topo">
              <h2 id="cid-t">Na cidade</h2>
              <a routerLink="/mapa">Abrir o mapa</a>
            </div>
            <div class="mapa-caixa">
              <ut-mapa class="mapa" [markers]="cityMarkers()" [fitToMarkers]="true" (markerSelect)="open($event)" label="Mapa com as ocorrências mais recentes da cidade" />
            </div>
            <p class="dica">{{ cityText() }}</p>
          </section>
        </div>

        <p class="convite"><a routerLink="/comunidade">Ir para a Comunidade</a> para conversar sobre o bairro.</p>
      }
    </div>
  `,
  styles: `
    .cab { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s-4); margin-bottom: var(--s-5); flex-wrap: wrap; }
    .cab p { margin-top: 6px; }

    .faixa {
      display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 3fr) minmax(0, 1.2fr);
      background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); margin-bottom: var(--s-5);
      box-shadow: var(--sombra);
    }
    .faixa > * { padding: var(--s-5); }
    .faixa > * + * { border-left: 1px solid var(--linha); }
    .num { display: block; font-family: var(--fonte-titulo); font-weight: 700; font-size: 2.25rem; line-height: 1; }
    .rot { display: block; font-size: var(--t-sm); color: var(--texto-2); margin-top: 6px; }
    .por-status { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); }
    .por-status li + li { border-left: 1px dashed var(--linha); }
    .por-status a { display: grid; grid-template-columns: auto 1fr; column-gap: var(--s-2); padding: 0 var(--s-4); color: inherit; text-decoration: none; }
    .por-status a:hover .rot { text-decoration: underline; }
    .por-status ut-icon { grid-row: span 2; margin-top: 6px; }
    .por-status ut-icon { color: var(--cor); }
    .convite { margin-top: var(--s-5); color: var(--texto-2); }
    .por-status .num { font-size: 1.75rem; }

    .colunas { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--s-5); align-items: start; }
    .bloco { overflow: hidden; }
    .bloco-topo { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); padding: var(--s-4) var(--s-4) var(--s-3); border-bottom: 1px solid var(--linha); }
    .bloco-topo h2 { font-size: var(--t-lg); }
    .vazio-pad { padding: var(--s-4); }
    .mapa-caixa { position: relative; height: 340px; }
    .mapa { position: absolute; inset: 0; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); padding: var(--s-3) var(--s-4) var(--s-4); }
    .admin-link { margin: 0 var(--s-4) var(--s-4); }
    .bloco ut-ocorrencia-item:last-child ::ng-deep .item { border-bottom: 0; }

    @media (max-width: 1100px) {
      .faixa { grid-template-columns: 1fr 1fr; }
      .por-status { grid-column: 1 / -1; grid-row: 2; border-left: 0 !important; border-top: 1px solid var(--linha); }
      .conf { border-left: 1px solid var(--linha); }
      .colunas { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .faixa { grid-template-columns: 1fr; }
      .faixa > * + * { border-left: 0 !important; border-top: 1px solid var(--linha); }
      .por-status { grid-template-columns: 1fr; }
      .por-status li + li { border-left: 0; border-top: 1px dashed var(--linha); }
      .por-status a { padding: var(--s-3) 0; }
      .num { font-size: 1.875rem; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  session = inject(SessionStore);

  summary = signal<UserSummary | null>(null);
  mine = signal<Occurrence[]>([]);
  cityMarkers = signal<MapMarker[]>([]);
  cityTotal = signal(0);
  error = signal<string | null>(null);

  greeting = signal(saudacao(new Date().getHours()));
  subtitle = computed(() => {
    const s = this.summary();
    if (!s) return 'Aqui você acompanha o que registrou e o que está acontecendo na cidade.';
    if (s.total === 0) return 'Que bom ter você aqui. Quando registrar sua primeira reclamação, ela aparece nesta página.';
    if (s.resolved > 0)
      return s.resolved === 1
        ? 'Uma das suas reclamações já foi resolvida. Obrigado por ajudar a cuidar da cidade.'
        : `${s.resolved} das suas reclamações já foram resolvidas. Obrigado por ajudar a cuidar da cidade.`;
    return 'Suas reclamações estão no mapa. Veja abaixo em que pé está cada uma.';
  });

  cityText = computed(() => {
    const n = this.cityMarkers().length;
    if (n === 0) return 'Ainda não há ocorrências registradas na cidade.';
    return `Mostrando as ${n} ocorrências mais recentes de Sorocaba, de qualquer pessoa.`;
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.error.set(null);
    this.summary.set(null);
    forkJoin({
      summary: this.api.summary(),
      mine: this.api.mine({}, 1, 5),
      city: this.api.markers({}),
    }).subscribe({
      next: (r) => {
        this.mine.set(r.mine.items);
        this.cityMarkers.set(r.city.markers.slice(0, 60));
        this.summary.set(r.summary);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  open(id: number) {
    this.router.navigate(['/ocorrencias', id]);
  }
}

// saudação conforme a hora do dia
export function saudacao(hora: number) {
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}
