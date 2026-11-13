import { TranslatePipe } from '@ngx-translate/core';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/states';

@Component({
  selector: 'ut-nao-encontrada',
  imports: [RouterLink, EmptyStateComponent, TranslatePipe],
  template: `
    <div class="pagina">
      <ut-vazio icon="pin" [title]="'auto.m84a4341ede' | translate" [text]="'auto.md4985f3b8b' | translate">
        <a routerLink="/" class="btn btn-secundario btn-sm">{{ 'auto.mcc85e897e2' | translate }}</a>
        <a routerLink="/mapa" class="btn btn-texto btn-sm">{{ 'auto.m9a4863d29f' | translate }}</a>
      </ut-vazio>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
