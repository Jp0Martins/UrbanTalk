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
  imports: [RouterLink, IconComponent, NeighborhoodInputComponent, ErrorStateComponent],
  template: `
    <nav class="trilha" aria-label="Você está em">
      <a routerLink="/comunidade/foruns">Fóruns</a><span aria-hidden="true" class="sep"> › </span>
      @if (editing()) { <a [routerLink]="['/comunidade/f', slug()]">{{ original()?.name ?? '…' }}</a><span aria-hidden="true" class="sep"> › </span><span>Editar</span> } @else { <span>Criar fórum</span> }
    </nav>

    @if (loadError(); as e) {
      <ut-erro [message]="e" [retryable]="false" />
    } @else if (editing() && !original()) {
      <p class="carregando">Carregando…</p>
    } @else {
      <div class="grade">
        <form class="painel form" (submit)="$event.preventDefault(); save()" novalidate>
          <h2>{{ editing() ? 'Editar fórum' : 'Criar um fórum' }}</h2>
          <div class="campo">
            <label for="ff-nome">Nome</label>
            <input id="ff-nome" class="entrada" maxlength="60" [value]="name()" (input)="name.set($any($event.target).value)" [disabled]="editing() && !canRename()" [attr.aria-invalid]="!!fields()['name']" aria-describedby="ff-nome-d" />
            <span class="dica" id="ff-nome-d">{{ editing() && !canRename() ? 'O nome só pode ser trocado pela administração, para não confundir quem já participa.' : 'De 5 a 60 caracteres. Ex.: Ciclistas da Zona Norte.' }}</span>
            @if (fields()['name']) { <span class="erro">{{ fields()['name'] }}</span> }
          </div>
          <div class="campo">
            <label for="ff-desc">Finalidade</label>
            <textarea id="ff-desc" class="entrada" rows="3" maxlength="300" [value]="description()" (input)="description.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['description']" aria-describedby="ff-desc-d"></textarea>
            <span class="dica tabular" id="ff-desc-d">Para que serve o fórum e quem deveria participar. {{ description().trim().length }}/300</span>
            @if (fields()['description']) { <span class="erro">{{ fields()['description'] }}</span> }
          </div>
          <div class="duas">
            <div class="campo">
              <label for="ff-tema">Tema</label>
              <select id="ff-tema" class="entrada" (change)="theme.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['theme']">
                <option value="" [selected]="!theme()">Escolha…</option>
                @for (t of themes(); track t.id) { <option [value]="t.id" [selected]="theme() === t.id">{{ t.name }}</option> }
              </select>
              @if (fields()['theme']) { <span class="erro">{{ fields()['theme'] }}</span> }
            </div>
            <div class="campo">
              <label for="ff-bairro">Bairro <span class="muted">(opcional)</span></label>
              <ut-bairro inputId="ff-bairro" placeholder="Deixe em branco se não for de um bairro" [value]="neighborhood()" (valueChange)="neighborhood.set($event)" [invalid]="!!fields()['neighborhoodName']" />
              @if (fields()['neighborhoodName']) { <span class="erro">{{ fields()['neighborhoodName'] }}</span> }
            </div>
          </div>
          <div class="campo">
            <label for="ff-tags">Tags <span class="muted">(opcional)</span></label>
            <input id="ff-tags" class="entrada" maxlength="140" placeholder="Ex.: bicicleta, ciclovia" [value]="tags()" (input)="tags.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['tags']" />
            <span class="dica">Até 5, separadas por vírgula. Ajudam outras pessoas a encontrar o fórum.</span>
            @if (fields()['tags']) { <span class="erro">{{ fields()['tags'] }}</span> }
          </div>
          <div class="campo">
            <label for="ff-regras">Regras <span class="muted">(opcional)</span></label>
            <textarea id="ff-regras" class="entrada" rows="4" maxlength="1500" [value]="rules()" (input)="rules.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['rules']" placeholder="Ex.: Só assuntos de mobilidade. Sem propaganda."></textarea>
            <span class="dica">Somam-se aos combinados gerais da Comunidade.</span>
            @if (fields()['rules']) { <span class="erro">{{ fields()['rules'] }}</span> }
          </div>
          @if (formError()) { <p class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ formError() }}</p> }
          <div class="acoes">
            <a class="btn btn-secundario" [routerLink]="editing() ? ['/comunidade/f', slug()] : ['/comunidade/foruns']">Cancelar</a>
            <button type="submit" class="btn btn-primario" [disabled]="saving()">{{ saving() ? 'Salvando…' : editing() ? 'Salvar alterações' : 'Criar fórum' }}</button>
          </div>
        </form>
        <aside class="painel ajuda">
          <h2>Antes de criar</h2>
          <ul>
            <li>Procure se já existe um fórum parecido: é melhor juntar as pessoas num lugar só.</li>
            <li>Quem cria cuida da descrição, das tags e das regras. A equipe pode moderar e remover fóruns que fujam dos combinados.</li>
            <li>Fóruns não substituem reclamações: para a equipe acompanhar um problema, <a routerLink="/registrar">registre uma reclamação</a>.</li>
            <li>Cada pessoa pode criar até 3 fóruns por dia.</li>
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
