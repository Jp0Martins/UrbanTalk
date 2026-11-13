import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Sort } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { RelativePipe } from '../core/format';
import { Filters, HeatGrid, MapMarker, NeighborhoodSummary, Occurrence, OccurrenceDetail, addressLine, placeKey } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { StatusLegendComponent } from '../shared/status-legend.component';
import { CategoryLabelComponent, PlacaComponent, StatusBadgeComponent } from '../shared/badges';
import { FilterBarComponent } from '../shared/filter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { MapComponent } from '../shared/map.component';
import { OccurrenceItemComponent } from '../shared/occurrence-item.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

@Component({
  selector: 'ut-mapa-page',
  imports: [
    RouterLink,
    PageHeaderComponent,
    FilterBarComponent,
    MapComponent,
    IconComponent,
    StatusBadgeComponent,
    CategoryLabelComponent,
    PlacaComponent,
    OccurrenceItemComponent,
    PaginationComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativePipe,
    StatusLegendComponent,
    TranslatePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina [title]="'auto.ma87dc97e16' | translate" [description]="'auto.mda1ead57dc' | translate">
        <div class="alternar" role="group" [aria-label]="'auto.md25621e0a7' | translate">
          <button type="button" class="btn btn-sm" [class.btn-primario]="view() === 'mapa'" [class.btn-secundario]="view() !== 'mapa'" [attr.aria-pressed]="view() === 'mapa'" (click)="setView('mapa')">
            <ut-icon name="map" [size]="16" />{{ 'auto.mb74e0f23cd' | translate }}
          </button>
          <button type="button" class="btn btn-sm" [class.btn-primario]="view() === 'lista'" [class.btn-secundario]="view() !== 'lista'" [attr.aria-pressed]="view() === 'lista'" (click)="setView('lista')">
            <ut-icon name="list" [size]="16" />{{ 'auto.me41a947762' | translate }}
          </button>
          <button type="button" class="btn btn-sm" [class.btn-primario]="view() === 'bairros'" [class.btn-secundario]="view() !== 'bairros'" [attr.aria-pressed]="view() === 'bairros'" (click)="setView('bairros')">
            <ut-icon name="pin" [size]="16" />{{ 'auto.mcca8b7d5ec' | translate }}
          </button>
        </div>
      </ut-cabecalho-pagina>

      <ut-filtros [value]="filters()" [showSearch]="view() === 'lista'" [showDates]="true" [showStreet]="true" (changed)="applyFilters($event)" [label]="'auto.m217a2aa3ba' | translate" />

      @if (error(); as e) {
        <div class="espaco"><ut-erro [message]="e" (retry)="reload()" /></div>
      }

      @if (view() === 'mapa') {
        <div class="divisao">
          <div class="mapa-caixa">
            <ut-mapa class="mapa" [markers]="markers()" [heat]="layer() === 'concentracao' ? heat() : null" [selectedId]="selectedId()" [fitToMarkers]="true" (markerSelect)="select($event)" [label]="'auto.m50381d8f6e' | translate" />
            <div class="camadas segmentado" role="group" [aria-label]="'auto.m2b0b3566c4' | translate">
              <button type="button" [attr.aria-pressed]="layer() === 'marcadores'" (click)="setLayer('marcadores')"><ut-icon name="pin" [size]="16" />{{ 'auto.m8f4dd2f45c' | translate }}</button>
              <button type="button" [attr.aria-pressed]="layer() === 'concentracao'" (click)="setLayer('concentracao')"><ut-icon name="sparkle" [size]="16" />{{ 'auto.mde9057b858' | translate }}</button>
            </div>
            @if (layer() === 'concentracao') {
              <div class="legenda calor">
                @if (heat(); as h) {
                  <span class="escala" aria-hidden="true"><i style="background:#fde9b8"></i><i style="background:#f8c66b"></i><i style="background:#ee9437"></i><i style="background:#d1601b"></i><i style="background:#9e3412"></i></span>
                  <span>Menos → mais registros por quadrado de ~{{ h.cellMeters }} m (máx. {{ h.max }})</span>
                }
              </div>
            } @else {
              <ut-legenda-status class="legenda" hint="O ícone indica a categoria" />
            }
            @if (loadingMarkers()) {
              <div class="mapa-aviso" role="status">{{ 'auto.ma8d77a14f2' | translate }}</div>
            }
          </div>

          <aside class="lado" [aria-label]="'auto.me04e6dedc0' | translate">
            @if (selected(); as o) {
              <div class="previa">
                <button type="button" class="btn btn-texto btn-sm voltar" (click)="selectedId.set(null)"><ut-icon name="arrow-left" [size]="16" />{{ 'auto.m65ad557d93' | translate }}</button>
                @if (o.photoUrl) {
                  <img [src]="o.photoUrl" [alt]="'Foto enviada para a ocorrência ' + o.code" class="foto" />
                }
                <div class="previa-topo">
                  <ut-categoria [icon]="o.category.icon" [name]="o.category.name" [detail]="o.categoryDetail" />
                  <ut-status [status]="o.status" />
                </div>
                <p>{{ o.description }}</p>
                <div class="meta">
                  <ut-placa>{{ address(o) }}</ut-placa>
                  <span class="tabular">{{ o.code }}</span>
                  <span>{{ o.createdAt | relativo }}</span>
                </div>
                <p class="conf"><ut-icon name="hand" [size]="18" /><span class="tabular">{{ o.confirmations }}</span> {{ o.confirmations === 1 ? ('auto.m125375e18e' | translate) : ('auto.me11a7b2e09' | translate) }}</p>
                <a [routerLink]="['/ocorrencias', o.id]" class="btn btn-primario">{{ 'auto.m992f12f23b' | translate }}</a>
              </div>
            } @else if (loadingDetail()) {
              <p class="carregando">{{ 'auto.m33310c10c0' | translate }}</p>
            } @else {
              @if (layer() === 'concentracao' && heat(); as h) {
                <div class="aviso" [class.aviso-atencao]="!h.reliable" [class.aviso-info]="h.reliable" role="status">
                  <ut-icon name="info" [size]="18" />
                  <span>
                    @if (!h.reliable) {
                      Só {{ h.total }} {{ h.total === 1 ? ('auto.m0ac94d3165' | translate) : ('auto.m8d4b3cbe7d' | translate) }} com estes filtros (mínimo de {{ h.minSample }} para comparar áreas). A concentração é mostrada só como referência e nenhuma região deve ser vista como problemática por isso.
                    } @else {
                      {{ h.total }} registros reais, agrupados em quadrados de ~{{ h.cellMeters }} m. Mais registros pode significar mais participação dos moradores naquela área, não só mais problemas. Duplicatas confirmadas pela equipe não contam duas vezes.
                    }
                  </span>
                </div>
              }
              @if (hoodItem(); as hz) {
                <section class="resumo-bairro" [aria-label]="'auto.m1c27f0d090' | translate">
                  <h2>{{ hz.name }}</h2>
                  <dl class="nums"><div><dt>{{ 'auto.m144e6627bf' | translate }}</dt><dd>{{ hz.total }}</dd></div><div><dt>{{ 'auto.mf6e9789267' | translate }}</dt><dd>{{ hz.open }}</dd></div><div><dt>{{ 'auto.m6d70e1959a' | translate }}</dt><dd>{{ hz.resolved }}</dd></div></dl>
                  @if (hz.recurring.length) {
                    <p class="dica">Categorias recorrentes (3 ou mais registros): @for (c of hz.recurring; track c.id; let l = $last) { <strong>{{ c.name }}</strong> ({{ c.count }}){{ l ? '' : ', ' }} }</p>
                  } @else {
                    <p class="dica">{{ 'auto.mac2b9fa00e' | translate }}</p>
                  }
                  <a class="btn btn-texto btn-sm" routerLink="/comunidade/foruns" [queryParams]="{ bairro: hz.name }">{{ 'auto.m7e62cb8701' | translate }}</a>
                </section>
              }
              <div class="lado-topo">
                <p><strong class="tabular">{{ markers().length.toLocaleString('pt-BR') }}</strong> {{ markers().length === 1 ? ('auto.mf0c222df00' | translate) : ('auto.ma06ec91e02' | translate) }} no mapa</p>
                @if (truncated()) {
                  <p class="dica">{{ 'auto.mf70ad11772' | translate }}</p>
                }
                @if (withoutPoint() > 0) {
                  <p class="dica">{{ withoutPoint() === 1 ? '1 reclamação da cidade toda não tem ponto' : withoutPoint() + ' reclamações da cidade toda não têm ponto' }} e aparece{{ withoutPoint() === 1 ? '' : ('auto.m6b0d31c0d5' | translate) }} só na <button type="button" class="link" (click)="setView('lista')">{{ 'auto.m22d01cec21' | translate }}</button>.</p>
                }
              </div>
              @if (!loadingMarkers() && markers().length === 0 && !error()) {
                <ut-vazio icon="pin" [title]="'auto.m1ec4888562' | translate" [text]="'auto.m75351be2d2' | translate" />
              }
              <ul class="mini-lista">
                @for (m of markers().slice(0, shown()); track m.id) {
                  <li>
                    <button type="button" class="mini" (click)="select(m.id)">
                      <span class="pino" [attr.data-color]="catalog.get(m.status).color"><ut-icon [name]="m.categoryIcon" [size]="14" /></span>
                      <span class="mini-texto">
                        <strong>{{ m.categoryName }}</strong>
                        <span>{{ m.street ? m.street + ', ' : '' }}{{ m.neighborhoodName ?? ('auto.mf42a4c41ae' | translate) }} · {{ m.createdAt | relativo }}</span>
                      </span>
                      <span class="sr-only">Status: {{ catalog.name(m.status) }}</span>
                    </button>
                  </li>
                }
              </ul>
              @if (markers().length > shown()) {
                <button type="button" class="btn btn-texto btn-sm" (click)="shown.set(shown() + 30)">{{ 'auto.md30954e0b4' | translate }}</button>
              }
            }
          </aside>
        </div>
      } @else if (view() === 'bairros') {
        @if (hoods(); as hs) {
          @if (hs.total === 0) {
            <ut-vazio icon="pin" [title]="'auto.m1e9636d70a' | translate" [text]="'auto.mb42c848748' | translate" />
          } @else {
            <div class="rankings">
              <section class="painel rank">
                <h2>{{ 'auto.m73e5a70d87' | translate }}</h2>
                @if (hs.rankings.mostOpen.length === 0) { <p class="dica">{{ 'auto.m3a38ebffce' | translate }}</p> }
                <ol>@for (r of hs.rankings.mostOpen; track r.key) { <li><button type="button" class="link" (click)="pickHood(r.key)">{{ r.name }}</button><span class="tabular">{{ r.value }} de {{ r.total }}</span></li> }</ol>
              </section>
              <section class="painel rank">
                <h2>{{ 'auto.m9c0a05909f' | translate }}</h2>
                @if (hs.rankings.mostResolved.length === 0) { <p class="dica">{{ 'auto.m8bf50bd391' | translate }}</p> }
                <ol>@for (r of hs.rankings.mostResolved; track r.key) { <li><button type="button" class="link" (click)="pickHood(r.key)">{{ r.name }}</button><span class="tabular">{{ r.value }} de {{ r.total }}</span></li> }</ol>
              </section>
              @if (hs.cityWide.total > 0) {
                <p class="dica nota-rank">Além dos bairros, {{ hs.cityWide.total === 1 ? ('auto.m1885228eae' | translate) : 'há ' + hs.cityWide.total + ' reclamações' }} que vale{{ hs.cityWide.total === 1 ? '' : ('auto.m6b0d31c0d5' | translate) }} para a cidade toda ({{ hs.cityWide.open }} em aberto).</p>
              }
              <p class="dica nota-rank">Bairros com grafias diferentes (acentos, maiúsculas) são somados juntos. Rankings só consideram bairros com {{ hs.rankings.minSample }} ou mais registros. Os números refletem o que foi registrado no UrbanTalk; bairros com mais participação tendem a aparecer mais.</p>
            </div>
            <div class="bairros-grade">
              <ul class="painel bairros-lista" [aria-label]="'auto.m3286167bd4' | translate">
                @for (h of hs.items; track h.key) {
                  <li><button type="button" class="bairro-btn" [class.ativo]="pickedHood() === h.key" [attr.aria-pressed]="pickedHood() === h.key" (click)="pickHood(h.key)">
                    <span class="b-nome">{{ h.name }}</span>
                    <span class="b-num tabular">{{ h.total }}</span>
                    <span class="b-barra" aria-hidden="true"><i class="ab" [style.width.%]="(h.open / maxHood()) * 100"></i><i class="re" [style.width.%]="(h.resolved / maxHood()) * 100"></i></span>
                    <span class="b-sub">{{ h.open }} em aberto · {{ h.resolved }} resolvidas</span>
                  </button></li>
                }
              </ul>
              @if (picked(); as h) {
                <section class="painel bairro-det" aria-live="polite">
                  <h2>{{ h.name }}</h2>
                  <dl class="nums"><div><dt>{{ 'auto.m144e6627bf' | translate }}</dt><dd>{{ h.total }}</dd></div><div><dt>{{ 'auto.mf6e9789267' | translate }}</dt><dd>{{ h.open }}</dd></div><div><dt>{{ 'auto.m6d70e1959a' | translate }}</dt><dd>{{ h.resolved }}</dd></div></dl>
                  <h3>{{ 'auto.m8da7519ee2' | translate }}</h3>
                  <ul class="cats">
                    @for (c of h.categories; track c.id) {
                      <li><ut-icon [name]="c.icon" [size]="16" /><span class="c-nome">{{ c.name }}</span><span class="c-barra"><i [style.width.%]="(c.count / h.categories[0].count) * 100"></i></span><span class="tabular">{{ c.count }}</span>@if (c.count >= 3) { <span class="selo-texto">{{ 'auto.mdea50411b9' | translate }}</span> }</li>
                    }
                  </ul>
                  <div class="acoes-b">
                    <button type="button" class="btn btn-secundario btn-sm" (click)="showHoodOnMap(h.name)"><ut-icon name="map" [size]="16" />{{ 'auto.m45f3f64f78' | translate }}</button>
                    <a class="btn btn-texto btn-sm" routerLink="/comunidade/foruns" [queryParams]="{ bairro: h.name }">{{ 'auto.m7e62cb8701' | translate }}</a>
                  </div>
                </section>
              } @else {
                <p class="painel bairro-det dica">{{ 'auto.m7fbb392594' | translate }}</p>
              }
            </div>
          }
        } @else {
          <p class="carregando">{{ 'auto.m7961de49b0' | translate }}</p>
        }
      } @else {
        <div class="lista-topo">
          <p aria-live="polite">
            @if (page(); as p) {
              <strong class="tabular">{{ p.total.toLocaleString('pt-BR') }}</strong> {{ p.total === 1 ? ('auto.m4934149abf' | translate) : ('auto.medd3b4ce26' | translate) }}
            }
          </p>
          <div class="ordem campo">
            <label for="ordem" class="sr-only">{{ 'auto.m1f77dbb2bd' | translate }}</label>
            <select id="ordem" class="entrada" (change)="setSort($any($event.target).value)">
              <option value="recent" [selected]="sort() === 'recent'">{{ 'auto.m544f071b0a' | translate }}</option>
              <option value="confirmations" [selected]="sort() === 'confirmations'">{{ 'auto.m4b8b145785' | translate }}</option>
              <option value="oldest" [selected]="sort() === 'oldest'">{{ 'auto.m424fcf5c8a' | translate }}</option>
            </select>
          </div>
        </div>
        @if (loadingList()) {
          <p class="carregando">{{ 'auto.m74403a934f' | translate }}</p>
        } @else if (page(); as p) {
          @if (p.items.length === 0) {
            <ut-vazio icon="search" [title]="'auto.m76c7490c08' | translate" [text]="'auto.m7d4d2cba26' | translate" />
          } @else {
            <div class="painel lista">
              @for (o of p.items; track o.id) {
                <ut-ocorrencia-item [item]="o" />
              }
            </div>
            <ut-paginacao [page]="p.page" [totalPages]="p.totalPages" (go)="loadList($event)" />
          }
        }
      }
    </div>
  `,
  styles: `
    .alternar { display: flex; gap: 0; }
    .alternar .btn:first-child { border-radius: var(--r-1) 0 0 var(--r-1); }
    .alternar .btn:last-child { border-radius: 0 var(--r-1) var(--r-1) 0; margin-left: -1px; }
    ut-filtros { display: block; margin-bottom: var(--s-4); }
    .espaco { margin-bottom: var(--s-4); }
    .divisao { display: grid; grid-template-columns: minmax(0, 1fr) 360px; grid-template-rows: minmax(0, 1fr); gap: var(--s-4); height: calc(100dvh - 300px); min-height: 520px; }
    .mapa-caixa { position: relative; border: 1px solid var(--linha); border-radius: var(--r-2); overflow: hidden; }
    .mapa { position: absolute; inset: 0; }
    .legenda {
      position: absolute; left: 10px; bottom: 22px; z-index: 500;
      background: rgb(255 255 255 / 0.95); border: 1px solid var(--linha); border-radius: var(--r-1);
      padding: 6px 10px; font-size: var(--t-xs); font-weight: 500; max-width: calc(100% - 20px);
    }

    .mapa-aviso { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 500; background: var(--asfalto); color: #fff; padding: 6px 12px; border-radius: var(--r-1); font-size: var(--t-sm); }

    /* a lista rola dentro do painel; relative prende os textos escondidos de leitor de tela, que esticavam a página */
    .lado { background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); overflow-y: auto; padding: var(--s-4); min-height: 0; position: relative; }
    .lado-topo { margin-bottom: var(--s-3); }
    .lado-topo .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .mini-lista { list-style: none; margin: 0 calc(-1 * var(--s-4)); padding: 0; border-top: 1px solid var(--linha); }
    .mini {
      width: 100%; display: flex; gap: var(--s-3); align-items: center; text-align: left;
      background: none; border: 0; border-bottom: 1px solid var(--linha); padding: 10px var(--s-4); cursor: pointer;
    }
    .mini:hover { background: var(--superficie-2); }
    .mini-texto { display: flex; flex-direction: column; min-width: 0; font-size: var(--t-sm); }
    .mini-texto span { color: var(--texto-2); font-size: var(--t-xs); }
    .pino { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; flex: none; }
    .pino { background: var(--cor); }

    .previa { display: flex; flex-direction: column; gap: var(--s-3); }
    .voltar { align-self: flex-start; margin-left: calc(-1 * var(--s-2)); }
    .foto { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--r-1); background: var(--concreto); }
    .previa-topo { display: flex; justify-content: space-between; gap: var(--s-2); align-items: center; font-weight: 600; flex-wrap: wrap; }
    .meta { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; font-size: var(--t-xs); color: var(--texto-3); }
    .conf { display: flex; align-items: center; gap: 6px; color: var(--texto-2); font-size: var(--t-sm); }
    .conf .tabular { font-weight: 600; color: var(--texto); }

    .camadas { position: absolute; top: 10px; right: 10px; z-index: 500; background: rgb(255 255 255 / 0.95); }
    .camadas button { min-height: 32px; padding: 0 10px; font-size: var(--t-sm); }
    .calor { display: flex; gap: 8px; align-items: center; }
    .escala { display: inline-flex; }
    .escala i { width: 16px; height: 10px; display: block; }
    .lado .aviso { margin-bottom: var(--s-3); }
    .resumo-bairro { background: var(--superficie-2); border-radius: var(--r-1); padding: var(--s-3); margin-bottom: var(--s-3); display: flex; flex-direction: column; gap: 6px; }
    .resumo-bairro h2, .bairro-det h2 { font-size: var(--t-lg); }
    .nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0; }
    .nums div { background: var(--superficie); border-radius: var(--r-1); padding: 6px 8px; }
    .nums dt { font-size: var(--t-xs); color: var(--texto-2); }
    .nums dd { margin: 0; font-family: var(--fonte-titulo); font-weight: 700; font-size: var(--t-xl); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .rankings { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); margin-bottom: var(--s-4); }
    .rank { padding: var(--s-4); }
    .rank h2 { font-size: var(--t-md); margin-bottom: var(--s-2); }
    .rank ol { margin: 0; padding-left: 1.3em; display: flex; flex-direction: column; gap: 4px; }
    .rank li span { margin-left: 8px; color: var(--texto-2); font-size: var(--t-sm); }
    .nota-rank { grid-column: 1 / -1; }
    .link { background: none; border: 0; padding: 0; color: var(--placa); text-decoration: underline; cursor: pointer; font: inherit; }
    .bairros-grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 420px); gap: var(--s-4); align-items: start; }
    .bairros-lista { list-style: none; margin: 0; padding: 0; overflow: hidden; }
    .bairro-btn { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px var(--s-3); text-align: left; background: none; border: 0; border-bottom: 1px solid var(--linha); padding: 10px var(--s-4); cursor: pointer; }
    .bairro-btn:hover, .bairro-btn.ativo { background: var(--superficie-2); }
    .bairro-btn.ativo { box-shadow: inset 4px 0 0 var(--faixa); }
    .b-nome { font-weight: 600; }
    .b-num { font-weight: 700; }
    .b-barra { grid-column: 1 / -1; display: flex; height: 6px; background: var(--superficie-2); border-radius: 3px; overflow: hidden; }
    .b-barra .ab { background: var(--st-ambar); }
    .b-barra .re { background: var(--st-verde); }
    .b-sub { grid-column: 1 / -1; font-size: var(--t-xs); color: var(--texto-2); }
    .bairro-det { padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); position: sticky; top: var(--s-4); }
    .bairro-det h3 { font-size: var(--t-md); }
    .cats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: var(--t-sm); }
    .cats li { display: grid; grid-template-columns: auto minmax(0, 1fr) 80px auto auto; gap: 6px; align-items: center; }
    .c-barra { height: 8px; background: var(--superficie-2); border-radius: 3px; overflow: hidden; }
    .c-barra i { display: block; height: 100%; background: var(--placa); }
    .acoes-b { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    @media (max-width: 900px) { .rankings, .bairros-grade { grid-template-columns: 1fr; } .bairro-det { position: static; } }
    .lista-topo { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); flex-wrap: wrap; }
    .ordem { width: 240px; }
    .lista { overflow: hidden; }

    @media (max-width: 1000px) {
      .divisao { grid-template-columns: 1fr; grid-template-rows: auto; height: auto; }
      .mapa-caixa { height: 420px; }
      .lado { max-height: none; }
    }
    @media (max-width: 640px) {
      .mapa-caixa { height: 360px; }
      .leg-dica { display: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  catalog = inject(StatusCatalog);
  address = addressLine;
  view = signal<'mapa' | 'lista' | 'bairros'>('mapa');
  layer = signal<'marcadores' | 'concentracao'>('marcadores');
  heat = signal<HeatGrid | null>(null);
  hoods = signal<NeighborhoodSummary | null>(null);
  pickedHood = signal<string | null>(null);
  picked = computed(() => this.hoods()?.items.find((h) => h.key === this.pickedHood()) ?? null);
  maxHood = computed(() => Math.max(1, ...(this.hoods()?.items.map((h) => h.total) ?? [1])));
  // resumo do bairro filtrado, mostrado ao lado do mapa
  hoodItem = computed(() => {
    const name = this.filters().neighborhood;
    const key = name ? placeKey(name) : '';
    return key ? (this.hoods()?.items.find((h) => h.key === key) ?? null) : null;
  });
  filters = signal<Filters>({});
  sort = signal<Sort>('recent');
  markers = signal<MapMarker[]>([]);
  truncated = signal(false);
  withoutPoint = signal(0);
  shown = signal(30);
  selectedId = signal<number | null>(null);
  detail = signal<OccurrenceDetail | null>(null);
  selected = computed(() => {
    const d = this.detail();
    return d && d.id === this.selectedId() ? d : null;
  });
  page = signal<{ items: Occurrence[]; page: number; totalPages: number; total: number } | null>(null);
  loadingMarkers = signal(false);
  loadingList = signal(false);
  loadingDetail = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const num = (k: string) => (q.get(k) ? Number(q.get(k)) : null);
    this.filters.set({
      category: num('categoria'),
      neighborhood: q.get('bairro') || null,
      scope: (q.get('onde') as Filters['scope']) || null,
      status: q.get('status') || null,
    });
    const ver = q.get('ver');
    if (ver === 'lista' || ver === 'bairros') this.view.set(ver);
    if (q.get('camada') === 'concentracao') this.layer.set('concentracao');
    this.reload();
  }

  reload() {
    if (this.view() === 'mapa') {
      this.loadMarkers();
      if (this.layer() === 'concentracao') this.loadHeat();
      if (this.filters().neighborhood) this.loadHoods();
    } else if (this.view() === 'bairros') this.loadHoods();
    else this.loadList(1);
  }

  setView(v: 'mapa' | 'lista' | 'bairros') {
    if (this.view() === v) return;
    this.view.set(v);
    if (v !== 'lista') this.filters.update((f) => ({ ...f, q: null }));
    this.syncUrl();
    this.reload();
  }

  setLayer(l: 'marcadores' | 'concentracao') {
    this.layer.set(l);
    this.selectedId.set(null);
    this.syncUrl();
    if (l === 'concentracao') this.loadHeat();
  }

  private loadHeat() {
    this.api.heat(this.filters()).subscribe({ next: (h) => this.heat.set(h), error: (e) => this.error.set(toApiError(e).message) });
  }

  private loadHoods() {
    this.api.neighborhoodSummary(this.filters()).subscribe({ next: (h) => this.hoods.set(h), error: (e) => this.error.set(toApiError(e).message) });
  }

  pickHood(key: string) {
    this.pickedHood.set(key);
  }

  showHoodOnMap(name: string) {
    this.filters.set({ ...this.filters(), neighborhood: name, scope: null });
    this.view.set('mapa');
    this.syncUrl();
    this.reload();
  }

  setSort(s: Sort) {
    this.sort.set(s);
    this.loadList(1);
  }

  applyFilters(f: Filters) {
    this.filters.set(f);
    this.selectedId.set(null);
    this.shown.set(30);
    this.syncUrl();
    this.reload();
  }

  select(id: number) {
    this.selectedId.set(id);
    if (this.detail()?.id === id) return;
    this.loadingDetail.set(true);
    this.api.get(id).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.loadingDetail.set(false);
      },
      error: (e) => {
        this.loadingDetail.set(false);
        this.selectedId.set(null);
        this.error.set(toApiError(e).message);
      },
    });
  }

  private loadMarkers() {
    this.loadingMarkers.set(true);
    this.error.set(null);
    this.api.markers(this.filters()).subscribe({
      next: (r) => {
        this.markers.set(r.markers);
        this.truncated.set(r.truncated);
        this.withoutPoint.set(r.withoutPoint ?? 0);
        this.loadingMarkers.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loadingMarkers.set(false);
      },
    });
  }

  loadList(page: number) {
    this.loadingList.set(true);
    this.error.set(null);
    this.api.list(this.filters(), page, 20, this.sort()).subscribe({
      next: (p) => {
        this.page.set(p);
        this.loadingList.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loadingList.set(false);
      },
    });
  }

  private syncUrl() {
    const f = this.filters();
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        ver: this.view() !== 'mapa' ? this.view() : null,
        camada: this.layer() === 'concentracao' ? 'concentracao' : null,
        categoria: f.category ?? null,
        bairro: f.neighborhood ?? null,
        onde: f.scope ?? null,
        status: f.status ?? null,
      },
    });
  }
}
