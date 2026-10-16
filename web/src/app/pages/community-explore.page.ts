import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toApiError } from '../core/api-error';
import { CommunityExplore } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ForumCardComponent } from '../shared/forum-card.component';
import { IconComponent } from '../shared/icon.component';
import { ErrorStateComponent } from '../shared/states';
import { TopicRowComponent } from '../shared/topic-row.component';

// descoberta dentro da Comunidade: só o que existe de verdade, sem números inventados
@Component({
  selector: 'ut-comunidade-explorar',
  imports: [RouterLink, IconComponent, ForumCardComponent, TopicRowComponent, ErrorStateComponent],
  template: `
    @if (error(); as e) {
      <ut-erro [message]="e" (retry)="load()" />
    } @else if (data(); as d) {
      <div class="grade">
        <section class="painel bloco" aria-labelledby="pop-t">
          <h2 id="pop-t">Em alta nos últimos 30 dias</h2>
          @if (d.popular.length === 0) {
            <p class="vazio">Nenhuma discussão recebeu votos ou respostas no último mês. Que tal <a routerLink="/comunidade/foruns">entrar num fórum</a> e puxar o assunto?</p>
          } @else {
            <ul class="lista">@for (t of d.popular; track t.id) { <li><ut-topic-row [topic]="t" /></li> }</ul>
          }
        </section>

        <section class="painel bloco" aria-labelledby="nov-t">
          <h2 id="nov-t">Discussões novas</h2>
          @if (d.newest.length === 0) {
            <p class="vazio">Ninguém abriu discussão ainda. A primeira pode ser sua.</p>
          } @else {
            <ul class="lista">@for (t of d.newest; track t.id) { <li><ut-topic-row [topic]="t" /></li> }</ul>
          }
        </section>

        <section class="painel bloco largo" aria-labelledby="temas-t">
          <h2 id="temas-t">Temas</h2>
          <ul class="temas">
            @for (t of d.themes; track t.id) {
              <li><a [routerLink]="['/comunidade/foruns']" [queryParams]="{ tema: t.id }"><ut-icon [name]="t.icon" [size]="18" />{{ t.name }}<span class="n tabular">{{ t.forums }} {{ t.forums === 1 ? 'fórum' : 'fóruns' }}</span></a></li>
            }
          </ul>
        </section>

        <section class="bloco largo sem-painel" aria-labelledby="nf-t">
          <div class="b-topo"><h2 id="nf-t">Fóruns criados recentemente</h2><a routerLink="/comunidade/foruns" [queryParams]="{ tipo: 'comunidade', ordem: 'novos' }" class="btn btn-texto btn-sm">Ver todos</a></div>
          @if (d.newForums.length === 0) {
            <div class="convite">
              <p>Ainda não há fóruns criados por moradores. Tem um assunto que merece um espaço próprio?</p>
              @if (session.user()) { <a routerLink="/comunidade/foruns/novo" class="btn btn-primario"><ut-icon name="plus" [size]="18" />Criar fórum</a> }
              @else { <a routerLink="/entrar" [queryParams]="{ volta: '/comunidade/foruns/novo' }" class="btn btn-secundario">Entre para criar um fórum</a> }
            </div>
          } @else {
            <ul class="foruns">@for (f of d.newForums; track f.id) { <li><ut-forum-card [forum]="f" [compact]="true" /></li> }</ul>
          }
        </section>

        @if (d.tags.length) {
          <section class="painel bloco largo" aria-labelledby="tags-t">
            <h2 id="tags-t">Tags mais usadas</h2>
            <p class="tags">@for (t of d.tags; track t.tag) { <span class="tag">#{{ t.tag }} <span class="n tabular">{{ t.count }}</span></span> }</p>
          </section>
        }
      </div>
    } @else {
      <p class="carregando">Carregando…</p>
    }
  `,
  styles: `
    :host { display: block; }
    .grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4); align-items: start; }
    .bloco { padding: var(--s-4) var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
    .sem-painel { padding: 0; }
    .largo { grid-column: 1 / -1; }
    h2 { font-size: var(--t-lg); }
    .b-topo { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
    .lista, .temas, .foruns { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .temas { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
    .temas a { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border: 1px solid var(--linha); border-radius: var(--r-1); text-decoration: none; color: var(--texto); font-weight: 500; }
    .temas a:hover { border-color: var(--placa); }
    .temas .n { margin-left: auto; font-size: var(--t-xs); color: var(--texto-3); font-weight: 400; }
    .foruns { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: var(--s-3); }
    .vazio { color: var(--texto-2); }
    .convite { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; padding: var(--s-4); border: 1px dashed var(--linha-forte); border-radius: var(--r-2); background: var(--superficie-2); }
    .convite p { flex: 1 1 260px; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: var(--placa-clara); color: var(--placa); font-weight: 600; border-radius: var(--r-1); padding: 2px 8px; font-size: var(--t-sm); }
    .tag .n { color: var(--texto-2); font-weight: 400; }
    @media (max-width: 900px) { .grade { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityExplorePage implements OnInit {
  private api = inject(ParticipationApi);
  session = inject(SessionStore);
  data = signal<CommunityExplore | null>(null);
  error = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  load() {
    this.error.set(null);
    this.api.communityExplore().subscribe({ next: (d) => this.data.set(d), error: (e) => this.error.set(toApiError(e).message) });
  }
}
