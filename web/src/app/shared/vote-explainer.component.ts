import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from './icon.component';

// explicação fixa sobre o significado dos votos e das fases
@Component({
  selector: 'ut-explica-voto',
  imports: [IconComponent, TranslatePipe],
  template: `
    <details class="aviso aviso-info explica">
      <summary><ut-icon name="info" [size]="18" /><span><strong>{{ 'auto.m53176b4c4e' | translate }}</strong> {{ 'auto.mde80f84805' | translate }}</span></summary>
      <ul>
        <li>{{ 'auto.m3203fb4c0c' | translate }}</li>
        <li>{{ 'auto.mf9853e26e4' | translate }}</li>
        <li>{{ 'auto.m5dfb1bb3a2' | translate }}</li>
        <li>{{ 'auto.ma389ed5115' | translate }}</li>
        <li>{{ 'auto.m98532f2aab' | translate }}</li>
      </ul>
    </details>
  `,
  styles: `
    .explica { display: block; }
    summary { display: flex; gap: var(--s-2); align-items: center; cursor: pointer; list-style: none; min-height: 32px; }
    summary::-webkit-details-marker { display: none; }
    ul { margin: var(--s-2) 0 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: 4px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoteExplainerComponent {}
