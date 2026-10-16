import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { TeamMember } from '../core/models';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { ErrorStateComponent } from '../shared/states';

@Component({
  selector: 'ut-admin-equipe',
  imports: [PageHeaderComponent, AvatarComponent, IconComponent, ErrorStateComponent],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Equipe" description="Quem tem acesso de funcionário. Não existe cadastro aberto para a equipe: a pessoa cria uma conta de cliente e um administrador libera o acesso aqui." />

      <div class="grade">
        <section class="painel lista" aria-labelledby="membros-t">
          <h2 id="membros-t">Pessoas com acesso</h2>
          @if (error(); as e) {
            <ut-erro [message]="e" (retry)="load()" />
          } @else if (!members()) {
            <p class="carregando">Carregando equipe…</p>
          } @else {
            <ul>
              @for (m of members()!; track m.id) {
                <li>
                  <ut-avatar [name]="m.name" [initials]="initials(m.name)" [staff]="true" [size]="38" />
                  <div class="quem">
                    <span class="nome">{{ m.name }}{{ m.id === session.user()?.id ? ' (você)' : '' }}</span>
                    <span class="email">{{ m.email }}</span>
                  </div>
                  @if (m.id === session.user()?.id) {
                    <span class="selo-texto">{{ m.role === 'admin' ? 'Administrador' : 'Funcionário' }}</span>
                  } @else {
                    <div class="campo papel">
                      <label class="sr-only" [for]="'papel-' + m.id">Acesso de {{ m.name }}</label>
                      <select class="entrada" [id]="'papel-' + m.id" (change)="changeRole(m, $any($event.target).value)">
                        <option value="staff" [selected]="m.role === 'staff'">Funcionário</option>
                        <option value="admin" [selected]="m.role === 'admin'">Administrador</option>
                        <option value="user">Remover acesso (vira cliente)</option>
                      </select>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <form class="painel form" (submit)="$event.preventDefault(); grant()" novalidate aria-labelledby="dar-t">
          <h2 id="dar-t">Liberar acesso</h2>
          <p class="muted pequeno">A pessoa precisa ter criado uma conta no site antes. Depois de liberar, ela entra escolhendo "Funcionário" na tela de login.</p>
          <div class="campo">
            <label for="email">E-mail da conta</label>
            <input id="email" class="entrada" type="email" autocomplete="off" [value]="email()" (input)="email.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['email']" />
            @if (fields()['email']) { <span class="erro">{{ fields()['email'] }}</span> }
          </div>
          <fieldset class="tipo">
            <legend class="rotulo">Tipo de acesso</legend>
            <label><input type="radio" name="tipo" [checked]="role() === 'staff'" (change)="role.set('staff')" /> <span><strong>Funcionário</strong><br /><span class="muted">Vê todas as reclamações, muda status, anota e gera relatórios.</span></span></label>
            <label><input type="radio" name="tipo" [checked]="role() === 'admin'" (change)="role.set('admin')" /> <span><strong>Administrador</strong><br /><span class="muted">Tudo do funcionário, mais configurar status e gerenciar a equipe.</span></span></label>
          </fieldset>
          @if (formError()) {
            <div class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ formError() }}</div>
          }
          <button type="submit" class="btn btn-primario" [disabled]="busy() || !email().trim()">Liberar acesso</button>
          <p class="dica">Toda liberação ou remoção fica registrada com seu nome. Para criar uma conta de funcionário direto no servidor, use <code>npm run staff:create</code> (veja o README).</p>
        </form>
      </div>
    </div>
  `,
  styles: `
    .grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 400px); gap: var(--s-5); align-items: start; }
    .lista, .form { padding: var(--s-5); }
    h2 { font-size: var(--t-lg); margin-bottom: var(--s-3); }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; gap: var(--s-3); align-items: center; padding: var(--s-3) 0; border-top: 1px solid var(--linha); flex-wrap: wrap; }
    .quem { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .nome { font-weight: 600; }
    .email { font-size: var(--t-xs); color: var(--texto-2); overflow-wrap: anywhere; }
    .papel { width: 230px; }
    .form { display: flex; flex-direction: column; gap: var(--s-4); }
    .pequeno { font-size: var(--t-sm); margin-top: -6px; }
    .tipo { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
    .tipo legend { padding: 0; margin-bottom: 4px; }
    .tipo label { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--linha); border-radius: var(--r-1); font-size: var(--t-sm); cursor: pointer; }
    .tipo label:has(input:checked) { border-color: var(--placa); background: var(--placa-clara); }
    .tipo input { margin-top: 3px; accent-color: var(--placa); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    code { font-size: 0.95em; background: rgb(0 0 0 / 0.06); padding: 1px 5px; border-radius: 3px; }
    @media (max-width: 960px) { .grade { grid-template-columns: 1fr; } .papel { width: 100%; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTeamPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  session = inject(SessionStore);

  members = signal<TeamMember[] | null>(null);
  error = signal<string | null>(null);
  email = signal('');
  role = signal<'staff' | 'admin'>('staff');
  busy = signal(false);
  formError = signal<string | null>(null);
  fields = signal<Record<string, string>>({});

  initials(name: string) {
    const p = name.trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.error.set(null);
    this.api.team().subscribe({
      next: (r) => this.members.set(r.members),
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  grant() {
    this.busy.set(true);
    this.formError.set(null);
    this.fields.set({});
    this.api.grantAccess(this.email().trim(), this.role()).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show('Acesso liberado. A pessoa já pode entrar como Funcionário.');
        this.email.set('');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const err = toApiError(e);
        this.formError.set(err.message);
        this.fields.set(err.fields);
      },
    });
  }

  changeRole(m: TeamMember, role: 'user' | 'staff' | 'admin') {
    if (role === 'user' && !window.confirm(`Remover o acesso de funcionário de ${m.name}? A conta continua existindo como cliente.`)) {
      this.load();
      return;
    }
    this.api.setRole(m.id, role).subscribe({
      next: () => {
        this.toast.show(role === 'user' ? `${m.name} não tem mais acesso de funcionário.` : 'Acesso atualizado.');
        this.load();
      },
      error: (e) => {
        this.toast.show(toApiError(e).message, 'erro');
        this.load();
      },
    });
  }
}
