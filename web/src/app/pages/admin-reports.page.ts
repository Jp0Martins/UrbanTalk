import { TranslatePipe } from '@ngx-translate/core';
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
  imports: [PageHeaderComponent, IconComponent, NeighborhoodInputComponent, TranslatePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina [title]="'auto.md084946253' | translate" [description]="'auto.m4b33e19396' | translate" />

      <div class="grade">
        <form class="painel form" (submit)="$event.preventDefault(); generate()" novalidate>
          <h2>{{ 'auto.me992860b56' | translate }}</h2>
          <div class="linha">
            <div class="campo">
              <label for="de">{{ 'auto.m2c38c11abd' | translate }}</label>
              <input id="de" class="entrada" type="date" [value]="f().from ?? ''" [max]="f().to ?? today" (change)="set('from', $any($event.target).value)" [attr.aria-invalid]="!!fields()['from']" />
              @if (fields()['from']) {
                <span class="erro">{{ fields()['from'] }}</span>
              }
            </div>
            <div class="campo">
              <label for="ate">{{ 'auto.ma293c7ef42' | translate }}</label>
              <input id="ate" class="entrada" type="date" [value]="f().to ?? ''" [min]="f().from ?? ''" [max]="today" (change)="set('to', $any($event.target).value)" [attr.aria-invalid]="!!fields()['to']" />
              @if (fields()['to']) {
                <span class="erro">{{ fields()['to'] }}</span>
              }
            </div>
          </div>
          <div class="campo">
            <label for="onde">{{ 'auto.m769815f878' | translate }}</label>
            <select id="onde" class="entrada" (change)="setScope($any($event.target).value)">
              <option value="" [selected]="!f().scope">{{ 'auto.mb1f27213ce' | translate }}</option>
              <option value="cidade" [selected]="f().scope === 'cidade'">{{ 'auto.m25bf01cfcb' | translate }}</option>
              <option value="bairro" [selected]="f().scope === 'bairro'">{{ 'auto.m79562fd313' | translate }}</option>
            </select>
          </div>
          @if (f().scope !== 'cidade') {
            <div class="campo">
              <label for="bairro">{{ 'auto.m49f7179a65' | translate }}</label>
              <ut-bairro inputId="bairro" [placeholder]="'auto.m197b18b57f' | translate" describedBy="bairro-dica" [value]="f().neighborhood ?? ''" (committed)="set('neighborhood', $event.trim())" />
              <span class="dica" id="bairro-dica">{{ 'auto.m259dc2343c' | translate }}</span>
            </div>
          }
          <div class="campo">
            <label for="cat">{{ 'auto.m5966b0ce8b' | translate }}</label>
            <select id="cat" class="entrada" (change)="set('category', $any($event.target).value)">
              <option value="" [selected]="!f().category">{{ 'auto.m1459742683' | translate }}</option>
              @for (c of categories(); track c.id) {
                <option [value]="c.id" [selected]="f().category === c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="st">{{ 'auto.mbae7d5be70' | translate }}</label>
            <select id="st" class="entrada" (change)="set('status', $any($event.target).value)">
              <option value="" [selected]="!f().status">{{ 'auto.ma1beb7aea5' | translate }}</option>
              @for (s of catalog.all(); track s.slug) {
                <option [value]="s.slug" [selected]="f().status === s.slug">{{ s.name }}{{ s.active ? '' : ' (desativado)' }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="rua">{{ 'auto.ma89b964320' | translate }} <span class="muted">{{ 'auto.m813486d257' | translate }}</span></label>
            <input id="rua" class="entrada" maxlength="100" [value]="f().street ?? ''" (change)="set('street', $any($event.target).value.trim())" [placeholder]="'auto.m7454b35252' | translate" />
          </div>
          @if (error()) {
            <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ error() }}</div>
          }
          <div class="botoes-rel">
            <button type="submit" class="btn btn-primario" [disabled]="busy()">
              <ut-icon name="download" />{{ busy() ? ('auto.m4d9c6dae0c' | translate) : ('auto.m264d08ec77' | translate) }}
            </button>
            <button type="button" class="btn btn-secundario" [disabled]="busy()" (click)="generate('csv')">
              <ut-icon name="file" />{{ 'auto.m4a1ffe14a7' | translate }}
            </button>
          </div>
          <p class="dica-csv">{{ 'auto.mb885d1a70c' | translate }}</p>
        </form>

        <aside class="painel previa" aria-live="polite" aria-labelledby="prev-t">
          <h2 id="prev-t">{{ 'auto.m9774128981' | translate }}</h2>
          @if (loadingPreview()) {
            <p class="carregando">{{ 'auto.mf347763e11' | translate }}</p>
          } @else if (preview(); as p) {
            <p class="total"><span class="tabular">{{ p.total }}</span> {{ p.total === 1 ? ('auto.mf0c222df00' | translate) : ('auto.ma06ec91e02' | translate) }} entre {{ fmt(p.period.from) }} e {{ fmt(p.period.to) }}</p>
            @if (p.total === 0) {
              <p class="muted">{{ 'auto.mac566cbde2' | translate }}</p>
            } @else {
              <ul class="itens">
                <li>Totais por status: {{ statusLine() }}</li>
                <li>{{ p.byCategory.filter(nonZero).length }} categorias e {{ p.byNeighborhood.length }} bairros com registros</li>
                <li>{{ 'auto.m43bc2470a2' | translate }}</li>
                <li>{{ 'auto.mbc03f1a52e' | translate }}</li>
                <li>{{ 'auto.m473bd9494d' | translate }}</li>
              </ul>
            }
          }
          <p class="nota">{{ 'auto.m4c5d4eb886' | translate }}</p>
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
