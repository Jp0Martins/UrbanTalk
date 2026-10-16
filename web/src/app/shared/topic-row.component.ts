import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RelativePipe, plural } from '../core/format';
import { Topic } from '../core/models';
import { IconComponent } from './icon.component';

// linha compacta de discussão, com o fórum de origem
@Component({
  selector: 'ut-topic-row',
  imports: [RouterLink, IconComponent, RelativePipe],
  template: `
    @let t = topic();
    <a class="linha" [routerLink]="['/comunidade/discussoes', t.id]">
      <span class="votos tabular" [title]="t.votes + ' votos de útil'"><ut-icon name="arrow-up" [size]="14" />{{ t.votes }}</span>
      <span class="txt">
        <span class="titulo">{{ t.title }}</span>
        <span class="meta">
          {{ t.forum.name }} · {{ replies(t) }} · {{ t.lastActivityAt | relativo }}
          @for (g of t.tags.slice(0, 3); track g) { <span class="tag">#{{ g }}</span> }
        </span>
      </span>
    </a>
  `,
  styles: `
    :host { display: block; }
    .linha { display: flex; gap: var(--s-3); align-items: flex-start; padding: 10px 12px; border: 1px solid var(--linha); border-radius: var(--r-1); background: var(--superficie); text-decoration: none; color: inherit; }
    .linha:hover { border-color: var(--placa); color: inherit; }
    .votos { display: inline-flex; flex-direction: column; align-items: center; min-width: 32px; color: var(--texto-2); font-size: var(--t-sm); font-weight: 700; }
    .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .titulo { font-weight: 600; overflow-wrap: anywhere; }
    .meta { font-size: var(--t-xs); color: var(--texto-3); display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { color: var(--placa); font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicRowComponent {
  topic = input.required<Topic>();
  replies = (t: Topic) => plural(t.replies, 'resposta', 'respostas');
}
