import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DatePipe } from '../core/format';
import { TimelineItem } from '../core/models';
import { StatusCatalog } from '../core/status-catalog';
import { IconComponent } from './icon.component';

const ICONS: Record<string, string> = {
  registro: 'status-registrada',
  atualizacao_publica: 'megaphone',
  nota_interna: 'lock',
  atribuicao: 'user',
  prioridade: 'sliders',
  pedido_info: 'info',
  pedido_cancelado: 'x',
  resposta_cidadao: 'send',
  evidencia: 'camera',
  resolucao: 'status-resolvida',
  avaliacao: 'hand',
  reaberta: 'refresh',
  duplicata: 'list',
  endereco: 'pin',
};

// histórico completo da reclamação; o servidor já decidiu o que cada pessoa pode ver
@Component({
  selector: 'ut-linha-tempo',
  imports: [IconComponent, DatePipe],
  template: `
    <ol class="linha-tempo">
      @for (t of items(); track t.key) {
        <li class="evento" [class]="'k-' + t.kind" [attr.data-color]="color(t)">
          <span class="marca"><ut-icon [name]="icon(t)" [size]="18" /></span>
          <div class="conteudo">
            <p class="titulo-ev">
              {{ t.title }}
              @if (t.visibility === 'interna') { <span class="selo-texto interna"><ut-icon name="lock" [size]="12" />Interna</span> }
              @if (t.visibility === 'autor') { <span class="selo-texto">{{ staffView() ? 'Visível para quem registrou' : 'Só você e a equipe veem' }}</span> }
            </p>
            <p class="quando">{{ t.at | data: true }} · {{ who(t) }}</p>
            @if (t.body) { <p class="msg">{{ t.body }}</p> }
            @if (photos(t).length) {
              <ul class="fotos">
                @for (p of photos(t); track p) {
                  <li><a [href]="p" target="_blank" rel="noopener"><img [src]="p" alt="Foto anexada ao acompanhamento" loading="lazy" /></a></li>
                }
              </ul>
            }
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    .linha-tempo { list-style: none; margin: 0 0 var(--s-3); padding: 0; }
    .evento { display: flex; gap: var(--s-3); position: relative; padding-bottom: var(--s-4); }
    .evento:not(:last-child)::before { content: ''; position: absolute; left: 15px; top: 34px; bottom: 4px; border-left: 2px dotted var(--linha-forte); }
    .marca { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--cor-fundo, var(--superficie-2)); color: var(--cor, var(--texto-2)); }
    .k-atualizacao_publica .marca, .k-nota_interna .marca { background: var(--faixa-clara); color: #7a5300; }
    .conteudo { min-width: 0; flex: 1; }
    .titulo-ev { font-weight: 500; padding-top: 4px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .quando { font-size: var(--t-xs); color: var(--texto-2); }
    .msg { margin-top: 6px; background: var(--superficie); border: 1px solid var(--linha); padding: 8px 12px; border-radius: var(--r-1); max-width: 60ch; white-space: pre-line; overflow-wrap: anywhere; }
    .k-atualizacao_publica .msg { background: var(--faixa-clara); border-color: #f1dca6; }
    .k-nota_interna .msg { background: #fffbea; border-style: dashed; }
    .fotos { list-style: none; margin: 8px 0 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
    .fotos img { width: 96px; height: 72px; object-fit: cover; border-radius: var(--r-1); border: 1px solid var(--linha); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OccurrenceTimelineComponent {
  private catalog = inject(StatusCatalog);
  items = input.required<TimelineItem[]>();
  staffView = input(false);

  icon(t: TimelineItem) {
    if (t.kind === 'status') return this.catalog.icon(String(t.data?.['to'] ?? ''));
    if (t.kind === 'avaliacao' && t.data?.['verdict'] === 'persiste') return 'alert';
    return ICONS[t.kind] ?? 'info';
  }

  color(t: TimelineItem) {
    if (t.kind === 'status' || t.kind === 'registro') return this.catalog.get(String(t.data?.['to'] ?? '')).color;
    if (t.kind === 'resolucao') return 'verde';
    if (t.kind === 'reaberta' || (t.kind === 'avaliacao' && t.data?.['verdict'] === 'persiste')) return 'vermelho';
    if (t.kind === 'avaliacao') return 'verde';
    return null;
  }

  who(t: TimelineItem) {
    if (t.actor === 'cidadao') return 'por quem registrou';
    if (t.actor === 'comunidade') return 'por um morador';
    if (t.actor === 'equipe') return t.actorName ? `por ${t.actorName}` : 'pela equipe UrbanTalk';
    return 'registro do sistema';
  }

  photos(t: TimelineItem): string[] {
    const p = t.data?.['photos'];
    if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string');
    const one = t.data?.['photoUrl'];
    return typeof one === 'string' ? [one] : [];
  }
}
