import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { toApiError } from '../core/api-error';
import { plural } from '../core/format';
import { Forum, ForumPage, ForumSort, ForumTheme } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { SessionStore } from '../core/session.store';
import { ForumCardComponent } from '../shared/forum-card.component';
import { IconComponent } from '../shared/icon.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

interface ForumFilters {
  q: string;
  theme: string;
  neighborhood: string;
  kind: '' | 'oficial' | 'comunidade';
  following: boolean;
  sort: ForumSort;
}

const EMPTY: ForumFilters = { q: '', theme: '', neighborhood: '', kind: '', following: false, sort: 'atividade' };

// aba Fóruns: oficiais e criados pelas pessoas, com busca por nome, tema, tag e bairro
@Component({
  selector: 'ut-foruns',
  imports: [RouterLink, IconComponent, ForumCardComponent, NeighborhoodInputComponent, PaginationComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <form class="filtros" role="search" aria-label="Procurar fóruns" (submit)="$event.preventDefault(); apply({ q: draftQ().trim() })">
      <div class="campo busca">
        <label for="fq">Procurar fórum</label>
        <div class="busca-wrap">
          <ut-icon name="search" [size]="18" />
          <input id="fq" class="entrada" type="search" maxlength="80" placeholder="Nome, tema, tag ou bairro" [value]="f().q" (input)="draftQ.set($any($event.target).value)" (search)="apply({ q: draftQ().trim() })" />
        </div>
      </div>
      <div class="campo">
        <label for="ftema">Tema</label>
        <select id="ftema" class="entrada" (change)="apply({ theme: $any($event.target).value })">
          <option value="" [selected]="!f().theme">Todos</option>
          @for (t of themes(); track t.id) { <option [value]="t.id" [selected]="f().theme === t.id">{{ t.name }}</option> }
        </select>
      </div>
      <div class="campo">
        <label for="fbairro">Bairro citado</label>
        <ut-bairro inputId="fbairro" placeholder="Qualquer bairro" [value]="f().neighborhood" (committed)="apply({ neighborhood: $event.trim() })" />
      </div>
      <div class="campo">
        <label for="ftipo">Tipo</label>
        <select id="ftipo" class="entrada" (change)="apply({ kind: $any($event.target).value })">
          <option value="" [selected]="!f().kind">Todos</option>
          <option value="oficial" [selected]="f().kind === 'oficial'">Oficiais</option>
          <option value="comunidade" [selected]="f().kind === 'comunidade'">Criados por pessoas</option>
        </select>
      </div>
      <div class="campo">
        <label for="fordem">Ordenar</label>
        <select id="fordem" class="entrada" (change)="apply({ sort: $any($event.target).value })">
          <option value="atividade" [selected]="f().sort === 'atividade'">Atividade recente</option>
          <option value="populares" [selected]="f().sort === 'populares'">Mais participantes</option>
          <option value="novos" [selected]="f().sort === 'novos'">Mais novos</option>
          <option value="nome" [selected]="f().sort === 'nome'">Nome (A–Z)</option>
        </select>
      </div>
      @if (session.user()) {
        <label class="check"><input type="checkbox" [checked]="f().following" (change)="apply({ following: $any($event.target).checked })" />Só os que sigo</label>
      }
      @if (hasFilters()) { <button type="button" class="btn btn-texto" (click)="clear()">Limpar</button> }
    </form>

    @if (mine().length && !hasFilters()) {
      <section class="meus" aria-labelledby="meus-t">
        <h2 id="meus-t" class="secao">Nos seus bairros de interesse</h2>
        <ul class="grade">@for (x of mine(); track x.id) { <li><ut-forum-card [forum]="x" /></li> }</ul>
      </section>
    }

    @if (error(); as e) {
      <ut-erro [message]="e" (retry)="load()" />
    } @else if (data(); as d) {
      <div class="topo-lista">
        <h2 class="secao">{{ hasFilters() ? 'Resultado' : 'Todos os fóruns' }} <span class="muted tabular">({{ total(d) }})</span></h2>
        @if (!session.user()) { <p class="dica"><a routerLink="/entrar" [queryParams]="{ volta: '/comunidade/foruns' }">Entre</a> para seguir fóruns, abrir discussões ou criar um fórum.</p> }
      </div>
      @if (d.items.length === 0) {
        <ut-vazio icon="users" [title]="hasFilters() ? 'Nenhum fórum com esses filtros' : 'Ainda não há fóruns'" [text]="hasFilters() ? 'Tente outra palavra ou tire algum filtro. Se o assunto ainda não tem espaço, você pode criar um fórum para ele.' : 'Comece um espaço para o assunto que importa para você.'">
          @if (session.user()) { <a routerLink="/comunidade/foruns/novo" class="btn btn-primario"><ut-icon name="plus" [size]="18" />Criar fórum</a> }
          @if (hasFilters()) { <button type="button" class="btn btn-secundario" (click)="clear()">Limpar filtros</button> }
        </ut-vazio>
      } @else {
        <ul class="grade">@for (x of d.items; track x.id) { <li><ut-forum-card [forum]="x" /></li> }</ul>
        <ut-paginacao [page]="d.page" [totalPages]="d.totalPages" (go)="load($event)" />
      }
      @if (session.user() && d.items.length > 0) {
        <p class="convite">Não achou o assunto? <a routerLink="/comunidade/foruns/novo">Crie um fórum</a> e convide quem se importa com ele.</p>
      }
    } @else {
      <p class="carregando">Carregando fóruns…</p>
    }
  `,
  styles: `
    :host { display: block; }
    .filtros { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: flex-end; margin-bottom: var(--s-5); }
    .campo { flex: 1 1 160px; max-width: 220px; }
    .busca { flex: 2 1 240px; max-width: 340px; }
    .busca-wrap { position: relative; }
    .busca-wrap ut-icon { position: absolute; left: 11px; top: 13px; color: var(--texto-3); pointer-events: none; }
    .busca-wrap .entrada { padding-left: 36px; }
    .check { display: inline-flex; gap: 8px; align-items: center; min-height: 44px; font-weight: 500; }
    .secao { font-size: var(--t-lg); margin-bottom: var(--s-3); }
    .meus { margin-bottom: var(--s-6); }
    .topo-lista { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); flex-wrap: wrap; }
    .grade { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: var(--s-3); }
    .dica { font-size: var(--t-sm); color: var(--texto-2); }
    .convite { margin-top: var(--s-5); color: var(--texto-2); }
    @media (max-width: 640px) {
      .campo, .busca { max-width: none; flex: 1 1 calc(50% - var(--s-3)); }
      .busca { flex-basis: 100%; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumsPage implements OnInit {
  private part = inject(ParticipationApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  session = inject(SessionStore);

  f = signal<ForumFilters>(EMPTY);
  draftQ = signal('');
  data = signal<ForumPage | null>(null);
  themes = signal<ForumTheme[]>([]);
  mine = signal<Forum[]>([]);
  error = signal<string | null>(null);
  hasFilters = computed(() => {
    const f = this.f();
    return Boolean(f.q || f.theme || f.neighborhood || f.kind || f.following);
  });
  total = (d: ForumPage) => plural(d.total, 'fórum', 'fóruns');

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const kind = q.get('tipo');
    this.f.set({
      q: q.get('q') ?? '',
      theme: q.get('tema') ?? '',
      neighborhood: q.get('bairro') ?? '',
      kind: kind === 'oficial' || kind === 'comunidade' ? kind : '',
      following: q.get('seguindo') === '1',
      sort: (['atividade', 'populares', 'novos', 'nome'].includes(q.get('ordem') ?? '') ? q.get('ordem') : 'atividade') as ForumSort,
    });
    this.draftQ.set(this.f().q);
    this.load(Number(q.get('pagina')) || 1);
    this.loadMine();
  }

  apply(p: Partial<ForumFilters>) {
    const next = { ...this.f(), ...p };
    if (JSON.stringify(next) === JSON.stringify(this.f())) return;
    this.f.set(next);
    this.load(1);
  }

  clear() {
    this.draftQ.set('');
    this.f.set({ ...EMPTY, sort: this.f().sort });
    this.load(1);
  }

  load(page = 1) {
    const f = this.f();
    this.error.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { q: f.q || null, tema: f.theme || null, bairro: f.neighborhood || null, tipo: f.kind || null, seguindo: f.following ? '1' : null, ordem: f.sort !== 'atividade' ? f.sort : null, pagina: page > 1 ? page : null },
    });
    this.part.forums({ q: f.q || null, theme: f.theme || null, neighborhood: f.neighborhood || null, kind: f.kind || null, following: f.following ? '1' : null, sort: f.sort, page }).subscribe({
      next: (d) => {
        this.data.set(d);
        if (!this.themes().length) this.themes.set(d.themes);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }

  // fóruns que citam os bairros de interesse (escolha privada, feita no perfil)
  private loadMine() {
    if (!this.session.user()) return;
    this.part.interests().subscribe({
      next: (r) => {
        const names = r.neighborhoods.slice(0, 5);
        if (!names.length) return;
        forkJoin(names.map((n) => this.part.forums({ neighborhood: n, pageSize: 6 }))).subscribe({
          next: (pages) => {
            const seen = new Set<number>();
            const all = pages.flatMap((p) => p.items).filter((x) => !seen.has(x.id) && seen.add(x.id));
            this.mine.set(all.slice(0, 6));
          },
          error: () => this.mine.set([]),
        });
      },
      error: () => this.mine.set([]),
    });
  }

}
