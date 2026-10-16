import { TestBed } from '@angular/core/testing';
import { StatusCatalog } from '../core/status-catalog';
import { StatusBadgeComponent } from './badges';
import { BarListComponent } from './charts';

describe('StatusBadgeComponent', () => {
  it('mostra o nome configurado em texto, com a cor do status', async () => {
    TestBed.inject(StatusCatalog).set([
      { id: 1, slug: 'em-analise', name: 'Em análise', description: 'Avaliando.', color: 'violeta', isClosed: false, isInitial: false, active: true, sortOrder: 1 },
    ]);
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'em-analise');
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent?.trim()).toBe('Em análise');
    expect(el.querySelector('[data-color="violeta"]')).not.toBeNull();
  });

  it('status desconhecido ainda aparece com texto legível', async () => {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'aguardando-execucao');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('Aguardando execucao');
  });
});

describe('BarListComponent', () => {
  it('calcula percentuais sobre o total e limita os itens visíveis', async () => {
    const fixture = TestBed.createComponent(BarListComponent);
    fixture.componentRef.setInput('items', [
      { label: 'Centro', value: 6 },
      { label: 'Campolim', value: 3 },
      { label: 'Éden', value: 1 },
    ]);
    fixture.componentRef.setInput('limit', 2);
    await fixture.whenStable();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.pct')?.textContent).toBe('60%');
    expect((fixture.nativeElement as HTMLElement).querySelector('.mais')?.textContent).toContain('Mostrar mais 1');
  });

  it('mostra aviso quando não há dados', async () => {
    const fixture = TestBed.createComponent(BarListComponent);
    fixture.componentRef.setInput('items', []);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem registros');
  });
});

describe('saudacao', () => {
  it('muda conforme a hora do dia', async () => {
    const { saudacao } = await import('../pages/dashboard.page');
    expect(saudacao(8)).toBe('Bom dia');
    expect(saudacao(14)).toBe('Boa tarde');
    expect(saudacao(21)).toBe('Boa noite');
    expect(saudacao(2)).toBe('Boa noite');
  });
});
