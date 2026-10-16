import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatDay, formatDayShort } from '../core/format';

export interface BarItem {
  label: string;
  value: number;
  icon?: string;
  // cor só para status; categorias e bairros usam a cor única da marca
  color?: string;
}

// ranking horizontal: rótulo, barra e valor; funciona como tabela para leitores de tela
@Component({
  selector: 'ut-barras',
  template: `
    @if (items().length === 0) {
      <p class="sem-dados">{{ emptyText() }}</p>
    } @else {
      <table class="barras">
        <caption class="sr-only">{{ caption() }}</caption>
        <colgroup><col /><col class="c-valor" /><col class="c-pct" /></colgroup>
        <thead class="sr-only">
          <tr><th scope="col">Item</th><th scope="col">Ocorrências</th><th scope="col">Percentual</th></tr>
        </thead>
        <tbody>
          @for (it of visible(); track it.label) {
            <tr>
              <th scope="row" class="rotulo">
                <span class="nome" [title]="it.label">{{ it.label }}</span>
                <span class="trilho" aria-hidden="true">
                  <span class="barra" [style.width.%]="pct(it.value, max())" [style.background]="it.color ?? 'var(--placa)'"></span>
                </span>
              </th>
              <td class="valor tabular">{{ it.value.toLocaleString('pt-BR') }}</td>
              <td class="pct tabular">{{ share(it.value) }}</td>
            </tr>
          }
        </tbody>
      </table>
      @if (hidden() > 0) {
        <button type="button" class="btn btn-texto btn-sm mais" (click)="expanded.set(!expanded())">
          {{ expanded() ? 'Mostrar menos' : 'Mostrar mais ' + hidden() }}
        </button>
      }
    }
  `,
  styles: `
    .barras { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .barras tr + tr th, .barras tr + tr td { padding-top: 10px; }
    .rotulo { text-align: left; font-weight: 500; font-size: var(--t-sm); padding-right: var(--s-3); }
    .nome { display: block; margin-bottom: 4px; overflow-wrap: anywhere; line-height: 1.3; }
    .trilho { display: block; height: 10px; }
    .barra { display: block; height: 10px; border-radius: 0 4px 4px 0; min-width: 2px; }
    td { vertical-align: bottom; }
    .c-valor { width: 3rem; }
    .c-pct { width: 3.25rem; }
    .valor { width: 3rem; text-align: right; font-weight: 600; font-size: var(--t-sm); line-height: 1; }
    .pct { width: 3.25rem; text-align: right; color: var(--texto-2); font-size: var(--t-xs); line-height: 1; }
    .sem-dados { color: var(--texto-2); font-size: var(--t-sm); padding: var(--s-3) 0; }
    .mais { margin-top: var(--s-2); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarListComponent {
  items = input.required<BarItem[]>();
  caption = input('');
  emptyText = input('Sem registros para os filtros escolhidos.');
  limit = input(8);
  total = input<number | null>(null);
  expanded = signal(false);

  max = computed(() => Math.max(1, ...this.items().map((i) => i.value)));
  visible = computed(() => (this.expanded() ? this.items() : this.items().slice(0, this.limit())));
  hidden = computed(() => Math.max(0, this.items().length - this.limit()));
  sum = computed(() => this.total() ?? this.items().reduce((a, i) => a + i.value, 0));

  pct(v: number, max: number) {
    return v === 0 ? 0 : Math.max(1, (v / max) * 100);
  }
  share(v: number) {
    const t = this.sum();
    return t === 0 ? '0%' : `${Math.round((v / t) * 100)}%`;
  }
}

// colunas no tempo, com tooltip ao passar o mouse ou focar
@Component({
  selector: 'ut-serie',
  template: `
    <div class="serie">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="summary()">
        @for (t of ticks(); track t) {
          <line [attr.x1]="0" [attr.x2]="W" [attr.y1]="y(t)" [attr.y2]="y(t)" class="grade" />
        }
        @for (p of points(); track p.start; let i = $index) {
          <rect
            [attr.x]="i * colW() + gap() / 2"
            [attr.width]="colW() - gap()"
            [attr.y]="y(p.count)"
            [attr.height]="H - y(p.count)"
            [class.ativo]="hover() === i"
            class="col"
          />
          <rect
            [attr.x]="i * colW()"
            [attr.width]="colW()"
            y="0"
            [attr.height]="H"
            class="alvo"
            tabindex="0"
            (mouseenter)="hover.set(i)"
            (mouseleave)="hover.set(null)"
            (focus)="hover.set(i)"
            (blur)="hover.set(null)"
          >
            <title>{{ bucketLabel(p.start) }}: {{ p.count }}</title>
          </rect>
        }
        <line x1="0" [attr.x2]="W" [attr.y1]="H" [attr.y2]="H" class="base" />
      </svg>
      <div class="eixo-y tabular" aria-hidden="true">
        @for (t of ticks(); track t) {
          <span [style.bottom.%]="(t / top()) * 100">{{ t }}</span>
        }
      </div>
      @if (hover() !== null) {
        <div class="dica" [style.left.%]="((hover()! + 0.5) / points().length) * 100" role="status">
          <strong class="tabular">{{ points()[hover()!].count }}</strong>
          <span>{{ bucketLabel(points()[hover()!].start) }}</span>
        </div>
      }
    </div>
    <div class="eixo-x" aria-hidden="true">
      <span>{{ first() }}</span><span>{{ last() }}</span>
    </div>
  `,
  styles: `
    .serie { position: relative; height: 180px; margin-left: 28px; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .col { fill: var(--placa); }
    .col.ativo { fill: var(--faixa); }
    .alvo { fill: transparent; outline: none; cursor: default; }
    .alvo:focus-visible { fill: rgb(240 180 41 / 0.25); }
    .grade { stroke: var(--linha); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .base { stroke: var(--linha-forte); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .eixo-y { position: absolute; left: -28px; top: 0; bottom: 0; width: 22px; }
    .eixo-y span { position: absolute; right: 0; transform: translateY(50%); font-size: 11px; color: var(--texto-3); }
    .eixo-x { display: flex; justify-content: space-between; margin-left: 28px; margin-top: 6px; font-size: var(--t-xs); color: var(--texto-3); }
    .dica {
      position: absolute; top: -8px; transform: translate(-50%, -100%);
      background: var(--asfalto); color: var(--texto-inverso);
      padding: 6px 10px; border-radius: var(--r-1); font-size: var(--t-xs);
      white-space: nowrap; pointer-events: none; display: flex; gap: 8px; align-items: baseline;
    }
    .dica strong { font-size: var(--t-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineChartComponent {
  points = input.required<{ start: string; count: number }[]>();
  granularity = input<'day' | 'week' | 'month'>('day');
  readonly W = 600;
  readonly H = 180;
  hover = signal<number | null>(null);

  max = computed(() => Math.max(0, ...this.points().map((p) => p.count)));
  // topo do eixo arredondado para cima, com até 4 linhas de grade inteiras
  top = computed(() => {
    const m = this.max();
    if (m <= 4) return Math.max(m, 1);
    const step = Math.ceil(m / 4);
    return step * 4;
  });
  ticks = computed(() => {
    const top = this.top();
    const step = top <= 4 ? 1 : top / 4;
    const out: number[] = [];
    for (let t = step; t <= top; t += step) out.push(t);
    return out;
  });
  colW = computed(() => this.W / Math.max(1, this.points().length));
  gap = computed(() => Math.min(4, this.colW() * 0.25));

  y(v: number) {
    return this.H - (v / this.top()) * this.H;
  }

  bucketLabel(start: string) {
    if (this.granularity() === 'week') return `Semana de ${formatDay(start)}`;
    if (this.granularity() === 'month') return start.slice(5, 7) + '/' + start.slice(0, 4);
    return formatDay(start);
  }
  first = computed(() => (this.points().length ? formatDayShort(this.points()[0].start) : ''));
  last = computed(() => (this.points().length ? formatDayShort(this.points()[this.points().length - 1].start) : ''));
  summary = computed(() => {
    const total = this.points().reduce((a, p) => a + p.count, 0);
    return `Gráfico de colunas: ${total} ocorrências entre ${this.first()} e ${this.last()}, máximo de ${this.max()} em um período.`;
  });
}
