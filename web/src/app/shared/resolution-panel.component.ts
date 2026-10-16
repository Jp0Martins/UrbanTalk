import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { DatePipe } from '../core/format';
import { OccurrenceDetail } from '../core/models';
import { SessionStore } from '../core/session.store';
import { StatusCatalog } from '../core/status-catalog';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

// resolução informada, evidências e avaliação dos moradores, sempre separadas
@Component({
  selector: 'ut-resolucao',
  imports: [RouterLink, IconComponent, DatePipe],
  template: `
    @let o = occ();
    @if (o.resolution; as r) {
      <section class="resolucao" aria-labelledby="res-t">
        <h2 id="res-t">Resolução</h2>
        <p class="quando">{{ catalog.name(r.status) }} em {{ r.createdAt | data: true }}@if (r.resolvedBy) { · por {{ r.resolvedBy }} }</p>
        @if (r.description) { <p class="descricao">{{ r.description }}</p> }

        <ul class="niveis" aria-label="O que sabemos sobre esta resolução">
          <li [class.ok]="r.levels.informada">
            <ut-icon [name]="r.levels.informada ? 'check' : 'status-encerrada'" [size]="18" />
            <span><strong>Resolução informada</strong>Um responsável da equipe declarou que o problema foi resolvido.</span>
          </li>
          <li [class.ok]="r.levels.comEvidencias">
            <ut-icon [name]="r.levels.comEvidencias ? 'check' : 'status-encerrada'" [size]="18" />
            <span><strong>{{ r.levels.comEvidencias ? 'Resolução com evidências' : 'Sem evidências anexadas' }}</strong>
              {{ r.levels.comEvidencias ? 'Foram anexadas fotos da intervenção. Fotos ajudam, mas não são uma verificação independente.' : 'A equipe ainda não anexou fotos da intervenção.' }}</span>
          </li>
          <li [class.ok]="r.levels.confirmadaPelaComunidade">
            <ut-icon [name]="r.levels.confirmadaPelaComunidade ? 'check' : 'status-encerrada'" [size]="18" />
            <span><strong>{{ r.levels.confirmadaPelaComunidade ? 'Confirmação da comunidade' : 'Ainda sem confirmação da comunidade' }}</strong>
              {{ r.feedback.resolvido }} {{ r.feedback.resolvido === 1 ? 'morador indicou' : 'moradores indicaram' }} que parece resolvido · {{ r.feedback.persiste }} {{ r.feedback.persiste === 1 ? 'informou' : 'informaram' }} que continua.
              <span class="regra">Conta como confirmação com 2 ou mais "parece resolvido" e mais respostas positivas que negativas.</span></span>
          </li>
        </ul>

        @if (r.evidence.antes.length || r.evidence.depois.length) {
          <div class="evidencias">
            @for (grupo of [{ k: 'Antes', fotos: r.evidence.antes }, { k: 'Depois', fotos: r.evidence.depois }]; track grupo.k) {
              @if (grupo.fotos.length) {
                <figure>
                  <figcaption>{{ grupo.k }}</figcaption>
                  <ul>
                    @for (f of grupo.fotos; track f.id) {
                      <li><a [href]="f.url" target="_blank" rel="noopener"><img [src]="f.url" [alt]="'Foto de ' + grupo.k.toLowerCase() + ' da intervenção'" loading="lazy" /></a>@if (f.caption) { <span class="leg">{{ f.caption }}</span> }</li>
                    }
                  </ul>
                </figure>
              }
            }
          </div>
        }

        @if (o.reviewRequested) {
          <p class="aviso aviso-atencao"><ut-icon name="alert" [size]="18" />Um morador informou que o problema continua. A equipe vai reavaliar; o histórico anterior fica preservado.</p>
        }

        @if (r.feedback.mine; as m) {
          <p class="estado"><ut-icon name="check" [size]="18" />Você informou: {{ m === 'resolvido' ? 'parece resolvido' : 'o problema continua' }}.</p>
        } @else if (r.canGiveFeedback) {
          <div class="avaliar">
            <p class="rotulo">Você passou pelo local? O problema foi mesmo resolvido?</p>
            @if (mode() === null) {
              <div class="botoes">
                <button type="button" class="btn btn-secundario" [disabled]="sending()" (click)="send('resolvido')"><ut-icon name="check" [size]="18" />Parece resolvido</button>
                <button type="button" class="btn btn-secundario" (click)="mode.set('persiste')"><ut-icon name="alert" [size]="18" />O problema continua</button>
              </div>
            } @else {
              <div class="campo">
                <label for="persiste-txt">O que você viu no local?</label>
                <textarea id="persiste-txt" class="entrada" rows="3" maxlength="500" [value]="comment()" (input)="comment.set($any($event.target).value)" [attr.aria-invalid]="!!error()"></textarea>
                <span class="dica">Só a equipe lê este comentário. Ele serve para reavaliar a reclamação.</span>
              </div>
              <div class="botoes">
                <button type="button" class="btn btn-texto" (click)="mode.set(null)">Cancelar</button>
                <button type="button" class="btn btn-primario" [disabled]="sending() || comment().trim().length < 5" (click)="send('persiste')">Enviar</button>
              </div>
            }
            @if (error()) { <p class="erro" role="alert">{{ error() }}</p> }
          </div>
        } @else if (!session.user()) {
          <p class="dica"><a routerLink="/entrar" [queryParams]="{ volta: '/ocorrencias/' + o.id }">Entre</a> para dizer se o problema foi mesmo resolvido.</p>
        }

        @if (r.feedback.comments.length) {
          <div class="comentarios">
            <p class="rotulo"><ut-icon name="lock" [size]="14" />Comentários das avaliações (só a equipe vê)</p>
            <ul>
              @for (c of r.feedback.comments; track c.createdAt + c.name) {
                <li><strong>{{ c.name }}</strong> · {{ c.verdict === 'persiste' ? 'continua' : 'parece resolvido' }} · {{ c.createdAt | data: true }}<p>{{ c.comment }}</p></li>
              }
            </ul>
          </div>
        }
      </section>
    } @else if (o.previousResolutions > 0) {
      <p class="aviso aviso-info"><ut-icon name="refresh" [size]="18" />Esta reclamação já foi dada como resolvida {{ o.previousResolutions === 1 ? 'uma vez' : o.previousResolutions + ' vezes' }} e foi reaberta. O histórico completo está no acompanhamento.</p>
    }
  `,
  styles: `
    .resolucao { display: flex; flex-direction: column; gap: var(--s-3); background: var(--superficie); border: 1px solid var(--linha); border-top: 4px solid var(--st-verde); border-radius: var(--r-2); padding: var(--s-5); }
    h2 { font-size: var(--t-lg); }
    .quando { font-size: var(--t-sm); color: var(--texto-2); }
    .descricao { white-space: pre-line; overflow-wrap: anywhere; }
    .niveis { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .niveis li { display: flex; gap: var(--s-2); align-items: flex-start; padding: 8px 12px; border-radius: var(--r-1); background: var(--superficie-2); color: var(--texto-2); font-size: var(--t-sm); }
    .niveis li.ok { background: var(--st-verde-fundo); color: var(--texto); }
    .niveis li.ok ut-icon { color: var(--st-verde); }
    .niveis strong { display: block; color: var(--texto); }
    .regra { display: block; font-size: var(--t-xs); color: var(--texto-3); margin-top: 2px; }
    .evidencias { display: flex; gap: var(--s-4); flex-wrap: wrap; }
    figure { margin: 0; }
    figcaption { font-weight: 700; font-size: var(--t-sm); margin-bottom: 4px; }
    figure ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
    figure img { width: 150px; height: 112px; object-fit: cover; border-radius: var(--r-1); border: 1px solid var(--linha); }
    .leg { display: block; font-size: var(--t-xs); color: var(--texto-2); max-width: 150px; }
    .avaliar { display: flex; flex-direction: column; gap: var(--s-2); border-top: 1px solid var(--linha); padding-top: var(--s-3); }
    .botoes { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .estado { display: flex; gap: 8px; align-items: center; font-size: var(--t-sm); background: var(--superficie-2); padding: 8px 12px; border-radius: var(--r-1); }
    .comentarios { border-top: 1px dashed var(--linha-forte); padding-top: var(--s-3); font-size: var(--t-sm); }
    .comentarios .rotulo { display: flex; gap: 4px; align-items: center; }
    .comentarios ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .comentarios li { background: #fffbea; padding: 6px 10px; border-radius: var(--r-1); }
    .dica { font-size: var(--t-xs); color: var(--texto-2); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionPanelComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  session = inject(SessionStore);
  catalog = inject(StatusCatalog);
  occ = input.required<OccurrenceDetail>();
  updated = output<OccurrenceDetail>();
  mode = signal<'persiste' | null>(null);
  comment = signal('');
  sending = signal(false);
  error = signal<string | null>(null);

  send(verdict: 'resolvido' | 'persiste') {
    this.sending.set(true);
    this.error.set(null);
    this.api.feedback(this.occ().id, verdict, verdict === 'persiste' ? this.comment().trim() : '').subscribe({
      next: (o) => {
        this.sending.set(false);
        this.mode.set(null);
        this.updated.emit(o);
        this.toast.show(verdict === 'resolvido' ? 'Obrigado! Sua confirmação ajuda a saber se a solução funcionou.' : 'Obrigado. A equipe vai reavaliar esta reclamação.');
      },
      error: (e) => {
        this.sending.set(false);
        const err = toApiError(e);
        this.error.set(Object.values(err.fields)[0] ?? err.message);
      },
    });
  }
}
