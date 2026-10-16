import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe } from '../core/format';
import { MapMarker, OccurrenceDetail, Post, Scope, StaffOccurrenceDetail, addressLine } from '../core/models';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';
import { SessionStore } from '../core/session.store';
import { StatusCatalog } from '../core/status-catalog';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { StatusBadgeComponent } from '../shared/badges';
import { IconComponent } from '../shared/icon.component';
import { MapComponent } from '../shared/map.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';
import { InfoRequestBoxComponent } from '../shared/info-request-box.component';
import { OccurrenceTimelineComponent } from '../shared/occurrence-timeline.component';
import { ResolutionPanelComponent } from '../shared/resolution-panel.component';
import { StaffTrackingToolsComponent } from '../shared/staff-tracking-tools.component';
import { StaffTriageComponent } from '../shared/staff-triage.component';

@Component({
  selector: 'ut-detalhe',
  imports: [RouterLink, IconComponent, StatusBadgeComponent, MapComponent, ErrorStateComponent, EmptyStateComponent, AvatarComponent, DatePipe, RelativePipe, OccurrenceTimelineComponent, ResolutionPanelComponent, InfoRequestBoxComponent, StaffTrackingToolsComponent, StaffTriageComponent, NeighborhoodInputComponent],
  template: `
    <div class="pagina">
      <button type="button" class="btn btn-texto btn-sm voltar" (click)="back()"><ut-icon name="arrow-left" [size]="16" />Voltar</button>

      @if (error(); as e) {
        @if (notFound()) {
          <ut-vazio icon="search" title="Reclamação não encontrada" text="O endereço pode estar incorreto ou a reclamação foi removida.">
            <a routerLink="/mapa" class="btn btn-secundario btn-sm">Ir para o mapa</a>
          </ut-vazio>
        } @else {
          <ut-erro [message]="e" (retry)="load()" />
        }
      } @else if (!occ()) {
        <p class="carregando">Carregando reclamação…</p>
      } @else {
        @let o = occ()!;
        <div class="grade">
          <article class="principal">
            <header class="cab">
              <div class="linha-meta">
                <span class="codigo tabular">{{ o.code }}</span>
                @if (o.isDemo) {
                  <span class="selo-texto">Dado fictício de demonstração</span>
                }
                @if (o.isMine) {
                  <span class="selo-texto">Você registrou</span>
                }
              </div>
              <h1>{{ o.category.name }}@if (o.categoryDetail) {<span class="detalhe">: {{ o.categoryDetail }}</span>}</h1>
              <p class="endereco"><ut-icon name="pin" [size]="18" /><span>{{ address(o) }}</span><span class="selo-texto">{{ o.scope === 'cidade' ? 'Vale para a cidade toda' : 'Bairro' }}</span></p>
              <div class="linha-status">
                <ut-status [status]="o.status" />
                <span class="muted">Registrada em {{ o.createdAt | data: true }}</span>
                @if (o.reopenedCount > 0) { <span class="selo-texto">Reaberta {{ o.reopenedCount === 1 ? '1 vez' : o.reopenedCount + ' vezes' }}</span> }
              </div>
              @if (staff()?.reviewRequestedAt) {
                <p class="aviso aviso-atencao"><ut-icon name="alert" [size]="18" />Um morador informou que o problema continua depois da resolução. Reavalie e, se for o caso, reabra com uma justificativa.</p>
              }
            </header>

            @if (o.isMine) {
              <ut-pedido-info [occ]="o" (updated)="apply($event)" />
            }

            <section class="bloco" aria-labelledby="desc-t">
              <h2 id="desc-t" class="sr-only">Descrição</h2>
              <p class="descricao">{{ o.description }}</p>
              @if (o.reference) {
                <p class="ref"><ut-icon name="info" [size]="18" />Referência: {{ o.reference }}</p>
              }
            </section>

            @if (o.photoUrl) {
              <figure class="foto">
                <img [src]="o.photoUrl" [alt]="'Foto do problema: ' + o.category.name + ' em ' + (o.neighborhood?.name ?? 'Sorocaba')" />
                <figcaption>Foto enviada por quem registrou.</figcaption>
              </figure>
            }

            <ut-resolucao [occ]="o" (updated)="apply($event)" />

            <section class="bloco" aria-labelledby="acomp-t">
              <h2 id="acomp-t">Acompanhamento</h2>
              <ut-linha-tempo [items]="o.timeline" [staffView]="!!staff()" />
              <p class="dica">Quem muda o status é a equipe do UrbanTalk. Não há integração automática com a Prefeitura e nenhum aviso é enviado por e-mail: as novidades aparecem aqui.</p>
            </section>

            <section class="bloco" aria-labelledby="local-t">
              <h2 id="local-t">Local</h2>
              @if (o.latitude !== null && o.longitude !== null) {
                <div class="mapa-caixa">
                  <ut-mapa class="mapa" [markers]="marker()" [selectedId]="o.id" [fitToMarkers]="true" [label]="'Local da reclamação ' + o.code" />
                </div>
                <p class="coords tabular">{{ o.scope === 'cidade' ? 'Ponto de exemplo marcado no mapa' : 'Ponto marcado no mapa' }}: {{ o.latitude.toFixed(5) }}, {{ o.longitude.toFixed(5) }}</p>
              } @else {
                <p class="sem-ponto"><ut-icon name="info" [size]="18" />Esta reclamação vale para a cidade toda, por isso não tem um ponto no mapa nem bairro.</p>
              }
            </section>
          </article>

          <aside class="lateral">
            @if (staff(); as s) {
              <section class="caixa gestao" aria-labelledby="gest-t">
                <h2 id="gest-t"><ut-icon name="shield" [size]="20" />Gestão da equipe</h2>
                <div class="quem-registrou">
                  <span class="rotulo">Registrada por</span>
                  <span>{{ s.reporter.name }}</span>
                  <a [href]="'mailto:' + s.reporter.email" class="email">{{ s.reporter.email }}</a>
                  <span class="dica">Visível só para funcionários.</span>
                </div>

                <ut-triagem [occ]="s" (updated)="apply($event)" />

                <div class="sub-bloco">
                  <h3>Mudar o status</h3>
                  <div class="campo">
                    <label for="novo-status">Novo status</label>
                    <select id="novo-status" class="entrada" (change)="newStatus.set($any($event.target).value)">
                      <option value="" [selected]="!newStatus()">Escolha…</option>
                      @for (st of catalog.active(); track st.slug) {
                        <option [value]="st.slug" [selected]="newStatus() === st.slug" [disabled]="st.slug === o.status">{{ st.name }}{{ st.slug === o.status ? ' (atual)' : '' }}</option>
                      }
                    </select>
                    @if (newStatus(); as ns) {
                      <span class="dica">{{ catalog.get(ns).description }}</span>
                    }
                  </div>
                  <div class="campo">
                    <label for="nota-status">Mensagem para o cidadão <span class="muted">{{ reopening() ? '(obrigatória ao reabrir)' : '(opcional)' }}</span></label>
                    <textarea id="nota-status" class="entrada" maxlength="500" rows="2" [value]="statusNote()" (input)="statusNote.set($any($event.target).value)" placeholder="Ex.: incluída no relatório de outubro"></textarea>
                    <span class="dica">{{ reopening() ? 'A reclamação está encerrada: explique por que ela volta para análise. A resolução anterior fica no histórico.' : 'Aparece no acompanhamento público junto com a mudança.' }}</span>
                  </div>
                  @if (statusError()) {
                    <p class="erro" role="alert">{{ statusError() }}</p>
                  }
                  <button type="button" class="btn btn-primario" [disabled]="!newStatus() || newStatus() === o.status || savingStatus()" (click)="askStatus()">{{ savingStatus() ? 'Salvando…' : 'Salvar status' }}</button>
                </div>

                <div class="sub-bloco">
                  <h3>Anotações</h3>
                  <fieldset class="tipo-nota">
                    <legend class="sr-only">Tipo de anotação</legend>
                    <label [class.marcado]="noteType() === 'interna'">
                      <input type="radio" name="tipo-nota" [checked]="noteType() === 'interna'" (change)="noteType.set('interna')" />
                      <ut-icon name="lock" [size]="16" />Interna
                    </label>
                    <label [class.marcado]="noteType() === 'publica'">
                      <input type="radio" name="tipo-nota" [checked]="noteType() === 'publica'" (change)="noteType.set('publica')" />
                      <ut-icon name="megaphone" [size]="16" />Visível ao cidadão
                    </label>
                  </fieldset>
                  <p class="dica">
                    @if (noteType() === 'interna') { Só a equipe vê. Use para organizar a análise. } @else { Aparece no acompanhamento da reclamação para quem registrou e para quem consulta. }
                  </p>
                  <textarea class="entrada" maxlength="1000" rows="3" aria-label="Texto da anotação" [value]="noteBody()" (input)="noteBody.set($any($event.target).value)" [placeholder]="noteType() === 'interna' ? 'Ex.: ligar para a regional na segunda' : 'Ex.: a Prefeitura informou que a equipe passa esta semana'"></textarea>
                  @if (noteError()) {
                    <p class="erro" role="alert">{{ noteError() }}</p>
                  }
                  <button type="button" class="btn btn-secundario" [disabled]="noteBody().trim().length < 3 || savingNote()" (click)="saveNote()">
                    {{ savingNote() ? 'Salvando…' : noteType() === 'interna' ? 'Salvar anotação interna' : 'Publicar atualização' }}
                  </button>

                  <p class="dica">As anotações aparecem no acompanhamento ao lado, com o selo "Interna" quando forem só da equipe.</p>
                </div>

                <ut-ferramentas-acompanhamento [occ]="s" (updated)="apply($event)" />

                <div class="sub-bloco">
                  <h3>Endereço</h3>
                  @if (!editingAddress()) {
                    <p>{{ address(o) }}@if (o.reference) {<br /><span class="muted">{{ o.reference }}</span>}</p>
                    <button type="button" class="btn btn-texto btn-sm" (click)="startAddress()"><ut-icon name="edit" [size]="16" />Corrigir endereço</button>
                  } @else {
                    <div class="campo">
                      <label for="ed-onde">Onde se aplica</label>
                      <select id="ed-onde" class="entrada" (change)="addrScope.set($any($event.target).value)">
                        <option value="cidade" [selected]="addrScope() === 'cidade'">Cidade toda</option>
                        <option value="bairro" [selected]="addrScope() === 'bairro'" [disabled]="o.latitude === null">Bairro{{ o.latitude === null ? ' (precisa de ponto no mapa)' : '' }}</option>
                      </select>
                    </div>
                    @if (addrScope() === 'bairro') {
                      <div class="campo">
                        <label for="ed-bairro">Nome do bairro</label>
                        <ut-bairro inputId="ed-bairro" [value]="addrHood()" (valueChange)="addrHood.set($event)" />
                      </div>
                      <div class="campo">
                        <label for="ed-rua">Rua ou via</label>
                        <input id="ed-rua" class="entrada" maxlength="160" [value]="addrStreet()" (input)="addrStreet.set($any($event.target).value)" />
                      </div>
                      <div class="campo">
                        <label for="ed-ref">Ponto de referência</label>
                        <input id="ed-ref" class="entrada" maxlength="120" [value]="addrRef()" (input)="addrRef.set($any($event.target).value)" />
                      </div>
                    } @else {
                      <p class="dica">Ao salvar como cidade toda, o bairro, a rua e a referência atuais são apagados.</p>
                    }
                    @if (addrError()) {
                      <p class="erro" role="alert">{{ addrError() }}</p>
                    }
                    <div class="linha-botoes">
                      <button type="button" class="btn btn-secundario btn-sm" (click)="editingAddress.set(false)">Cancelar</button>
                      <button type="button" class="btn btn-primario btn-sm" (click)="saveAddress()">Salvar endereço</button>
                    </div>
                    <p class="dica">A correção fica registrada com seu nome no log da equipe.</p>
                  }
                </div>
              </section>
            }

            <section class="caixa" aria-labelledby="conf-t">
              <h2 id="conf-t">Confirmações</h2>
              <p class="contagem tabular">{{ o.confirmations }}</p>
              <p class="muted pequeno">{{ o.confirmations === 1 ? 'pessoa confirmou que também viu' : 'pessoas confirmaram que também viram' }} este problema.</p>
              @if (!session.user()) {
                <a routerLink="/entrar" [queryParams]="{ volta: '/ocorrencias/' + o.id }" class="btn btn-secundario">Entre para confirmar</a>
              } @else if (session.isStaff()) {
                <p class="estado">Confirmações vêm dos cidadãos e ajudam a priorizar.</p>
              } @else if (o.isMine) {
                <p class="estado"><ut-icon name="user" [size]="18" />Você registrou esta reclamação.</p>
              } @else if (o.confirmedByMe) {
                <p class="estado ok"><ut-icon name="check" [size]="18" />Você confirmou esta reclamação.</p>
              } @else if (o.isClosed) {
                <p class="estado">Reclamação encerrada: não recebe novas confirmações.</p>
              } @else {
                <button type="button" class="btn btn-primario" [disabled]="confirming()" (click)="confirm()">
                  <ut-icon name="hand" [size]="18" />{{ confirming() ? 'Confirmando…' : 'Também vi este problema' }}
                </button>
                <p class="dica">Cada pessoa confirma uma vez. A confirmação não pode ser desfeita.</p>
              }
            </section>

            <section class="caixa" aria-labelledby="disc-t">
              <h2 id="disc-t">Conversas na comunidade</h2>
              @if (!session.user()) {
                <p class="muted pequeno">Entre na sua conta para ver e participar das conversas sobre esta reclamação.</p>
              } @else if (posts() === null) {
                <p class="carregando">Carregando conversas…</p>
              } @else if (posts()!.length === 0) {
                <p class="muted pequeno">Ninguém comentou sobre esta reclamação ainda. Que tal começar?</p>
              } @else {
                <ul class="conversas">
                  @for (p of posts()!.slice(0, 3); track p.id) {
                    <li>
                      <ut-avatar [name]="p.author.name" [initials]="p.author.initials" [staff]="p.author.isStaff" [size]="32" />
                      <div>
                        <p class="quem-post">{{ p.author.name }} <span class="quando">· {{ p.createdAt | relativo }}</span></p>
                        <p class="texto-post">{{ p.body }}</p>
                      </div>
                    </li>
                  }
                </ul>
              }
              @if (session.user()) {
                <a routerLink="/comunidade" [queryParams]="{ ocorrencia: o.id }" class="btn btn-secundario"><ut-icon name="chat" [size]="18" />{{ posts()?.length ? 'Ver conversa e participar' : 'Começar uma conversa' }}</a>
              }
            </section>
          </aside>
        </div>

        <dialog #dlg class="dialogo" aria-labelledby="dlg-t" (close)="onDialogClose()">
          <h2 id="dlg-t">Mudar para "{{ catalog.name(newStatus()) }}"?</h2>
          <p>A mudança fica no histórico público de {{ o.code }}, com data e hora, e o cidadão passa a ver o novo status. Nada é enviado à Prefeitura.</p>
          <div class="dlg-acoes">
            <button type="button" class="btn btn-secundario" (click)="dlg.close('cancel')">Cancelar</button>
            <button type="button" class="btn btn-primario" (click)="dlg.close('ok')">Mudar status</button>
          </div>
        </dialog>
      }
    </div>
  `,
  styles: `
    .voltar { margin-left: calc(-1 * var(--s-2)); margin-bottom: var(--s-3); }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: var(--s-6); align-items: start; }
    .principal { display: flex; flex-direction: column; gap: var(--s-6); min-width: 0; }
    .cab { display: flex; flex-direction: column; gap: var(--s-3); }
    .linha-meta { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
    .codigo { font-weight: 600; color: var(--texto-2); margin-right: var(--s-2); }
    h1 { font-size: var(--t-2xl); }
    .detalhe { font-weight: 500; }
    .endereco { display: flex; gap: 6px; align-items: flex-start; font-size: var(--t-lg); color: var(--texto); }
    .endereco ut-icon { color: var(--placa); margin-top: 4px; }
    .linha-status { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; font-size: var(--t-sm); }
    .descricao { font-size: 1.125rem; max-width: 65ch; white-space: pre-line; }
    .ref { display: flex; gap: 6px; align-items: center; color: var(--texto-2); margin-top: var(--s-3); }
    .bloco h2 { font-size: var(--t-lg); margin-bottom: var(--s-3); }
    .foto { margin: 0; }
    .foto img { width: 100%; max-height: 520px; object-fit: contain; background: var(--asfalto); border-radius: var(--r-2); }
    .foto figcaption { font-size: var(--t-xs); color: var(--texto-3); margin-top: 6px; }
    .mapa-caixa { position: relative; height: 300px; border: 1px solid var(--linha); border-radius: var(--r-2); overflow: hidden; }
    .mapa { position: absolute; inset: 0; }
    .coords { font-size: var(--t-xs); color: var(--texto-3); margin-top: 6px; }
    .sem-ponto { display: flex; gap: var(--s-2); align-items: flex-start; color: var(--texto-2); background: var(--superficie-2); border: 1px dashed var(--linha-forte); border-radius: var(--r-1); padding: var(--s-3); }
    .sem-ponto ut-icon { flex: none; margin-top: 2px; }

    .linha-tempo { list-style: none; margin: 0 0 var(--s-3); padding: 0; }
    .evento { display: flex; gap: var(--s-3); position: relative; padding-bottom: var(--s-4); }
    .evento:not(:last-child)::before { content: ''; position: absolute; left: 15px; top: 34px; bottom: 4px; border-left: 2px dotted var(--linha-forte); }
    .marca { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-fundo, var(--superficie-2)); color: var(--cor, var(--texto-2)); }
    .atualizacao .marca { background: var(--faixa-clara); color: #7a5300; }
    .titulo-ev { font-weight: 500; padding-top: 4px; }
    .quando { font-size: var(--t-xs); color: var(--texto-2); }
    .msg { margin-top: 6px; background: var(--superficie); border: 1px solid var(--linha); padding: 8px 12px; border-radius: var(--r-1); max-width: 60ch; white-space: pre-line; }
    .atualizacao .msg { background: var(--faixa-clara); border-color: #f1dca6; }

    .lateral { display: flex; flex-direction: column; gap: var(--s-4); }
    .caixa { background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); box-shadow: var(--sombra); }
    .caixa h2 { font-size: var(--t-lg); display: flex; align-items: center; gap: 8px; }
    .gestao { border-top: 4px solid var(--faixa); }
    .gestao h2 ut-icon { color: var(--placa); }
    .sub-bloco { display: flex; flex-direction: column; gap: var(--s-3); border-top: 1px solid var(--linha); padding-top: var(--s-4); }
    .sub-bloco h3 { font-size: var(--t-md); font-family: var(--fonte); font-weight: 700; }
    .quem-registrou { display: flex; flex-direction: column; gap: 2px; background: var(--superficie-2); border-radius: var(--r-1); padding: 10px 12px; }
    .email { font-size: var(--t-sm); overflow-wrap: anywhere; }
    .tipo-nota { border: 0; margin: 0; padding: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: var(--superficie-2); border-radius: var(--r-1); border: 1px solid var(--linha); }
    .tipo-nota label { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; border-radius: var(--r-1); font-weight: 600; font-size: var(--t-sm); color: var(--texto-2); cursor: pointer; position: relative; }
    .tipo-nota label.marcado { background: var(--superficie); color: var(--texto); box-shadow: inset 0 0 0 1px var(--linha-forte); }
    .tipo-nota input { position: absolute; opacity: 0; pointer-events: none; }
    .tipo-nota label:has(input:focus-visible) { outline: 2px solid var(--asfalto); outline-offset: 2px; }
    .notas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); max-height: 320px; overflow-y: auto; }
    .notas li { background: var(--superficie-2); border-radius: var(--r-1); padding: 10px 12px; }
    .notas p { white-space: pre-line; font-size: var(--t-sm); margin-top: 4px; }
    .nota-topo { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
    .linha-botoes { display: flex; gap: var(--s-2); justify-content: flex-end; }

    .contagem { font-family: var(--fonte-titulo); font-size: 2.5rem; font-weight: 700; line-height: 1; }
    .pequeno { font-size: var(--t-sm); margin-top: -6px; }
    .estado { display: flex; gap: 8px; align-items: center; font-size: var(--t-sm); color: var(--texto-2); background: var(--superficie-2); padding: 10px 12px; border-radius: var(--r-1); }
    .estado.ok { color: var(--resolvida); background: var(--resolvida-fundo); font-weight: 600; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }

    .conversas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }
    .conversas li { display: flex; gap: 10px; }
    .quem-post { font-weight: 600; font-size: var(--t-sm); }
    .texto-post { font-size: var(--t-sm); color: var(--texto-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

    @media (max-width: 1000px) {
      .grade { grid-template-columns: 1fr; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPage {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private location = inject(Location);
  private router = inject(Router);
  session = inject(SessionStore);
  catalog = inject(StatusCatalog);

  // vem do parâmetro da rota (withComponentInputBinding)
  id = input.required<string>();
  occ = signal<OccurrenceDetail | null>(null);
  staff = signal<StaffOccurrenceDetail | null>(null);
  posts = signal<Post[] | null>(null);
  error = signal<string | null>(null);
  notFound = signal(false);
  confirming = signal(false);
  address = addressLine;

  newStatus = signal<string>('');
  statusNote = signal('');
  savingStatus = signal(false);
  statusError = signal<string | null>(null);
  noteType = signal<'interna' | 'publica'>('interna');
  noteBody = signal('');
  savingNote = signal(false);
  noteError = signal<string | null>(null);
  editingAddress = signal(false);
  addrScope = signal<Scope>('bairro');
  addrHood = signal('');
  addrStreet = signal('');
  addrRef = signal('');
  addrError = signal<string | null>(null);
  dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  marker = computed<MapMarker[]>(() => {
    const o = this.occ();
    if (!o || o.latitude === null || o.longitude === null) return [];
    return [{
      id: o.id, code: o.code, latitude: o.latitude, longitude: o.longitude, status: o.status,
      categoryId: o.category.id, categoryIcon: o.category.icon, categoryName: o.category.name,
      neighborhoodName: o.neighborhood?.name ?? null, street: o.street, confirmations: o.confirmations, createdAt: o.createdAt,
    }];
  });

  // mudar de um status encerrado para um aberto é uma reabertura
  reopening = computed(() => {
    const o = this.occ();
    const ns = this.newStatus();
    return Boolean(o && ns && o.isClosed && !this.catalog.get(ns).isClosed);
  });

  constructor() {
    effect(() => {
      this.id();
      this.load();
    });
  }

  load() {
    const id = Number(this.id());
    this.error.set(null);
    this.notFound.set(false);
    this.occ.set(null);
    this.staff.set(null);
    this.posts.set(null);
    if (!Number.isInteger(id) || id < 1) {
      this.notFound.set(true);
      this.error.set('Reclamação não encontrada.');
      return;
    }
    // funcionário recebe a versão completa; cidadão e visitante, a pública
    const req = this.session.isStaff() ? this.api.staffGet(id) : this.api.get(id);
    req.subscribe({
      next: (o) => this.apply(o),
      error: (e) => {
        const err = toApiError(e);
        this.notFound.set(err.status === 404);
        this.error.set(err.message);
      },
    });
    if (this.session.user()) {
      this.api.feed('recentes', null, id, 10).subscribe({
        next: (r) => this.posts.set(r.items),
        error: () => this.posts.set([]),
      });
    }
  }

  apply(o: OccurrenceDetail | StaffOccurrenceDetail) {
    this.occ.set(o);
    if ('notes' in o) this.staff.set(o);
    this.newStatus.set('');
  }

  back() {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate([this.session.isStaff() ? '/admin/reclamacoes' : '/mapa']);
  }

  confirm() {
    const o = this.occ();
    if (!o) return;
    this.confirming.set(true);
    this.api.confirm(o.id).subscribe({
      next: (r) => {
        this.occ.set({ ...o, confirmations: r.confirmations, confirmedByMe: true });
        this.toast.show('Confirmação registrada. Obrigado por ajudar a mostrar o tamanho do problema.');
        this.confirming.set(false);
      },
      error: (e) => {
        const err = toApiError(e);
        this.toast.show(err.message, 'erro');
        this.confirming.set(false);
        if (err.code === 'already_confirmed') this.occ.set({ ...o, confirmedByMe: true });
      },
    });
  }

  askStatus() {
    this.statusError.set(null);
    this.dlg()?.nativeElement.showModal();
  }

  onDialogClose() {
    const el = this.dlg()?.nativeElement;
    if (el?.returnValue === 'ok') this.saveStatus();
  }

  private saveStatus() {
    const o = this.occ();
    if (!o || !this.newStatus()) return;
    this.savingStatus.set(true);
    this.api.changeStatus(o.id, this.newStatus(), this.statusNote().trim()).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.statusNote.set('');
        this.savingStatus.set(false);
        this.toast.show(`Status alterado para ${this.catalog.name(updated.status)}.`);
      },
      error: (e) => {
        this.savingStatus.set(false);
        this.statusError.set(toApiError(e).message);
      },
    });
  }

  saveNote() {
    const o = this.occ();
    if (!o) return;
    this.savingNote.set(true);
    this.noteError.set(null);
    const type = this.noteType();
    this.api.addNote(o.id, type, this.noteBody().trim()).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.noteBody.set('');
        this.savingNote.set(false);
        this.toast.show(type === 'interna' ? 'Anotação interna salva.' : 'Atualização publicada no acompanhamento.');
      },
      error: (e) => {
        this.savingNote.set(false);
        this.noteError.set(toApiError(e).message);
      },
    });
  }

  startAddress() {
    const o = this.occ();
    if (!o) return;
    this.addrScope.set(o.scope);
    this.addrHood.set(o.neighborhood?.name ?? '');
    this.addrStreet.set(o.street ?? '');
    this.addrRef.set(o.reference ?? '');
    this.addrError.set(null);
    this.editingAddress.set(true);
  }

  saveAddress() {
    const o = this.occ();
    if (!o) return;
    const city = this.addrScope() === 'cidade';
    const data = city
      ? { scope: 'cidade' as Scope, neighborhoodName: '', street: '', reference: '' }
      : { scope: 'bairro' as Scope, neighborhoodName: this.addrHood().trim(), street: this.addrStreet().trim(), reference: this.addrRef().trim() };
    this.api.updateAddress(o.id, data).subscribe({
      next: (updated) => {
        this.apply(updated);
        this.editingAddress.set(false);
        this.toast.show('Endereço atualizado.');
      },
      error: (e) => {
        const err = toApiError(e);
        this.addrError.set(Object.values(err.fields)[0] ?? err.message);
      },
    });
  }
}
