import { describe, it, expect } from 'vitest';
import { comidasDelDia, cupoDelDia, dietaDelDia, totalItemsDelDia, adherenciaDelDia } from './diaDeDieta';
import type { Diet, DietCompletionLog } from '../types';

const CUPO = { HC: 10, PROT: 8, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 };

const dieta: Diet = {
  id: 'd1',
  athleteId: 'a@b.com',
  name: 'Dieta del coach',
  budget: CUPO,
  meals: [
    { id: 'm1', name: 'Desayuno', items: [
      { category: 'HC', foodLabel: 'Avena', quantity: 2 },
      { category: 'PROT', foodLabel: 'Claras', quantity: 1 },
    ] },
  ],
};

const log = (over: Partial<DietCompletionLog> = {}): DietCompletionLog => ({
  id: 'a@b.com_2026-09-01',
  athleteId: 'a@b.com',
  date: '2026-09-01',
  dietId: 'd1',
  doneItemIds: [],
  ...over,
});

describe('el día manda sobre la dieta', () => {
  it('usa las comidas guardadas en el propio día', () => {
    const l = log({ meals: [{ id: 'x', name: 'Cena', items: [{ category: 'HC', foodLabel: 'Pasta', quantity: 3 }] }] });
    expect(comidasDelDia(l, [dieta])[0].items[0].foodLabel).toBe('Pasta');
  });

  it('editar la dieta NO reescribe un día ya guardado', () => {
    // El fallo que motivó todo esto: el lunes apuntaba a la dieta, el martes se
    // cambiaba el arroz por pasta y el lunes pasaba a decir que comiste pasta.
    const l = log({ meals: [{ id: 'x', name: 'Comida', items: [{ category: 'HC', foodLabel: 'Arroz', quantity: 2 }] }] });
    const dietaEditada: Diet = { ...dieta, meals: [{ id: 'm1', name: 'Comida', items: [{ category: 'HC', foodLabel: 'Pasta', quantity: 2 }] }] };
    expect(comidasDelDia(l, [dietaEditada])[0].items[0].foodLabel).toBe('Arroz');
  });

  it('un día anterior al cambio se sigue leyendo desde su dieta', () => {
    expect(comidasDelDia(log(), [dieta])[0].items).toHaveLength(2);
  });

  it('un día viejo cuya dieta ya no existe no revienta', () => {
    expect(comidasDelDia(log({ dietId: 'borrada' }), [])).toEqual([]);
    expect(totalItemsDelDia(log({ dietId: 'borrada' }), [])).toBe(0);
  });

  it('sin registro no hay comidas ni cupo inventados', () => {
    expect(comidasDelDia(null, [dieta])).toEqual([]);
    expect(cupoDelDia(null, [dieta])).toMatchObject({ HC: 0, PROT: 0, GRASA: 0 });
  });
});

describe('cupoDelDia', () => {
  it('el cupo congelado del día gana al cupo actual de la dieta', () => {
    const otro = { HC: 5, PROT: 5, GRASA: 5, MIX_HC: 0, MIX_GRASA: 0 };
    expect(cupoDelDia(log({ budget: otro }), [dieta])).toMatchObject(otro);
  });

  it('sin cupo congelado, el de la dieta', () => {
    expect(cupoDelDia(log(), [dieta])).toMatchObject(CUPO);
  });
});

describe('adherenciaDelDia', () => {
  it('cuenta sobre los alimentos de ESE día', () => {
    const l = log({
      meals: [{ id: 'x', name: 'Comida', items: [
        { category: 'HC', foodLabel: 'A', quantity: 1 },
        { category: 'HC', foodLabel: 'B', quantity: 1 },
        { category: 'HC', foodLabel: 'C', quantity: 1 },
        { category: 'HC', foodLabel: 'D', quantity: 1 },
      ] }],
      doneItemIds: ['x_0', 'x_1', 'x_2'],
    });
    expect(adherenciaDelDia(l, [])).toBe(75);
  });

  it('un día sin nada planificado es null, no un 0 %', () => {
    // Un día en blanco no es un día incumplido: contarlo como 0 hundía la media
    // de adherencia de quien simplemente no abrió la app.
    expect(adherenciaDelDia(log({ meals: [] }), [])).toBeNull();
  });

  it('nunca pasa del 100 % aunque sobren marcas', () => {
    const l = log({
      meals: [{ id: 'x', name: 'C', items: [{ category: 'HC', foodLabel: 'A', quantity: 1 }] }],
      doneItemIds: ['x_0', 'x_1', 'x_2'],
    });
    expect(adherenciaDelDia(l, [])).toBe(100);
  });
});

describe('dietaDelDia', () => {
  it('devuelve el día vestido de dieta, con sus comidas y su cupo', () => {
    const l = log({ meals: [{ id: 'x', name: 'Cena', items: [] }], budget: CUPO });
    const d = dietaDelDia(l, [dieta]);
    expect(d?.meals[0].name).toBe('Cena');
    expect(d?.budget).toMatchObject(CUPO);
  });

  it('para un día viejo devuelve la dieta original tal cual', () => {
    expect(dietaDelDia(log(), [dieta])).toBe(dieta);
  });
});
