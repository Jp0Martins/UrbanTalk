import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toApiError } from '../core/api-error';
import { SessionStore } from '../core/session.store';
import { placeKey } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';

@Component({
  selector: 'ut-perfil',
  imports: [PageHeaderComponent, AvatarComponent, IconComponent, NeighborhoodInputComponent],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Meu perfil" description="Seus dados de acesso e como você aparece para outras pessoas." />
      @let u = session.user()!;
      <div class="grade">
        <section class="painel cartao-perfil" aria-labelledby="quem-t">
          <ut-avatar [name]="u.name" [initials]="initials()" [staff]="session.isStaff()" [size]="72" />
          <div>
            <h2 id="quem-t">{{ u.name }}</h2>
            <p class="muted">{{ u.email }}</p>
            <p class="papel"><ut-icon [name]="session.isStaff() ? 'shield' : 'user'" [size]="16" />{{ roleText() }}</p>
          </div>
          <div class="como-aparece">
            <p class="rotulo">Como você aparece</p>
            <ul>
              <li>Na Comunidade: <strong>{{ publicName() }}</strong>{{ session.isStaff() ? ', com o selo Equipe UrbanTalk' : '' }}</li>
              @if (session.isCitizen()) {
                <li>Nas reclamações públicas: <strong>sem nome</strong>. Só a equipe sabe quem registrou.</li>
              }
              <li>Seu e-mail <strong>nunca</strong> aparece para outras pessoas.</li>
            </ul>
          </div>
        </section>

        <div class="formularios">
          <form id="bairros" class="painel form" (submit)="$event.preventDefault(); saveInterests()" aria-labelledby="bairros-t">
            <h2 id="bairros-t">Bairros de interesse</h2>
            <p class="muted">Até 5 bairros, digitados do seu jeito. Os fóruns que citam esses bairros aparecem em destaque na aba Fóruns da Comunidade. <strong>Ninguém mais vê essa escolha</strong>, e ela não precisa ser onde você mora.</p>
            @if (interestsLoaded()) {
              @if (chosen().length) {
                <ul class="escolhidos">
                  @for (n of chosen(); track n) {
                    <li><span>{{ n }}</span><button type="button" class="btn btn-texto btn-sm" (click)="removeHood(n)">Remover<span class="sr-only"> {{ n }}</span></button></li>
                  }
                </ul>
              }
              <div class="campo">
                <label for="add-bairro">Adicionar bairro</label>
                <div class="add-linha">
                  <ut-bairro inputId="add-bairro" [placeholder]="chosen().length >= 5 ? 'Limite de 5 bairros' : 'Digite o nome do bairro'" [value]="draftHood()" (valueChange)="draftHood.set($event)" />
                  <button type="button" class="btn btn-secundario" [disabled]="chosen().length >= 5 || !draftHood().trim()" (click)="addHood()">Adicionar</button>
                </div>
              </div>
              <button type="submit" class="btn btn-primario" [disabled]="savingInterests() || !interestsDirty()">{{ savingInterests() ? 'Salvando…' : 'Salvar bairros' }}</button>
            } @else {
              <p class="carregando">Carregando…</p>
            }
          </form>

          <form class="painel form" (submit)="$event.preventDefault(); saveName()" novalidate>
            <h2>Nome</h2>
            <div class="campo">
              <label for="nome">Nome completo</label>
              <input id="nome" class="entrada" autocomplete="name" maxlength="120" [value]="name()" (input)="name.set($any($event.target).value)" [attr.aria-invalid]="!!nameError()" />
              @if (nameError()) {
                <span class="erro">{{ nameError() }}</span>
              }
            </div>
            <button type="submit" class="btn btn-primario" [disabled]="savingName() || name().trim() === u.name">{{ savingName() ? 'Salvando…' : 'Salvar nome' }}</button>
          </form>

          <form class="painel form" (submit)="$event.preventDefault(); savePassword()" novalidate>
            <h2>Senha</h2>
            <div class="campo">
              <label for="atual">Senha atual</label>
              <input id="atual" class="entrada" type="password" autocomplete="current-password" [value]="current()" (input)="current.set($any($event.target).value)" [attr.aria-invalid]="!!pwFields()['current']" />
              @if (pwFields()['current']) {
                <span class="erro">{{ pwFields()['current'] }}</span>
              }
            </div>
            <div class="campo">
              <label for="nova">Nova senha</label>
              <input id="nova" class="entrada" type="password" autocomplete="new-password" [value]="next()" (input)="next.set($any($event.target).value)" [attr.aria-invalid]="!!pwFields()['next']" aria-describedby="nova-dica" />
              <span class="dica" id="nova-dica">Pelo menos 8 caracteres, com letras e números.</span>
              @if (pwFields()['next']) {
                <span class="erro">{{ pwFields()['next'] }}</span>
              }
            </div>
            @if (pwError()) {
              <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ pwError() }}</div>
            }
            <button type="submit" class="btn btn-secundario" [disabled]="savingPw() || !current() || !next()">{{ savingPw() ? 'Salvando…' : 'Trocar senha' }}</button>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: `
    .grade { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); gap: var(--s-5); align-items: start; max-width: 1040px; }
    .cartao-perfil { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); }
    .cartao-perfil h2 { font-size: var(--t-xl); }
    .papel { display: inline-flex; align-items: center; gap: 6px; margin-top: var(--s-2); font-size: var(--t-sm); font-weight: 600; background: var(--faixa-clara); color: #6b4a00; padding: 4px 10px; border-radius: var(--r-1); }
    .como-aparece { border-top: 1px solid var(--linha); padding-top: var(--s-4); }
    .como-aparece ul { margin: 6px 0 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 6px; color: var(--texto-2); font-size: var(--t-sm); }
    .como-aparece strong { color: var(--texto); }
    .formularios { display: flex; flex-direction: column; gap: var(--s-5); }
    .form { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-4); max-width: 520px; }
    .form h2 { font-size: var(--t-lg); }
    .form .btn { align-self: flex-start; }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .add-linha { display: flex; gap: var(--s-2); }
    .add-linha ut-bairro { flex: 1; min-width: 0; }
    .escolhidos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .escolhidos li { display: inline-flex; align-items: center; gap: 2px; background: var(--placa-clara); border-radius: var(--r-1); padding-left: 10px; font-weight: 500; }
    @media (max-width: 860px) { .grade { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  session = inject(SessionStore);
  private toast = inject(ToastService);
  private part = inject(ParticipationApi);

  chosen = signal<string[]>([]);
  private saved = signal<string[]>([]);
  draftHood = signal('');
  interestsLoaded = signal(false);
  savingInterests = signal(false);
  interestsDirty = computed(() => this.chosen().join('|') !== this.saved().join('|'));

  constructor() {
    this.part.interests().subscribe({
      next: (r) => {
        this.chosen.set(r.neighborhoods);
        this.saved.set(r.neighborhoods);
        this.interestsLoaded.set(true);
      },
      error: () => this.interestsLoaded.set(true),
    });
  }

  // grafias diferentes do mesmo bairro contam como um só
  addHood() {
    const name = this.draftHood().trim().replace(/\s+/g, ' ');
    const key = placeKey(name);
    if (key.length < 2 || this.chosen().length >= 5) return;
    if (!this.chosen().some((n) => placeKey(n) === key)) this.chosen.set([...this.chosen(), name.slice(0, 80)]);
    this.draftHood.set('');
  }

  removeHood(name: string) {
    this.chosen.set(this.chosen().filter((x) => x !== name));
  }

  saveInterests() {
    this.savingInterests.set(true);
    this.part.setInterests(this.chosen()).subscribe({
      next: (r) => {
        this.savingInterests.set(false);
        this.saved.set(r.neighborhoods);
        this.chosen.set(r.neighborhoods);
        this.toast.show('Bairros de interesse salvos.');
      },
      error: (e) => {
        this.savingInterests.set(false);
        this.toast.show(toApiError(e).message, 'erro');
      },
    });
  }

  name = signal(this.session.user()?.name ?? '');
  nameError = signal<string | null>(null);
  savingName = signal(false);
  current = signal('');
  next = signal('');
  pwError = signal<string | null>(null);
  pwFields = signal<Record<string, string>>({});
  savingPw = signal(false);

  initials = computed(() => {
    const p = (this.session.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  });
  publicName = computed(() => {
    const p = (this.session.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : (p[0] ?? '');
  });
  roleText = computed(() => {
    const r = this.session.user()?.role;
    return r === 'admin' ? 'Administrador(a): gerencia status e equipe' : r === 'staff' ? 'Funcionário(a) do UrbanTalk' : 'Conta de cliente';
  });

  async saveName() {
    const v = this.name().trim();
    if (v.length < 2) {
      this.nameError.set('O nome precisa ter pelo menos 2 letras.');
      return;
    }
    this.nameError.set(null);
    this.savingName.set(true);
    try {
      await this.session.updateName(v);
      this.toast.show('Nome atualizado.');
    } catch (e) {
      const err = toApiError(e);
      this.nameError.set(err.fields['name'] ?? err.message);
    } finally {
      this.savingName.set(false);
    }
  }

  async savePassword() {
    this.pwError.set(null);
    this.pwFields.set({});
    if (this.next().length < 8 || !/[A-Za-z]/.test(this.next()) || !/\d/.test(this.next())) {
      this.pwFields.set({ next: 'Use pelo menos 8 caracteres, com letras e números.' });
      return;
    }
    this.savingPw.set(true);
    try {
      await this.session.changePassword(this.current(), this.next());
      this.current.set('');
      this.next.set('');
      this.toast.show('Senha trocada. Use a nova senha no próximo acesso.');
    } catch (e) {
      const err = toApiError(e);
      this.pwError.set(err.message);
      this.pwFields.set(err.fields);
    } finally {
      this.savingPw.set(false);
    }
  }
}
