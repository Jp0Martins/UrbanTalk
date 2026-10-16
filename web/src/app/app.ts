import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastsComponent } from './layout/toasts.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastsComponent],
  template: `<router-outlet /><ut-toasts />`,
})
export class App {}
