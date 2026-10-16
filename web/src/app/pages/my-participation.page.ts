import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { MyParticipation } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { ForumCardComponent } from '../shared/forum-card.component';
import { IconComponent } from '../shared/icon.component';
import { ErrorStateComponent } from '../shared/states';
import { TopicRowComponent } from '../shared/topic-row.component';

// o que a pessoa criou, segue e comentou na Comunidade
@Component({
  selector: 'ut-minhas-participacoes',
  imports: [RouterLink, IconComponent, ForumCardComponent, TopicRowComponent, ErrorStateComponent],
  template: `
    @if (error(); as e) {
      <ut-erro [message]="e" (retry)="load()" />
    } @else if (data(); as d) {
      <div class="grade">
        <section class="bloco largo" aria-labelledby="cri-t">
          <div class="b-topo"><h2 id="cri-t">Fóruns que você criou</h2><a routerLink="/comunidade/foruns/novo" class="btn btn-texto btn-sm"><ut-icon name="plus" [size]="16" />Criar fórum</a></div>
          @if (d.createdForums.length === 0) {
            <p class="vazio">Você ainda não criou nenhum fórum. Quando um assunto merecer um espaço próprio, é só criar.</p>
          } @else {
            <ul class="foruns">@for (f of d.createdForums; track f.id) { <li><ut-forum-card [forum]="f" [compact]="true" /></li> }</ul>
          }
        </section>

        <section class="bloco largo" aria-labelledby="seg-t">
          <h2 id="seg-t">Fóruns que você segue</h2>
          @if (d.followedForums.length === 0) {
            <p class="vazio">Siga fóruns para ser avisado de novas discussões. <a routerLink="/comunidade/foruns">Ver fóruns</a></p>
          } @else {
            <ul class="foruns">@for (f of d.followedForums; track f.id) { <li><ut-forum-card [forum]="f" [compact]="true" /></li> }</ul>
          }
        </section>

        <section class="painel bloco" aria-labelledby="mt-t">
          <h2 id="mt-t">Discussões que você abriu</h2>
          @if (d.myTopics.length === 0) {
            <p class="vazio">Nenhuma ainda. Escolha um fórum e abra uma conversa.</p>
          } @else {
            <ul class="lista">@for (t of d.myTopics; track t.id) { <li><ut-topic-row [topic]="t" /></li> }</ul>
          }
        </section>

        <section class="painel bloco" aria-labelledby="ct-t">
          <h2 id="ct-t">Discussões em que você comentou</h2>
          @if (d.commentedTopics.length === 0) {
            <p class="vazio">Você ainda não respondeu a nenhuma discussão.</p>
          } @else {
            <ul class="lista">@for (t of d.commentedTopics; track t.id) { <li><ut-topic-row [topic]="t" /></li> }</ul>
          }
        </section>

        <p class="largo feed-nota">
          @if (d.feedPosts > 0) { Você tem {{ d.feedPosts }} {{ d.feedPosts === 1 ? 'publicação' : 'publicações' }} no feed. <a routerLink="/comunidade" [queryParams]="{ filtro: 'minhas' }">Ver no Feed</a> }
          @else { Você ainda não publicou no feed. <a routerLink="/comunidade">Ir para o Feed</a> }
        </p>
      </div>
    } @else {
      <p class="carregando">Carregando…</p>
    }
  `,
  styles: `
    :host { display: block; }
    .grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-5) var(--s-4); align-items: start; }
    .bloco { display: flex; flex-direction: column; gap: var(--s-3); }
    .painel.bloco { padding: var(--s-4) var(--s-5); }
    .largo { grid-column: 1 / -1; }
    h2 { font-size: var(--t-lg); }
    .b-topo { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .foruns { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: var(--s-3); }
    .vazio { color: var(--texto-2); padding: var(--s-4); border: 1px dashed var(--linha-forte); border-radius: var(--r-2); background: var(--superficie-2); }
    .painel .vazio { border: 0; padding: 0; background: none; }
    .feed-nota { color: var(--texto-2); }
    @media (max-width: 900px) { .grade { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyParticipationPage implements OnInit {
  private api = inject(ParticipationApi);
  data = signal<MyParticipation | null>(null);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  load() {
    this.error.set(null);
    this.api.myParticipation().subscribe({ next: (d) => this.data.set(d), error: (e) => this.error.set(toApiError(e).message) });
  }
}
