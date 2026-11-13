import { TranslatePipe } from '@ngx-translate/core';
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
  imports: [RouterLink, IconComponent, PageHeaderComponent, ErrorStateComponent, TranslatePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina [title]="'auto.m871f24c4cd' | translate" [description]="'auto.m0a0cddcd4e' | translate" />
      <div class="segmentado abas" role="tablist" [aria-label]="'auto.mcec5a35096' | translate">
        @for (t of tabs; track t.id) { <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" (click)="open(t.id)">{{ t.label }}</button> }
      </div>
      @if (error(); as e) { <ut-erro [message]="e" (retry)="open(tab())" /> }

      @switch (tab()) {
        @case ('priorizacao') {
          @if (prio(); as p) {
            <form class="painel bloco" (submit)="$event.preventDefault(); savePrio()">
              <p class="muted">{{ 'auto.m8595a3ad30' | translate }} <a routerLink="/admin/fila">{{ 'auto.m6a1a148a2e' | translate }}</a>{{ 'auto.m3569675fca' | translate }}</p>
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
                <button type="button" class="btn btn-texto" (click)="prio.set({ ...defaults()! })">{{ 'auto.m418fbad4cb' | translate }}</button>
                <button type="submit" class="btn btn-primario" [disabled]="busy()">{{ 'auto.md2d3426bb6' | translate }}</button>
              </div>
            </form>
          } @else { <p class="carregando">{{ 'auto.mbca482b745' | translate }}</p> }
        }
        @case ('categorias') {
          <form class="painel bloco nova" (submit)="$event.preventDefault(); createCat()">
            <h2>{{ 'auto.m20e2b0ca91' | translate }}</h2>
            <div class="linha">
              <div class="campo"><label for="c-nome">{{ 'auto.m13030dd962' | translate }}</label><input id="c-nome" class="entrada" maxlength="80" [value]="cName()" (input)="cName.set($any($event.target).value)" /></div>
              <div class="campo cresce"><label for="c-desc">{{ 'auto.m469768598e' | translate }}</label><input id="c-desc" class="entrada" maxlength="200" [value]="cDesc()" (input)="cDesc.set($any($event.target).value)" /></div>
              <div class="campo"><label for="c-ico">{{ 'auto.m5f019bb4f8' | translate }}</label>
                <select id="c-ico" class="entrada" (change)="cIcon.set($any($event.target).value)">@for (i of icons(); track i) { <option [value]="i" [selected]="cIcon() === i">{{ i }}</option> }</select></div>
            </div>
            <label class="check"><input type="checkbox" [checked]="cDetail()" (change)="cDetail.set($any($event.target).checked)" />{{ 'auto.m2559b79f28' | translate }}</label>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy() || cName().trim().length < 3">{{ 'auto.meac851fdea' | translate }}</button>
          </form>
          <ul class="lista">
            @for (c of cats(); track c.id) {
              <li class="painel item" [class.inativa]="!c.active">
                <ut-icon [name]="c.icon" [size]="22" />
                <div class="cresce">
                  <p><strong>{{ c.name }}</strong> @if (!c.active) { <span class="selo-texto">{{ 'auto.mb062fbd950' | translate }}</span> } @if (c.requiresDetail) { <span class="selo-texto">{{ 'auto.m6917cdee71' | translate }}</span> }</p>
                  <p class="dica">{{ c.description || 'Sem descrição' }} · {{ c.usage }} reclamações</p>
                </div>
                <button type="button" class="btn btn-texto btn-sm" (click)="renameCat(c)">{{ 'auto.m5f9fc71a02' | translate }}</button>
                <button type="button" class="btn btn-secundario btn-sm" (click)="toggleCat(c)">{{ c.active ? ('auto.m79db9fc450' | translate) : ('auto.m4384962e9a' | translate) }}</button>
              </li>
            }
          </ul>
          <p class="dica">{{ 'auto.m17c5559710' | translate }}</p>
        }
        @case ('foruns') {
          <section class="painel bloco">
            <h2>{{ 'auto.mec7ad5ad41' | translate }}</h2>
            <label class="check"><input type="checkbox" [checked]="approval()" [disabled]="busy()" (change)="setApproval($any($event.target).checked)" />{{ 'auto.m79cb4014e4' | translate }}</label>
            <p class="dica">{{ approval() ? ('auto.md1a49b6c78' | translate) : ('auto.m810c28f5ae' | translate) }} Cada pessoa cria no máximo 3 fóruns por dia.</p>
          </section>
          <form class="painel bloco nova" (submit)="$event.preventDefault(); createForum()">
            <h2>{{ 'auto.md13b7018cb' | translate }}</h2>
            <div class="linha">
              <div class="campo"><label for="f-nome">{{ 'auto.m13030dd962' | translate }}</label><input id="f-nome" class="entrada" maxlength="60" [value]="fName()" (input)="fName.set($any($event.target).value)" /></div>
              <div class="campo"><label for="f-tema">{{ 'auto.m6ae1bcaff6' | translate }}</label>
                <select id="f-tema" class="entrada" (change)="fTheme.set($any($event.target).value)">
                  @for (t of themes; track t.id) { <option [value]="t.id" [selected]="fTheme() === t.id">{{ t.name }}</option> }
                </select>
              </div>
              <div class="campo cresce"><label for="f-desc">{{ 'auto.m469768598e' | translate }}</label><input id="f-desc" class="entrada" maxlength="300" [value]="fDesc()" (input)="fDesc.set($any($event.target).value)" /></div>
            </div>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy() || fName().trim().length < 5">{{ 'auto.m288b2f618b' | translate }}</button>
          </form>
          <ul class="lista">
            @for (f of forums(); track f.id) {
              <li class="painel item col" [class.inativa]="!f.active || f.hidden">
                <div class="linha-item">
                  <ut-icon [name]="f.icon" [size]="22" />
                  <div class="cresce">
                    <p><strong>{{ f.name }}</strong>
                      <span class="selo-texto" [class.equipe]="f.kind === 'oficial'">{{ f.kind === 'oficial' ? ('auto.m45ce87990a' | translate) : ('auto.m3cc52f916c' | translate) }}</span>
                      @if (!f.active) { <span class="selo-texto">{{ 'auto.m8809a6227c' | translate }}</span> }
                      @if (f.status !== 'ativo') { <span class="selo-texto interna">{{ f.status === 'pendente' ? ('auto.mfb02485822' | translate) : ('auto.m1ffbc631fb' | translate) }}</span> }
                      @if (f.hidden) { <span class="selo-texto">{{ 'auto.mdd180eb7b5' | translate }}</span> }
                    </p>
                    <p class="dica">{{ f.theme.name }}{{ f.neighborhoodName ? ' · ' + f.neighborhoodName : '' }} · {{ f.topics }} discussões · {{ f.participants }} participantes{{ f.creatorFullName ? ' · criado por ' + f.creatorFullName : '' }}</p>
                  </div>
                  <a class="btn btn-texto btn-sm" [routerLink]="['/comunidade/f', f.slug]">{{ 'auto.mbf763df731' | translate }}</a>
                  @if (f.kind === 'oficial') {
                    <button type="button" class="btn btn-texto btn-sm" (click)="instFor.set(instFor() === f.slug ? null : f.slug)">{{ 'auto.m28f881e2ec' | translate }}</button>
                  }
                  <button type="button" class="btn btn-secundario btn-sm" (click)="toggleForum(f)">{{ f.active ? ('auto.m79db9fc450' | translate) : ('auto.m4384962e9a' | translate) }}</button>
                </div>
                @if (instFor() === f.slug) {
                  <form class="inst" (submit)="$event.preventDefault(); createInst(f)">
                    <p class="dica">{{ 'auto.ma8d37e3e65' | translate }}</p>
                    <input class="entrada" maxlength="140" [aria-label]="'auto.m98a5efa60b' | translate" [placeholder]="'auto.m98a5efa60b' | translate" [value]="iTitle()" (input)="iTitle.set($any($event.target).value)" />
                    <textarea class="entrada" rows="3" maxlength="3000" [aria-label]="'auto.m6eeba656c0' | translate" [placeholder]="'auto.mdeed0333d1' | translate" [value]="iBody()" (input)="iBody.set($any($event.target).value)"></textarea>
                    <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy()">{{ 'auto.m60d772089c' | translate }}</button>
                  </form>
                }
              </li>
            }
          </ul>
          <p class="dica">{{ 'auto.mafe46a3be5' | translate }}</p>
        }
        @case ('fases') {
          <form class="painel bloco nova" (submit)="$event.preventDefault(); createPhase()">
            <h2>{{ 'auto.m511f764a1c' | translate }}</h2>
            <div class="linha">
              <div class="campo"><label for="p-nome">{{ 'auto.m13030dd962' | translate }}</label><input id="p-nome" class="entrada" maxlength="40" [value]="pName()" (input)="pName.set($any($event.target).value)" /></div>
              <div class="campo cresce"><label for="p-desc">{{ 'auto.m469768598e' | translate }}</label><input id="p-desc" class="entrada" maxlength="240" [value]="pDesc()" (input)="pDesc.set($any($event.target).value)" /></div>
              <div class="campo"><label for="p-cor">{{ 'auto.m62037d4390' | translate }}</label><select id="p-cor" class="entrada" (change)="pColor.set($any($event.target).value)">@for (c of colors; track c) { <option [value]="c" [selected]="pColor() === c">{{ colorNames[c] }}</option> }</select></div>
            </div>
            <label class="check"><input type="checkbox" [checked]="pFinal()" (change)="pFinal.set($any($event.target).checked)" />{{ 'auto.mb13f477cc9' | translate }}</label>
            <button type="submit" class="btn btn-primario btn-sm" [disabled]="busy() || pName().trim().length < 3">{{ 'auto.m8ab1e069ec' | translate }}</button>
          </form>
          <ul class="lista">
            @for (s of phases(); track s.id) {
              <li class="painel item" [class.inativa]="!s.active">
                <span class="cor" [attr.data-color]="s.color" aria-hidden="true"></span>
                <div class="cresce">
                  <p><strong>{{ s.name }}</strong> @if (s.isInitial) { <span class="selo-texto">{{ 'auto.m1708faf0b7' | translate }}</span> } @if (s.isFinal) { <span class="selo-texto">{{ 'auto.m672b22cc51' | translate }}</span> } @if (!s.active) { <span class="selo-texto">{{ 'auto.mb062fbd950' | translate }}</span> }</p>
                  <p class="dica">{{ s.description }}</p>
                </div>
                @if (!s.isInitial && !s.isFinal && s.active) { <button type="button" class="btn btn-texto btn-sm" (click)="phase(s, { isInitial: true })">{{ 'auto.m79160fc71a' | translate }}</button> }
                @if (!s.isInitial) { <button type="button" class="btn btn-secundario btn-sm" (click)="phase(s, { active: !s.active })">{{ s.active ? ('auto.m79db9fc450' | translate) : ('auto.m4384962e9a' | translate) }}</button> }
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
