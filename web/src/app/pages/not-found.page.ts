import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/states';

@Component({
  selector: 'ut-nao-encontrada',
  imports: [RouterLink, EmptyStateComponent],
  template: `
    <div class="pagina">
      <ut-vazio icon="pin" title="Página não encontrada" text="O endereço pode ter sido digitado errado ou a página mudou de lugar.">
        <a routerLink="/" class="btn btn-secundario btn-sm">Ir para o início</a>
        <a routerLink="/mapa" class="btn btn-texto btn-sm">Abrir o mapa</a>
      </ut-vazio>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
