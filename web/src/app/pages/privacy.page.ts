import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'ut-privacidade',
  imports: [RouterLink, TranslatePipe],
  template: `
    <article class="politica">
      <a routerLink="/" class="voltar">← {{ 'privacy.back' | translate }}</a>
      <header>
        <p class="rotulo">UrbanTalk · EcoGestor</p>
        <h1>{{ 'privacy.title' | translate }}</h1>
        <p class="introducao">{{ 'privacy.intro' | translate }}</p>
        <p class="atualizado">{{ 'privacy.updated' | translate }}</p>
      </header>

      <section aria-labelledby="operacao">
        <h2 id="operacao">{{ 'privacy.operatorTitle' | translate }}</h2>
        <p>{{ 'privacy.operatorText' | translate }}</p>
      </section>

      <section aria-labelledby="dados">
        <h2 id="dados">{{ 'privacy.dataTitle' | translate }}</h2>
        <ul>
          <li>{{ 'privacy.dataAccount' | translate }}</li>
          <li>{{ 'privacy.dataIncidents' | translate }}</li>
          <li>{{ 'privacy.dataCommunity' | translate }}</li>
          <li>{{ 'privacy.dataSecurity' | translate }}</li>
        </ul>
      </section>

      <section aria-labelledby="publico">
        <h2 id="publico">{{ 'privacy.publicTitle' | translate }}</h2>
        <p>{{ 'privacy.publicText' | translate }}</p>
        <p>{{ 'privacy.sharingText' | translate }}</p>
      </section>

      <section aria-labelledby="prazo">
        <h2 id="prazo">{{ 'privacy.retentionTitle' | translate }}</h2>
        <p>{{ 'privacy.retentionText' | translate }}</p>
      </section>

      <section aria-labelledby="limites">
        <h2 id="limites">{{ 'privacy.limitsTitle' | translate }}</h2>
        <p>{{ 'privacy.limitsText' | translate }}</p>
      </section>

      <section aria-labelledby="direitos">
        <h2 id="direitos">{{ 'privacy.rightsTitle' | translate }}</h2>
        <p>{{ 'privacy.rightsText' | translate }}</p>
        <p>{{ 'privacy.requestsText' | translate }}</p>
        <a class="btn btn-primario" href="https://wa.me/5511973389410?text=Ol%C3%A1%2C%20equipe%20UrbanTalk!%20Quero%20falar%20sobre%20meus%20dados." target="_blank" rel="noopener noreferrer">{{ 'privacy.requestButton' | translate }}</a>
      </section>

      <section aria-labelledby="seguranca">
        <h2 id="seguranca">{{ 'privacy.securityTitle' | translate }}</h2>
        <p>{{ 'privacy.securityText' | translate }}</p>
        <p>{{ 'privacy.responsibilityText' | translate }}</p>
      </section>

      <section aria-labelledby="fontes">
        <h2 id="fontes">{{ 'privacy.sourcesTitle' | translate }}</h2>
        <p>{{ 'privacy.sourcesText' | translate }}</p>
        <ul>
          <li><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" target="_blank" rel="noopener noreferrer">{{ 'privacy.lgpdLink' | translate }}</a></li>
          <li><a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares" target="_blank" rel="noopener noreferrer">{{ 'privacy.anpdLink' | translate }}</a></li>
        </ul>
      </section>
    </article>
  `,
  styles: `
    :host { display: block; background: var(--superficie); min-height: 100%; }
    .politica { max-width: 880px; margin: 0 auto; padding: var(--s-6) var(--s-5) var(--s-7); }
    .voltar { display: inline-block; margin-bottom: var(--s-5); }
    header { padding-bottom: var(--s-5); border-bottom: 1px solid var(--linha); }
    .rotulo, .atualizado { color: var(--texto-2); font-size: var(--t-sm); }
    h1 { margin: var(--s-2) 0 var(--s-3); font-size: var(--t-3xl); }
    .introducao { font-size: var(--t-lg); max-width: 65ch; }
    .atualizado { margin-top: var(--s-4); }
    section { padding-top: var(--s-5); }
    h2 { margin-bottom: var(--s-3); font-size: var(--t-xl); }
    p, li { line-height: 1.65; }
    p + p, ul + p { margin-top: var(--s-3); }
    ul { padding-left: var(--s-5); }
    li + li { margin-top: var(--s-2); }
    .btn { margin-top: var(--s-4); }
    @media (max-width: 640px) { .politica { padding: var(--s-5) var(--s-4) var(--s-7); } h1 { font-size: var(--t-2xl); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {}
