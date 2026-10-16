import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RelativePipe, plural } from '../core/format';
import { Forum } from '../core/models';
import { IconComponent } from './icon.component';

// cartão de fórum usado nas listas da Comunidade
@Component({
  selector: 'ut-forum-card',
  imports: [RouterLink, IconComponent, RelativePipe],
  template: `
    @let f = forum();
    <a class="card" [routerLink]="['/comunidade/f', f.slug]">
      <span class="ico" [class.oficial]="f.kind === 'oficial'"><ut-icon [name]="f.icon" [size]="22" /></span>
      <span class="corpo">
        <span class="topo">
          <span class="nome">{{ f.name }}</span>
          @if (f.kind === 'oficial') { <span class="selo-texto equipe">Oficial</span> }
          @if (f.status === 'pendente') { <span class="selo-texto interna">Aguardando aprovação</span> }
          @if (f.following) { <span class="selo-texto publica">Seguindo</span> }
        </span>
        <span class="desc">{{ f.description }}</span>
        <span class="meta">
          <span>{{ f.theme.name }}</span>
          @if (f.neighborhoodName) { <span class="lugar"><ut-icon name="pin" [size]="12" />{{ f.neighborhoodName }}</span> }
          @for (t of f.tags.slice(0, 3); track t) { <span class="tag">#{{ t }}</span> }
        </span>
        <span class="nums tabular">
          {{ topics(f) }} · {{ people(f) }}
          @if (f.lastActivity) { · ativo {{ f.lastActivity | relativo }} }
          @if (f.creator && !compact()) { · criado por {{ f.creator.isMe ? 'você' : f.creator.name }} }
        </span>
      </span>
    </a>
  `,
  styles: `
    :host { display: block; }
    .card { display: flex; gap: var(--s-3); padding: var(--s-4); background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); text-decoration: none; color: inherit; height: 100%; }
    .card:hover { border-color: var(--placa); color: inherit; }
    .ico { width: 44px; height: 44px; flex: none; border-radius: var(--r-1); display: grid; place-items: center; background: var(--placa-clara); color: var(--placa); }
    .ico.oficial { background: var(--placa); color: #fff; }
    .corpo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .topo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .nome { font-family: var(--fonte-titulo); font-weight: 600; font-size: 1.125rem; line-height: 1.2; }
    .desc { color: var(--texto-2); font-size: var(--t-sm); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .meta { display: flex; gap: 8px; flex-wrap: wrap; font-size: var(--t-xs); color: var(--texto-2); align-items: center; }
    .lugar { display: inline-flex; gap: 2px; align-items: center; }
    .tag { color: var(--placa); font-weight: 600; }
    .nums { font-size: var(--t-xs); color: var(--texto-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumCardComponent {
  forum = input.required<Forum>();
  compact = input(false);
  topics = (f: Forum) => plural(f.topics, 'discussão', 'discussões');
  people = (f: Forum) => plural(f.participants, 'participante', 'participantes');
}
