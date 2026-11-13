import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { LanguageService } from './i18n';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.removeItem('urbantalk-language');
    TestBed.configureTestingModule({ providers: [provideTranslateService({ fallbackLang: 'pt', lang: 'pt' })] });
  });

  it('switches text and the document language, then remembers the choice', () => {
    const language = TestBed.inject(LanguageService);
    const translate = TestBed.inject(TranslateService);
    expect(translate.instant('nav.map')).toBe('Mapa de ocorrências');
    language.set('en');
    expect(translate.instant('nav.map')).toBe('Incident map');
    expect(language.statusName({ slug: 'registrada', name: 'Registrada', description: '', id: 1, color: 'ambar', isClosed: false, isInitial: true, active: true, sortOrder: 1 })).toBe('Reported');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('urbantalk-language')).toBe('en');
    language.set('pt');
  });
});
