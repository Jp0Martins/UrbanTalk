import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { DatePipe } from '../core/format';
import { ProposalDetail, parseOccurrenceCode } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { ProposalCatalog } from '../core/proposal-catalog';
import { SessionStore } from '../core/session.store';
import { ToastService } from '../core/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { StatusBadgeComponent } from '../shared/badges';
import { DiscussionComponent } from '../shared/discussion.component';
import { IconComponent } from '../shared/icon.component';
import { PhaseBadgeComponent } from '../shared/phase-badge.component';
import { ReportButtonComponent } from '../shared/report-button.component';
import { ErrorStateComponent } from '../shared/states';
import { VoteButtonComponent } from '../shared/vote-button.component';
import { VoteExplainerComponent } from '../shared/vote-explainer.component';

@Component({
  selector: 'ut-proposta',
  imports: [RouterLink, AvatarComponent, IconComponent, StatusBadgeComponent, PhaseBadgeComponent, DiscussionComponent, ReportButtonComponent, ErrorStateComponent, VoteButtonComponent, VoteExplainerComponent, DatePipe],
  template: `
    <div class="pagina">
      <nav class="trilha" aria-label="Você está em"><a routerLink="/propostas">Ideias e propostas</a><span aria-hidden="true" class="sep"> › </span>Proposta</nav>
      @if (error(); as e) {
        <ut-erro [message]="e" (retry)="load()" />
      } @else if (p(); as p) {
        <div class="grade">
          <article class="principal-col">
            <header class="cab">
              <div class="selos">
                <ut-fase [status]="p.status" />
                @if (p.neighborhood) { <span class="selo-texto"><ut-icon name="pin" [size]="12" />{{ p.neighborhood.name }}</span> } @else { <span class="selo-texto">Cidade toda</span> }
                @if (p.category) { <span class="selo-texto">{{ p.category.name }}</span> }
              </div>
              <h1>{{ p.title }}</h1>
              <p class="autor">
                <ut-avatar [name]="p.author.name" [initials]="p.author.initials" [size]="30" />
                <span>Proposta de <strong>{{ p.author.isMe ? p.author.name + ' (você)' : p.author.name }}</strong> · {{ p.createdAt | data }}</span>
                @if (p.author.isDemo) { <span class="selo-texto">Demonstração</span> }
              </p>
            </header>

            <p class="corpo">{{ p.body }}</p>

            @if (p.images.length) {
              <ul class="galeria" aria-label="Imagens da proposta">
                @for (img of p.images; track img; let i = $index) {
                  <li><a [href]="img" target="_blank" rel="noopener"><img [src]="img" [alt]="'Imagem ' + (i + 1) + ' enviada com a proposta'" loading="lazy" /></a></li>
                }
              </ul>
            }
            @if (p.referenceUrl) {
              <p class="ref"><ut-icon name="file" [size]="16" />Referência: <a [href]="p.referenceUrl" target="_blank" rel="noopener noreferrer nofollow">{{ p.referenceUrl }}</a> <span class="muted">(site externo)</span></p>
            }

            <section class="bloco" aria-labelledby="rel-t">
              <h2 id="rel-t">Reclamações relacionadas</h2>
              @if (p.occurrences.length === 0) {
                <p class="muted">Nenhuma reclamação do mapa foi relacionada a esta proposta.</p>
              } @else {
                <ul class="rel">
                  @for (o of p.occurrences; track o.id) {
                    <li>
                      <a [routerLink]="['/ocorrencias', o.id]"><ut-icon [name]="o.icon" [size]="18" />{{ o.category }} · {{ o.street ? o.street + ', ' : '' }}{{ o.neighborhood }} <span class="muted tabular">{{ o.code }}</span></a>
                      <ut-status [status]="o.status" />
                      @if (p.canLink) { <button type="button" class="btn btn-texto btn-sm" (click)="unlink(o.id)">Remover<span class="sr-only"> {{ o.code }}</span></button> }
                    </li>
                  }
                </ul>
              }
              @if (p.canLink) {
                <form class="ligar" (submit)="$event.preventDefault(); link()">
                  <label for="lig-cod" class="sr-only">Código da reclamação</label>
                  <input id="lig-cod" class="entrada" placeholder="UT-00012" maxlength="12" [value]="code()" (input)="code.set($any($event.target).value)" />
                  <button type="submit" class="btn btn-secundario btn-sm">Relacionar</button>
                </form>
                @if (linkError()) { <p class="erro">{{ linkError() }}</p> }
              }
            </section>

            <section class="bloco" aria-labelledby="hist-t">
              <h2 id="hist-t">Histórico de fases</h2>
              <ol class="linha-tempo">
                @for (h of p.history; track h.id) {
                  <li>
                    <ut-fase [status]="h.toStatus" />
                    <span class="quando">{{ h.createdAt | data: true }}{{ h.fromStatus === null ? ' · proposta publicada' : h.byStaff ? ' · pela equipe' : '' }}</span>
                    @if (h.note) { <p class="nota">{{ h.note }}</p> }
                  </li>
                }
              </ol>
            </section>

            <ut-discussao target="proposals" [targetId]="p.id" [initialTotal]="p.comments" heading="Comentários e debate" emptyText="Ninguém comentou ainda. Que tal sugerir uma melhoria na ideia?" />
          </article>

          <aside class="lado">
            <section class="painel apoio-box">
              <ut-apoio size="lg" [proposalId]="p.id" [votes]="p.votes" [voted]="p.votedByMe" [canVote]="p.canVote" [isFinal]="p.isFinal" (changed)="voted($event)" />
              <div>
                <p class="ap-titulo">{{ p.votes === 1 ? '1 apoio de morador' : p.votes + ' apoios de moradores' }}</p>
                <p class="muted ap-texto">
                  @if (p.isFinal) { Votação encerrada nesta fase. }
                  @else if (session.isStaff()) { Contas de funcionário não votam. }
                  @else if (p.votedByMe) { Você apoia esta proposta. Clique de novo para retirar. }
                  @else { Apoio mostra demanda, não é decisão oficial. }
                </p>
              </div>
            </section>
            <div class="painel acoes-box">
              <button type="button" class="btn btn-secundario" (click)="share()"><ut-icon name="send" [size]="18" />Compartilhar</button>
              @if (session.user()) {
                <button type="button" class="btn btn-secundario" [attr.aria-pressed]="p.following" (click)="toggleFollow()"><ut-icon [name]="p.following ? 'check' : 'plus'" [size]="18" />{{ p.following ? 'Acompanhando' : 'Acompanhar' }}</button>
              }
              @if (session.isCitizen()) {
                <a class="btn btn-texto" routerLink="/comunidade/f/ideias-propostas">Debater no fórum de ideias</a>
              }
              @if (p.canReport) { <ut-denunciar type="proposal" [targetId]="p.id" /> }
              @if (p.canDelete) { <button type="button" class="btn btn-texto apagar" (click)="remove()">Remover minha proposta</button> }
            </div>

            @if (p.canChangeStatus) {
              <form class="painel equipe" (submit)="$event.preventDefault(); changePhase()">
                <h2><ut-icon name="shield" [size]="18" />Fase da proposta</h2>
                <div class="campo">
                  <label for="fase-n">Nova fase</label>
                  <select id="fase-n" class="entrada" (change)="phase.set($any($event.target).value)">
                    <option value="">Escolha…</option>
                    @for (s of catalog.active(); track s.id) {
                      @if (s.slug !== p.status) { <option [value]="s.slug">{{ s.name }}{{ s.isFinal ? ' (final)' : '' }}</option> }
                    }
                  </select>
                </div>
                <div class="campo">
                  <label for="fase-nota">Explicação pública</label>
                  <textarea id="fase-nota" class="entrada" rows="3" maxlength="500" [value]="phaseNote()" (input)="phaseNote.set($any($event.target).value)" [attr.aria-invalid]="!!phaseFields()['note']"></textarea>
                  <span class="dica">Obrigatória nas fases finais: diga qual órgão respondeu e quando.</span>
                  @if (phaseFields()['note']) { <span class="erro">{{ phaseFields()['note'] }}</span> }
                </div>
                @if (phaseError()) { <p class="erro" role="alert">{{ phaseError() }}</p> }
                <button type="submit" class="btn btn-primario" [disabled]="!phase() || savingPhase()">{{ savingPhase() ? 'Salvando…' : 'Mudar fase' }}</button>
              </form>
            }
            <ut-explica-voto />
          </aside>
        </div>
      } @else {
        <p class="carregando">Carregando proposta…</p>
      }
    </div>
  `,
  styles: `
    .trilha { font-size: var(--t-sm); color: var(--texto-2); margin-bottom: var(--s-4); }
    .sep { white-space: pre; }
    .grade { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 320px); gap: var(--s-6); align-items: start; }
    .principal-col { display: flex; flex-direction: column; gap: var(--s-5); min-width: 0; }
    .cab { display: flex; flex-direction: column; gap: var(--s-2); }
    .selos { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .autor { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; font-size: var(--t-sm); color: var(--texto-2); }
    .corpo { white-space: pre-line; overflow-wrap: anywhere; font-size: 1.0625rem; line-height: 1.6; background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-2); padding: var(--s-5); }
    .galeria { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s-2); }
    .galeria img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--r-1); }
    .ref { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: var(--t-sm); overflow-wrap: anywhere; }
    .bloco { display: flex; flex-direction: column; gap: var(--s-3); }
    .bloco h2 { font-size: var(--t-lg); }
    .rel { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .rel li { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; padding: 8px 12px; background: var(--superficie); border: 1px solid var(--linha); border-radius: var(--r-1); }
    .rel a { display: inline-flex; gap: 6px; align-items: center; flex: 1; min-width: 200px; }
    .ligar { display: flex; gap: var(--s-2); }
    .ligar .entrada { max-width: 180px; min-height: 36px; }
    .linha-tempo { list-style: none; margin: 0; padding: 0 0 0 var(--s-4); border-left: 2px solid var(--linha-forte); display: flex; flex-direction: column; gap: var(--s-3); }
    .linha-tempo li { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .quando { font-size: var(--t-xs); color: var(--texto-3); }
    .nota { font-size: var(--t-sm); background: var(--superficie); border: 1px solid var(--linha); padding: 6px 10px; border-radius: var(--r-1); }
    .lado { display: flex; flex-direction: column; gap: var(--s-3); position: sticky; top: var(--s-5); }
    .apoio-box { padding: var(--s-4); display: flex; gap: var(--s-4); align-items: center; }
    .ap-titulo { font-weight: 700; }
    .ap-texto { font-size: var(--t-sm); }
    .acoes-box { padding: var(--s-3); display: flex; flex-direction: column; gap: var(--s-2); align-items: stretch; }
    .apagar { color: var(--perigo); }
    .equipe { padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); border-top: 4px solid var(--asfalto); }
    .equipe h2 { font-size: var(--t-md); display: flex; gap: 6px; align-items: center; }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    @media (max-width: 1000px) {
      .grade { grid-template-columns: 1fr; }
      /* no celular: apoio antes do texto, demais ações depois da conversa */
      .lado { display: contents; }
      .apoio-box { order: -1; }
      .acoes-box, .equipe, .lado ut-explica-voto { order: 1; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalPage {
  private api = inject(ParticipationApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  catalog = inject(ProposalCatalog);
  session = inject(SessionStore);
  id = input.required<string>();

  p = signal<ProposalDetail | null>(null);
  error = signal<string | null>(null);
  code = signal('');
  linkError = signal<string | null>(null);
  phase = signal('');
  phaseNote = signal('');
  savingPhase = signal(false);
  phaseError = signal<string | null>(null);
  phaseFields = signal<Record<string, string>>({});

  constructor() {
    this.catalog.ensure();
    effect(() => {
      this.id();
      untracked(() => this.load());
    });
  }

  load() {
    this.error.set(null);
    this.p.set(null);
    this.api.proposal(Number(this.id())).subscribe({
      next: (p) => this.p.set(p),
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  voted(r: { votes: number; votedByMe: boolean }) {
    const p = this.p()!;
    this.p.set({ ...p, votes: r.votes, votedByMe: r.votedByMe, following: r.votedByMe ? true : p.following });
  }

  async share() {
    const url = location.href;
    const title = this.p()!.title;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Proposta no UrbanTalk: ${title}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.toast.show('Link da proposta copiado.');
    } catch {
      // compartilhamento cancelado pela pessoa: nada a fazer
    }
  }

  toggleFollow() {
    const p = this.p()!;
    this.api.follow('proposals', p.id, !p.following).subscribe({
      next: (r) => {
        this.p.set({ ...p, following: r.following });
        this.toast.show(r.following ? 'Você vai receber avisos sobre esta proposta.' : 'Você deixou de acompanhar esta proposta.', 'info');
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }

  link() {
    const id = parseOccurrenceCode(this.code());
    if (!id) {
      this.linkError.set('Digite um código como UT-00012.');
      return;
    }
    this.linkError.set(null);
    this.api.linkOccurrence(this.p()!.id, id, true).subscribe({
      next: (p) => {
        this.p.set(p);
        this.code.set('');
        this.toast.show('Reclamação relacionada.');
      },
      error: (e) => this.linkError.set(toApiError(e).message),
    });
  }

  unlink(occId: number) {
    this.api.linkOccurrence(this.p()!.id, occId, false).subscribe({
      next: (p) => this.p.set(p),
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }

  changePhase() {
    this.savingPhase.set(true);
    this.phaseError.set(null);
    this.phaseFields.set({});
    this.api.proposalStatus(this.p()!.id, this.phase(), this.phaseNote()).subscribe({
      next: (p) => {
        this.savingPhase.set(false);
        this.p.set(p);
        this.phase.set('');
        this.phaseNote.set('');
        this.toast.show('Fase atualizada. Quem acompanha a proposta foi avisado.');
      },
      error: (e) => {
        this.savingPhase.set(false);
        const err = toApiError(e);
        this.phaseFields.set(err.fields);
        this.phaseError.set(err.message);
      },
    });
  }

  remove() {
    if (!confirm('Remover sua proposta? Ela deixa de aparecer para todos.')) return;
    this.api.deleteProposal(this.p()!.id).subscribe({
      next: () => {
        this.toast.show('Proposta removida.', 'info');
        this.router.navigate(['/propostas']);
      },
      error: (e) => this.toast.show(toApiError(e).message, 'erro'),
    });
  }
}
