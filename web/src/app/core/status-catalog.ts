import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { StatusDef } from './models';

// lista de status carregada da API e compartilhada por toda a interface
@Injectable({ providedIn: 'root' })
export class StatusCatalog {
  private http = inject(HttpClient);
  readonly all = signal<StatusDef[]>([]);
  readonly active = computed(() => this.all().filter((s) => s.active));
  private bySlug = computed(() => new Map(this.all().map((s) => [s.slug, s])));

  async load() {
    try {
      const res = await firstValueFrom(this.http.get<{ statuses: StatusDef[] }>(`${environment.apiUrl}/statuses`));
      this.all.set(res.statuses);
    } catch {
      // sem a lista, os rótulos caem no próprio slug; a página continua funcionando
    }
  }

  set(list: StatusDef[]) {
    this.all.set(list);
  }

  get(slug: string | null | undefined): StatusDef {
    const found = slug ? this.bySlug().get(slug) : undefined;
    if (found) return found;
    const name = (slug ?? '').replace(/-/g, ' ');
    return {
      id: 0,
      slug: slug ?? '',
      name: name.charAt(0).toUpperCase() + name.slice(1),
      description: '',
      color: 'cinza',
      isClosed: false,
      isInitial: false,
      active: false,
      sortOrder: 0,
    };
  }

  name(slug: string | null | undefined) {
    return this.get(slug).name;
  }

  // forma do ícone muda conforme o tipo, para não depender só da cor
  icon(slug: string | null | undefined) {
    const s = this.get(slug);
    if (s.isInitial) return 'status-registrada';
    if (s.isClosed) return s.slug === 'resolvida' ? 'status-resolvida' : 'status-encerrada';
    return 'status-encaminhada';
  }
}
