import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import pt from './translations/pt.json';
import en from './translations/en.json';
import autoPt from './translations/auto-pt.json';
import autoEn from './translations/auto-en.json';
import type { StatusDef } from './models';

const defaultStatuses: Record<string, { ptName: string; enName: string; ptDescription: string; enDescription: string }> = {
  registrada: { ptName: 'Registrada', enName: 'Reported', ptDescription: 'Recebida pelo UrbanTalk e visível no mapa. Ainda não foi incluída em um relatório.', enDescription: 'Received by UrbanTalk and visible on the map. It has not yet been included in a report.' },
  encaminhada: { ptName: 'Encaminhada', enName: 'Forwarded', ptDescription: 'Incluída em um relatório que a equipe enviou manualmente ao órgão responsável.', enDescription: 'Included in a report that the team manually sent to the responsible authority.' },
  resolvida: { ptName: 'Resolvida', enName: 'Resolved', ptDescription: 'A equipe conferiu que o problema foi solucionado.', enDescription: 'The team checked that the problem was resolved.' },
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private translate = inject(TranslateService);
  language = signal<'pt' | 'en'>('pt');

  constructor() {
    this.translate.setTranslation('pt', { ...pt, auto: autoPt });
    this.translate.setTranslation('en', { ...en, auto: autoEn });
    let saved: string | null = null;
    try { saved = localStorage.getItem('urbantalk-language'); } catch { /* storage may be disabled */ }
    this.set(saved === 'en' ? 'en' : 'pt');
  }

  set(language: 'pt' | 'en') {
    this.language.set(language);
    this.translate.use(language);
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
    try { localStorage.setItem('urbantalk-language', language); } catch { /* keep the in-memory choice */ }
  }

  statusName(status: StatusDef) {
    const known = defaultStatuses[status.slug];
    return this.language() === 'en' && known?.ptName === status.name ? known.enName : status.name;
  }

  statusDescription(status: StatusDef) {
    const known = defaultStatuses[status.slug];
    return this.language() === 'en' && known?.ptDescription === status.description ? known.enDescription : status.description;
  }
}
