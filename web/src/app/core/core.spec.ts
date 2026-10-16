import { HttpErrorResponse } from '@angular/common/http';
import { toApiError } from './api-error';
import { toParams } from './api.service';
import { TestBed } from '@angular/core/testing';
import { addDays, avatarTone, formatDay, relativeTime } from './format';
import { addressLine, categoryLabel, insideSorocaba, isStaffRole, placeKey } from './models';
import { splitTags } from '../pages/forum.page';
import { StatusCatalog } from './status-catalog';

describe('toParams', () => {
  it('ignora filtros vazios e mantém os preenchidos', () => {
    const p = toParams({ category: 2, neighborhood: null, status: 'registrada', q: '', page: 1 });
    expect(p.keys().sort()).toEqual(['category', 'page', 'status']);
    expect(p.get('category')).toBe('2');
  });
});

describe('toApiError', () => {
  it('lê mensagem e campos do formato de erro da API', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: { error: { code: 'invalid_request', message: 'Revise os campos.', fields: { email: 'E-mail inválido.' } } },
    });
    expect(toApiError(err)).toEqual({ status: 400, code: 'invalid_request', message: 'Revise os campos.', fields: { email: 'E-mail inválido.' } });
  });

  it('explica falha de conexão sem inventar dados', () => {
    const e = toApiError(new HttpErrorResponse({ status: 0 }));
    expect(e.code).toBe('offline');
    expect(e.message).toMatch(/servidor/);
  });
});

describe('datas', () => {
  it('formata dia local e soma dias', () => {
    expect(formatDay('2026-10-05')).toBe('05/10/2026');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('descreve tempo relativo', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(relativeTime('2026-10-14T11:30:00Z', now)).toBe('há 30 min');
    expect(relativeTime('2026-10-13T11:00:00Z', now)).toBe('ontem');
    expect(relativeTime('2026-10-09T12:00:00Z', now)).toBe('há 5 dias');
  });
});

describe('insideSorocaba', () => {
  it('aceita o centro de Sorocaba e recusa São Paulo capital', () => {
    expect(insideSorocaba(-23.5015, -47.4583)).toBe(true);
    expect(insideSorocaba(-23.5505, -46.6333)).toBe(false);
  });
});

describe('endereço e categoria', () => {
  it('mostra rua e bairro sem confundir com coordenadas', () => {
    expect(addressLine({ street: 'Rua da Penha', neighborhood: { name: 'Centro' } })).toBe('Rua da Penha, Centro');
    expect(addressLine({ street: null, neighborhood: { name: 'Centro' } })).toBe('Centro');
    // reclamação da cidade toda não tem bairro
    expect(addressLine({ street: null, neighborhood: null })).toBe('Cidade toda');
  });

  it('normaliza bairro como o servidor: sem acento, sem caixa, sem espaços extras', () => {
    expect(placeKey('  Jardim   São Conrado ')).toBe('jardim sao conrado');
    expect(placeKey('JARDIM SAO CONRADO')).toBe(placeKey('jardim são conrado'));
    expect(placeKey('Jardim Ipê')).not.toBe(placeKey('Jardim Ipanema'));
    expect(placeKey('Éden')).toBe('eden');
  });

  it('separa tags por vírgula ou espaço, sem repetir', () => {
    expect(splitTags('Bike, #ciclovia  bike,,')).toEqual(['bike', 'ciclovia']);
  });

  it('junta "Outros" com a especificação digitada', () => {
    expect(categoryLabel({ category: { name: 'Outros' }, categoryDetail: 'Árvore caída' })).toBe('Outros: Árvore caída');
    expect(categoryLabel({ category: { name: 'Buraco na via' }, categoryDetail: null })).toBe('Buraco na via');
  });
});

describe('perfis', () => {
  it('reconhece funcionário e administrador como equipe', () => {
    expect(isStaffRole('staff')).toBe(true);
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('user')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });

  it('tom do avatar é estável por nome', () => {
    expect(avatarTone('Ana R.')).toBe(avatarTone('Ana R.'));
    expect(['1', '2', '3', '4', '5']).toContain(avatarTone('Beatriz L.'));
  });
});

describe('StatusCatalog', () => {
  it('escolhe a forma do ícone pelo tipo de status', () => {
    const c = TestBed.inject(StatusCatalog);
    c.set([
      { id: 1, slug: 'registrada', name: 'Registrada', description: '', color: 'ambar', isClosed: false, isInitial: true, active: true, sortOrder: 1 },
      { id: 2, slug: 'em-analise', name: 'Em análise', description: '', color: 'violeta', isClosed: false, isInitial: false, active: true, sortOrder: 2 },
      { id: 3, slug: 'resolvida', name: 'Resolvida', description: '', color: 'verde', isClosed: true, isInitial: false, active: true, sortOrder: 3 },
      { id: 4, slug: 'cancelada', name: 'Cancelada', description: '', color: 'vermelho', isClosed: true, isInitial: false, active: false, sortOrder: 4 },
    ]);
    expect(c.icon('registrada')).toBe('status-registrada');
    expect(c.icon('em-analise')).toBe('status-encaminhada');
    expect(c.icon('resolvida')).toBe('status-resolvida');
    expect(c.icon('cancelada')).toBe('status-encerrada');
    expect(c.active().map((s) => s.slug)).toEqual(['registrada', 'em-analise', 'resolvida']);
    // desativado continua com nome certo para o histórico
    expect(c.name('cancelada')).toBe('Cancelada');
  });
});
