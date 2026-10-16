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
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <div class="auth">
    <div class="caixa">
      <h1>{{ profile() === 'funcionario' ? 'Entrar na área da equipe' : 'Entrar' }}</h1>
      <p class="sub">{{ profile() === 'funcionario' ? 'Entre com a conta de funcionário que a administração liberou para você.' : 'Use o e-mail e a senha da sua conta UrbanTalk.' }}</p>
      @if (expired) {
        <div class="aviso aviso-info" role="status"><ut-icon name="info" />Sua sessão terminou. Entre de novo para continuar.</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset class="perfil">
          <legend class="rotulo">Como você quer entrar?</legend>
          <div class="segmentado">
            <label [class.marcado]="profile() === 'cliente'">
              <input type="radio" name="perfil" value="cliente" [checked]="profile() === 'cliente'" (change)="setProfile('cliente')" />
              <ut-icon name="user" [size]="18" />Cliente
            </label>
            <label [class.marcado]="profile() === 'funcionario'">
              <input type="radio" name="perfil" value="funcionario" [checked]="profile() === 'funcionario'" (change)="setProfile('funcionario')" />
              <ut-icon name="shield" [size]="18" />Funcionário
            </label>
          </div>
          @if (profile() === 'funcionario') {
            <p class="dica-perfil">O acesso de funcionário é liberado pela administração do UrbanTalk. Não existe cadastro aberto para a equipe.</p>
          }
        </fieldset>
        @if (error()) {
          <div class="aviso aviso-erro" role="alert">
            <ut-icon name="alert" />
            <div class="erro-corpo">
              <span>{{ error() }}</span>
              @if (suggest(); as other) {
                <button type="button" class="btn btn-secundario btn-sm" (click)="setProfile(other); submit()">Entrar como {{ other === 'funcionario' ? 'Funcionário' : 'Cliente' }}</button>
              }
            </div>
          </div>
        }
        <div class="campo">
          <label for="email">E-mail</label>
          <input id="email" class="entrada" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="invalid('email')" aria-describedby="email-erro" />
          @if (invalid('email')) {
            <span class="erro" id="email-erro">Informe um e-mail válido.</span>
          }
        </div>
        <div class="campo">
          <label for="senha">Senha</label>
          <div class="senha">
            <input id="senha" class="entrada" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" [attr.aria-invalid]="invalid('password')" aria-describedby="senha-erro" />
            <button type="button" class="btn btn-texto btn-sm ver" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Ocultar' : 'Mostrar' }}</button>
          </div>
          @if (invalid('password')) {
            <span class="erro" id="senha-erro">Informe sua senha.</span>
          }
        </div>
        <button type="submit" class="btn btn-primario" [disabled]="busy()">{{ busy() ? 'Entrando…' : profile() === 'funcionario' ? 'Entrar na área da equipe' : 'Entrar' }}</button>
      </form>
      @if (profile() === 'cliente') {
        <p class="troca">Ainda não tem conta? <a routerLink="/cadastro" [queryParams]="{ volta: back }">Criar conta de cliente</a></p>
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
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <div class="auth">
    <div class="caixa">
      <h1>Criar conta</h1>
      <p class="sub">Leva menos de um minuto. Com ela você registra reclamações, confirma as dos vizinhos, conversa na Comunidade e acompanha o andamento.</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error()) {
          <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ error() }}</div>
        }
        <div class="campo">
          <label for="nome">Nome</label>
          <input id="nome" class="entrada" formControlName="name" autocomplete="name" [attr.aria-invalid]="!!msg('name')" aria-describedby="nome-erro" />
          @if (msg('name'); as m) {
            <span class="erro" id="nome-erro">{{ m }}</span>
          }
        </div>
        <div class="campo">
          <label for="email">E-mail</label>
          <input id="email" class="entrada" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="!!msg('email')" aria-describedby="email-erro" />
          @if (msg('email'); as m) {
            <span class="erro" id="email-erro">{{ m }}</span>
          }
        </div>
        <div class="campo">
          <label for="senha">Senha</label>
          <div class="senha">
            <input id="senha" class="entrada" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" [attr.aria-invalid]="!!msg('password')" aria-describedby="senha-dica senha-erro" />
            <button type="button" class="btn btn-texto btn-sm ver" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Ocultar' : 'Mostrar' }}</button>
          </div>
          <span class="dica" id="senha-dica">Pelo menos 8 caracteres, com letras e números.</span>
          @if (msg('password'); as m) {
            <span class="erro" id="senha-erro">{{ m }}</span>
          }
        </div>
        <p class="dica privacidade">Seu e-mail nunca aparece para outras pessoas. Nas reclamações públicas não mostramos seu nome; na Comunidade aparece só o primeiro nome e a inicial do sobrenome.</p>
        <button type="submit" class="btn btn-primario" [disabled]="busy()">{{ busy() ? 'Criando conta…' : 'Criar conta de cliente' }}</button>
      </form>
      <p class="troca">Já tem conta? <a routerLink="/entrar" [queryParams]="{ volta: back }">Entrar</a></p>
      <p class="troca equipe">Faz parte da equipe? O acesso de funcionário é liberado pela administração.</p>
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
