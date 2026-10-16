import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { MapMarker, Occurrence } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { StatusLegendComponent } from '../shared/status-legend.component';
import { SessionStore } from '../core/session.store';
import { PublicHeaderComponent } from '../layout/public-header.component';
import { IconComponent } from '../shared/icon.component';
import { MapComponent } from '../shared/map.component';
import { OccurrenceItemComponent } from '../shared/occurrence-item.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

@Component({
  selector: 'ut-home',
  imports: [RouterLink, PublicHeaderComponent, MapComponent, IconComponent, OccurrenceItemComponent, EmptyStateComponent, ErrorStateComponent, StatusLegendComponent],
  template: `
    <ut-cabecalho-publico />
    <main id="conteudo">
      <section class="hero">
        <div class="hero-texto">
          <h1>Viu um problema na rua? Registre, confirme e acompanhe até a solução.</h1>
          <p class="lead">
            O UrbanTalk reúne num só lugar as reclamações sobre buracos, iluminação, calçadas, lixo, sinalização e pontos
            de ônibus de Sorocaba, com foto e local exato. A equipe organiza os registros em relatórios por bairro e
            encaminha aos órgãos responsáveis.
          </p>
          <div class="acoes">
            <a [routerLink]="session.user() ? '/registrar' : '/cadastro'" class="btn btn-primario">
              <ut-icon name="plus" />Registrar um problema
            </a>
            <a routerLink="/mapa" class="btn btn-secundario"><ut-icon name="map" />Ver o mapa completo</a>
          </div>
          @if (totals(); as t) {
            <p class="numeros" aria-live="polite">
              <span class="tabular">{{ t.total.toLocaleString('pt-BR') }}</span> {{ t.total === 1 ? 'ocorrência registrada' : 'ocorrências registradas' }},
              <span class="tabular">{{ t.resolved.toLocaleString('pt-BR') }}</span> {{ t.resolved === 1 ? 'resolvida' : 'resolvidas' }}.
            </p>
          }
        </div>
        <div class="hero-mapa">
          <ut-mapa class="mapa" [markers]="markers()" [fitToMarkers]="true" label="Mapa com as ocorrências registradas em Sorocaba" (markerSelect)="open($event)" />
          <div class="legenda" aria-hidden="true">
            <ut-legenda-status />
          </div>
          @if (!loading() && markers().length === 0 && !error()) {
            <div class="mapa-vazio">Ainda não há ocorrências no mapa. A primeira pode ser a sua.</div>
          }
        </div>
      </section>

      <section class="faixa-secao" id="como-funciona" aria-labelledby="como-titulo">
        <div class="dentro">
          <h2 id="como-titulo">Como funciona</h2>
          <ol class="passos">
            <li>
              <span class="n">1</span>
              <h3>Registre</h3>
              <p>Escolha o tipo de problema, tire uma foto e marque o ponto no mapa. Leva menos de dois minutos.</p>
            </li>
            <li>
              <span class="n">2</span>
              <h3>Outras pessoas confirmam</h3>
              <p>Quem passa pelo mesmo lugar confirma o registro. Assim fica claro o que afeta mais gente.</p>
            </li>
            <li>
              <span class="n">3</span>
              <h3>A equipe encaminha</h3>
              <p>Os registros viram relatórios por bairro e categoria, enviados manualmente aos órgãos responsáveis.</p>
            </li>
            <li>
              <span class="n">4</span>
              <h3>Acompanhe</h3>
              <p>Cada ocorrência mostra o status e o histórico de mudanças, do registro até a solução.</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="status-secao" aria-labelledby="status-titulo">
        <div class="dentro duas-colunas">
          <div>
            <h2 id="status-titulo">O que cada status quer dizer</h2>
            <p class="muted nota">
              O UrbanTalk não tem ligação automática com a Prefeitura. Quem muda o status é a equipe do projeto, depois
              de enviar o relatório ou conferir a solução. Confirmações de cidadãos não mudam o status sozinhas.
            </p>
          </div>
          <ol class="trilha">
            @for (s of catalog.active(); track s.slug) {
              <li [attr.data-color]="s.color">
                <ut-icon [name]="catalog.icon(s.slug)" [size]="22" />
                <div>
                  <strong>{{ s.name }}</strong>
                  <p>{{ s.description }}</p>
                </div>
              </li>
            }
          </ol>
        </div>
      </section>

      <section class="recentes" aria-labelledby="recentes-titulo">
        <div class="dentro">
          <div class="recentes-topo">
            <h2 id="recentes-titulo">Registros recentes</h2>
            <a routerLink="/mapa" [queryParams]="{ ver: 'lista' }">Ver todos</a>
          </div>
          @if (error(); as e) {
            <ut-erro [message]="e" (retry)="load()" />
          } @else if (loading()) {
            <p class="carregando">Carregando registros…</p>
          } @else if (recent().length === 0) {
            <ut-vazio icon="pin" title="Nenhuma ocorrência registrada ainda" text="Quando alguém registrar um problema, ele aparece aqui e no mapa.">
              <a [routerLink]="session.user() ? '/registrar' : '/cadastro'" class="btn btn-primario btn-sm">Registrar o primeiro</a>
            </ut-vazio>
          } @else {
            <div class="painel lista">
              @for (o of recent(); track o.id) {
                <ut-ocorrencia-item [item]="o" />
              }
            </div>
          }
        </div>
      </section>
    </main>
    <footer class="rodape">
      <div class="dentro">
        <p>
          UrbanTalk é um projeto de extensão do grupo EcoGestor, Centro Universitário Facens, Sorocaba, 2026.
          Não há integração automática com a Prefeitura de Sorocaba: os relatórios são encaminhados manualmente.
        </p>
        <p>Mapa: dados de colaboradores do OpenStreetMap.</p>
      </div>
    </footer>
  `,
  styles: `
    :host { display: block; background: var(--superficie); }
    .dentro { max-width: 1280px; margin: 0 auto; padding: 0 var(--s-6); }

    .hero {
      max-width: 1280px; margin: 0 auto; padding: var(--s-7) var(--s-6) var(--s-7);
      display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: var(--s-7); align-items: center;
    }
    h1 { font-size: var(--t-3xl); line-height: 1.05; letter-spacing: -0.015em; font-weight: 700; }
    .lead { margin-top: var(--s-4); font-size: 1.125rem; color: var(--texto-2); max-width: 54ch; }
    .acoes { display: flex; gap: var(--s-3); margin-top: var(--s-5); flex-wrap: wrap; }
    .numeros { margin-top: var(--s-4); font-size: var(--t-sm); color: var(--texto-2); }
    .numeros .tabular { font-weight: 600; color: var(--texto); }

    .hero-mapa { position: relative; height: 520px; border-radius: var(--r-2); overflow: hidden; border: 1px solid var(--linha); }
    .mapa { position: absolute; inset: 0; }
    .legenda {
      position: absolute; left: 10px; bottom: 22px; z-index: 500;
      background: rgb(255 255 255 / 0.94); border: 1px solid var(--linha); border-radius: var(--r-1);
      display: flex; gap: var(--s-3); padding: 6px 10px; font-size: var(--t-xs); font-weight: 500;
    }
    .legenda span { display: inline-flex; align-items: center; gap: 5px; }
    .legenda i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .mapa-vazio {
      position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 500;
      background: var(--asfalto); color: #fff; padding: 8px 12px; border-radius: var(--r-1); font-size: var(--t-sm);
    }

    .faixa-secao { background: var(--asfalto); color: var(--texto-inverso); padding: var(--s-7) 0; }
    .faixa-secao h2 { margin-bottom: var(--s-5); }
    .passos { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-5); position: relative; }
    .passos li { position: relative; }
    .passos li:not(:last-child)::after {
      content: ''; position: absolute; top: 17px; left: 46px; right: calc(-1 * var(--s-5) + 10px);
      border-top: 3px dashed var(--faixa);
    }
    .n {
      display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%;
      background: var(--faixa); color: var(--asfalto); font-family: var(--fonte-titulo); font-weight: 700; font-size: 1.125rem;
      position: relative; margin-bottom: var(--s-4);
    }
    .passos h3 { font-size: var(--t-lg); margin-bottom: 6px; }
    .passos p { color: var(--texto-inverso-2); font-size: var(--t-sm); max-width: 32ch; }

    .status-secao { padding: var(--s-7) 0; background: var(--concreto); }
    .duas-colunas { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); gap: var(--s-7); align-items: start; }
    .nota { margin-top: var(--s-3); max-width: 46ch; }
    .trilha { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-3); }
    .trilha li {
      background: var(--superficie); border-top: 4px solid; padding: var(--s-4); border-radius: 0 0 var(--r-1) var(--r-1);
      display: flex; flex-direction: column; gap: var(--s-2);
    }
    .trilha li { border-top-color: var(--cor); }
    .trilha li ut-icon { color: var(--cor); }
    .trilha p { font-size: var(--t-sm); color: var(--texto-2); margin-top: 2px; }

    .recentes { padding: var(--s-7) 0; }
    .recentes-topo { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--s-4); }
    .lista { overflow: hidden; }
    .lista ut-ocorrencia-item:last-child ::ng-deep .item { border-bottom: 0; }

    .rodape { background: var(--concreto); border-top: 1px solid var(--linha); padding: var(--s-5) 0; font-size: var(--t-sm); color: var(--texto-2); }
    .rodape p + p { margin-top: 4px; }

    @media (max-width: 1000px) {
      .hero { grid-template-columns: 1fr; gap: var(--s-5); padding-top: var(--s-6); }
      .hero-mapa { height: 400px; }
      .passos { grid-template-columns: repeat(2, 1fr); }
      .passos li::after { display: none; }
      .duas-colunas { grid-template-columns: 1fr; gap: var(--s-5); }
    }
    @media (max-width: 640px) {
      .dentro, .hero { padding-left: var(--s-4); padding-right: var(--s-4); }
      h1 { font-size: 2.125rem; }
      .lead { font-size: var(--t-md); }
      .hero-mapa { height: 320px; }
      .passos, .trilha { grid-template-columns: 1fr; }
      .legenda { flex-wrap: wrap; right: 10px; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  session = inject(SessionStore);

  catalog = inject(StatusCatalog);
  markers = signal<MapMarker[]>([]);
  recent = signal<Occurrence[]>([]);
  resolvedTotal = signal(0);
  total = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  totals = computed(() => (this.loading() || this.error() || this.total() === 0 ? null : { total: this.total(), resolved: this.resolvedTotal() }));

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      map: this.api.markers({}),
      recent: this.api.list({}, 1, 5),
      resolved: this.api.list({ status: 'resolvida' }, 1, 1),
    }).subscribe({
      next: (r) => {
        this.markers.set(r.map.markers);
        this.recent.set(r.recent.items);
        this.total.set(r.recent.total);
        this.resolvedTotal.set(r.resolved.total);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loading.set(false);
      },
    });
  }

  open(id: number) {
    this.router.navigate(['/ocorrencias', id]);
  }
}
