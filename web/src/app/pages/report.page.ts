import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { Category, MAX_PHOTO_MB, OccurrenceDetail, PHOTO_TYPES, Scope, insideSorocaba } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { ToastService } from '../core/toast.service';
import { PlacaComponent } from '../shared/badges';
import { IconComponent } from '../shared/icon.component';
import { LatLng, MapComponent } from '../shared/map.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';

type Step = 1 | 2 | 3;

@Component({
  selector: 'ut-registrar',
  imports: [RouterLink, PageHeaderComponent, MapComponent, IconComponent, PlacaComponent, NeighborhoodInputComponent],
  template: `
    <div class="pagina">
      @if (created(); as c) {
        <section class="sucesso" aria-labelledby="ok-t">
          <div class="selo"><ut-icon name="check" [size]="28" /></div>
          <h1 id="ok-t" tabindex="-1" #okTitle>Pronto! Reclamação {{ c.code }} registrada</h1>
          <p>Ela foi salva e já aparece na lista pública com o status <strong>{{ statusName(c.status) }}</strong>. A equipe do UrbanTalk vê a reclamação na hora, e você acompanha cada novidade em Minhas reclamações.</p>
          <div class="acoes">
            <a [routerLink]="['/ocorrencias', c.id]" class="btn btn-primario">Ver a reclamação</a>
            <a routerLink="/comunidade" [queryParams]="{ ocorrencia: c.id }" class="btn btn-secundario"><ut-icon name="chat" [size]="18" />Contar para a comunidade</a>
            <button type="button" class="btn btn-texto" (click)="reset()">Registrar outra</button>
          </div>
        </section>
      } @else {
        <ut-cabecalho-pagina title="Registrar uma reclamação" description="Três passos rápidos: onde se aplica, o que é e revisão. Nada é enviado antes de você conferir." />

        <ol class="etapas" aria-label="Etapas do registro">
          @for (s of steps; track s.n) {
            <li [class.atual]="step() === s.n" [class.feita]="step() > s.n" [attr.aria-current]="step() === s.n ? 'step' : null">
              <span class="n">@if (step() > s.n) { <ut-icon name="check" [size]="16" /> } @else { {{ s.n }} }</span>{{ s.label }}
            </li>
          }
        </ol>

        @if (step() === 1) {
          <section class="passo-local" aria-labelledby="p1">
            <h2 id="p1" class="sr-only">Onde é o problema</h2>
            <div class="mapa-caixa" [class.apagado]="scope() === 'cidade' && !point()">
              <ut-mapa #picker class="mapa" mode="pick" [pickValue]="point()" (picked)="setPoint($event, 'mapa')" label="Mapa para marcar o local do problema. Clique no mapa ou arraste o marcador." />
              @if (!point()) {
                <div class="mapa-dica" aria-hidden="true">{{ scope() === 'cidade' ? 'Opcional: marque um ponto de exemplo' : scope() === 'bairro' ? 'Clique no mapa no ponto exato do problema' : 'Primeiro, diga ao lado onde o problema se aplica' }}</div>
              }
            </div>
            <div class="campos">
              <fieldset class="onde" [attr.aria-invalid]="!!errors()['scope']">
                <legend class="rotulo">Onde se aplica?</legend>
                <div class="onde-opcoes">
                  <label class="onde-op" [class.marcada]="scope() === 'cidade'">
                    <input type="radio" name="abrangencia" value="cidade" [checked]="scope() === 'cidade'" (change)="setScope('cidade')" />
                    <span class="onde-nome">Cidade toda</span>
                    <span class="onde-desc">Afeta Sorocaba inteira, sem um bairro específico</span>
                  </label>
                  <label class="onde-op" [class.marcada]="scope() === 'bairro'">
                    <input type="radio" name="abrangencia" value="bairro" [checked]="scope() === 'bairro'" (change)="setScope('bairro')" />
                    <span class="onde-nome">Bairro</span>
                    <span class="onde-desc">Acontece em um lugar específico</span>
                  </label>
                </div>
                @if (errors()['scope']) {
                  <p class="erro" role="alert">{{ errors()['scope'] }}</p>
                }
              </fieldset>

              @if (scope() === 'bairro') {
                <div class="campo">
                  <label for="bairro">Nome do bairro</label>
                  <ut-bairro inputId="bairro" [required]="true" [invalid]="!!errors()['neighborhoodName']" describedBy="bairro-dica" [value]="neighborhoodName()" (valueChange)="setHoodName($event)" />
                  <span class="dica" id="bairro-dica">Escreva como você conhece o bairro. Se ele não aparecer nas sugestões, tudo bem: o nome novo é aceito.</span>
                  @if (errors()['neighborhoodName']) {
                    <p class="erro" role="alert">{{ errors()['neighborhoodName'] }}</p>
                  }
                </div>
              }

              @if (scope()) {
                <div class="campo">
                  <span class="rotulo">{{ scope() === 'cidade' ? 'Ponto de exemplo no mapa (opcional)' : 'Local no mapa' }}</span>
                  <button type="button" class="btn btn-secundario" (click)="locate()" [disabled]="locating()">
                    <ut-icon name="locate" [size]="18" />{{ locating() ? 'Buscando sua localização…' : 'Usar minha localização' }}
                  </button>
                  @if (geoMsg(); as g) {
                    <p class="dica" [class.erro]="g.kind === 'erro'" role="status">{{ g.text }}</p>
                  }
                  <p class="dica">{{ scope() === 'cidade' ? 'Não é preciso marcar nada. Use só se quiser mostrar um lugar onde o problema aparece.' : 'Você também pode clicar no mapa ou arrastar o marcador para corrigir o ponto.' }}</p>
                  @if (point(); as p) {
                    <p class="coords tabular">Ponto marcado: {{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}
                      @if (scope() === 'cidade') { <button type="button" class="btn btn-texto btn-sm" (click)="point.set(null)">Remover ponto</button> }
                    </p>
                  }
                  @if (errors()['latitude'] || errors()['longitude']) {
                    <p class="erro" role="alert">{{ errors()['latitude'] || errors()['longitude'] }}</p>
                  }
                </div>
              }

              @if (scope() === 'bairro') {
                <div class="campo">
                  <label for="rua">Rua ou via <span class="muted">(recomendado)</span></label>
                  <input id="rua" class="entrada" maxlength="160" autocomplete="address-line1" [value]="street()" (input)="street.set($any($event.target).value)" [attr.aria-invalid]="!!errors()['street']" aria-describedby="rua-dica" placeholder="Ex.: Rua XV de Novembro" />
                  <span class="dica" id="rua-dica">Escreva do jeito que aparece na placa. Não sabe o nome? Deixe em branco e use o ponto de referência.</span>
                  @if (errors()['street']) {
                    <p class="erro" role="alert">{{ errors()['street'] }}</p>
                  }
                </div>
                <div class="campo">
                  <label for="ref">Ponto de referência <span class="muted">(opcional)</span></label>
                  <input id="ref" class="entrada" maxlength="120" [value]="reference()" (input)="reference.set($any($event.target).value)" placeholder="Ex.: em frente ao nº 250, perto da padaria" />
                </div>
              }
              <div class="nav">
                <button type="button" class="btn btn-primario" (click)="next()">Continuar</button>
              </div>
            </div>
          </section>
        }

        @if (step() === 2) {
          <section class="passo-o-que" aria-labelledby="p2">
            <h2 id="p2" class="sr-only">O que está acontecendo</h2>
            <fieldset class="categorias" [attr.aria-invalid]="!!errors()['categoryId']">
              <legend class="rotulo">Tipo de problema</legend>
              <div class="cat-grade">
                @for (c of categories(); track c.id) {
                  <label class="cat" [class.marcada]="categoryId() === c.id">
                    <input type="radio" name="categoria" [value]="c.id" [checked]="categoryId() === c.id" (change)="categoryId.set(c.id)" />
                    <ut-icon [name]="c.icon" [size]="26" />
                    <span class="cat-nome">{{ c.name }}</span>
                    <span class="cat-desc">{{ c.description }}</span>
                  </label>
                }
              </div>
              @if (errors()['categoryId']) {
                <p class="erro" role="alert">{{ errors()['categoryId'] }}</p>
              }
            </fieldset>

            @if (selectedCategory()?.requiresDetail) {
              <div class="campo detalhe-outros">
                <label for="detalhe">Qual é o problema?</label>
                <input id="detalhe" class="entrada" maxlength="80" [value]="categoryDetail()" (input)="categoryDetail.set($any($event.target).value)" [attr.aria-invalid]="!!errors()['categoryDetail']" aria-describedby="detalhe-dica" placeholder="Ex.: árvore caída, vazamento de água, fio solto" />
                <span class="dica" id="detalhe-dica">Em poucas palavras. A reclamação continua na categoria Outros, e a equipe usa esse texto para entender o caso.</span>
                @if (errors()['categoryDetail']) {
                  <p class="erro" role="alert">{{ errors()['categoryDetail'] }}</p>
                }
              </div>
            }

            <div class="lado-a-lado">
              <div class="campo">
                <label for="desc">Descrição</label>
                <textarea id="desc" class="entrada" rows="5" maxlength="1000" [value]="description()" (input)="description.set($any($event.target).value)" [attr.aria-invalid]="!!errors()['description']" aria-describedby="desc-dica" placeholder="O que você viu, há quanto tempo e como afeta quem passa por ali."></textarea>
                <span class="dica tabular" id="desc-dica">{{ description().trim().length }}/1000 caracteres, mínimo 10.</span>
                @if (errors()['description']) {
                  <p class="erro" role="alert">{{ errors()['description'] }}</p>
                }
              </div>
              <div class="campo">
                <span class="rotulo" id="foto-r">Foto <span class="muted">(recomendada)</span></span>
                @if (photoPreview(); as src) {
                  <div class="foto-previa">
                    <img [src]="src" alt="Prévia da foto escolhida" />
                    <button type="button" class="btn btn-secundario btn-sm" (click)="removePhoto()"><ut-icon name="x" [size]="16" />Remover foto</button>
                  </div>
                } @else {
                  <label class="foto-escolher">
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" (change)="pickPhoto($event)" aria-labelledby="foto-r" />
                    <ut-icon name="camera" [size]="26" />
                    <span>Tirar ou escolher foto</span>
                    <span class="dica">JPG, PNG ou WebP, até {{ maxMb }} MB.</span>
                  </label>
                }
                @if (errors()['photo']) {
                  <p class="erro" role="alert">{{ errors()['photo'] }}</p>
                }
              </div>
            </div>
            <div class="nav">
              <button type="button" class="btn btn-secundario" (click)="step.set(1)"><ut-icon name="arrow-left" [size]="18" />Voltar</button>
              <button type="button" class="btn btn-primario" (click)="next()">Revisar</button>
            </div>
          </section>
        }

        @if (step() === 3) {
          <section class="passo-revisar" aria-labelledby="p3">
            <h2 id="p3">Confira antes de enviar</h2>
            @if (submitError()) {
              <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ submitError() }}</div>
            }
            <dl class="resumo">
              <div><dt>Tipo</dt><dd>{{ selectedCategory()?.name }}@if (selectedCategory()?.requiresDetail) { : {{ categoryDetail().trim() }} }</dd><dd><button type="button" class="btn btn-texto btn-sm" (click)="step.set(2)">Alterar</button></dd></div>
              <div><dt>Descrição</dt><dd class="pre">{{ description().trim() }}</dd><dd><button type="button" class="btn btn-texto btn-sm" (click)="step.set(2)">Alterar</button></dd></div>
              <div><dt>Onde se aplica</dt><dd>@if (scope() === 'cidade') { <ut-placa size="lg">Cidade toda</ut-placa><br /><span class="muted">Sem bairro específico</span> } @else { <ut-placa size="lg">{{ street().trim() ? street().trim() + ', ' : '' }}{{ hoodClean() }}</ut-placa>@if (!street().trim()) {<br /><span class="muted">Rua não informada</span>}@if (reference().trim()) {<br /><span class="muted">Referência: {{ reference().trim() }}</span>} }</dd><dd><button type="button" class="btn btn-texto btn-sm" (click)="step.set(1)">Alterar</button></dd></div>
              <div><dt>Ponto no mapa</dt><dd class="tabular muted">@if (point(); as p) { {{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }} } @else { Nenhum ponto marcado }</dd><dd><button type="button" class="btn btn-texto btn-sm" (click)="step.set(1)">Alterar</button></dd></div>
              <div><dt>Foto</dt><dd>@if (photoPreview()) {<img [src]="photoPreview()" alt="Foto que será enviada" class="mini-foto" />} @else {Sem foto}</dd><dd><button type="button" class="btn btn-texto btn-sm" (click)="step.set(2)">Alterar</button></dd></div>
            </dl>
            <p class="dica">Ao enviar, a reclamação fica pública no mapa sem seu nome ou e-mail. A data, a hora e o status inicial são definidos pelo servidor.</p>
            <div class="nav">
              <button type="button" class="btn btn-secundario" (click)="step.set(2)"><ut-icon name="arrow-left" [size]="18" />Voltar</button>
              <button type="button" class="btn btn-primario" [disabled]="sending()" (click)="submit()">{{ sending() ? 'Enviando…' : 'Enviar reclamação' }}</button>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .etapas { list-style: none; margin: 0 0 var(--s-5); padding: 0; display: flex; gap: var(--s-5); flex-wrap: wrap; }
    .etapas li { display: flex; align-items: center; gap: var(--s-2); color: var(--texto-3); font-weight: 500; }
    .etapas .n { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--linha-forte); font-weight: 700; font-size: var(--t-sm); }
    .etapas li.atual { color: var(--texto); }
    .etapas li.atual .n { background: var(--asfalto); border-color: var(--asfalto); color: #fff; box-shadow: 0 0 0 3px var(--faixa); }
    .etapas li.feita { color: var(--texto-2); }
    .etapas li.feita .n { background: var(--resolvida); border-color: var(--resolvida); color: #fff; }

    .passo-local { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: var(--s-5); align-items: start; }
    .mapa-caixa { position: relative; height: 560px; border: 1px solid var(--linha); border-radius: var(--r-2); overflow: hidden; }
    .mapa-caixa.apagado { opacity: .72; }
    .onde { border: 0; margin: 0; padding: 0; min-width: 0; }
    .onde legend { margin-bottom: var(--s-2); padding: 0; }
    .onde-opcoes { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
    .onde-op { position: relative; display: flex; flex-direction: column; gap: 2px; padding: var(--s-3); border: 1px solid var(--linha-forte); border-radius: var(--r-1); cursor: pointer; background: var(--superficie); }
    .onde-op:hover { border-color: var(--texto-3); background: var(--superficie-2); }
    .onde-op input { position: absolute; opacity: 0; pointer-events: none; }
    .onde-op:has(input:focus-visible) { outline: 2px solid var(--asfalto); outline-offset: 2px; box-shadow: 0 0 0 5px var(--faixa); }
    .onde-op.marcada { border-color: var(--placa); background: var(--placa-clara); box-shadow: inset 0 0 0 1px var(--placa); }
    .onde-nome { font-weight: 600; }
    .onde-desc { font-size: var(--t-xs); color: var(--texto-2); }
    .mapa { position: absolute; inset: 0; }
    .mapa-dica { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 500; background: var(--asfalto); color: #fff; padding: 8px 12px; border-radius: var(--r-1); font-size: var(--t-sm); pointer-events: none; white-space: nowrap; }
    .campos { display: flex; flex-direction: column; gap: var(--s-5); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5); }
    .coords { font-size: var(--t-sm); color: var(--texto-2); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .nav { display: flex; justify-content: space-between; gap: var(--s-3); }
    .campos .nav { justify-content: flex-end; }

    .passo-o-que, .passo-revisar { background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-5); }
    .categorias { border: 0; margin: 0; padding: 0; min-width: 0; }
    .categorias legend { margin-bottom: var(--s-3); padding: 0; }
    .cat-grade { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); }
    .cat {
      position: relative; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: var(--s-3); row-gap: 2px;
      padding: var(--s-4); border: 1px solid var(--linha-forte); border-radius: var(--r-1); cursor: pointer; background: var(--superficie);
    }
    .cat:hover { border-color: var(--texto-3); background: var(--superficie-2); }
    .cat input { position: absolute; opacity: 0; pointer-events: none; }
    .cat:has(input:focus-visible) { outline: 2px solid var(--asfalto); outline-offset: 2px; box-shadow: 0 0 0 5px var(--faixa); }
    .cat ut-icon { grid-row: span 2; color: var(--texto-2); margin-top: 2px; }
    .cat-nome { font-weight: 600; }
    .cat-desc { font-size: var(--t-xs); color: var(--texto-2); }
    .cat.marcada { border-color: var(--placa); background: var(--placa-clara); box-shadow: inset 0 0 0 1px var(--placa); }
    .cat.marcada ut-icon { color: var(--placa); }

    .detalhe-outros { max-width: 520px; padding: var(--s-4); background: var(--superficie-2); border-radius: var(--r-1); border: 1px dashed var(--linha-forte); }
    .lado-a-lado { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--s-5); }
    .foto-escolher {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center;
      min-height: 150px; border: 1.5px dashed var(--linha-forte); border-radius: var(--r-1); cursor: pointer; color: var(--texto-2); padding: var(--s-4);
      background: var(--superficie-2);
    }
    .foto-escolher:hover { border-color: var(--placa); color: var(--placa); }
    .foto-escolher:has(input:focus-visible) { outline: 2px solid var(--asfalto); outline-offset: 2px; box-shadow: 0 0 0 5px var(--faixa); }
    .foto-escolher input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .foto-escolher span:first-of-type { font-weight: 600; color: var(--texto); }
    .foto-previa { display: flex; flex-direction: column; gap: var(--s-2); align-items: flex-start; }
    .foto-previa img { max-height: 220px; border-radius: var(--r-1); object-fit: cover; }

    .resumo { margin: 0; display: flex; flex-direction: column; }
    .resumo > div { display: grid; grid-template-columns: 140px 1fr auto; gap: var(--s-3); padding: var(--s-3) 0; border-bottom: 1px solid var(--linha); align-items: start; }
    .resumo dt { font-weight: 600; color: var(--texto-2); font-size: var(--t-sm); padding-top: 2px; }
    .resumo dd { margin: 0; min-width: 0; }
    .pre { white-space: pre-line; }
    .mini-foto { max-height: 120px; border-radius: var(--r-1); }

    .sucesso { max-width: 620px; margin: var(--s-7) auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--s-4); }
    .sucesso h1 { outline: none; }
    .sucesso p { color: var(--texto-2); }
    .selo { width: 56px; height: 56px; border-radius: 50%; background: var(--resolvida); color: #fff; display: grid; place-items: center; }
    .acoes { display: flex; gap: var(--s-3); flex-wrap: wrap; justify-content: center; }

    @media (max-width: 1000px) {
      .passo-local { grid-template-columns: 1fr; }
      .mapa-caixa { height: 420px; }
      .cat-grade { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .lado-a-lado { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .mapa-caixa { height: 340px; }
      .mapa-dica { top: auto; bottom: 28px; white-space: normal; text-align: center; width: max-content; max-width: calc(100% - 24px); }
      .cat-grade { grid-template-columns: 1fr; }
      .resumo > div { grid-template-columns: 1fr auto; }
      .resumo dt { grid-column: 1 / -1; }
      .etapas { gap: var(--s-3); font-size: var(--t-sm); }
      .passo-o-que, .passo-revisar, .campos { padding: var(--s-4); }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private catalog = inject(StatusCatalog);
  private picker = viewChild<MapComponent>('picker');

  steps = [
    { n: 1 as Step, label: 'Onde se aplica' },
    { n: 2 as Step, label: 'O que é' },
    { n: 3 as Step, label: 'Revisar e enviar' },
  ];
  maxMb = MAX_PHOTO_MB;
  categories = toSignal(this.api.categories$, { initialValue: [] as Category[] });

  step = signal<Step>(1);
  point = signal<LatLng | null>(null);
  scope = signal<Scope | null>(null);
  neighborhoodName = signal('');
  reference = signal('');
  street = signal('');
  categoryDetail = signal('');
  // chave única por formulário: reenviar após falha de rede não duplica a reclamação
  private submitKey = newKey();
  categoryId = signal<number | null>(null);
  description = signal('');
  photo = signal<File | null>(null);
  photoPreview = signal<string | null>(null);
  errors = signal<Record<string, string>>({});
  locating = signal(false);
  geoMsg = signal<{ kind: 'info' | 'erro'; text: string } | null>(null);
  sending = signal(false);
  submitError = signal<string | null>(null);
  created = signal<OccurrenceDetail | null>(null);

  selectedCategory = computed(() => this.categories().find((c) => c.id === this.categoryId()) ?? null);
  statusName = (slug: string) => this.catalog.name(slug);

  ngOnInit() {
    // texto vindo da Comunidade ("transformar em reclamação")
    const text = this.route.snapshot.queryParamMap.get('descricao');
    if (text) this.description.set(text.slice(0, 1000));
  }

  hoodClean = computed(() => this.neighborhoodName().trim().replace(/\s+/g, ' '));

  // trocar de bairro para cidade toda apaga o que era só do bairro, para não ir junto sem querer
  setScope(s: Scope) {
    const prev = this.scope();
    if (s === prev) return;
    this.scope.set(s);
    if (s === 'cidade' && prev === 'bairro') {
      this.neighborhoodName.set('');
      this.street.set('');
      this.reference.set('');
      this.point.set(null);
      this.geoMsg.set(null);
    }
    this.errors.update(({ scope, neighborhoodName, latitude, longitude, ...rest }) => rest);
  }

  setHoodName(v: string) {
    this.neighborhoodName.set(v);
    if (v.trim()) this.errors.update(({ neighborhoodName, ...rest }) => rest);
  }

  setPoint(p: LatLng, origin: 'mapa' | 'gps') {
    if (!insideSorocaba(p.lat, p.lng)) {
      this.geoMsg.set({ kind: 'erro', text: 'Esse ponto fica fora de Sorocaba. O UrbanTalk aceita apenas ocorrências no município.' });
      return;
    }
    this.point.set(p);
    this.errors.update(({ latitude, longitude, ...rest }) => rest);
    if (origin === 'mapa') this.geoMsg.set(null);
  }

  locate() {
    if (!('geolocation' in navigator)) {
      this.geoMsg.set({ kind: 'erro', text: 'Seu navegador não informa a localização. Marque o ponto no mapa.' });
      return;
    }
    this.locating.set(true);
    this.geoMsg.set(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!insideSorocaba(p.lat, p.lng)) {
          this.geoMsg.set({ kind: 'erro', text: 'Sua localização parece estar fora de Sorocaba. Marque o ponto no mapa.' });
          return;
        }
        this.setPoint(p, 'gps');
        this.picker()?.flyTo(p);
        const acc = Math.round(pos.coords.accuracy);
        this.geoMsg.set({ kind: 'info', text: `Localização encontrada (precisão de cerca de ${acc} m). Ajuste o marcador se precisar.` });
      },
      (err) => {
        this.locating.set(false);
        const text =
          err.code === err.PERMISSION_DENIED
            ? 'A permissão de localização foi negada. Marque o ponto clicando no mapa.'
            : 'Não foi possível obter sua localização agora. Marque o ponto no mapa.';
        this.geoMsg.set({ kind: 'erro', text });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  pickPhoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      this.errors.update((e) => ({ ...e, photo: 'Escolha uma foto em JPG, PNG ou WebP.' }));
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      this.errors.update((e) => ({ ...e, photo: `A foto tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é ${MAX_PHOTO_MB} MB.` }));
      return;
    }
    this.removePhoto();
    this.photo.set(file);
    this.photoPreview.set(URL.createObjectURL(file));
    this.errors.update(({ photo, ...rest }) => rest);
  }

  removePhoto() {
    const url = this.photoPreview();
    if (url) URL.revokeObjectURL(url);
    this.photo.set(null);
    this.photoPreview.set(null);
  }

  private validate(step: Step) {
    const e: Record<string, string> = {};
    if (step === 1) {
      const scope = this.scope();
      if (!scope) e['scope'] = 'Diga se o problema é da cidade toda ou de um bairro.';
      if (scope === 'bairro') {
        const name = this.hoodClean();
        if (name.replace(/[^\p{L}\p{N}]/gu, '').length < 2) e['neighborhoodName'] = 'Digite o nome do bairro.';
        else if (name.length > 80) e['neighborhoodName'] = 'Use até 80 caracteres no nome do bairro.';
        if (!this.point()) e['latitude'] = 'Marque no mapa onde está o problema.';
        const st = this.street().trim();
        if (st && st.length < 3) e['street'] = 'Escreva o nome da rua com pelo menos 3 letras, ou deixe em branco.';
      }
    }
    if (step === 2) {
      if (!this.categoryId()) e['categoryId'] = 'Escolha o tipo de problema.';
      if (this.selectedCategory()?.requiresDetail && this.categoryDetail().trim().length < 3) {
        e['categoryDetail'] = 'Conte em poucas palavras qual é o problema (pelo menos 3 letras).';
      }
      const len = this.description().trim().length;
      if (len < 10) e['description'] = 'Descreva o problema com pelo menos 10 caracteres.';
      if (len > 1000) e['description'] = 'A descrição pode ter até 1000 caracteres.';
    }
    this.errors.set({ ...e, ...(this.errors()['photo'] && step === 2 ? { photo: this.errors()['photo'] } : {}) });
    return Object.keys(e).length === 0;
  }

  next() {
    const s = this.step();
    if (!this.validate(s)) return;
    this.step.set((s + 1) as Step);
    window.scrollTo({ top: 0 });
  }

  submit() {
    if (!this.validate(1)) return this.step.set(1);
    if (!this.validate(2)) return this.step.set(2);
    const p = this.point();
    const scope = this.scope()!;
    const data = new FormData();
    data.set('categoryId', String(this.categoryId()));
    data.set('scope', scope);
    data.set('description', this.description().trim());
    // cidade toda: nada de bairro, rua ou referência; o ponto só vai se a pessoa marcou
    if (scope === 'bairro') {
      data.set('neighborhoodName', this.hoodClean());
      if (this.reference().trim()) data.set('reference', this.reference().trim());
      if (this.street().trim()) data.set('street', this.street().trim());
    }
    if (p) {
      data.set('latitude', String(p.lat));
      data.set('longitude', String(p.lng));
    }
    if (this.selectedCategory()?.requiresDetail) data.set('categoryDetail', this.categoryDetail().trim());
    const photo = this.photo();
    if (photo) data.set('photo', photo, photo.name);

    if (this.sending()) return;
    this.sending.set(true);
    this.submitError.set(null);
    this.api.create(data, this.submitKey).subscribe({
      // só mostra sucesso depois que o servidor confirmou o salvamento
      next: (o) => {
        this.sending.set(false);
        this.created.set(o);
        this.submitKey = newKey();
        this.toast.show(`Reclamação ${o.code} registrada.`);
        window.scrollTo({ top: 0 });
      },
      error: (err) => {
        this.sending.set(false);
        const e = toApiError(err);
        this.submitError.set(
          e.code === 'offline'
            ? 'Não conseguimos confirmar o envio porque a conexão falhou. Nada foi perdido: confira a internet e toque em Enviar de novo. Se a primeira tentativa tiver chegado, ela não será duplicada.'
            : e.message,
        );
        this.errors.set(e.fields);
        // leva a pessoa direto à etapa com o campo recusado pelo servidor
        if (e.fields['latitude'] || e.fields['longitude'] || e.fields['scope'] || e.fields['neighborhoodName'] || e.fields['street'] || e.fields['reference']) this.step.set(1);
        else if (e.fields['categoryId'] || e.fields['categoryDetail'] || e.fields['description'] || e.fields['photo']) this.step.set(2);
      },
    });
  }

  reset() {
    this.removePhoto();
    this.created.set(null);
    this.step.set(1);
    this.point.set(null);
    this.scope.set(null);
    this.neighborhoodName.set('');
    this.reference.set('');
    this.street.set('');
    this.categoryDetail.set('');
    this.submitKey = newKey();
    this.categoryId.set(null);
    this.description.set('');
    this.errors.set({});
    this.geoMsg.set(null);
  }

  ngOnDestroy() {
    const url = this.photoPreview();
    if (url) URL.revokeObjectURL(url);
  }
}

function newKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
