import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../core/api-error';
import { DatePipe, RelativePipe } from '../core/format';
import { AppNotification } from '../core/models';
import { NotificationsService } from '../core/notifications.service';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

// ícone por tipo de aviso
const ICON_BY_KIND: Record<string, string> = {
  'ocorrencia.atualizacao': 'history',
  'ocorrencia.confirmada': 'hand',
  'ocorrencia.pedido_info': 'info',
  'comentario.resposta': 'chat',
  'topico.respostas': 'chat',
  'proposta.comentarios': 'chat',
  'proposta.status': 'sparkle',
  'proposta.apoio': 'arrow-up',
  'equipe.nova': 'inbox',
  'equipe.atribuida': 'user',
  'equipe.resposta_cidadao': 'send',
  'equipe.persiste': 'alert',
  'equipe.paradas': 'clock',
  'equipe.denuncias': 'shield',
  'feed.curtida': 'heart',
  'feed.comentario': 'chat',
};

@Component({
  selector: 'ut-notificacoes',
  imports: [IconComponent, PageHeaderComponent, EmptyStateComponent, ErrorStateComponent, RelativePipe, DatePipe],
  template: `
    <div class="pagina estreita">
      <ut-cabecalho-pagina title="Notificações" description="Novidades sobre o que você registrou, confirmou, propôs ou acompanha. Avisos parecidos são agrupados para não lotar sua caixa.">
        <button type="button" class="btn btn-secundario" [disabled]="notes.unread() === 0" (click)="markAll()"><ut-icon name="check" [size]="18" />Marcar todas como lidas</button>
      </ut-cabecalho-pagina>
      <div class="segmentado" role="tablist" aria-label="Filtrar notificações">
        <button type="button" role="tab" [attr.aria-selected]="filter() === 'todas'" (click)="setFilter('todas')">Todas</button>
        <button type="button" role="tab" [attr.aria-selected]="filter() === 'nao-lidas'" (click)="setFilter('nao-lidas')">Não lidas <span class="tabular">({{ notes.unread() }})</span></button>
      </div>

      @if (loading()) {
        <p class="carregando">Carregando notificações…</p>
      } @else if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (items().length === 0) {
        <ut-vazio icon="inbox" [title]="filter() === 'nao-lidas' ? 'Nada novo por aqui' : 'Você ainda não tem notificações'" text="Quando houver novidade em algo que você registrou, confirmou ou acompanha, ela aparece aqui." />
      } @else {
        <ul class="lista">
          @for (n of items(); track n.id) {
            <li>
              <button type="button" class="item" [class.nova]="!n.read" (click)="open(n)">
                <span class="ico"><ut-icon [name]="icon(n.kind)" [size]="20" /></span>
                <span class="textos">
                  <span class="titulo">{{ n.title }}@if (n.count > 1) { <span class="vezes">({{ n.count }} novidades)</span> }</span>
                  @if (n.body) { <span class="corpo">{{ n.body }}</span> }
                  <time class="quando" [attr.datetime]="n.createdAt" [title]="n.createdAt | data: true">{{ n.createdAt | relativo }}</time>
                </span>
                @if (!n.read) { <span class="ponto" aria-label="Não lida"></span> }
              </button>
            </li>
          }
        </ul>
        @if (nextBefore()) {
          <button type="button" class="btn btn-secundario mais" (click)="load(true)">Carregar mais antigas</button>
        }
      }
    </div>
  `,
  styles: `
    .estreita { max-width: 860px; }
    .segmentado { margin-bottom: var(--s-4); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .item { width: 100%; display: flex; gap: var(--s-3); align-items: flex-start; text-align: left; padding: var(--s-3) var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); cursor: pointer; }
    .item:hover { border-color: var(--linha-forte); }
    .item.nova { border-left: 4px solid var(--faixa); background: #fffdf5; }
    .ico { width: 38px; height: 38px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--placa-clara); color: var(--placa); }
    .textos { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .titulo { font-weight: 600; }
    .nova .titulo { font-weight: 700; }
    .vezes { font-weight: 500; color: var(--texto-2); font-size: var(--t-sm); margin-left: 6px; }
    .corpo { color: var(--texto-2); font-size: var(--t-sm); overflow-wrap: anywhere; }
    .quando { color: var(--texto-3); font-size: var(--t-xs); }
    .ponto { width: 10px; height: 10px; border-radius: 50%; background: var(--placa); flex: none; margin-top: 6px; }
    .mais { margin-top: var(--s-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage implements OnInit {
  notes = inject(NotificationsService);
  private router = inject(Router);
  private toast = inject(ToastService);
  filter = signal<'todas' | 'nao-lidas'>('todas');
  items = signal<AppNotification[]>([]);
  nextBefore = signal<number | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  icon = (k: string) => ICON_BY_KIND[k] ?? 'info';

  constructor() {
    // novidade chegou pelo canal em tempo real: recarrega a primeira página sem piscar a tela
    let seen: number | null = null;
    effect(() => {
      const v = this.notes.version();
      if (seen !== null && v !== seen) untracked(() => this.refresh());
      seen = v;
    });
  }

  ngOnInit() {
    this.load();
  }

  private refresh() {
    if (this.loading()) return;
    this.notes.list(this.filter()).subscribe({
      next: (r) => {
        // mantém as páginas antigas já carregadas abaixo da primeira
        const fresh = new Set(r.items.map((n) => n.id));
        const older = this.items().filter((n) => !fresh.has(n.id) && r.items.length > 0 && n.id < r.items[r.items.length - 1].id);
        this.items.set([...r.items, ...older]);
        if (older.length === 0) this.nextBefore.set(r.nextBefore);
      },
      error: () => undefined,
    });
  }

  setFilter(f: 'todas' | 'nao-lidas') {
    this.filter.set(f);
    this.load();
  }

  load(more = false) {
    if (!more) this.loading.set(true);
    this.error.set(null);
    this.notes.list(this.filter(), more ? this.nextBefore() : null).subscribe({
      next: (r) => {
        this.items.set(more ? [...this.items(), ...r.items] : r.items);
        this.nextBefore.set(r.nextBefore);
        this.notes.unread.set(r.unread);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(toApiError(e).message);
        this.loading.set(false);
      },
    });
  }

  open(n: AppNotification) {
    const go = () => this.router.navigateByUrl(n.link);
    if (n.read) {
      go();
      return;
    }
    this.notes.markRead(n.id).subscribe({
      next: (r) => {
        this.notes.unread.set(r.unread);
        go();
      },
      error: () => go(),
    });
  }

  markAll() {
    this.notes.markAll().subscribe({
      next: () => {
        this.notes.unread.set(0);
        this.items.set(this.items().map((n) => ({ ...n, read: true })).filter((n) => this.filter() === 'todas' || !n.read));
        this.toast.show('Todas as notificações foram marcadas como lidas.', 'info');
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }
}
