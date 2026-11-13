import { TranslatePipe } from '@ngx-translate/core';
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
  imports: [RouterLink, IconComponent, ForumCardComponent, TopicRowComponent, ErrorStateComponent, TranslatePipe],
  template: `
    @if (error(); as e) {
      <ut-erro [message]="e" (retry)="load()" />
    } @else if (data(); as d) {
      <div class="grade">
        <section class="bloco largo" aria-labelledby="cri-t">
          <div class="b-topo"><h2 id="cri-t">{{ 'auto.m7f64bd5999' | translate }}</h2><a routerLink="/comunidade/foruns/novo" class="btn btn-texto btn-sm"><ut-icon name="plus" [size]="16" />{{ 'auto.ma97e989a61' | translate }}</a></div>
          @if (d.createdForums.length === 0) {
            <p class="vazio">{{ 'auto.madde5ed834' | translate }}</p>
          } @else {
            <ul class="foruns">@for (f of d.createdForums; track f.id) { <li><ut-forum-card [forum]="f" [compact]="true" /></li> }</ul>
          }
        </section>

        <section class="bloco largo" aria-labelledby="seg-t">
          <h2 id="seg-t">{{ 'auto.m34a2b97924' | translate }}</h2>
          @if (d.followedForums.length === 0) {
            <p class="vazio">{{ 'auto.mc3d03253d9' | translate }} <a routerLink="/comunidade/foruns">{{ 'auto.m1935ccb761' | translate }}</a></p>
          } @else {
            <ul class="foruns">@for (f of d.followedForums; track f.id) { <li><ut-forum-card [forum]="f" [compact]="true" /></li> }</ul>
          }
        </section>

        <section class="painel bloco" aria-labelledby="mt-t">
          <h2 id="mt-t">{{ 'auto.m9cd13c6ee9' | translate }}</h2>
          @if (d.myTopics.length === 0) {
            <p class="vazio">{{ 'auto.mc2b0272765' | translate }}</p>
          } @else {
            <ul class="lista">@for (t of d.myTopics; track t.id) { <li><ut-topic-row [topic]="t" /></li> }</ul>
          }
        </section>

        <section class="painel bloco" aria-labelledby="ct-t">
          <h2 id="ct-t">{{ 'auto.mf329707765' | translate }}</h2>
          @if (d.commentedTopics.length === 0) {
            <p class="vazio">{{ 'auto.m3e5b506326' | translate }}</p>
          } @else {
            <ul class="lista">@for (t of d.commentedTopics; track t.id) { <li><ut-topic-row [topic]="t" /></li> }</ul>
          }
        </section>

        <p class="largo feed-nota">
          @if (d.feedPosts > 0) { Você tem {{ d.feedPosts }} {{ d.feedPosts === 1 ? ('auto.m69b68b34dd' | translate) : ('auto.mfbef526996' | translate) }} no feed. <a routerLink="/comunidade" [queryParams]="{ filtro: 'minhas' }">{{ 'auto.m23a55e86b8' | translate }}</a> }
          @else { Você ainda não publicou no feed. <a routerLink="/comunidade">{{ 'auto.m08dcf39837' | translate }}</a> }
        </p>
      </div>
    } @else {
      <p class="carregando">{{ 'auto.mbca482b745' | translate }}</p>
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
