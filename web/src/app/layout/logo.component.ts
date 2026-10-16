import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// a marca é uma placa de rua: nome em cima, cidade na linha de baixo
@Component({
  selector: 'ut-logo',
  imports: [RouterLink],
  template: `
    <a [routerLink]="link()" class="logo" [class.sobre-escuro]="onDark()" aria-label="UrbanTalk, página inicial">
      <span class="nome">UrbanTalk</span>
      <span class="cidade">Sorocaba, SP</span>
    </a>
  `,
  styles: `
    .logo {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      padding: 6px 12px 7px;
      background: var(--placa);
      color: #fff;
      border-radius: var(--r-1);
      box-shadow: inset 0 0 0 3px var(--placa), inset 0 0 0 4.5px #fff;
      text-decoration: none;
      line-height: 1;
    }
    .logo:hover { color: #fff; background: var(--placa-escura); box-shadow: inset 0 0 0 3px var(--placa-escura), inset 0 0 0 4.5px #fff; }
    .nome { font-family: var(--fonte-titulo); font-weight: 700; font-size: 1.25rem; letter-spacing: 0.005em; }
    .cidade { font-size: 0.6875rem; font-weight: 500; opacity: 0.9; }
    .sobre-escuro { box-shadow: inset 0 0 0 3px var(--placa), inset 0 0 0 4.5px #fff, 0 0 0 1px rgb(255 255 255 / 0.12); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoComponent {
  link = input<string>('/');
  onDark = input(false);
}
