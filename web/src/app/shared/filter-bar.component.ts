import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { Filters, Status } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { IconComponent } from './icon.component';
import { NeighborhoodInputComponent } from './neighborhood-input.component';

// filtros numa única linha acima do conteúdo; cada mudança é aplicada na hora
@Component({
  selector: 'ut-filtros',
  imports: [IconComponent, NeighborhoodInputComponent],
  template: `
    <form class="filtros" role="search" [attr.aria-label]="label()" (submit)="$event.preventDefault(); applySearch()">
      @if (showSearch()) {
        <div class="campo busca">
          <label [for]="uid + 'q'">Buscar na descrição</label>
          <div class="busca-wrap">
            <ut-icon name="search" [size]="18" />
            <input
              class="entrada"
              type="search"
              [id]="uid + 'q'"
              [value]="value().q ?? ''"
              (input)="draftQ.set($any($event.target).value)"
              (search)="applySearch()"
              placeholder="Ex.: poste, praça"
              maxlength="100"
            />
          </div>
        </div>
      }
      <div class="campo">
        <label [for]="uid + 'cat'">Categoria</label>
        <select class="entrada" [id]="uid + 'cat'" (change)="set('category', $any($event.target).value)">
          <option value="" [selected]="!value().category">Todas</option>
          @for (c of categories(); track c.id) {
            <option [value]="c.id" [selected]="value().category === c.id">{{ c.name }}</option>
          }
        </select>
      </div>
      <div class="campo">
        <label [for]="uid + 'onde'">Onde se aplica</label>
        <select class="entrada" [id]="uid + 'onde'" (change)="setScope($any($event.target).value)">
          <option value="" [selected]="!value().scope">Todas</option>
          <option value="cidade" [selected]="value().scope === 'cidade'">Cidade toda</option>
          <option value="bairro" [selected]="value().scope === 'bairro'">Um bairro</option>
        </select>
      </div>
      @if (value().scope !== 'cidade') {
        <div class="campo">
          <label [for]="uid + 'bairro'">Bairro</label>
          <ut-bairro [inputId]="uid + 'bairro'" placeholder="Qualquer bairro" [value]="value().neighborhood ?? ''" (committed)="setHood($event)" />
        </div>
      }
      @if (showStatus()) {
        <div class="campo">
          <label [for]="uid + 'status'">Status</label>
          <select class="entrada" [id]="uid + 'status'" (change)="set('status', $any($event.target).value)">
            <option value="" [selected]="!value().status">Todos</option>
            @for (s of statuses(); track s.slug) {
              <option [value]="s.slug" [selected]="value().status === s.slug">{{ s.name }}{{ s.active ? '' : ' (desativado)' }}</option>
            }
          </select>
        </div>
      }
      @if (showStreet()) {
        <div class="campo">
          <label [for]="uid + 'rua'">Rua ou via</label>
          <input class="entrada" type="search" [id]="uid + 'rua'" [value]="value().street ?? ''" (input)="draftStreet.set($any($event.target).value)" (change)="applyStreet()" (search)="applyStreet()" placeholder="Ex.: XV de Novembro" maxlength="100" />
        </div>
      }
      @if (showDates()) {
        <div class="campo data">
          <label [for]="uid + 'de'">De</label>
          <input class="entrada" type="date" [id]="uid + 'de'" [value]="value().from ?? ''" [max]="value().to ?? ''" (change)="set('from', $any($event.target).value)" />
        </div>
        <div class="campo data">
          <label [for]="uid + 'ate'">Até</label>
          <input class="entrada" type="date" [id]="uid + 'ate'" [value]="value().to ?? ''" [min]="value().from ?? ''" (change)="set('to', $any($event.target).value)" />
        </div>
      }
      @if (active()) {
        <button type="button" class="btn btn-texto limpar" (click)="clear()">Limpar filtros</button>
      }
    </form>
  `,
  styles: `
    .filtros {
      display: flex;
      flex-wrap: wrap;
      gap: var(--s-3);
      align-items: flex-end;
    }
    .campo { flex: 1 1 170px; max-width: 240px; }
    .busca { flex: 2 1 220px; max-width: 320px; }
    .data { flex: 0 1 158px; }
    .busca-wrap { position: relative; }
    .busca-wrap ut-icon { position: absolute; left: 11px; top: 13px; color: var(--texto-3); pointer-events: none; }
    .busca-wrap .entrada { padding-left: 36px; }
    .limpar { min-height: 44px; }
    @media (max-width: 640px) {
      .campo, .busca { max-width: none; flex: 1 1 calc(50% - var(--s-3)); }
      .busca { flex-basis: 100%; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBarComponent {
  private api = inject(ApiService);
  private static seq = 0;
  readonly uid = `f${++FilterBarComponent.seq}-`;

  label = input('Filtros');
  value = input<Filters>({});
  showStatus = input(true);
  showDates = input(false);
  showSearch = input(false);
  showStreet = input(false);
  changed = output<Filters>();

  categories = toSignal(this.api.categories$, { initialValue: [] });
  private catalog = inject(StatusCatalog);
  statuses = this.catalog.all;
  draftQ = signal<string | null>(null);
  draftStreet = signal<string | null>(null);

  active = computed(() => Object.values(this.value()).some((v) => v !== null && v !== undefined && v !== ''));

  set(key: keyof Filters, raw: string) {
    const v = raw === '' ? null : key === 'category' ? Number(raw) : raw;
    this.changed.emit({ ...this.value(), [key]: v as Status | number | string | null });
  }

  // busca de bairro ignora acentos e maiúsculas no servidor; aqui só limpa espaços
  setHood(raw: string) {
    const v = raw.trim().replace(/\s+/g, ' ') || null;
    if (v === (this.value().neighborhood ?? null)) return;
    this.changed.emit({ ...this.value(), neighborhood: v });
  }

  setScope(raw: string) {
    const scope = (raw || null) as Filters['scope'];
    // cidade toda não tem bairro: o filtro de bairro some junto
    this.changed.emit({ ...this.value(), scope, ...(scope === 'cidade' ? { neighborhood: null } : {}) });
  }

  applySearch() {
    const q = (this.draftQ() ?? this.value().q ?? '').trim();
    const street = (this.draftStreet() ?? this.value().street ?? '').trim();
    this.changed.emit({ ...this.value(), q: q || null, ...(this.showStreet() ? { street: street || null } : {}) });
  }

  applyStreet() {
    const v = (this.draftStreet() ?? this.value().street ?? '').trim();
    if (v === (this.value().street ?? '')) return;
    this.changed.emit({ ...this.value(), street: v || null });
  }

  clear() {
    this.draftQ.set(null);
    this.draftStreet.set(null);
    this.changed.emit({});
  }
}
