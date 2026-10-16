import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { avatarTone } from '../core/format';

// círculo com iniciais; equipe aparece em tom escuro
@Component({
  selector: 'ut-avatar',
  template: `<span class="avatar" [class.equipe]="staff()" [attr.data-tom]="tone()" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">{{ initials() }}</span>`,
  styles: `:host { display: inline-flex; flex: none; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  name = input.required<string>();
  initials = input.required<string>();
  staff = input(false);
  size = input(42);
  tone = computed(() => avatarTone(this.name()));
}
