import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { toParams } from './api.service';
import { AppNotification } from './models';
import { SessionStore } from './session.store';

// contador de não lidas compartilhado pela barra lateral e pela central
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private http = inject(HttpClient);
  private session = inject(SessionStore);
  private readonly api = `${environment.apiUrl}/notifications`;
  readonly unread = signal(0);

  constructor() {
    effect(() => {
      if (this.session.user()) this.refreshCount();
      else this.unread.set(0);
    });
  }

  refreshCount() {
    if (!this.session.user() || document.visibilityState !== 'visible') return;
    this.http.get<{ unread: number }>(`${this.api}/unread-count`).subscribe({ next: (r) => this.unread.set(r.unread), error: () => undefined });
  }

  list(filter: 'todas' | 'nao-lidas', before: number | null = null) {
    return this.http.get<{ items: AppNotification[]; unread: number; nextBefore: number | null }>(this.api, { params: toParams({ filter, before }) });
  }

  markRead(id: number) {
    return this.http.post<{ unread: number }>(`${this.api}/${id}/read`, {});
  }

  markAll() {
    return this.http.post<{ unread: number }>(`${this.api}/read-all`, {});
  }
}
