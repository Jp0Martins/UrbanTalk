import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { addDays, formatDay, todayLocal } from '../core/format';
import { Filters, Indicators } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';

@Component({
  selector: 'ut-admin-relatorios',
  imports: [PageHeaderComponent, IconComponent, NeighborhoodInputComponent],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Relatório para encaminhamento" description="Gere um PDF consolidado para enviar manualmente aos órgãos responsáveis. O UrbanTalk não envia nada automaticamente." />

      <div class="grade">
        <form class="painel form" (submit)="$event.preventDefault(); generate()" novalidate>
          <h2>Critérios</h2>
          <div class="linha">
            <div class="campo">
              <label for="de">Data inicial</label>
              <input id="de" class="entrada" type="date" [value]="f().from ?? ''" [max]="f().to ?? today" (change)="set('from', $any($event.target).value)" [attr.aria-invalid]="!!fields()['from']" />
              @if (fields()['from']) {
                <span class="erro">{{ fields()['from'] }}</span>
              }
            </div>
            <div class="campo">
              <label for="ate">Data final</label>
              <input id="ate" class="entrada" type="date" [value]="f().to ?? ''" [min]="f().from ?? ''" [max]="today" (change)="set('to', $any($event.target).value)" [attr.aria-invalid]="!!fields()['to']" />
              @if (fields()['to']) {
                <span class="erro">{{ fields()['to'] }}</span>
              }
            </div>
          </div>
          <div class="campo">
            <label for="onde">Onde se aplica</label>
            <select id="onde" class="entrada" (change)="setScope($any($event.target).value)">
              <option value="" [selected]="!f().scope">Cidade toda e bairros</option>
              <option value="cidade" [selected]="f().scope === 'cidade'">Só reclamações da cidade toda</option>
              <option value="bairro" [selected]="f().scope === 'bairro'">Só reclamações de bairro</option>
            </select>
          </div>
          @if (f().scope !== 'cidade') {
            <div class="campo">
              <label for="bairro">Bairro</label>
              <ut-bairro inputId="bairro" placeholder="Todos os bairros" describedBy="bairro-dica" [value]="f().neighborhood ?? ''" (committed)="set('neighborhood', $event.trim())" />
              <span class="dica" id="bairro-dica">Digite o nome; maiúsculas e acentos não fazem diferença.</span>
            </div>
          }
          <div class="campo">
            <label for="cat">Categoria</label>
            <select id="cat" class="entrada" (change)="set('category', $any($event.target).value)">
              <option value="" [selected]="!f().category">Todas as categorias</option>
              @for (c of categories(); track c.id) {
                <option [value]="c.id" [selected]="f().category === c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="st">Status</label>
            <select id="st" class="entrada" (change)="set('status', $any($event.target).value)">
              <option value="" [selected]="!f().status">Todos os status</option>
              @for (s of catalog.all(); track s.slug) {
                <option [value]="s.slug" [selected]="f().status === s.slug">{{ s.name }}{{ s.active ? '' : ' (desativado)' }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="rua">Rua contém <span class="muted">(opcional)</span></label>
            <input id="rua" class="entrada" maxlength="100" [value]="f().street ?? ''" (change)="set('street', $any($event.target).value.trim())" placeholder="Ex.: XV de Novembro" />
          </div>
          @if (error()) {
            <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ error() }}</div>
          }
          <div class="botoes-rel">
            <button type="submit" class="btn btn-primario" [disabled]="busy()">
              <ut-icon name="download" />{{ busy() ? 'Gerando…' : 'Gerar e baixar PDF' }}
            </button>
            <button type="button" class="btn btn-secundario" [disabled]="busy()" (click)="generate('csv')">
              <ut-icon name="file" />Baixar planilha (CSV)
            </button>
          </div>
          <p class="dica-csv">O CSV traz uma linha por reclamação (sem descrição nem dados de quem registrou) e abre no Excel ou no Google Planilhas.</p>
        </form>

        <aside class="painel previa" aria-live="polite" aria-labelledby="prev-t">
          <h2 id="prev-t">O que vai no relatório</h2>
          @if (loadingPreview()) {
            <p class="carregando">Contando registros…</p>
          } @else if (preview(); as p) {
            <p class="total"><span class="tabular">{{ p.total }}</span> {{ p.total === 1 ? 'ocorrência' : 'ocorrências' }} entre {{ fmt(p.period.from) }} e {{ fmt(p.period.to) }}</p>
            @if (p.total === 0) {
              <p class="muted">O PDF será gerado informando que não há registros para estes critérios. Nenhum número é estimado.</p>
            } @else {
              <ul class="itens">
                <li>Totais por status: {{ statusLine() }}</li>
                <li>{{ p.byCategory.filter(nonZero).length }} categorias e {{ p.byNeighborhood.length }} bairros com registros</li>
                <li>O que foi escrito em "Outros", agrupado</li>
                <li>Gráfico da evolução no período</li>
                <li>Reclamações em aberto com mais confirmações, com rua e bairro, para priorizar</li>
              </ul>
              @if (p.demoCount > 0) {
                <div class="aviso aviso-atencao"><ut-icon name="info" />{{ p.demoCount }} dos registros são fictícios de demonstração e o PDF avisa isso.</div>
              }
            }
          }
          <p class="nota">Depois de enviar o relatório ao órgão responsável, atualize o status das reclamações na página de cada uma, e deixe uma atualização visível ao cidadão se quiser explicar o próximo passo.</p>
        </aside>
      </div>
    </div>
  `,
  styles: `
    .botoes-rel { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .dica-csv, .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--s-5); align-items: start; max-width: 1040px; }
    .form { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
    h2 { font-size: var(--t-lg); }
    .linha { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .previa { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
    .total { font-size: var(--t-lg); }
    .total .tabular { font-family: var(--fonte-titulo); font-weight: 700; font-size: 2rem; margin-right: 4px; }
    .itens { margin: 0; padding-left: 1.2em; color: var(--texto-2); display: flex; flex-direction: column; gap: 4px; }
    .nota { font-size: var(--t-xs); color: var(--texto-2); border-top: 1px solid var(--linha); padding-top: var(--s-3); margin-top: var(--s-2); }
    @media (max-width: 860px) { .grade { grid-template-columns: 1fr; } }
    @media (max-width: 480px) { .linha { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  today = todayLocal();
  catalog = inject(StatusCatalog);
  categories = toSignal(this.api.categories$, { initialValue: [] });
  f = signal<Filters>({ from: addDays(todayLocal(), -29), to: todayLocal() });
  preview = signal<Indicators | null>(null);
  loadingPreview = signal(false);
  busy = signal(false);
  error = signal<string | null>(null);
  fields = signal<Record<string, string>>({});
  fmt = formatDay;
  nonZero = (c: { count: number }) => c.count > 0;

  statusLine = computed(() =>
    (this.preview()?.byStatus ?? [])
      .filter((s) => s.count > 0)
      .map((s) => `${s.count} ${s.name.toLowerCase()}`)
      .join(', ') || 'nenhuma',
  );

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const num = (k: string) => (q.get(k) ? Number(q.get(k)) : null);
    this.f.set({
      from: q.get('de') ?? this.f().from,
      to: q.get('ate') ?? this.f().to,
      category: num('categoria'),
      neighborhood: q.get('bairro') || null,
      scope: (q.get('onde') as Filters['scope']) || null,
      status: q.get('status') || null,
    });
    this.refreshPreview();
  }

  set(key: keyof Filters, raw: string) {
    const v = raw === '' ? null : key === 'category' ? Number(raw) : raw;
    if (v === (this.f()[key] ?? null)) return;
    this.f.update((f) => ({ ...f, [key]: v }));
    this.fields.set({});
    this.error.set(null);
    this.refreshPreview();
  }

  setScope(raw: string) {
    const scope = (raw || null) as Filters['scope'];
    this.f.update((f) => ({ ...f, scope, ...(scope === 'cidade' ? { neighborhood: null } : {}) }));
    this.refreshPreview();
  }

  private refreshPreview() {
    const f = this.f();
    if (!f.from || !f.to || f.from > f.to) {
      this.preview.set(null);
      return;
    }
    this.loadingPreview.set(true);
    this.api.indicators(f).subscribe({
      next: (r) => {
        this.preview.set(r);
        this.loadingPreview.set(false);
      },
      error: (e) => {
        this.loadingPreview.set(false);
        this.error.set(toApiError(e).message);
      },
    });
  }

  generate(kind: 'pdf' | 'csv' = 'pdf') {
    const f = this.f();
    const fields: Record<string, string> = {};
    if (!f.from) fields['from'] = 'Informe a data inicial.';
    if (!f.to) fields['to'] = 'Informe a data final.';
    if (f.from && f.to && f.from > f.to) fields['from'] = 'A data inicial precisa ser anterior à final.';
    this.fields.set(fields);
    if (Object.keys(fields).length) return;

    this.busy.set(true);
    this.error.set(null);
    (kind === 'csv' ? this.api.reportCsv(f) : this.api.reportPdf(f)).subscribe({
      next: (res) => {
        this.busy.set(false);
        const blob = res.body!;
        const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `relatorio-urbantalk.${kind}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.toast.show(kind === 'csv' ? 'Planilha gerada. Confira a pasta de downloads.' : 'Relatório gerado. Confira a pasta de downloads.');
      },
      error: async (e: HttpErrorResponse) => {
        this.busy.set(false);
        // erro chega como blob porque a requisição pede PDF
        if (e.error instanceof Blob) {
          try {
            const body = JSON.parse(await e.error.text());
            this.error.set(body?.error?.message ?? 'Não foi possível gerar o relatório.');
            this.fields.set(body?.error?.fields ?? {});
            return;
          } catch {
            /* segue para a mensagem genérica */
          }
        }
        this.error.set(toApiError(e).message);
      },
    });
  }
}
