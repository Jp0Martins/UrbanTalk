import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../core/admin.api';
import { toApiError } from '../core/api-error';
import { AdminForum, COLOR_NAMES, CategoryAdmin, FORUM_THEME_OPTIONS, PrioritySettings, ProposalStatus, STATUS_COLORS, StatusColor } from '../core/models';
import { ProposalCatalog } from '../core/proposal-catalog';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ErrorStateComponent } from '../shared/states';

type Tab = 'priorizacao' | 'categorias' | 'foruns' | 'fases';

const WEIGHTS: { key: keyof PrioritySettings; label: string; hint: string }[] = [
  { key: 'priorityAlta', label: 'Prioridade alta', hint: 'pontos' },
  { key: 'priorityMedia', label: 'Prioridade média', hint: 'pontos' },
  { key: 'priorityBaixa', label: 'Prioridade baixa', hint: 'pontos' },
  { key: 'priorityNone', label: 'Ainda não avaliada', hint: 'pontos (ajuda a triagem inicial)' },
  { key: 'perConfirmation', label: 'Por confirmação', hint: 'pontos cada (0 a 20)' },
  { key: 'maxConfirmations', label: 'Confirmações que contam', hint: 'no máximo' },
  { key: 'perDay', label: 'Por dia desde o registro', hint: 'pontos (0 a 10)' },
  { key: 'maxDays', label: 'Dias que contam', hint: 'no máximo' },
  { key: 'staleBonus', label: 'Sem movimentação', hint: 'pontos' },
  { key: 'staleDays', label: 'Considerar parada após', hint: 'dias' },
  { key: 'reviewBonus', label: 'Morador disse que continua', hint: 'pontos' },
  { key: 'overdueDays', label: 'Considerar atrasada após', hint: 'dias desde o registro' },
];

@Component({
  selector: 'ut-configuracoes',
  imports: [RouterLink, IconComponent, PageHeaderComponent, ErrorStateComponent],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Configurações" description="Ajustes globais que só administradores podem fazer. Cada alteração fica registrada no histórico administrativo." />
      <div class="segmentado abas" role="tablist" aria-label="Seções">
        @for (t of tabs; track t.id) { <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" (click)="open(t.id)">{{ t.label }}</button> }
      </div>
      @if (error(); as e) { <ut-erro [message]="e" (retry)="open(tab())" /> }

      @switch (tab()) {
        @case ('priorizacao') {
          @if (prio(); as p) {
            <form class="painel bloco" (submit)="$event.preventDefault(); savePrio()">
              <p class="muted">Estes pesos ordenam a <a routerLink="/admin/fila">Fila de Análise</a>. Cada reclamação mostra de onde veio cada ponto. Mantenha as confirmações com teto para que não sejam o único critério.</p>
              <div class="pesos">
                @for (w of weights; track w.key) {
                  <div class="campo">
                    <label [for]="'w-' + w.key">{{ w.label }}</label>
                    <input class="entrada" type="number" min="0" [id]="'w-' + w.key" [value]="p[w.key]" (input)="setW(w.key, $any($event.target).value)" [attr.aria-invalid]="!!prioFields()[w.key]" />
                    <span class="dica">{{ prioFields()[w.key] ?? w.hint }}</span>
                  </div>
                }
              </div>
              <div class="acoes">
                <button type="button" class="btn btn-texto" (click)="prio.set({ ...defaults()! })">Voltar ao padrão</button>
                <button type="submit" class="btn btn-primario" [disabled]="busy()">Salvar pesos</button>
              </div>
            </form>
          } @else { <p class="carregando">Carregando…</p> }
        }
        @case ('categorias') {
          <form class="painel bloco nova" (submit)="$event.preventDefault(); createCat()">
            <h2>Nova categoria</h2>
            <div class="linha">
              <div class="campo"><label for="c-nome">Nome</label><input id="c-nome" class="entrada" maxlength="80" [value]="cName()" (input)="cName.set($any($event.target).value)" /></div>
              <div class="campo cresce"><label for="c-desc">Descrição</label><input id="c-desc" class="entrada" maxlength="200" [value]="cDesc()" (input)="cDesc.set($any($event.target).value)" /></div>
              <div class="campo"><label for="c-ico">Ícone</label>
                <select id="c-ico" class="entrada" (change)="cIcon.set($any($event.target).value)">@for (i of icons(); track i) { <option [value]="i" [selected]="cIcon() === i">{{ i }}</option> }</select></div>
            </div>
            <label class="check"><input type="checkbox" [checked]="cDetail()" (change)="cDetail.set($any($event.target).checked)" />Pede para a pessoa descrever o problema (como "Outros")</label>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy() || cName().trim().length < 3">Criar categoria</button>
          </form>
          <ul class="lista">
            @for (c of cats(); track c.id) {
              <li class="painel item" [class.inativa]="!c.active">
                <ut-icon [name]="c.icon" [size]="22" />
                <div class="cresce">
                  <p><strong>{{ c.name }}</strong> @if (!c.active) { <span class="selo-texto">Desativada</span> } @if (c.requiresDetail) { <span class="selo-texto">Pede descrição</span> }</p>
                  <p class="dica">{{ c.description || 'Sem descrição' }} · {{ c.usage }} reclamações</p>
                </div>
                <button type="button" class="btn btn-texto btn-sm" (click)="renameCat(c)">Renomear</button>
                <button type="button" class="btn btn-secundario btn-sm" (click)="toggleCat(c)">{{ c.active ? 'Desativar' : 'Reativar' }}</button>
              </li>
            }
          </ul>
          <p class="dica">Categorias não são excluídas para não quebrar o histórico. Desativadas somem do formulário de registro e continuam nos relatórios.</p>
        }
        @case ('foruns') {
          <section class="painel bloco">
            <h2>Aprovação de fóruns criados por pessoas</h2>
            <label class="check"><input type="checkbox" [checked]="approval()" [disabled]="busy()" (change)="setApproval($any($event.target).checked)" />Exigir aprovação da equipe antes de um fórum novo aparecer</label>
            <p class="dica">{{ approval() ? 'Fóruns novos ficam visíveis só para quem criou até alguém da equipe aprovar em Moderação › Fóruns.' : 'Fóruns novos aparecem na hora. A equipe continua podendo moderar, ocultar e receber denúncias.' }} Cada pessoa cria no máximo 3 fóruns por dia.</p>
          </section>
          <form class="painel bloco nova" (submit)="$event.preventDefault(); createForum()">
            <h2>Novo fórum oficial</h2>
            <div class="linha">
              <div class="campo"><label for="f-nome">Nome</label><input id="f-nome" class="entrada" maxlength="60" [value]="fName()" (input)="fName.set($any($event.target).value)" /></div>
              <div class="campo"><label for="f-tema">Tema</label>
                <select id="f-tema" class="entrada" (change)="fTheme.set($any($event.target).value)">
                  @for (t of themes; track t.id) { <option [value]="t.id" [selected]="fTheme() === t.id">{{ t.name }}</option> }
                </select>
              </div>
              <div class="campo cresce"><label for="f-desc">Descrição</label><input id="f-desc" class="entrada" maxlength="300" [value]="fDesc()" (input)="fDesc.set($any($event.target).value)" /></div>
            </div>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy() || fName().trim().length < 5">Criar fórum oficial</button>
          </form>
          <ul class="lista">
            @for (f of forums(); track f.id) {
              <li class="painel item col" [class.inativa]="!f.active || f.hidden">
                <div class="linha-item">
                  <ut-icon [name]="f.icon" [size]="22" />
                  <div class="cresce">
                    <p><strong>{{ f.name }}</strong>
                      <span class="selo-texto" [class.equipe]="f.kind === 'oficial'">{{ f.kind === 'oficial' ? 'Oficial' : 'Comunidade' }}</span>
                      @if (!f.active) { <span class="selo-texto">Desativado</span> }
                      @if (f.status !== 'ativo') { <span class="selo-texto interna">{{ f.status === 'pendente' ? 'Aguardando aprovação' : 'Recusado' }}</span> }
                      @if (f.hidden) { <span class="selo-texto">Oculto pela moderação</span> }
                    </p>
                    <p class="dica">{{ f.theme.name }}{{ f.neighborhoodName ? ' · ' + f.neighborhoodName : '' }} · {{ f.topics }} discussões · {{ f.participants }} participantes{{ f.creatorFullName ? ' · criado por ' + f.creatorFullName : '' }}</p>
                  </div>
                  <a class="btn btn-texto btn-sm" [routerLink]="['/comunidade/f', f.slug]">Abrir</a>
                  @if (f.kind === 'oficial') {
                    <button type="button" class="btn btn-texto btn-sm" (click)="instFor.set(instFor() === f.slug ? null : f.slug)">Tópico de apoio</button>
                  }
                  <button type="button" class="btn btn-secundario btn-sm" (click)="toggleForum(f)">{{ f.active ? 'Desativar' : 'Reativar' }}</button>
                </div>
                @if (instFor() === f.slug) {
                  <form class="inst" (submit)="$event.preventDefault(); createInst(f)">
                    <p class="dica">Publicado em nome do UrbanTalk, com o selo "Conteúdo do UrbanTalk". Nunca aparece como publicação de morador.</p>
                    <input class="entrada" maxlength="140" aria-label="Título" placeholder="Título" [value]="iTitle()" (input)="iTitle.set($any($event.target).value)" />
                    <textarea class="entrada" rows="3" maxlength="3000" aria-label="Texto" placeholder="Texto de apoio ou pergunta para iniciar a conversa" [value]="iBody()" (input)="iBody.set($any($event.target).value)"></textarea>
                    <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy()">Publicar tópico de apoio</button>
                  </form>
                }
              </li>
            }
          </ul>
          <p class="dica">Não existem grupos automáticos por bairro: os fóruns de bairro são criados pelas próprias pessoas, com o nome que usam no dia a dia.</p>
        }
        @case ('fases') {
          <form class="painel bloco nova" (submit)="$event.preventDefault(); createPhase()">
            <h2>Nova fase de proposta</h2>
            <div class="linha">
              <div class="campo"><label for="p-nome">Nome</label><input id="p-nome" class="entrada" maxlength="40" [value]="pName()" (input)="pName.set($any($event.target).value)" /></div>
              <div class="campo cresce"><label for="p-desc">Descrição</label><input id="p-desc" class="entrada" maxlength="240" [value]="pDesc()" (input)="pDesc.set($any($event.target).value)" /></div>
              <div class="campo"><label for="p-cor">Cor</label><select id="p-cor" class="entrada" (change)="pColor.set($any($event.target).value)">@for (c of colors; track c) { <option [value]="c" [selected]="pColor() === c">{{ colorNames[c] }}</option> }</select></div>
            </div>
            <label class="check"><input type="checkbox" [checked]="pFinal()" (change)="pFinal.set($any($event.target).checked)" />Fase final (encerra a votação e exige explicação da fonte)</label>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy() || pName().trim().length < 3">Criar fase</button>
          </form>
          <ul class="lista">
            @for (s of phases(); track s.id) {
              <li class="painel item" [class.inativa]="!s.active">
                <span class="cor" [attr.data-color]="s.color" aria-hidden="true"></span>
                <div class="cresce">
                  <p><strong>{{ s.name }}</strong> @if (s.isInitial) { <span class="selo-texto">Inicial</span> } @if (s.isFinal) { <span class="selo-texto">Final</span> } @if (!s.active) { <span class="selo-texto">Desativada</span> }</p>
                  <p class="dica">{{ s.description }}</p>
                </div>
                @if (!s.isInitial && !s.isFinal && s.active) { <button type="button" class="btn btn-texto btn-sm" (click)="phase(s, { isInitial: true })">Tornar inicial</button> }
                @if (!s.isInitial) { <button type="button" class="btn btn-secundario btn-sm" (click)="phase(s, { active: !s.active })">{{ s.active ? 'Desativar' : 'Reativar' }}</button> }
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    .abas { margin-bottom: var(--s-4); flex-wrap: wrap; }
    .bloco { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); margin-bottom: var(--s-4); }
    .bloco h2 { font-size: var(--t-lg); }
    .pesos { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--s-3); }
    .acoes { display: flex; justify-content: flex-end; gap: var(--s-2); }
    .linha { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: flex-end; }
    .cresce { flex: 1; min-width: 200px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: var(--t-sm); }
    .check input { width: 18px; height: 18px; }
    .nova .btn { align-self: flex-start; }
    .lista { list-style: none; margin: 0 0 var(--s-3); padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .item { display: flex; gap: var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); flex-wrap: wrap; }
    .item.col { flex-direction: column; align-items: stretch; }
    .linha-item { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; }
    .item.inativa { opacity: 0.7; }
    .inst { display: flex; flex-direction: column; gap: var(--s-2); border-top: 1px solid var(--linha); padding-top: var(--s-3); }
    .inst .btn { align-self: flex-start; }
    .cor { width: 14px; height: 36px; border-radius: 3px; background: var(--cor); flex: none; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsPage implements OnInit {
  private api = inject(AdminApi);
  private toast = inject(ToastService);
  private catalog = inject(ProposalCatalog);
  tabs: { id: Tab; label: string }[] = [
    { id: 'priorizacao', label: 'Priorização' },
    { id: 'categorias', label: 'Categorias' },
    { id: 'foruns', label: 'Fóruns' },
    { id: 'fases', label: 'Fases das propostas' },
  ];
  weights = WEIGHTS;
  colors = STATUS_COLORS;
  colorNames = COLOR_NAMES;
  tab = signal<Tab>('priorizacao');
  error = signal<string | null>(null);
  busy = signal(false);
  prio = signal<PrioritySettings | null>(null);
  defaults = signal<PrioritySettings | null>(null);
  prioFields = signal<Partial<Record<string, string>>>({});
  cats = signal<CategoryAdmin[]>([]);
  icons = signal<string[]>([]);
  cName = signal('');
  cDesc = signal('');
  cIcon = signal('other');
  cDetail = signal(false);
  forums = signal<AdminForum[]>([]);
  approval = signal(false);
  themes = FORUM_THEME_OPTIONS;
  fTheme = signal('comunidade');
  fName = signal('');
  fDesc = signal('');
  instFor = signal<string | null>(null);
  iTitle = signal('');
  iBody = signal('');
  phases = signal<ProposalStatus[]>([]);
  pName = signal('');
  pDesc = signal('');
  pColor = signal<StatusColor>('violeta');
  pFinal = signal(false);

  ngOnInit() {
    this.open('priorizacao');
  }

  private fail = (e: unknown) => {
    this.busy.set(false);
    const err = toApiError(e);
    this.toast.show(Object.values(err.fields)[0] ?? err.message, 'erro');
  };

  open(t: Tab) {
    this.tab.set(t);
    this.error.set(null);
    const err = (e: unknown) => this.error.set(toApiError(e).message);
    if (t === 'priorizacao') this.api.prioritySettings().subscribe({ next: (r) => { this.prio.set(r.settings); this.defaults.set(r.defaults); }, error: err });
    if (t === 'categorias') this.api.categories().subscribe({ next: (r) => { this.cats.set(r.categories); this.icons.set(r.icons); }, error: err });
    if (t === 'foruns') {
      this.api.forums().subscribe({ next: (r) => this.forums.set(r.forums), error: err });
      this.api.forumSettings().subscribe({ next: (r) => this.approval.set(r.approvalRequired), error: err });
    }
    if (t === 'fases') this.api.proposalStatuses().subscribe({ next: (r) => this.phases.set(r.statuses), error: err });
  }

  setW(k: keyof PrioritySettings, v: string) {
    this.prio.set({ ...this.prio()!, [k]: Number(v) });
  }

  savePrio() {
    this.busy.set(true);
    this.prioFields.set({});
    this.api.savePriority(this.prio()!).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.prio.set(r.settings);
        this.toast.show('Pesos salvos. A Fila de Análise já usa os novos valores.');
      },
      error: (e) => {
        this.prioFields.set(toApiError(e).fields);
        this.fail(e);
      },
    });
  }

  createCat() {
    this.busy.set(true);
    this.api.createCategory({ name: this.cName().trim(), description: this.cDesc().trim(), icon: this.cIcon(), requiresDetail: this.cDetail() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.cName.set('');
        this.cDesc.set('');
        this.toast.show('Categoria criada.');
        this.open('categorias');
      },
      error: this.fail,
    });
  }

  renameCat(c: CategoryAdmin) {
    const name = prompt('Novo nome da categoria', c.name)?.trim();
    if (!name || name === c.name) return;
    this.api.updateCategory(c.id, { name }).subscribe({ next: () => this.open('categorias'), error: this.fail });
  }

  toggleCat(c: CategoryAdmin) {
    this.api.updateCategory(c.id, { active: !c.active }).subscribe({ next: () => { this.toast.show(c.active ? 'Categoria desativada.' : 'Categoria reativada.'); this.open('categorias'); }, error: this.fail });
  }

  createForum() {
    this.busy.set(true);
    this.api.createForum({ name: this.fName().trim(), description: this.fDesc().trim(), theme: this.fTheme() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.fName.set('');
        this.fDesc.set('');
        this.toast.show('Fórum criado.');
        this.open('foruns');
      },
      error: this.fail,
    });
  }

  setApproval(on: boolean) {
    this.busy.set(true);
    this.api.setForumApproval(on).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.approval.set(r.approvalRequired);
        this.toast.show(r.approvalRequired ? 'Fóruns novos passam a depender de aprovação.' : 'Fóruns novos aparecem sem aprovação prévia.');
      },
      error: this.fail,
    });
  }

  toggleForum(f: AdminForum) {
    this.api.updateForum(f.id, { active: !f.active }).subscribe({ next: () => this.open('foruns'), error: this.fail });
  }

  createInst(f: AdminForum) {
    this.busy.set(true);
    this.api.institutionalTopic(f.slug, { title: this.iTitle().trim(), body: this.iBody().trim() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.iTitle.set('');
        this.iBody.set('');
        this.instFor.set(null);
        this.toast.show('Tópico de apoio publicado.');
        this.open('foruns');
      },
      error: this.fail,
    });
  }

  createPhase() {
    this.busy.set(true);
    this.api.createProposalStatus({ name: this.pName().trim(), description: this.pDesc().trim(), color: this.pColor(), isFinal: this.pFinal() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.pName.set('');
        this.pDesc.set('');
        this.toast.show('Fase criada.');
        this.catalog.ensure(true);
        this.open('fases');
      },
      error: this.fail,
    });
  }

  phase(s: ProposalStatus, data: { isInitial?: true; active?: boolean }) {
    this.api.updateProposalStatus(s.id, data).subscribe({ next: () => { this.catalog.ensure(true); this.open('fases'); }, error: this.fail });
  }
}
