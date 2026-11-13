import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { COLOR_NAMES, STATUS_COLORS, StatusAdmin, StatusColor } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { ToastService } from '../core/toast.service';
import { StatusBadgeComponent } from '../shared/badges';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ErrorStateComponent } from '../shared/states';

// sugestões de configuração, nunca criadas automaticamente
const SUGGESTIONS: { name: string; description: string; color: StatusColor; isClosed: boolean }[] = [
  { name: 'Em análise', description: 'A equipe está avaliando a reclamação.', color: 'violeta', isClosed: false },
  { name: 'Em triagem', description: 'A reclamação está sendo conferida e classificada.', color: 'petroleo', isClosed: false },
  { name: 'Aguardando informações', description: 'Precisamos de mais detalhes de quem registrou.', color: 'laranja', isClosed: false },
  { name: 'Em andamento', description: 'O órgão responsável informou que está cuidando do problema.', color: 'azul', isClosed: false },
  { name: 'Aguardando execução', description: 'O serviço foi programado e aguarda a equipe de campo.', color: 'petroleo', isClosed: false },
  { name: 'Não procedente', description: 'Depois de analisada, a reclamação não se confirmou.', color: 'cinza', isClosed: true },
  { name: 'Cancelada', description: 'A reclamação foi cancelada (duplicada ou registrada por engano).', color: 'vermelho', isClosed: true },
];

interface Draft {
  name: string;
  description: string;
  color: StatusColor;
  isClosed: boolean;
  countsAsResolved?: boolean;
}

const emptyDraft = (): Draft => ({ name: '', description: '', color: 'violeta', isClosed: false, countsAsResolved: false });

@Component({
  selector: 'ut-admin-status',
  imports: [PageHeaderComponent, IconComponent, StatusBadgeComponent, ErrorStateComponent, TranslatePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina [title]="'auto.mef75413197' | translate" [description]="'auto.mb3f5fc5781' | translate" />

      @if (!canManage() && loaded()) {
        <div class="aviso aviso-info aviso-topo" role="note"><ut-icon name="lock" />{{ 'auto.m344c740302' | translate }}</div>
      }

      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (!loaded()) {
        <p class="carregando">{{ 'auto.m5ef2c2d7a0' | translate }}</p>
      } @else {
        <div class="grade">
          <section class="painel lista" aria-labelledby="lista-t">
            <h2 id="lista-t">{{ 'auto.m704b0a49c8' | translate }}</h2>
            <ol>
              @for (s of items(); track s.id; let i = $index; let last = $last) {
                <li [class.inativo]="!s.active">
                  @if (editing() === s.id) {
                    <div class="edicao">
                      <div class="campo">
                        <label [for]="'nome-' + s.id">{{ 'auto.m13030dd962' | translate }}</label>
                        <input class="entrada" [id]="'nome-' + s.id" maxlength="40" [value]="edit().name" (input)="patchEdit({ name: $any($event.target).value })" />
                      </div>
                      <div class="campo">
                        <label [for]="'desc-' + s.id">{{ 'auto.mb7aad0cd0a' | translate }}</label>
                        <textarea class="entrada" [id]="'desc-' + s.id" rows="2" maxlength="240" [value]="edit().description" (input)="patchEdit({ description: $any($event.target).value })"></textarea>
                      </div>
                      <fieldset class="cores">
                        <legend class="rotulo">{{ 'auto.m62037d4390' | translate }}</legend>
                        @for (c of colors; track c) {
                          <label class="cor" [attr.data-color]="c" [class.marcada]="edit().color === c" [title]="colorNames[c]">
                            <input type="radio" [name]="'cor-' + s.id" [checked]="edit().color === c" (change)="patchEdit({ color: c })" />
                            <span class="sr-only">{{ colorNames[c] }}</span>
                          </label>
                        }
                      </fieldset>
                      <label class="check">
                        <input type="checkbox" [checked]="edit().isClosed" [disabled]="s.isInitial" (change)="patchEdit({ isClosed: $any($event.target).checked })" />
                        {{ 'auto.m864e031e9f' | translate }}
                      </label>
                      @if (edit().isClosed) {
                        <label class="check">
                          <input type="checkbox" [checked]="!!edit().countsAsResolved" (change)="patchEdit({ countsAsResolved: $any($event.target).checked })" />
                          {{ 'auto.mdf392751e5' | translate }}
                        </label>
                      }
                      @if (rowError()) {
                        <p class="erro" role="alert">{{ rowError() }}</p>
                      }
                      <div class="linha-botoes">
                        <button type="button" class="btn btn-texto btn-sm" (click)="editing.set(null)">{{ 'auto.mc111e0ab9d' | translate }}</button>
                        <button type="button" class="btn btn-primario btn-sm" (click)="saveEdit(s)">{{ 'auto.m93bf2d32ec' | translate }}</button>
                      </div>
                    </div>
                  } @else {
                    <div class="linha">
                      @if (canManage()) {
                        <span class="mover">
                          <button type="button" class="btn btn-texto btn-sm" [disabled]="i === 0 || busy()" (click)="move(i, -1)"><ut-icon name="arrow-up" [size]="16" /><span class="sr-only">Subir {{ s.name }}</span></button>
                          <button type="button" class="btn btn-texto btn-sm" [disabled]="last || busy()" (click)="move(i, 1)"><ut-icon name="arrow-down" [size]="16" /><span class="sr-only">Descer {{ s.name }}</span></button>
                        </span>
                      }
                      <div class="info">
                        <div class="titulo">
                          <ut-status [status]="s.slug" />
                          @if (s.isInitial) { <span class="selo-texto">{{ 'auto.m38f09011a4' | translate }}</span> }
                          @if (s.isClosed) { <span class="selo-texto">{{ 'auto.mc78fd804dc' | translate }}</span> }
                          @if (s.countsAsResolved) { <span class="selo-texto">{{ 'auto.mf3429d5b4b' | translate }}</span> }
                          @if (!s.active) { <span class="selo-texto">{{ 'auto.m8809a6227c' | translate }}</span> }
                        </div>
                        <p class="desc">{{ s.description || 'Sem descrição.' }}</p>
                        <p class="uso">{{ usageText(s) }}</p>
                      </div>
                      @if (canManage()) {
                        <div class="acoes">
                          <button type="button" class="btn btn-texto btn-sm" (click)="startEdit(s)"><ut-icon name="edit" [size]="16" />{{ 'auto.m2b5f23437f' | translate }}</button>
                          @if (!s.isInitial) {
                            <button type="button" class="btn btn-texto btn-sm" (click)="toggleActive(s)">{{ s.active ? ('auto.m79db9fc450' | translate) : ('auto.m4384962e9a' | translate) }}</button>
                          }
                          @if (s.active && !s.isInitial && !s.isClosed) {
                            <button type="button" class="btn btn-texto btn-sm" (click)="makeInitial(s)">{{ 'auto.m79160fc71a' | translate }}</button>
                          }
                          @if (!s.isInitial && s.usage.occurrences + s.usage.history === 0) {
                            <button type="button" class="btn btn-texto btn-sm perigo" (click)="remove(s)">{{ 'auto.m8e7c1314fe' | translate }}</button>
                          }
                        </div>
                      }
                    </div>
                  }
                </li>
              }
            </ol>
          </section>

          @if (canManage()) {
            <form class="painel novo" (submit)="$event.preventDefault(); create()" novalidate aria-labelledby="novo-t">
              <h2 id="novo-t">{{ 'auto.m87fc0c3b88' | translate }}</h2>
              @if (suggestions().length) {
                <div class="sugestoes">
                  <p class="rotulo">{{ 'auto.m1e07cf18bb' | translate }} <span class="muted">{{ 'auto.m4b584d4af0' | translate }}</span></p>
                  <div class="chips">
                    @for (sg of suggestions(); track sg.name) {
                      <button type="button" class="chip" [attr.data-color]="sg.color" (click)="draft.set({ name: sg.name, description: sg.description, color: sg.color, isClosed: sg.isClosed })"><i aria-hidden="true"></i>{{ sg.name }}</button>
                    }
                  </div>
                </div>
              }
              <div class="campo">
                <label for="novo-nome">{{ 'auto.m13030dd962' | translate }}</label>
                <input id="novo-nome" class="entrada" maxlength="40" [value]="draft().name" (input)="patchDraft({ name: $any($event.target).value })" [attr.aria-invalid]="!!createFields()['name']" />
                @if (createFields()['name']) { <span class="erro">{{ createFields()['name'] }}</span> }
              </div>
              <div class="campo">
                <label for="novo-desc">{{ 'auto.mb7aad0cd0a' | translate }}</label>
                <textarea id="novo-desc" class="entrada" rows="2" maxlength="240" [value]="draft().description" (input)="patchDraft({ description: $any($event.target).value })" [placeholder]="'auto.m5b7c81e07d' | translate"></textarea>
              </div>
              <fieldset class="cores">
                <legend class="rotulo">{{ 'auto.m62037d4390' | translate }}</legend>
                @for (c of colors; track c) {
                  <label class="cor" [attr.data-color]="c" [class.marcada]="draft().color === c" [title]="colorNames[c]">
                    <input type="radio" name="cor-nova" [checked]="draft().color === c" (change)="patchDraft({ color: c })" />
                    <span class="sr-only">{{ colorNames[c] }}</span>
                  </label>
                }
              </fieldset>
              <label class="check">
                <input type="checkbox" [checked]="draft().isClosed" (change)="patchDraft({ isClosed: $any($event.target).checked })" />
                {{ 'auto.m1f309c6845' | translate }}
              </label>
              @if (draft().isClosed) {
                <label class="check">
                  <input type="checkbox" [checked]="!!draft().countsAsResolved" (change)="patchDraft({ countsAsResolved: $any($event.target).checked })" />
                  {{ 'auto.m363bcac7c2' | translate }}
                </label>
              }
              @if (createError()) {
                <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ createError() }}</div>
              }
              <button type="submit" class="btn btn-primario" [disabled]="busy() || draft().name.trim().length < 3"><ut-icon name="plus" />{{ 'auto.m6575cfb695' | translate }}</button>
            </form>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .aviso-topo { margin-bottom: var(--s-4); }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 380px); gap: var(--s-5); align-items: start; }
    .lista { padding: var(--s-5); }
    .lista h2, .novo h2 { font-size: var(--t-lg); margin-bottom: var(--s-3); }
    ol { list-style: none; margin: 0; padding: 0; }
    li { border-top: 1px solid var(--linha); padding: var(--s-3) 0; }
    li.inativo .info { opacity: 0.7; }
    .linha { display: flex; gap: var(--s-3); align-items: flex-start; }
    .mover { display: flex; flex-direction: column; }
    .mover .btn { min-height: 30px; padding: 0 6px; }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .titulo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .desc { font-size: var(--t-sm); color: var(--texto-2); }
    .uso { font-size: var(--t-xs); color: var(--texto-3); }
    .acoes { display: flex; flex-wrap: wrap; gap: 2px; justify-content: flex-end; max-width: 260px; }
    .perigo { color: var(--perigo); }
    .edicao, .novo { display: flex; flex-direction: column; gap: var(--s-3); }
    .novo { padding: var(--s-5); position: sticky; top: var(--s-5); }
    .cores { border: 0; margin: 0; padding: 0; display: flex; gap: 8px; flex-wrap: wrap; }
    .cores legend { padding: 0; margin-bottom: 6px; }
    .cor { width: 32px; height: 32px; border-radius: 50%; background: var(--cor); cursor: pointer; position: relative; border: 3px solid var(--superficie); box-shadow: 0 0 0 1px var(--linha-forte); }
    .cor.marcada { box-shadow: 0 0 0 2px var(--asfalto); }
    .cor input { position: absolute; opacity: 0; pointer-events: none; }
    .cor:has(input:focus-visible) { outline: 2px solid var(--asfalto); outline-offset: 3px; }
    .check { display: flex; gap: 8px; align-items: flex-start; font-size: var(--t-sm); }
    .check input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--placa); }
    .sugestoes { display: flex; flex-direction: column; gap: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--linha-forte); background: var(--superficie); border-radius: var(--r-1); padding: 4px 10px; font-size: var(--t-xs); font-weight: 600; cursor: pointer; }
    .chip:hover { background: var(--cor-fundo); }
    .chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--cor); }
    .linha-botoes { display: flex; justify-content: flex-end; gap: var(--s-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    @media (max-width: 1000px) {
      .grade { grid-template-columns: 1fr; }
      .novo { position: static; order: -1; }
    }
    @media (max-width: 560px) {
      .linha { flex-wrap: wrap; }
      .acoes { max-width: none; justify-content: flex-start; width: 100%; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStatusesPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private catalog = inject(StatusCatalog);

  colors = STATUS_COLORS;
  colorNames = COLOR_NAMES;
  items = signal<StatusAdmin[]>([]);
  canManage = signal(false);
  loaded = signal(false);
  error = signal<string | null>(null);
  busy = signal(false);
  editing = signal<number | null>(null);
  edit = signal<Draft>(emptyDraft());
  rowError = signal<string | null>(null);
  draft = signal<Draft>(emptyDraft());
  createError = signal<string | null>(null);
  createFields = signal<Record<string, string>>({});

  suggestions = computed(() => {
    const names = new Set(this.items().map((s) => s.name.toLowerCase()));
    return SUGGESTIONS.filter((s) => !names.has(s.name.toLowerCase()));
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.error.set(null);
    this.api.adminStatuses().subscribe({
      next: (r) => {
        this.items.set(r.statuses);
        this.canManage.set(r.canManage);
        this.loaded.set(true);
        // mantém etiquetas e filtros do resto do site em dia
        this.catalog.set(r.statuses);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  usageText(s: StatusAdmin) {
    const n = s.usage.occurrences;
    const now = n === 0 ? 'Nenhuma reclamação neste status agora' : n === 1 ? '1 reclamação neste status agora' : `${n} reclamações neste status agora`;
    return s.usage.history > 0 ? `${now} · aparece ${s.usage.history}× no histórico` : now;
  }

  patchDraft(p: Partial<Draft>) {
    this.draft.update((d) => ({ ...d, ...p }));
    this.createFields.set({});
  }

  patchEdit(p: Partial<Draft>) {
    this.edit.update((d) => ({ ...d, ...p }));
  }

  startEdit(s: StatusAdmin) {
    this.rowError.set(null);
    this.edit.set({ name: s.name, description: s.description, color: s.color, isClosed: s.isClosed, countsAsResolved: !!s.countsAsResolved });
    this.editing.set(s.id);
  }

  private run(obs: Observable<unknown>, ok: string, onError?: (msg: string) => void) {
    this.busy.set(true);
    obs.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(ok);
        this.editing.set(null);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const err = toApiError(e);
        const msg = Object.values(err.fields)[0] ?? err.message;
        if (onError) onError(msg);
        else this.toast.show(msg, 'erro', 8000);
      },
    });
  }

  saveEdit(s: StatusAdmin) {
    const e = this.edit();
    this.run(
      this.api.updateStatus(s.id, { name: e.name.trim(), description: e.description.trim(), color: e.color, isClosed: e.isClosed, countsAsResolved: e.isClosed && !!e.countsAsResolved }),
      'Status atualizado.',
      (m) => this.rowError.set(m),
    );
  }

  toggleActive(s: StatusAdmin) {
    this.run(this.api.updateStatus(s.id, { active: !s.active }), s.active ? `"${s.name}" desativado. Ele continua no histórico.` : `"${s.name}" reativado.`);
  }

  makeInitial(s: StatusAdmin) {
    this.run(this.api.updateStatus(s.id, { isInitial: true }), `Novas reclamações vão começar como "${s.name}".`);
  }

  remove(s: StatusAdmin) {
    if (!window.confirm(`Excluir o status "${s.name}"? Ele nunca foi usado, então nada se perde.`)) return;
    this.run(this.api.deleteStatus(s.id), 'Status excluído.');
  }

  move(i: number, delta: number) {
    const list = [...this.items()];
    const [it] = list.splice(i, 1);
    list.splice(i + delta, 0, it);
    this.items.set(list);
    this.busy.set(true);
    this.api.reorderStatuses(list.map((s) => s.id)).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.show(toApiError(e).message, 'erro');
        this.load();
      },
    });
  }

  create() {
    const d = this.draft();
    this.createError.set(null);
    this.busy.set(true);
    this.api.createStatus({ name: d.name.trim(), description: d.description.trim(), color: d.color, isClosed: d.isClosed, countsAsResolved: d.isClosed && !!d.countsAsResolved }).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.draft.set(emptyDraft());
        this.toast.show(`Status "${s.name}" criado. Ele já pode ser usado nas reclamações.`);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const err = toApiError(e);
        this.createError.set(err.message);
        this.createFields.set(err.fields);
      },
    });
  }
}
