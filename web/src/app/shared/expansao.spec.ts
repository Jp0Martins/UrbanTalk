import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OccurrenceDetail, TimelineItem, parseOccurrenceCode } from '../core/models';
import { OccurrenceTimelineComponent } from './occurrence-timeline.component';
import { ResolutionPanelComponent } from './resolution-panel.component';

const item = (p: Partial<TimelineItem>): TimelineItem => ({
  key: 'x', kind: 'status', at: '2026-10-10T12:00:00.000Z', actor: 'equipe', actorName: null, visibility: 'publica', title: 'Título', body: null, data: null, ...p,
});

describe('parseOccurrenceCode', () => {
  it('aceita UT-00012, ut12 e 12, e recusa texto qualquer', () => {
    expect(parseOccurrenceCode('UT-00012')).toBe(12);
    expect(parseOccurrenceCode(' ut12 ')).toBe(12);
    expect(parseOccurrenceCode('12')).toBe(12);
    expect(parseOccurrenceCode('buraco')).toBeNull();
  });
});

describe('OccurrenceTimelineComponent', () => {
  it('marca notas internas e conteúdo visível só ao autor', async () => {
    const fixture = TestBed.createComponent(OccurrenceTimelineComponent);
    fixture.componentRef.setInput('items', [
      item({ key: 'n1', kind: 'nota_interna', visibility: 'interna', title: 'Nota interna', body: 'ligar para a regional', actorName: 'Diego' }),
      item({ key: 'r1', kind: 'pedido_info', visibility: 'autor', title: 'A equipe pediu mais informações' }),
      item({ key: 'e1', kind: 'evidencia', title: 'Evidência', data: { photos: ['/api/photos/a.jpg'] } }),
    ]);
    fixture.componentRef.setInput('staffView', true);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.k-nota_interna .selo-texto.interna')?.textContent).toContain('Interna');
    expect(el.textContent).toContain('Visível para quem registrou');
    expect(el.textContent).toContain('por Diego');
    expect(el.querySelectorAll('.fotos img').length).toBe(1);
  });
});

describe('ResolutionPanelComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] }));

  it('mostra os três níveis separados, sem tratar foto como verificação', async () => {
    const occ = {
      id: 1, reviewRequested: false, previousResolutions: 0,
      resolution: {
        id: 1, status: 'resolvida', description: 'Tapa-buraco feito.', createdAt: '2026-10-10T12:00:00.000Z', resolvedBy: null,
        evidence: { antes: [], depois: [{ id: 1, url: '/api/photos/a.jpg', caption: null, createdAt: '2026-10-10T12:00:00.000Z' }] },
        levels: { informada: true, comEvidencias: true, confirmadaPelaComunidade: false },
        feedback: { resolvido: 1, persiste: 0, mine: null, comments: [] },
        canGiveFeedback: false,
      },
    } as unknown as OccurrenceDetail;
    const fixture = TestBed.createComponent(ResolutionPanelComponent);
    fixture.componentRef.setInput('occ', occ);
    await fixture.whenStable();
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.niveis li');
    expect(items.length).toBe(3);
    expect(items[1].textContent).toContain('não são uma verificação independente');
    expect(items[2].classList.contains('ok')).toBe(false);
    expect(items[2].textContent).toContain('Ainda sem confirmação da comunidade');
  });
});
