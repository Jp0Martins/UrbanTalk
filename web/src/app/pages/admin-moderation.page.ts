import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminApi, SpamReport } from '../core/admin.api';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe } from '../core/format';
import { ActivityBlock, Forum, ModerationContent, ReportGroup } from '../core/models';
import { ToastService } from '../core/toast.service';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { REPORT_REASONS } from '../shared/report-button.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

type Tab = 'denuncias' | 'foruns' | 'ocultos' | 'spam' | 'atividade';

@Component({
  selector: 'ut-moderacao',
  imports: [RouterLink, PageHeaderComponent, PaginationComponent, EmptyStateComponent, ErrorStateComponent, DatePipe, RelativePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Moderação" description="Denúncias da comunidade, conteúdo ocultado e sinais de spam. Ocultar não apaga: o registro fica guardado e a ação vai para o histórico administrativo." />
      <div class="segmentado abas" role="tablist" aria-label="Seções da moderação">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" (click)="open(t.id)">{{ t.label }}@if (t.id === 'denuncias' && openReports() > 0) { <span class="n">{{ openReports() }}</span> }@if (t.id === 'foruns' && pending()?.length) { <span class="n">{{ pending()!.length }}</span> }</button>
        }
      </div>

      @if (error(); as e) { <ut-erro [message]="e" (retry)="open(tab())" /> }

      @switch (tab()) {
        @case ('denuncias') {
          <div class="segmentado sub" role="group" aria-label="Situação das denúncias">
            @for (s of reportStatuses; track s.id) { <button type="button" [attr.aria-pressed]="rStatus() === s.id" (click)="rStatus.set(s.id); loadReports(1)">{{ s.label }}</button> }
          </div>
          @if (reports() === null) { <p class="carregando">Carregando denúncias…</p> }
          @else if (reports()!.length === 0) { <ut-vazio icon="check" title="Nenhuma denúncia aqui" [text]="rStatus() === 'aberta' ? 'Quando alguém denunciar um conteúdo, ele aparece nesta fila.' : 'Ainda não há denúncias com esta decisão.'" /> }
          @else {
            <ul class="lista">
              @for (g of reports(); track g.content.type + g.content.id) {
                <li class="painel card">
                  <p class="topo"><span class="selo-texto">{{ g.content.label }}</span> <strong>{{ g.reports }} {{ g.reports === 1 ? 'denúncia' : 'denúncias' }}</strong> <span class="muted">· primeira {{ g.firstAt | relativo }}</span>
                    @if (g.content.hiddenAt) { <span class="selo-texto interna">Oculto</span> }
                  </p>
                  <blockquote>{{ g.content.text }}</blockquote>
                  <p class="dica">Autor: {{ g.content.authorName ?? 'sem autor' }} · publicado {{ g.content.createdAt | data: true }} · <a [routerLink]="path(g.content.link)" [fragment]="frag(g.content.link)">ver no contexto</a></p>
                  <p class="motivos">@for (r of g.reasons; track r.reason) { <span class="selo-texto">{{ r.label }} ({{ r.count }})</span> }</p>
                  @if (g.details.length) { <ul class="detalhes">@for (d of g.details; track $index) { <li>“{{ d }}”</li> }</ul> }
                  @if (rStatus() === 'aberta') {
                    <div class="decidir">
                      <label class="sr-only" [for]="'mot-' + g.content.type + g.content.id">Motivo para ocultar</label>
                      <select class="entrada" [id]="'mot-' + g.content.type + g.content.id" (change)="reason.set($any($event.target).value)">
                        <option value="">Motivo para ocultar…</option>
                        @for (r of reasons; track r.id) { <option [value]="r.id">{{ r.label }}</option> }
                      </select>
                      <button type="button" class="btn btn-perigo btn-sm" [disabled]="busy()" (click)="decide(g, 'ocultar')">Ocultar</button>
                      <button type="button" class="btn btn-secundario btn-sm" [disabled]="busy()" (click)="decide(g, 'manter')">Manter publicado</button>
                    </div>
                  }
                </li>
              }
            </ul>
            <ut-paginacao [page]="rPage()" [totalPages]="rTotalPages()" (go)="loadReports($event)" />
          }
        }
        @case ('foruns') {
          @if (pending() === null) { <p class="carregando">Carregando…</p> }
          @else if (pending()!.length === 0) {
            <ut-vazio icon="check" title="Nenhum fórum aguardando aprovação" [text]="approvalOn() ? 'Quando alguém criar um fórum, ele aparece aqui antes de ficar público.' : 'A aprovação prévia está desligada: fóruns novos aparecem na hora. A administração pode ligá-la em Configurações › Fóruns.'" />
          } @else {
            <ul class="lista">
              @for (f of pending(); track f.id) {
                <li class="painel card">
                  <p class="topo"><span class="selo-texto">{{ f.theme.name }}</span>@if (f.neighborhoodName) { <span class="selo-texto">{{ f.neighborhoodName }}</span> } <strong>{{ f.name }}</strong> <span class="muted">· criado {{ f.createdAt | relativo }} por {{ f.creatorFullName ?? 'conta removida' }}</span></p>
                  <blockquote>{{ f.description }}</blockquote>
                  @if (f.tags.length) { <p class="motivos">@for (t of f.tags; track t) { <span class="selo-texto">#{{ t }}</span> }</p> }
                  @if (f.rules) { <p class="dica">Regras: {{ f.rules }}</p> }
                  <div class="decidir">
                    <a class="btn btn-texto btn-sm" [routerLink]="['/comunidade/f', f.slug]">Abrir</a>
                    <button type="button" class="btn btn-primario btn-sm" [disabled]="busy()" (click)="review(f.id, 'aprovar')">Aprovar</button>
                    <button type="button" class="btn btn-secundario btn-sm" [disabled]="busy()" (click)="review(f.id, 'recusar')">Recusar</button>
                  </div>
                </li>
              }
            </ul>
          }
        }
        @case ('ocultos') {
          @if (hidden() === null) { <p class="carregando">Carregando…</p> }
          @else if (hidden()!.length === 0) { <ut-vazio icon="check" title="Nenhum conteúdo oculto pela moderação" /> }
          @else {
            <ul class="lista">
              @for (h of hidden(); track h.type + h.id) {
                <li class="painel card">
                  <p class="topo"><span class="selo-texto">{{ h.label }}</span> <span class="selo-texto interna">{{ reasonLabel(h.hiddenReason) }}</span> <span class="muted">ocultado {{ h.hiddenAt! | relativo }}{{ h.moderatorName ? ' por ' + h.moderatorName : '' }}</span></p>
                  <blockquote>{{ h.text }}</blockquote>
                  <p class="dica">Autor: {{ h.authorName ?? 'sem autor' }}</p>
                  <button type="button" class="btn btn-secundario btn-sm" [disabled]="busy()" (click)="restore(h)">Restaurar</button>
                </li>
              }
            </ul>
          }
        }
        @case ('spam') {
          @if (spam(); as s) {
            <p class="muted">Últimos 30 dias, desde {{ s.since | data }}. São só sinais: confira antes de ocultar.</p>
            <h2 class="sec">Mesmo texto publicado várias vezes</h2>
            @if (s.repeated.length === 0) { <p class="muted">Nenhum texto repetido encontrado.</p> }
            <ul class="lista">
              @for (r of s.repeated; track r.text) {
                <li class="painel card">
                  <p class="topo"><strong>{{ r.count }} vezes</strong> <span class="muted">por {{ r.authors.join(', ') }}</span></p>
                  <blockquote>{{ r.text }}</blockquote>
                  <p class="links">@for (i of r.items; track i.type + i.id) { <a [routerLink]="path(i.link)" [fragment]="frag(i.link)">{{ i.label }} · {{ i.createdAt | relativo }}</a> }</p>
                </li>
              }
            </ul>
            <h2 class="sec">Muitas publicações na mesma hora</h2>
            @if (s.bursts.length === 0) { <p class="muted">Nenhuma conta com 10 ou mais publicações numa mesma hora.</p> }
            @else {
              <table class="tabela painel"><thead><tr><th>Conta</th><th class="num">Publicações</th><th>Hora</th></tr></thead>
                <tbody>@for (b of s.bursts; track b.name + b.hourStart) { <tr><td>{{ b.name }}</td><td class="num">{{ b.count }}</td><td>{{ b.hourStart | data: true }}</td></tr> }</tbody>
              </table>
            }
          } @else { <p class="carregando">Analisando…</p> }
        }
        @case ('atividade') {
          @if (activity(); as a) {
            <table class="tabela painel atividade">
              <caption class="sr-only">Atividade da comunidade</caption>
              <thead><tr><th>Indicador</th><th class="num">Últimos 7 dias</th><th class="num">Últimos 30 dias</th></tr></thead>
              <tbody>
                @for (row of activityRows; track row.key) { <tr><td>{{ row.label }}</td><td class="num">{{ val(a.week, row.key) }}</td><td class="num">{{ val(a.month, row.key) }}</td></tr> }
              </tbody>
            </table>
            <p class="dica">Contagens diretas do banco. "Pessoas ativas" soma quem publicou, comentou, propôs ou votou, sem repetir a mesma pessoa. Conteúdo de apoio do UrbanTalk não entra.</p>
          } @else { <p class="carregando">Carregando…</p> }
        }
      }
    </div>
  `,
  styles: `
    .abas { margin-bottom: var(--s-4); flex-wrap: wrap; }
    .n { background: var(--faixa); color: var(--asfalto); border-radius: var(--r-1); padding: 0 6px; font-size: var(--t-xs); }
    .sub { margin-bottom: var(--s-3); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }
    .card { padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-2); }
    .topo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--linha-forte); background: var(--superficie-2); white-space: pre-line; overflow-wrap: anywhere; }
    .motivos { display: flex; gap: 6px; flex-wrap: wrap; }
    .detalhes { margin: 0; padding-left: 1.1em; font-size: var(--t-sm); color: var(--texto-2); }
    .decidir { display: flex; gap: var(--s-2); flex-wrap: wrap; align-items: center; border-top: 1px solid var(--linha); padding-top: var(--s-3); }
    .decidir .entrada { max-width: 280px; min-height: 36px; padding-top: 6px; padding-bottom: 6px; }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .sec { font-size: var(--t-lg); margin: var(--s-5) 0 var(--s-3); }
    .links { display: flex; gap: var(--s-3); flex-wrap: wrap; font-size: var(--t-sm); }
    .atividade { max-width: 640px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModerationPage implements OnInit {
  private api = inject(AdminApi);
  private toast = inject(ToastService);
  tabs: { id: Tab; label: string }[] = [
    { id: 'denuncias', label: 'Denúncias' },
    { id: 'foruns', label: 'Fóruns novos' },
    { id: 'ocultos', label: 'Conteúdo oculto' },
    { id: 'spam', label: 'Sinais de spam' },
    { id: 'atividade', label: 'Atividade da comunidade' },
  ];
  reportStatuses = [
    { id: 'aberta', label: 'Abertas' },
    { id: 'procedente', label: 'Ocultadas' },
    { id: 'improcedente', label: 'Mantidas' },
  ];
  reasons = REPORT_REASONS;
  activityRows: { key: keyof ActivityBlock; label: string }[] = [
    { key: 'activePeople', label: 'Pessoas ativas' },
    { key: 'posts', label: 'Publicações no feed' },
    { key: 'topics', label: 'Discussões abertas por moradores' },
    { key: 'comments', label: 'Comentários e respostas' },
    { key: 'proposals', label: 'Propostas' },
    { key: 'votes', label: 'Apoios a propostas' },
    { key: 'reports', label: 'Denúncias recebidas' },
  ];
  tab = signal<Tab>('denuncias');
  rStatus = signal('aberta');
  reports = signal<ReportGroup[] | null>(null);
  rPage = signal(1);
  rTotalPages = signal(1);
  openReports = signal(0);
  hidden = signal<ModerationContent[] | null>(null);
  spam = signal<SpamReport | null>(null);
  activity = signal<{ week: ActivityBlock; month: ActivityBlock; openReports: number } | null>(null);
  pending = signal<(Forum & { creatorFullName: string | null })[] | null>(null);
  approvalOn = signal(false);
  private route = inject(ActivatedRoute);
  reason = signal('');
  busy = signal(false);
  error = signal<string | null>(null);

  val = (b: ActivityBlock, k: keyof ActivityBlock) => b[k];
  path = (link: string) => link.split('#')[0];
  frag = (link: string) => link.split('#')[1] ?? undefined;
  reasonLabel = (r: string | null) => REPORT_REASONS.find((x) => x.id === r)?.label ?? 'Moderação';

  ngOnInit() {
    // aviso de fórum pendente leva direto para a aba certa
    this.open(this.route.snapshot.queryParamMap.get('aba') === 'foruns' ? 'foruns' : 'denuncias');
    this.loadPending();
    this.api.activity().subscribe({ next: (a) => this.openReports.set(a.openReports), error: () => undefined });
  }

  open(t: Tab) {
    this.tab.set(t);
    this.error.set(null);
    const fail = (e: unknown) => this.error.set(toApiError(e).message);
    if (t === 'denuncias') this.loadReports(1);
    if (t === 'foruns') this.loadPending();
    if (t === 'ocultos') this.api.hidden().subscribe({ next: (r) => this.hidden.set(r.items), error: fail });
    if (t === 'spam') this.api.spam().subscribe({ next: (r) => this.spam.set(r), error: fail });
    if (t === 'atividade') this.api.activity().subscribe({ next: (r) => this.activity.set(r), error: fail });
  }

  loadReports(page: number) {
    this.reports.set(null);
    this.api.reports(this.rStatus(), page).subscribe({
      next: (r) => {
        this.reports.set(r.items);
        this.rPage.set(r.page);
        this.rTotalPages.set(r.totalPages);
        if (this.rStatus() === 'aberta') this.openReports.set(r.total);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  decide(g: ReportGroup, decision: 'ocultar' | 'manter') {
    if (decision === 'ocultar' && !this.reason()) {
      this.toast.show('Escolha o motivo antes de ocultar.', 'erro');
      return;
    }
    this.busy.set(true);
    this.api.decide(g.content.type, g.content.id, decision, decision === 'ocultar' ? this.reason() : null, '').subscribe({
      next: () => {
        this.busy.set(false);
        this.reason.set('');
        this.toast.show(decision === 'ocultar' ? 'Conteúdo ocultado. O registro foi preservado.' : 'Conteúdo mantido. As denúncias foram encerradas.');
        this.loadReports(this.rPage());
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  private loadPending() {
    this.api.pendingForums().subscribe({ next: (r) => this.pending.set(r.forums), error: (e) => this.error.set(toApiError(e).message) });
    this.api.forumSettings().subscribe({ next: (r) => this.approvalOn.set(r.approvalRequired), error: () => undefined });
  }

  review(id: number, decision: 'aprovar' | 'recusar') {
    if (decision === 'recusar' && !confirm('Recusar este fórum? Quem criou recebe um aviso.')) return;
    this.busy.set(true);
    this.api.reviewForum(id, decision).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set((this.pending() ?? []).filter((f) => f.id !== id));
        this.toast.show(decision === 'aprovar' ? 'Fórum aprovado. Ele já aparece para todos.' : 'Fórum recusado.');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  restore(h: ModerationContent) {
    this.busy.set(true);
    this.api.visibility(h.type, h.id, false).subscribe({
      next: () => {
        this.busy.set(false);
        this.hidden.set((this.hidden() ?? []).filter((x) => !(x.type === h.type && x.id === h.id)));
        this.toast.show('Conteúdo restaurado.');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }
}
