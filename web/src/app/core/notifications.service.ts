import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { toParams } from './api.service';
import { AppNotification } from './models';
import { SessionStore } from './session.store';
import { ToastService } from './toast.service';

// o que o servidor manda pelo canal em tempo real
interface LiveSnapshot {
  unread: number;
  latest: { id: number; kind: string; title: string; link: string; count: number; createdAt: string; read: boolean } | null;
}

// contador de não lidas compartilhado pela barra lateral e pela central, atualizado em tempo real
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private http = inject(HttpClient);
  private session = inject(SessionStore);
  private toast = inject(ToastService);
  private router = inject(Router);
  private zone = inject(NgZone);
  private readonly api = `${environment.apiUrl}/notifications`;
  readonly unread = signal(0);
  // muda a cada novidade recebida; a central de notificações recarrega a lista quando muda
  readonly version = signal(0);

  private source: EventSource | null = null;
  private lastKey: string | null = null;

  constructor() {
    effect(() => {
      const user = this.session.user();
      if (user) {
        this.refreshCount();
        this.connect();
      } else {
        this.disconnect();
        this.unread.set(0);
      }
    });
  }

  refreshCount() {
    if (!this.session.user() || document.visibilityState !== 'visible') return;
    this.http.get<{ unread: number }>(`${this.api}/unread-count`).subscribe({ next: (r) => this.unread.set(r.unread), error: () => undefined });
  }

  // Server-Sent Events: o navegador reconecta sozinho se a conexão cair; o contador por minuto continua como reserva
  private connect() {
    if (this.source || typeof EventSource === 'undefined') return;
    this.lastKey = null;
    const es = new EventSource(`${this.api}/stream`, { withCredentials: true });
    es.addEventListener('notificacoes', (ev) => {
      let snap: LiveSnapshot;
      try {
        snap = JSON.parse((ev as MessageEvent<string>).data) as LiveSnapshot;
      } catch {
        return;
      }
      this.zone.run(() => this.apply(snap));
    });
    // sessão encerrada no servidor: para de tentar até o próximo login
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) this.source = null;
    };
    this.source = es;
  }

  private disconnect() {
    this.source?.close();
    this.source = null;
    this.lastKey = null;
  }

  private apply(snap: LiveSnapshot) {
    this.unread.set(snap.unread);
    const l = snap.latest;
    const key = l ? `${l.id}:${l.createdAt}:${l.count}` : '';
    const first = this.lastKey === null;
    const changed = key !== this.lastKey;
    this.lastKey = key;
    this.version.update((v) => v + 1);
    // alerta só para novidade de verdade (não no primeiro envio, nem fora da central se já foi lida)
    if (!first && changed && l && !l.read && !this.router.url.startsWith('/notificacoes')) {
      this.toast.show(`Nova notificação: ${l.title}`, 'info', 6000);
    }
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
