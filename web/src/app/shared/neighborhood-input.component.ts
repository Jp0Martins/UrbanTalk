import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, model, output, signal } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { PlaceSuggestion } from '../core/models';

// campo de bairro em texto livre; as sugestões vêm de nomes já digitados, mas qualquer nome novo vale
@Component({
  selector: 'ut-bairro',
  template: `
    <input
      class="entrada"
      type="text"
      autocomplete="off"
      [id]="inputId()"
      [attr.list]="inputId() + '-sug'"
      [value]="value()"
      [placeholder]="placeholder()"
      maxlength="80"
      [attr.aria-invalid]="invalid() || null"
      [attr.aria-describedby]="describedBy() || null"
      [attr.required]="required() || null"
      (input)="typed($any($event.target).value)"
      (change)="committed.emit(value())"
      (keydown.enter)="committed.emit(value())"
      (focus)="load(value())"
    />
    <datalist [id]="inputId() + '-sug'">
      @for (s of suggestions(); track s.key) {
        <option [value]="s.name"></option>
      }
    </datalist>
  `,
  styles: `:host { display: block; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeighborhoodInputComponent {
  private api = inject(ApiService);
  inputId = input.required<string>();
  placeholder = input('Digite o nome do bairro');
  invalid = input(false);
  required = input(false);
  describedBy = input<string | null>(null);
  value = model('');
  // disparado ao sair do campo ou apertar Enter: bom para filtros
  committed = output<string>();

  suggestions = signal<PlaceSuggestion[]>([]);
  private q$ = new Subject<string>();

  constructor() {
    this.q$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => this.api.placeSuggestions(q).pipe(catchError(() => of([] as PlaceSuggestion[])))),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((s) => this.suggestions.set(s));
  }

  typed(v: string) {
    this.value.set(v);
    this.q$.next(v.trim());
    // escolher uma sugestão da lista já aplica, sem precisar sair do campo
    if (v && this.suggestions().some((s) => s.name === v)) this.committed.emit(v);
  }

  load(v: string) {
    this.q$.next(v.trim());
  }
}
