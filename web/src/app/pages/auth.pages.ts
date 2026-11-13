import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';

// só aceita caminhos internos como destino depois do login
function safeReturn(url: string | null) {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

const authStyles = `
  :host { display: block; padding: var(--s-7) var(--s-4); }
  .auth { max-width: 440px; margin: 0 auto; }
  h1 { font-size: var(--t-2xl); }
  .sub { color: var(--texto-2); margin: 6px 0 var(--s-5); }
  form { display: flex; flex-direction: column; gap: var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5); }
  .senha { position: relative; }
  .senha .entrada { padding-right: 84px; }
  .ver { position: absolute; right: 4px; top: 4px; min-height: 36px; }
  .btn-primario { width: 100%; margin-top: var(--s-2); }
  .troca { margin-top: var(--s-4); text-align: center; color: var(--texto-2); }
`;

@Component({
  selector: 'ut-login',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, TranslatePipe],
  template: `
    <div class="auth">
    <div class="caixa">
      <h1>{{ (profile() === 'funcionario' ? 'auth.staffLogin' : 'nav.login') | translate }}</h1>
      <p class="sub">{{ (profile() === 'funcionario' ? 'auth.staffHint' : 'auth.loginHint') | translate }}</p>
      @if (expired) {
        <div class="aviso aviso-info" role="status"><ut-icon name="info" />{{ 'auto.m4eb621087b' | translate }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset class="perfil">
          <legend class="rotulo">{{ 'auto.m32a6418155' | translate }}</legend>
          <div class="segmentado">
            <label [class.marcado]="profile() === 'cliente'">
              <input type="radio" name="perfil" value="cliente" [checked]="profile() === 'cliente'" (change)="setProfile('cliente')" />
              <ut-icon name="user" [size]="18" />{{ 'auto.mc5c7d5ee3d' | translate }}
            </label>
            <label [class.marcado]="profile() === 'funcionario'">
              <input type="radio" name="perfil" value="funcionario" [checked]="profile() === 'funcionario'" (change)="setProfile('funcionario')" />
              <ut-icon name="shield" [size]="18" />{{ 'auto.m43270d7695' | translate }}
            </label>
          </div>
          @if (profile() === 'funcionario') {
            <p class="dica-perfil">{{ 'auto.m959809455e' | translate }}</p>
          }
        </fieldset>
        @if (error()) {
          <div class="aviso aviso-erro" role="alert">
            <ut-icon name="alert" />
            <div class="erro-corpo">
              <span>{{ error() }}</span>
              @if (suggest(); as other) {
                <button type="button" class="btn btn-secundario btn-sm" (click)="setProfile(other); submit()">{{ 'auth.loginAs' | translate }} {{ (other === 'funcionario' ? 'auth.staff' : 'auth.citizen') | translate }}</button>
              }
            </div>
          </div>
        }
        <div class="campo">
          <label for="email">{{ 'auto.m0d01e2e866' | translate }}</label>
          <input id="email" class="entrada" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="invalid('email')" aria-describedby="email-erro" />
          @if (invalid('email')) {
            <span class="erro" id="email-erro">{{ 'auto.ma3560c0ea8' | translate }}</span>
          }
        </div>
        <div class="campo">
          <label for="senha">{{ 'auto.mdeba017251' | translate }}</label>
          <div class="senha">
            <input id="senha" class="entrada" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" [attr.aria-invalid]="invalid('password')" aria-describedby="senha-erro" />
            <button type="button" class="btn btn-texto btn-sm ver" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ (show() ? 'auth.hide' : 'auth.show') | translate }}</button>
          </div>
          @if (invalid('password')) {
            <span class="erro" id="senha-erro">{{ 'auto.m0eab8e165b' | translate }}</span>
          }
        </div>
        <button type="submit" class="btn btn-primario" [disabled]="busy()">{{ (busy() ? 'auth.loggingIn' : profile() === 'funcionario' ? 'auth.staffLogin' : 'nav.login') | translate }}</button>
      </form>
      @if (profile() === 'cliente') {
        <p class="troca">{{ 'auto.m3553721539' | translate }} <a routerLink="/cadastro" [queryParams]="{ volta: back }">{{ 'auto.mf644041182' | translate }}</a></p>
      }
    </div>
    </div>
  `,
  styles:
    authStyles +
    `
    .perfil { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .perfil legend { padding: 0; margin-bottom: 8px; }
    .perfil .segmentado { display: grid; grid-template-columns: 1fr 1fr; }
    .perfil label {
      display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; border-radius: var(--r-1);
      font-weight: 600; color: var(--texto-2); cursor: pointer; position: relative;
    }
    .perfil label:hover { color: var(--texto); }
    .perfil label.marcado { background: var(--superficie); color: var(--texto); box-shadow: inset 0 0 0 1px var(--linha-forte); }
    .perfil label.marcado ut-icon { color: var(--placa); }
    .perfil input { position: absolute; opacity: 0; pointer-events: none; }
    .perfil label:has(input:focus-visible) { outline: 2px solid var(--asfalto); outline-offset: 2px; box-shadow: 0 0 0 5px var(--faixa); }
    .dica-perfil { font-size: var(--t-xs); color: var(--texto-2); background: var(--superficie-2); border-radius: var(--r-1); padding: 8px 10px; }
    .erro-corpo { display: flex; flex-direction: column; gap: var(--s-2); align-items: flex-start; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private fb = inject(NonNullableFormBuilder);
  private session = inject(SessionStore);
  private router = inject(Router);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  back = safeReturn(this.route.snapshot.queryParamMap.get('volta'));
  expired = this.route.snapshot.queryParamMap.get('motivo') === 'sessao';
  // o seletor só indica o tipo de acesso; quem decide o papel é a API
  profile = signal<'cliente' | 'funcionario'>(this.route.snapshot.queryParamMap.get('perfil') === 'funcionario' ? 'funcionario' : 'cliente');
  suggest = signal<'cliente' | 'funcionario' | null>(null);
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  busy = signal(false);
  error = signal<string | null>(null);
  show = signal(false);
  private submitted = signal(false);

  setProfile(p: 'cliente' | 'funcionario') {
    this.profile.set(p);
    this.error.set(null);
    this.suggest.set(null);
  }

  invalid(name: 'email' | 'password') {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async submit() {
    this.submitted.set(true);
    this.error.set(null);
    this.suggest.set(null);
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      const user = await this.session.login(email, password, this.profile());
      this.toast.show(`Olá, ${user.name.split(' ')[0]}! Bom te ver por aqui.`);
      this.router.navigateByUrl(this.back ?? this.session.homePath());
    } catch (e) {
      const err = toApiError(e);
      this.error.set(err.message);
      // senha certa, perfil trocado: oferece entrar pelo outro tipo de acesso
      if (err.code === 'staff_account') this.suggest.set('funcionario');
      else if (err.status === 403 && this.profile() === 'funcionario') this.suggest.set('cliente');
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'ut-cadastro',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, TranslatePipe],
  template: `
    <div class="auth">
    <div class="caixa">
      <h1>{{ 'auto.mb03ff67468' | translate }}</h1>
      <p class="sub">{{ 'auto.m3b8ca99dec' | translate }}</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error()) {
          <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ error() }}</div>
        }
        <div class="campo">
          <label for="nome">{{ 'auto.m13030dd962' | translate }}</label>
          <input id="nome" class="entrada" formControlName="name" autocomplete="name" [attr.aria-invalid]="!!msg('name')" aria-describedby="nome-erro" />
          @if (msg('name'); as m) {
            <span class="erro" id="nome-erro">{{ m }}</span>
          }
        </div>
        <div class="campo">
          <label for="email">{{ 'auto.m0d01e2e866' | translate }}</label>
          <input id="email" class="entrada" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="!!msg('email')" aria-describedby="email-erro" />
          @if (msg('email'); as m) {
            <span class="erro" id="email-erro">{{ m }}</span>
          }
        </div>
        <div class="campo">
          <label for="senha">{{ 'auto.mdeba017251' | translate }}</label>
          <div class="senha">
            <input id="senha" class="entrada" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" [attr.aria-invalid]="!!msg('password')" aria-describedby="senha-dica senha-erro" />
            <button type="button" class="btn btn-texto btn-sm ver" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ (show() ? 'auth.hide' : 'auth.show') | translate }}</button>
          </div>
          <span class="dica" id="senha-dica">{{ 'auto.m1f8b1e760a' | translate }}</span>
          @if (msg('password'); as m) {
            <span class="erro" id="senha-erro">{{ m }}</span>
          }
        </div>
        <p class="dica privacidade">{{ 'auto.m4d723dae74' | translate }}</p>
        <p class="dica privacidade"><a routerLink="/privacidade">{{ 'privacy.readMore' | translate }}</a></p>
        <button type="submit" class="btn btn-primario" [disabled]="busy()">{{ (busy() ? 'auth.creating' : 'auth.createCitizen') | translate }}</button>
      </form>
      <p class="troca">{{ 'auto.me2c24f7bb6' | translate }} <a routerLink="/entrar" [queryParams]="{ volta: back }">{{ 'auto.m7573ba8515' | translate }}</a></p>
      <p class="troca equipe">{{ 'auto.m208a92114f' | translate }}</p>
    </div>
    </div>
  `,
  styles: authStyles + `.privacidade { font-size: var(--t-xs); color: var(--texto-2); } .equipe { font-size: var(--t-xs); margin-top: var(--s-2); }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private fb = inject(NonNullableFormBuilder);
  private session = inject(SessionStore);
  private router = inject(Router);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  back = safeReturn(this.route.snapshot.queryParamMap.get('volta'));
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
  });
  busy = signal(false);
  error = signal<string | null>(null);
  show = signal(false);
  serverFields = signal<Record<string, string>>({});
  private submitted = signal(false);
  private tick = signal(0);

  constructor() {
    this.form.valueChanges.subscribe(() => this.tick.update((t) => t + 1));
  }

  private messages = computed(() => {
    this.tick();
    this.submitted();
    const f = this.form.controls;
    const show = (k: keyof typeof f) => f[k].touched || this.submitted();
    const out: Record<string, string | null> = { name: null, email: null, password: null };
    if (show('name') && f.name.invalid) out['name'] = 'Informe seu nome, com pelo menos 2 letras.';
    if (show('email') && f.email.invalid) out['email'] = 'Informe um e-mail válido, como nome@exemplo.com.';
    if (show('password') && f.password.invalid) {
      out['password'] = f.password.hasError('minlength') || f.password.hasError('required')
        ? 'A senha precisa ter pelo menos 8 caracteres.'
        : 'Use letras e números na senha.';
    }
    return out;
  });

  msg(k: 'name' | 'email' | 'password') {
    return this.messages()[k] ?? this.serverFields()[k] ?? null;
  }

  async submit() {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.error.set(null);
    this.serverFields.set({});
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const { name, email, password } = this.form.getRawValue();
      await this.session.register(name, email, password);
      this.toast.show(`Conta criada. Seja bem-vindo(a), ${name.trim().split(' ')[0]}!`);
      this.router.navigateByUrl(this.back ?? '/painel');
    } catch (e) {
      const err = toApiError(e);
      this.error.set(err.message);
      this.serverFields.set(err.fields);
    } finally {
      this.busy.set(false);
    }
  }
}
