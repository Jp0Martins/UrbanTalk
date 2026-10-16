import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../core/admin.api';
import { toApiError } from '../core/api-error';
import { DatePipe } from '../core/format';
import { AuditEntry } from '../core/models';
import { PageHeaderComponent } from '../shared/page-header.component';
import { PaginationComponent } from '../shared/pagination.component';
import { EmptyStateComponent, ErrorStateComponent } from '../shared/states';

// nomes legíveis das ações registradas
const ACTIONS: Record<string, string> = {
  'equipe.conceder': 'Concedeu acesso à equipe',
  'equipe.alterar': 'Alterou papel de conta',
  'status.criar': 'Criou status',
  'status.editar': 'Editou status',
  'status.excluir': 'Excluiu status',
  'status.ordenar': 'Reordenou status',
  'ocorrencia.endereco': 'Corrigiu endereço',
  'ocorrencia.atribuir': 'Atribuiu responsável',
  'ocorrencia.prioridade': 'Alterou prioridade',
  'ocorrencia.duplicata': 'Marcou duplicata',
  'ocorrencia.duplicata_desfeita': 'Desfez duplicata',
  'moderacao.publicacao': 'Removeu publicação',
  'moderacao.comentario': 'Removeu comentário do feed',
  'moderacao.comentario_discussao': 'Removeu comentário de discussão',
  'moderacao.topico': 'Removeu discussão',
  'moderacao.ocultar': 'Ocultou conteúdo',
  'moderacao.manter': 'Manteve conteúdo denunciado',
  'moderacao.restaurar': 'Restaurou conteúdo',
  'proposta.status': 'Mudou fase de proposta',
  'proposta_fase.criar': 'Criou fase de proposta',
  'proposta_fase.alterar': 'Editou fase de proposta',
  'categoria.criar': 'Criou categoria',
  'categoria.alterar': 'Editou categoria',
  'forum.criar': 'Criou fórum',
  'forum.alterar': 'Editou fórum',
  'forum.topico_institucional': 'Publicou tópico de apoio',
  'forum.topico_ajuste': 'Fixou ou encerrou discussão',
  'config.priorizacao': 'Alterou pesos da priorização',
  'equipe.terminal': 'Conta da equipe criada pelo terminal',
};

@Component({
  selector: 'ut-auditoria',
  imports: [RouterLink, PageHeaderComponent, PaginationComponent, EmptyStateComponent, ErrorStateComponent, DatePipe],
  template: `
    <div class="pagina">
      <ut-cabecalho-pagina title="Histórico administrativo" description="Ações relevantes da equipe, em ordem da mais recente. O registro não pode ser editado pela interface." />
      <div class="campo filtro">
        <label for="acao">Tipo de ação</label>
        <select id="acao" class="entrada" (change)="action.set($any($event.target).value); load(1)">
          <option value="">Todas</option>
          @for (a of actions(); track a) { <option [value]="a" [selected]="action() === a">{{ label(a) }}</option> }
        </select>
      </div>
      @if (error(); as e) { <ut-erro [message]="e" (retry)="load(page())" /> }
      @else if (items() === null) { <p class="carregando">Carregando…</p> }
      @else if (items()!.length === 0) { <ut-vazio icon="history" title="Nenhuma ação registrada" /> }
      @else {
        <div class="rolagem painel">
          <table class="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Detalhes</th></tr></thead>
            <tbody>
              @for (i of items(); track i.id) {
                <tr>
                  <td class="tabular quando">{{ i.createdAt | data: true }}</td>
                  <td>{{ i.actorName }}</td>
                  <td>{{ label(i.action) }}</td>
                  <td>
                    @if (link(i); as l) { <a [routerLink]="l">{{ target(i) }}</a> } @else { {{ target(i) }} }
                  </td>
                  <td>@if (i.details) { <details><summary>ver</summary><pre>{{ json(i.details) }}</pre></details> }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ut-paginacao [page]="page()" [totalPages]="totalPages()" (go)="load($event)" />
      }
    </div>
  `,
  styles: `
    .filtro { max-width: 320px; margin-bottom: var(--s-4); }
    .rolagem { overflow-x: auto; }
    .quando { white-space: nowrap; }
    pre { white-space: pre-wrap; max-width: 420px; font-size: var(--t-xs); margin: 4px 0 0; background: var(--superficie-2); padding: 6px; border-radius: var(--r-1); }
    summary { cursor: pointer; color: var(--placa); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditPage implements OnInit {
  private api = inject(AdminApi);
  items = signal<AuditEntry[] | null>(null);
  actions = signal<string[]>([]);
  action = signal('');
  page = signal(1);
  totalPages = signal(1);
  error = signal<string | null>(null);

  label = (a: string) => ACTIONS[a] ?? a;
  json = (d: unknown) => JSON.stringify(d, null, 2);
  target(i: AuditEntry) {
    const names: Record<string, string> = { occurrence: 'Reclamação', proposal: 'Proposta', topic: 'Discussão', post: 'Publicação', user: 'Conta', status: 'Status', category: 'Categoria', forum: 'Fórum', settings: 'Configuração', comment: 'Comentário', post_comment: 'Comentário', proposal_status: 'Fase' };
    const n = names[i.targetType] ?? i.targetType;
    if (i.targetType === 'occurrence' && i.targetId) return `UT-${String(i.targetId).padStart(5, '0')}`;
    return i.targetId ? `${n} #${i.targetId}` : n;
  }
  link(i: AuditEntry) {
    if (!i.targetId) return null;
    if (i.targetType === 'occurrence') return `/ocorrencias/${i.targetId}`;
    if (i.targetType === 'proposal') return `/propostas/${i.targetId}`;
    if (i.targetType === 'topic') return `/comunidade/discussoes/${i.targetId}`;
    return null;
  }

  ngOnInit() {
    this.load(1);
  }

  load(page: number) {
    this.items.set(null);
    this.error.set(null);
    this.api.audit(this.action(), page).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.actions.set(r.actions);
        this.page.set(r.page);
        this.totalPages.set(r.totalPages);
      },
      error: (e) => this.error.set(toApiError(e).message),
    });
  }
}
