import { describe, it, expect } from 'vitest';
import type { Exercise } from '../types';
import { atributosFiltrables } from './atributosEjercicio';

const ej = (p: Partial<Exercise>) => ({ id: 'x', ownerId: 'c', name: 'n', primaryFocus: '', type: 'fuerza', isCustom: false, ...p } as Exercise);

describe('atributosFiltrables', () => {
  it('sin ejercicios no ofrece ningún filtro', () => {
    expect(atributosFiltrables([])).toEqual({ equipment: false, lateralidad: false, goma: false, guiado: false });
  });
  it('con casi ningún dato, tampoco', () => {
    const lista = [ej({ equipment: ['polea'] }), ...Array.from({ length: 19 }, () => ej({}))];
    expect(atributosFiltrables(lista).equipment).toBe(false);
  });
  it('con el 90 % o más, sí', () => {
    const lista = [...Array.from({ length: 9 }, () => ej({ lateralidad: 'bi', goma: false })), ej({})];
    const r = atributosFiltrables(lista);
    expect(r.lateralidad).toBe(true);
    expect(r.goma).toBe(true);
    expect(r.guiado).toBe(false);
  });
  it('los descartados no cuentan', () => {
    const lista = [ej({ lateralidad: 'uni' }), ej({ descartado: true }), ej({ descartado: true })];
    expect(atributosFiltrables(lista).lateralidad).toBe(true);
  });
});
