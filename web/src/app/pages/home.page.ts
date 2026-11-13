import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../core/i18n';
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
  imports: [RouterLink, PublicHeaderComponent, MapComponent, IconComponent, OccurrenceItemComponent, EmptyStateComponent, ErrorStateComponent, StatusLegendComponent, TranslatePipe],
  template: `
    <ut-cabecalho-publico />
    <main id="conteudo">
      <section class="hero">
        <div class="hero-texto">
          <h1>{{ 'home.hero.title' | translate }}</h1>
          <p class="lead">
            {{ 'home.hero.description' | translate }}
          </p>
          <div class="acoes">
            <a [routerLink]="session.user() ? '/registrar' : '/cadastro'" class="btn btn-primario">
              <ut-icon name="plus" />{{ 'home.hero.report' | translate }}
            </a>
            <a routerLink="/mapa" class="btn btn-secundario"><ut-icon name="map" />{{ 'home.hero.map' | translate }}</a>
          </div>
          @if (totals(); as t) {
            <p class="numeros" aria-live="polite">
              <span class="tabular">{{ t.total.toLocaleString('pt-BR') }}</span> {{ t.total === 1 ? ('auto.mf4f3422234' | translate) : ('auto.m4487f23de4' | translate) }},
              <span class="tabular">{{ t.resolved.toLocaleString('pt-BR') }}</span> {{ t.resolved === 1 ? ('auto.m0b04e260be' | translate) : ('auto.ma0260dee3f' | translate) }}.
            </p>
          }
        </div>
        <div class="hero-mapa">
          <ut-mapa class="mapa" [markers]="markers()" [fitToMarkers]="true" [label]="'auto.m5e2759c2d6' | translate" (markerSelect)="open($event)" />
          <div class="legenda" aria-hidden="true">
            <ut-legenda-status />
          </div>
          @if (!loading() && markers().length === 0 && !error()) {
            <div class="mapa-vazio">{{ 'home.mapEmpty' | translate }}</div>
          }
        </div>
      </section>

      <section class="faixa-secao" id="como-funciona" aria-labelledby="como-titulo">
        <div class="dentro">
          <h2 id="como-titulo">{{ 'home.how.title' | translate }}</h2>
          <ol class="passos">
            <li>
              <span class="n">1</span>
              <h3>{{ 'home.how.step1' | translate }}</h3>
              <p>{{ 'home.how.step1Text' | translate }}</p>
            </li>
            <li>
              <span class="n">2</span>
              <h3>{{ 'home.how.step2' | translate }}</h3>
              <p>{{ 'home.how.step2Text' | translate }}</p>
            </li>
            <li>
              <span class="n">3</span>
              <h3>{{ 'home.how.step3' | translate }}</h3>
              <p>{{ 'home.how.step3Text' | translate }}</p>
            </li>
            <li>
              <span class="n">4</span>
              <h3>{{ 'home.how.step4' | translate }}</h3>
              <p>{{ 'home.how.step4Text' | translate }}</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="status-secao" aria-labelledby="status-titulo">
        <div class="dentro duas-colunas">
          <div>
            <h2 id="status-titulo">{{ 'home.status.title' | translate }}</h2>
            <p class="muted nota">
              {{ 'home.status.text' | translate }}
            </p>
          </div>
          <ol class="trilha">
            @for (s of catalog.active(); track s.slug) {
              <li [attr.data-color]="s.color">
                <ut-icon [name]="catalog.icon(s.slug)" [size]="22" />
                <div>
                  <strong>{{ language.statusName(s) }}</strong>
                  <p>{{ language.statusDescription(s) }}</p>
                </div>
              </li>
            }
          </ol>
        </div>
      </section>

      <section class="recentes" aria-labelledby="recentes-titulo">
        <div class="dentro">
          <div class="recentes-topo">
            <h2 id="recentes-titulo">{{ 'home.recent.title' | translate }}</h2>
            <a routerLink="/mapa" [queryParams]="{ ver: 'lista' }">{{ 'home.recent.all' | translate }}</a>
          </div>
          @if (error(); as e) {
            <ut-erro [message]="e" (retry)="load()" />
          } @else if (loading()) {
            <p class="carregando">{{ 'home.recent.loading' | translate }}</p>
          } @else if (recent().length === 0) {
            <ut-vazio icon="pin" [title]="'auto.m049bcaf604' | translate" [text]="'auto.m362dbe14f1' | translate">
              <a [routerLink]="session.user() ? '/registrar' : '/cadastro'" class="btn btn-primario btn-sm">{{ 'home.recent.first' | translate }}</a>
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

      <section class="sobre-secao" id="equipe" aria-labelledby="equipe-titulo">
        <div class="dentro">
          <div class="equipe-topo">
            <div><h2 id="equipe-titulo">{{ 'home.team.title' | translate }}</h2><p>{{ 'home.team.text' | translate }}</p></div>
            <div class="equipe-controles">
              <button type="button" (click)="moveTeam(-1)" [attr.aria-label]="'home.team.previous' | translate">‹</button>
              <span aria-live="off">{{ teamIndex() + 1 }} / 6</span>
              <button type="button" (click)="moveTeam(1)" [attr.aria-label]="'home.team.next' | translate">›</button>
              <button type="button" class="pausa" (click)="teamPaused.set(!teamPaused())" [attr.aria-label]="(teamPaused() ? 'home.team.play' : 'home.team.pause') | translate">{{ (teamPaused() ? 'home.team.play' : 'home.team.pause') | translate }}</button>
            </div>
          </div>
          <ul #teamTrack class="equipe-trilha" (mouseenter)="teamHover.set(true)" (mouseleave)="teamHover.set(false)" (focusin)="teamFocus.set(true)" (focusout)="teamFocus.set(false)">
            <li><strong>{{ 'auto.m3cf7e08253' | translate }}</strong><span>{{ 'home.team.gustavo' | translate }}</span></li>
            <li><strong>{{ 'auto.m84a5954d44' | translate }}</strong><span>{{ 'home.team.henrik' | translate }}</span></li>
            <li><strong>{{ 'auto.m51fcf17e7b' | translate }}</strong><span>{{ 'home.team.joao' | translate }}</span></li>
            <li><strong>{{ 'auto.mb28599cd6e' | translate }}</strong><span>{{ 'home.team.pedro' | translate }}</span></li>
            <li><strong>{{ 'auto.m2afd9bd8a4' | translate }}</strong><span>{{ 'home.team.vinicius' | translate }}</span></li>
            <li><strong>{{ 'auto.mb22b75fc40' | translate }}</strong><span>{{ 'home.team.yasmin' | translate }}</span></li>
          </ul>
        </div>
      </section>

      <section class="apoio-secao">
        <div class="dentro apoio-grade">
          <div class="apoio-card privacidade-secao" id="privacidade" aria-labelledby="privacidade-titulo">
            <span class="apoio-marca" aria-hidden="true">01 / LGPD</span>
            <h2 id="privacidade-titulo">{{ 'home.privacy.title' | translate }}</h2>
            <p>{{ 'home.privacy.text1' | translate }}</p>
            <p>{{ 'home.privacy.text2' | translate }}</p>
            <div class="apoio-acoes">
              <a class="btn btn-primario" routerLink="/privacidade">{{ 'privacy.readMore' | translate }} <span aria-hidden="true">↗</span></a>
              <a href="https://wa.me/5511973389410?text=Ol%C3%A1%2C%20equipe%20UrbanTalk!%20Quero%20falar%20sobre%20meus%20dados." target="_blank" rel="noopener noreferrer">{{ 'home.privacy.contact' | translate }}</a>
            </div>
          </div>
          <div class="apoio-card contato-secao" id="contato" aria-labelledby="contato-titulo">
            <span class="apoio-marca" aria-hidden="true">02 / WhatsApp</span>
            <h2 id="contato-titulo">{{ 'home.contact.title' | translate }}</h2>
            <p>{{ 'home.contact.text' | translate }}</p>
            <a class="btn btn-contato" href="https://wa.me/5511973389410?text=Ol%C3%A1%2C%20equipe%20UrbanTalk!" target="_blank" rel="noopener noreferrer">{{ 'home.contact.button' | translate }} <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>
    </main>
    <footer class="rodape">
      <div class="dentro">
        <p>
          {{ 'home.footer.text' | translate }}
        </p>
        <p>{{ 'home.footer.map' | translate }}</p>
        <p><a href="#equipe">{{ 'home.footer.team' | translate }}</a> · <a routerLink="/privacidade">{{ 'home.privacy.title' | translate }}</a> · <a href="#contato">{{ 'home.footer.contact' | translate }}</a></p>
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
    .sobre-secao { padding: var(--s-7) 0; background: var(--concreto); }
    .equipe-topo { display: flex; justify-content: space-between; align-items: end; gap: var(--s-4); }
    .equipe-topo p { max-width: 68ch; margin-top: var(--s-2); color: var(--texto-2); }
    .equipe-controles { display: flex; align-items: center; gap: var(--s-2); flex: none; }
    .equipe-controles button { min-width: 44px; min-height: 44px; border: 1px solid var(--linha-forte); border-radius: var(--r-1); background: var(--superficie); color: var(--texto); cursor: pointer; font-size: 1.5rem; }
    .equipe-controles button:hover { background: var(--placa); color: #fff; }
    .equipe-controles .pausa { padding: 0 var(--s-3); font-size: var(--t-sm); font-weight: 600; }
    .equipe-controles span { min-width: 3.5rem; text-align: center; font-size: var(--t-sm); color: var(--texto-2); }
    .equipe-trilha { list-style: none; padding: 0 0 var(--s-2); margin: var(--s-5) 0 0; display: flex; gap: var(--s-3); overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: thin; }
    .equipe-trilha li { flex: 0 0 calc((100% - 2 * var(--s-3)) / 3); scroll-snap-align: start; min-width: 0; min-height: 126px; padding: var(--s-5); background: var(--superficie); border: 1px solid var(--linha); border-top: 4px solid var(--placa); border-radius: var(--r-1); display: flex; flex-direction: column; justify-content: space-between; gap: var(--s-3); }
    .equipe-trilha strong { font-size: var(--t-lg); }
    .equipe-trilha span { color: var(--texto-2); font-size: var(--t-sm); }
    .apoio-secao { padding: var(--s-7) 0; }
    .apoio-grade { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--s-4); }
    .apoio-card { min-width: 0; padding: var(--s-6); border-radius: var(--r-2); display: flex; flex-direction: column; align-items: flex-start; }
    .apoio-card h2 { margin: var(--s-3) 0; }
    .apoio-card p { max-width: 62ch; margin-bottom: var(--s-3); }
    .apoio-marca { font-size: var(--t-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .privacidade-secao { background: var(--concreto); border: 1px solid var(--linha); }
    .privacidade-secao .apoio-marca { color: var(--placa); }
    .apoio-acoes { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); width: 100%; margin-top: auto; padding-top: var(--s-3); }
    .apoio-acoes .btn { max-width: 100%; white-space: normal; }
    .apoio-acoes > a:not(.btn) { color: var(--placa); font-weight: 600; }
    .contato-secao { background: var(--asfalto); color: var(--texto-inverso); }
    .contato-secao .apoio-marca { color: var(--faixa); }
    .contato-secao p { color: var(--texto-inverso-2); }
    .btn-contato { background: var(--faixa); color: var(--asfalto); margin-top: auto; }
    .btn-contato:hover { filter: brightness(.95); }
    .rodape a { color: inherit; }

    @media (max-width: 1000px) {
      .hero { grid-template-columns: 1fr; gap: var(--s-5); padding-top: var(--s-6); }
      .hero-mapa { height: 400px; }
      .passos { grid-template-columns: repeat(2, 1fr); }
      .passos li::after { display: none; }
      .duas-colunas { grid-template-columns: 1fr; gap: var(--s-5); }
      .apoio-grade { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .dentro, .hero { padding-left: var(--s-4); padding-right: var(--s-4); }
      h1 { font-size: 2.125rem; }
      .lead { font-size: var(--t-md); }
      .hero-mapa { height: 320px; }
      .passos, .trilha { grid-template-columns: 1fr; }
      .legenda { flex-wrap: wrap; right: 10px; }
      .equipe-topo { align-items: start; flex-direction: column; }
      .equipe-trilha li { flex-basis: 85%; }
      .apoio-card { padding: var(--s-5); }
      .apoio-acoes { align-items: stretch; flex-direction: column; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit, AfterViewInit {
  @ViewChild('teamTrack') teamTrack?: ElementRef<HTMLElement>;
  private destroyRef = inject(DestroyRef);
  language = inject(LanguageService);
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
  teamIndex = signal(0);
  teamPaused = signal(false);
  teamHover = signal(false);
  teamFocus = signal(false);

  ngAfterViewInit() {
    const timer = window.setInterval(() => {
      if (!this.teamPaused() && !this.teamHover() && !this.teamFocus() && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.moveTeam(1);
    }, 5000);
    this.destroyRef.onDestroy(() => window.clearInterval(timer));
  }

  moveTeam(direction: number) {
    const track = this.teamTrack?.nativeElement;
    if (!track) return;
    const next = (this.teamIndex() + direction + track.children.length) % track.children.length;
    const card = track.children.item(next) as HTMLElement;
    track.scrollTo({ left: track.scrollLeft + card.getBoundingClientRect().left - track.getBoundingClientRect().left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    this.teamIndex.set(next);
  }

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
