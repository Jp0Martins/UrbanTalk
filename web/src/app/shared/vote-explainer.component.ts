import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from './icon.component';

// explicação fixa sobre o significado dos votos e das fases
@Component({
  selector: 'ut-explica-voto',
  imports: [IconComponent],
  template: `
    <details class="aviso aviso-info explica">
      <summary><ut-icon name="info" [size]="18" /><span><strong>Apoio não é aprovação oficial.</strong> Entenda os votos e as fases</span></summary>
      <ul>
        <li>Cada morador apoia uma proposta uma única vez e pode retirar o apoio enquanto ela não chega a uma fase final.</li>
        <li>O número de apoios mostra a demanda da comunidade. Ele não obriga a Prefeitura nem qualquer órgão a executar a proposta.</li>
        <li>"Priorizada pela comunidade" quer dizer que a proposta teve muito apoio, não que foi aprovada.</li>
        <li>"Aceita", "Recusada" e "Implementada" só são usadas quando a equipe do UrbanTalk recebe uma resposta do órgão responsável, e a fonte fica registrada no histórico.</li>
        <li>Contas de funcionário não votam, para o apoio refletir só a opinião dos moradores.</li>
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
