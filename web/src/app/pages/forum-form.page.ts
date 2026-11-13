import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { ForumDetail, ForumTheme } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';
import { ErrorStateComponent } from '../shared/states';
import { splitTags } from './forum.page';

// criar fórum (qualquer conta) ou editar as configurações básicas (quem criou ou a administração)
@Component({
  selector: 'ut-forum-form',
  imports: [RouterLink, IconComponent, NeighborhoodInputComponent, ErrorStateComponent, TranslatePipe],
  template: `
    <nav class="trilha" [aria-label]="'auto.m8fb521bd83' | translate">
      <a routerLink="/comunidade/foruns">{{ 'auto.m17f0d26d2c' | translate }}</a><span aria-hidden="true" class="sep"> › </span>
      @if (editing()) { <a [routerLink]="['/comunidade/f', slug()]">{{ original()?.name ?? '…' }}</a><span aria-hidden="true" class="sep"> › </span><span>{{ 'auto.m2b5f23437f' | translate }}</span> } @else { <span>{{ 'auto.ma97e989a61' | translate }}</span> }
    </nav>

    @if (loadError(); as e) {
      <ut-erro [message]="e" [retryable]="false" />
    } @else if (editing() && !original()) {
      <p class="carregando">{{ 'auto.mbca482b745' | translate }}</p>
    } @else {
      <div class="grade">
        <form class="painel form" (submit)="$event.preventDefault(); save()" novalidate>
          <h2>{{ editing() ? ('auto.m85c7c1fdc1' | translate) : ('auto.mc82faa3ab4' | translate) }}</h2>
          <div class="campo">
            <label for="ff-nome">{{ 'auto.m13030dd962' | translate }}</label>
            <input id="ff-nome" class="entrada" maxlength="60" [value]="name()" (input)="name.set($any($event.target).value)" [disabled]="editing() && !canRename()" [attr.aria-invalid]="!!fields()['name']" aria-describedby="ff-nome-d" />
            <span class="dica" id="ff-nome-d">{{ editing() && !canRename() ? ('auto.m09720d305a' | translate) : ('auto.m2e01632654' | translate) }}</span>
            @if (fields()['name']) { <span class="erro">{{ fields()['name'] }}</span> }
          </div>
          <div class="campo">
            <label for="ff-desc">{{ 'auto.m55593ee5d8' | translate }}</label>
            <textarea id="ff-desc" class="entrada" rows="3" maxlength="300" [value]="description()" (input)="description.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['description']" aria-describedby="ff-desc-d"></textarea>
            <span class="dica tabular" id="ff-desc-d">Para que serve o fórum e quem deveria participar. {{ description().trim().length }}/300</span>
            @if (fields()['description']) { <span class="erro">{{ fields()['description'] }}</span> }
          </div>
          <div class="duas">
            <div class="campo">
              <label for="ff-tema">{{ 'auto.m6ae1bcaff6' | translate }}</label>
              <select id="ff-tema" class="entrada" (change)="theme.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['theme']">
                <option value="" [selected]="!theme()">{{ 'auto.m4bdddd2bf6' | translate }}</option>
                @for (t of themes(); track t.id) { <option [value]="t.id" [selected]="theme() === t.id">{{ t.name }}</option> }
              </select>
              @if (fields()['theme']) { <span class="erro">{{ fields()['theme'] }}</span> }
            </div>
            <div class="campo">
              <label for="ff-bairro">{{ 'auto.m49f7179a65' | translate }} <span class="muted">{{ 'auto.m813486d257' | translate }}</span></label>
              <ut-bairro inputId="ff-bairro" [placeholder]="'auto.md485e00c4d' | translate" [value]="neighborhood()" (valueChange)="neighborhood.set($event)" [invalid]="!!fields()['neighborhoodName']" />
              @if (fields()['neighborhoodName']) { <span class="erro">{{ fields()['neighborhoodName'] }}</span> }
            </div>
          </div>
          <div class="campo">
            <label for="ff-tags">{{ 'auto.m848eed0fbd' | translate }} <span class="muted">{{ 'auto.m813486d257' | translate }}</span></label>
            <input id="ff-tags" class="entrada" maxlength="140" [placeholder]="'auto.m7457667d3d' | translate" [value]="tags()" (input)="tags.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['tags']" />
            <span class="dica">{{ 'auto.m70e9ca271c' | translate }}</span>
            @if (fields()['tags']) { <span class="erro">{{ fields()['tags'] }}</span> }
          </div>
          <div class="campo">
            <label for="ff-regras">{{ 'auto.mc3aec15974' | translate }} <span class="muted">{{ 'auto.m813486d257' | translate }}</span></label>
            <textarea id="ff-regras" class="entrada" rows="4" maxlength="1500" [value]="rules()" (input)="rules.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['rules']" [placeholder]="'auto.m0d9ba3e1bb' | translate"></textarea>
            <span class="dica">{{ 'auto.md35dd54247' | translate }}</span>
            @if (fields()['rules']) { <span class="erro">{{ fields()['rules'] }}</span> }
          </div>
          @if (formError()) { <p class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ formError() }}</p> }
          <div class="acoes">
            <a class="btn btn-secundario" [routerLink]="editing() ? ['/comunidade/f', slug()] : ['/comunidade/foruns']">{{ 'auto.mc111e0ab9d' | translate }}</a>
            <button type="submit" class="btn btn-primario" [disabled]="saving()">{{ saving() ? ('auto.m87ef46e99f' | translate) : editing() ? ('auto.m3bbd538880' | translate) : ('auto.ma97e989a61' | translate) }}</button>
          </div>
        </form>
        <aside class="painel ajuda">
          <h2>{{ 'auto.me2ff387f53' | translate }}</h2>
          <ul>
            <li>{{ 'auto.m4183e79711' | translate }}</li>
            <li>{{ 'auto.m6f7645a659' | translate }}</li>
            <li>{{ 'auto.mb61582ff63' | translate }} <a routerLink="/registrar">{{ 'auto.m144a514c70' | translate }}</a>.</li>
            <li>{{ 'auto.mf60f3bfdd5' | translate }}</li>
          </ul>
        </aside>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .trilha { font-size: var(--t-sm); color: var(--texto-2); margin-bottom: var(--s-4); }
    .sep { white-space: pre; }
    .grade { display: grid; grid-template-columns: minmax(0, 680px) minmax(0, 300px); gap: var(--s-6); align-items: start; }
    .form { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
    .form h2, .ajuda h2 { font-size: var(--t-lg); }
    .duas { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .acoes { display: flex; justify-content: flex-end; gap: var(--s-2); flex-wrap: wrap; }
    .ajuda { padding: var(--s-4) var(--s-5); }
    .ajuda ul { margin: var(--s-3) 0 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 8px; font-size: var(--t-sm); color: var(--texto-2); }
    @media (max-width: 1000px) { .grade { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .duas { grid-template-columns: 1fr; } .form { padding: var(--s-4); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumFormPage implements OnInit {
  private api = inject(ParticipationApi);
  private router = inject(Router);
  private toast = inject(ToastService);
  private session = inject(SessionStore);
  // presente só na edição (/comunidade/f/:slug/editar)
  slug = input<string>();

  editing = signal(false);
  original = signal<ForumDetail | null>(null);
  canRename = signal(false);
  themes = signal<ForumTheme[]>([]);
  name = signal('');
  description = signal('');
  theme = signal('');
  neighborhood = signal('');
  tags = signal('');
  rules = signal('');
  saving = signal(false);
  fields = signal<Record<string, string>>({});
  formError = signal<string | null>(null);
  loadError = signal<string | null>(null);

  ngOnInit() {
    this.api.forums({ pageSize: 1 }).subscribe({ next: (r) => this.themes.set(r.themes), error: () => undefined });
    const slug = this.slug();
    if (!slug) return;
    this.editing.set(true);
    this.api.forum(slug).subscribe({
      next: (f) => {
        if (!f.canEdit) {
          this.loadError.set('Só quem criou o fórum ou a administração pode editá-lo.');
          return;
        }
        this.original.set(f);
        this.canRename.set(this.session.user()?.role === 'admin');
        this.name.set(f.name);
        this.description.set(f.description);
        this.theme.set(f.theme.id);
        this.neighborhood.set(f.neighborhoodName ?? '');
        this.tags.set(f.tags.join(', '));
        this.rules.set(f.rules);
      },
      error: (e) => this.loadError.set(toApiError(e).message),
    });
  }

  save() {
    const local: Record<string, string> = {};
    if (!this.editing() && this.name().trim().length < 5) local['name'] = 'O nome precisa de pelo menos 5 caracteres.';
    if (this.description().trim().length < 10) local['description'] = 'Descreva a finalidade em pelo menos 10 caracteres.';
    if (!this.theme()) local['theme'] = 'Escolha um tema.';
    const tags = splitTags(this.tags());
    if (tags.length > 5) local['tags'] = 'Use no máximo 5 tags.';
    if (Object.keys(local).length) {
      this.fields.set(local);
      return;
    }
    const data = { description: this.description().trim(), theme: this.theme(), tags, neighborhoodName: this.neighborhood().trim(), rules: this.rules().trim() };
    this.saving.set(true);
    this.fields.set({});
    this.formError.set(null);
    const orig = this.original();
    const call = orig
      ? this.api.updateForum(orig.slug, this.canRename() && this.name().trim() !== orig.name ? { ...data, name: this.name().trim() } : data)
      : this.api.createForum({ ...data, name: this.name().trim() });
    call.subscribe({
      next: (f) => {
        this.saving.set(false);
        this.toast.show(orig ? 'Fórum atualizado.' : f.status === 'pendente' ? 'Fórum criado. Ele aparece para todos depois da aprovação da equipe.' : 'Fórum criado. Abra a primeira discussão!');
        this.router.navigate(['/comunidade/f', f.slug]);
      },
      error: (e) => {
        this.saving.set(false);
        const err = toApiError(e);
        this.fields.set(err.fields);
        if (!Object.keys(err.fields).length || err.status === 409 || err.status === 429) this.formError.set(err.message);
      },
    });
  }
}
