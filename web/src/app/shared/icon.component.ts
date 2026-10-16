import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { iconSvg } from './icons';

// ícone decorativo; o texto ao lado é quem carrega o significado
@Component({
  selector: 'ut-icon',
  template: '',
  host: { '[innerHTML]': 'svg()', 'aria-hidden': 'true', style: 'display:inline-flex;flex:none;line-height:0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);
  name = input.required<string>();
  size = input(20);
  // conteúdo vem só do conjunto interno de ícones, nunca de dados do usuário
  svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(iconSvg(this.name(), this.size())));
}
