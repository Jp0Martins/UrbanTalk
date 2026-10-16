import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { toApiError } from '../core/api-error';
import { MAX_PHOTO_MB, PHOTO_TYPES, Scope, parseOccurrenceCode } from '../core/models';
import { ParticipationApi } from '../core/participation.api';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { VoteExplainerComponent } from '../shared/vote-explainer.component';
import { NeighborhoodInputComponent } from '../shared/neighborhood-input.component';

const MAX_IMAGES = 3;

@Component({
  selector: 'ut-nova-proposta',
  imports: [AsyncPipe, RouterLink, IconComponent, PageHeaderComponent, VoteExplainerComponent, NeighborhoodInputComponent],
  template: `
    <div class="pagina estreita">
      <nav class="trilha" aria-label="Você está em"><a routerLink="/propostas">Ideias e propostas</a><span aria-hidden="true" class="sep"> › </span>Nova proposta</nav>
      <ut-cabecalho-pagina title="Nova proposta" description="Descreva o problema que a ideia resolve, onde ela se aplica e como imagina a solução." />
      <ut-explica-voto />

      <form class="painel form" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="campo">
          <label for="pr-titulo">Título</label>
          <input id="pr-titulo" class="entrada" maxlength="120" placeholder="Ex.: Faixa elevada na saída da escola da Rua Tal" [value]="title()" (input)="title.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['title']" aria-describedby="pr-titulo-d" />
          <span class="dica" id="pr-titulo-d">{{ title().length }}/120. Diga o que muda, de forma direta.</span>
          @if (fields()['title']) { <span class="erro">{{ fields()['title'] }}</span> }
        </div>
        <div class="campo">
          <label for="pr-texto">Descrição</label>
          <textarea id="pr-texto" class="entrada" rows="8" maxlength="4000" [value]="body()" (input)="body.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['body']" aria-describedby="pr-texto-d"></textarea>
          <span class="dica" id="pr-texto-d">Pelo menos 30 caracteres. Sugestão: qual é o problema hoje, quem é afetado e o que você propõe.</span>
          @if (fields()['body']) { <span class="erro">{{ fields()['body'] }}</span> }
        </div>
        <div class="duas">
          <div class="campo">
            <label for="pr-cat">Categoria (opcional)</label>
            <select id="pr-cat" class="entrada" (change)="categoryId.set($any($event.target).value)">
              <option value="">Sem categoria</option>
              @for (c of api.categories$ | async; track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
            @if (fields()['categoryId']) { <span class="erro">{{ fields()['categoryId'] }}</span> }
          </div>
          <div class="campo">
            <label for="pr-onde">Onde se aplica?</label>
            <select id="pr-onde" class="entrada" (change)="setScope($any($event.target).value)">
              <option value="cidade" [selected]="scope() === 'cidade'">Cidade toda</option>
              <option value="bairro" [selected]="scope() === 'bairro'">Bairro</option>
            </select>
          </div>
        </div>
        @if (scope() === 'bairro') {
          <div class="campo bairro">
            <label for="pr-bairro">Nome do bairro</label>
            <ut-bairro inputId="pr-bairro" [required]="true" [invalid]="!!fields()['neighborhoodName']" [value]="neighborhoodName()" (valueChange)="neighborhoodName.set($event)" />
            <span class="dica">Escreva como você conhece o bairro; nomes novos são aceitos.</span>
            @if (fields()['neighborhoodName']) { <span class="erro">{{ fields()['neighborhoodName'] }}</span> }
          </div>
        }

        <fieldset class="campo grupo">
          <legend class="rotulo">Imagens ou referências (opcional)</legend>
          <span class="dica">Até {{ maxImages }} fotos (JPG, PNG ou WebP, até {{ maxMb }} MB cada). Os dados de localização das fotos são removidos ao salvar.</span>
          @if (previews().length) {
            <ul class="previas">
              @for (p of previews(); track p.url; let i = $index) {
                <li><img [src]="p.url" [alt]="'Imagem ' + (i + 1)" /><button type="button" class="btn btn-texto btn-sm" (click)="removeImage(i)">Remover<span class="sr-only"> imagem {{ i + 1 }}</span></button></li>
              }
            </ul>
          }
          @if (previews().length < maxImages) {
            <label class="btn btn-secundario btn-sm arquivo"><ut-icon name="camera" [size]="16" />Adicionar foto<input type="file" accept="image/jpeg,image/png,image/webp" multiple (change)="addImages($any($event.target))" class="sr-only" /></label>
          }
          @if (imageError()) { <span class="erro">{{ imageError() }}</span> }
          @if (fields()['images']) { <span class="erro">{{ fields()['images'] }}</span> }
          <label for="pr-link" class="rotulo link-rot">Link de referência</label>
          <input id="pr-link" class="entrada" type="url" maxlength="300" placeholder="https://…" [value]="link()" (input)="link.set($any($event.target).value)" [attr.aria-invalid]="!!fields()['referenceUrl']" />
          @if (fields()['referenceUrl']) { <span class="erro">{{ fields()['referenceUrl'] }}</span> }
        </fieldset>

        <div class="campo">
          <label for="pr-occ">Reclamações relacionadas (opcional)</label>
          <input id="pr-occ" class="entrada" placeholder="Ex.: UT-00012, UT-00031" [value]="codes()" (input)="codes.set($any($event.target).value)" [attr.aria-invalid]="!!codesError() || !!fields()['occurrenceIds']" />
          <span class="dica">Códigos de reclamações do mapa que mostram o problema. Separe por vírgula.</span>
          @if (codesError()) { <span class="erro">{{ codesError() }}</span> }
          @if (fields()['occurrenceIds']) { <span class="erro">{{ fields()['occurrenceIds'] }}</span> }
        </div>

        @if (formError()) { <p class="aviso aviso-erro" role="alert"><ut-icon name="alert" />{{ formError() }}</p> }
        <div class="acoes">
          <a class="btn btn-secundario" routerLink="/propostas">Cancelar</a>
          <button type="submit" class="btn btn-primario" [disabled]="saving()">{{ saving() ? 'Publicando…' : 'Publicar proposta' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .estreita { max-width: 820px; }
    .trilha { font-size: var(--t-sm); color: var(--texto-2); margin-bottom: var(--s-4); }
    .sep { white-space: pre; }
    ut-explica-voto { display: block; margin-bottom: var(--s-4); }
    .form { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-5); }
    .duas { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
    .grupo { border: 0; padding: 0; margin: 0; }
    .previas { list-style: none; margin: 0; padding: 0; display: flex; gap: var(--s-3); flex-wrap: wrap; }
    .previas li { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .previas img { width: 140px; height: 105px; object-fit: cover; border-radius: var(--r-1); border: 1px solid var(--linha); }
    .arquivo { align-self: flex-start; cursor: pointer; }
    .link-rot { margin-top: var(--s-3); }
    .erro { color: var(--perigo); font-size: var(--t-sm); }
    .acoes { display: flex; justify-content: flex-end; gap: var(--s-2); }
    @media (max-width: 640px) { .duas { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalFormPage implements OnInit {
  api = inject(ApiService);
  private part = inject(ParticipationApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  maxImages = MAX_IMAGES;
  maxMb = MAX_PHOTO_MB;
  title = signal('');
  body = signal('');
  categoryId = signal('');
  scope = signal<Scope>('cidade');
  neighborhoodName = signal('');
  link = signal('');
  codes = signal('');
  images = signal<File[]>([]);
  previews = computed(() => this.images().map((f) => ({ url: this.urlFor(f) })));
  imageError = signal<string | null>(null);
  codesError = signal<string | null>(null);
  fields = signal<Record<string, string>>({});
  formError = signal<string | null>(null);
  saving = signal(false);
  private urls = new Map<File, string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.urls.forEach((u) => URL.revokeObjectURL(u)));
  }

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const occ = Number(q.get('ocorrencia'));
    if (Number.isInteger(occ) && occ > 0) this.codes.set(`UT-${String(occ).padStart(5, '0')}`);
    const bairro = q.get('bairro');
    if (bairro) {
      this.scope.set('bairro');
      this.neighborhoodName.set(bairro.slice(0, 80));
    }
  }

  setScope(v: string) {
    this.scope.set(v === 'bairro' ? 'bairro' : 'cidade');
    if (v !== 'bairro') this.neighborhoodName.set('');
  }

  private urlFor(f: File) {
    let u = this.urls.get(f);
    if (!u) {
      u = URL.createObjectURL(f);
      this.urls.set(f, u);
    }
    return u;
  }

  addImages(input: HTMLInputElement) {
    this.imageError.set(null);
    const files = Array.from(input.files ?? []);
    input.value = '';
    const ok: File[] = [];
    for (const f of files) {
      if (!PHOTO_TYPES.includes(f.type)) {
        this.imageError.set(`"${f.name}" não é JPG, PNG ou WebP.`);
        continue;
      }
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
        this.imageError.set(`"${f.name}" passa de ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      ok.push(f);
    }
    const all = [...this.images(), ...ok];
    if (all.length > MAX_IMAGES) this.imageError.set(`Use no máximo ${MAX_IMAGES} fotos.`);
    this.images.set(all.slice(0, MAX_IMAGES));
  }

  removeImage(i: number) {
    const f = this.images()[i];
    const u = this.urls.get(f);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(f);
    this.images.set(this.images().filter((_, j) => j !== i));
  }

  private parseCodes() {
    const parts = this.codes().split(/[,;\s]+/).filter(Boolean);
    const ids: number[] = [];
    for (const p of parts) {
      const id = parseOccurrenceCode(p);
      if (!id) {
        this.codesError.set(`"${p}" não parece um código válido (ex.: UT-00012).`);
        return null;
      }
      ids.push(id);
    }
    this.codesError.set(null);
    return [...new Set(ids)];
  }

  submit() {
    this.fields.set({});
    this.formError.set(null);
    const ids = this.parseCodes();
    if (ids === null) return;
    // validação básica aqui; a validação definitiva é do servidor
    const local: Record<string, string> = {};
    if (this.title().trim().length < 8) local['title'] = 'O título precisa de pelo menos 8 caracteres.';
    if (this.body().trim().length < 30) local['body'] = 'Escreva pelo menos 30 caracteres.';
    if (this.scope() === 'bairro' && this.neighborhoodName().replace(/[^\p{L}\p{N}]/gu, '').length < 2) local['neighborhoodName'] = 'Digite o nome do bairro ou escolha cidade toda.';
    if (Object.keys(local).length) {
      this.fields.set(local);
      return;
    }
    const fd = new FormData();
    fd.append('title', this.title());
    fd.append('body', this.body());
    fd.append('categoryId', this.categoryId());
    // cidade toda vai sem bairro, mesmo que algo tenha sido digitado antes
    fd.append('neighborhoodName', this.scope() === 'bairro' ? this.neighborhoodName().trim().replace(/\s+/g, ' ') : '');
    fd.append('referenceUrl', this.link().trim());
    fd.append('occurrenceIds', ids.join(','));
    for (const f of this.images()) fd.append('images', f);
    this.saving.set(true);
    this.part.createProposal(fd).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.toast.show('Proposta publicada. Você vai ser avisado sobre comentários e mudanças de fase.');
        this.router.navigate(['/propostas', p.id]);
      },
      error: (e) => {
        this.saving.set(false);
        const err = toApiError(e);
        this.fields.set(err.fields);
        if (!Object.keys(err.fields).length) this.formError.set(err.message);
        else this.formError.set('Revise os campos destacados.');
      },
    });
  }
}
