import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { User, isStaffRole } from './models';

// guarda quem está logado; a sessão em si fica num cookie httpOnly controlado pela API
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly user = signal<User | null>(null);
  readonly loaded = signal(false);
  // funcionário (staff ou admin) e administrador (gerencia status e equipe)
  readonly isStaff = computed(() => isStaffRole(this.user()?.role));
  readonly isManager = computed(() => this.user()?.role === 'admin');
  readonly isCitizen = computed(() => this.user()?.role === 'user');
  // página inicial de cada perfil depois do login
  readonly homePath = computed(() => (this.isStaff() ? '/admin' : '/painel'));
  readonly firstName = computed(() => this.user()?.name.split(' ')[0] ?? '');

  async load() {
    try {
      const res = await firstValueFrom(this.http.get<{ user: User | null }>(`${this.api}/auth/me`));
      this.user.set(res.user);
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async login(email: string, password: string, profile: 'cliente' | 'funcionario' = 'cliente') {
    const res = await firstValueFrom(this.http.post<{ user: User }>(`${this.api}/auth/login`, { email, password, profile }));
    this.user.set(res.user);
    return res.user;
  }

  async register(name: string, email: string, password: string) {
    const res = await firstValueFrom(this.http.post<{ user: User }>(`${this.api}/auth/register`, { name, email, password }));
    this.user.set(res.user);
    return res.user;
  }

  async updateName(name: string) {
    const res = await firstValueFrom(this.http.patch<{ user: User }>(`${this.api}/auth/me`, { name }));
    this.user.set(res.user);
    return res.user;
  }

  async changePassword(current: string, next: string) {
    await firstValueFrom(this.http.post(`${this.api}/auth/password`, { current, next }));
  }

  async logout() {
    try {
      await firstValueFrom(this.http.post(`${this.api}/auth/logout`, {}));
    } finally {
      this.user.set(null);
    }
  }

  clear() {
    this.user.set(null);
  }
}
