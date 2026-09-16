import { describe, it, expect } from 'vitest';
import {
  comidasDelDia, cupoDelDia, dietaDelDia, totalItemsDelDia, adherenciaDelDia,
  adherenciaPorIntercambios, enObjetivo,
} from './diaDeDieta';
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

describe('adherenciaPorIntercambios', () => {
  /** Un día con cupo 10/5/4 y comidas que suman exactamente eso. */
  const diaTipo = (marcados: string[]): DietCompletionLog => ({
    id: 'l', athleteId: 'a@x.com', date: '2026-09-16', dietId: 'd1',
    doneItemIds: marcados,
    budget: { HC: 10, PROT: 5, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{
      id: 'm1', name: 'Comida', items: [
        { category: 'HC', foodLabel: '30g arroz', quantity: 10 },
        { category: 'PROT', foodLabel: '100g pollo', quantity: 5 },
        { category: 'GRASA', foodLabel: '11g aceite', quantity: 4 },
      ],
    }],
  } as DietCompletionLog);

  it('se lo come todo: 100 %', () => {
    const a = adherenciaPorIntercambios(diaTipo(['m1_0', 'm1_1', 'm1_2']), [])!;
    expect(a.pct).toBe(100);
    expect(enObjetivo(a)).toBe(true);
  });

  it('mide COMIDA, no líneas: dejarse el aceite no es dejarse un tercio del día', () => {
    // Por líneas sería 2/3 = 66,7 %. En intercambios, 15 de 19 = 78,9 %.
    const a = adherenciaPorIntercambios(diaTipo(['m1_0', 'm1_1']), [])!;
    expect(a.pct).toBe(78.9);
    expect(adherenciaDelDia(diaTipo(['m1_0', 'm1_1']), [])).toBeCloseTo(66.7, 0);
  });

  it('pasarse NO se recorta a 100: comer de más es un dato', () => {
    const pasado = {
      ...diaTipo(['m1_0']),
      budget: { HC: 5, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    } as DietCompletionLog;
    const a = adherenciaPorIntercambios(pasado, [])!;
    expect(a.pct).toBe(200);
    expect(enObjetivo(a)).toBe(false);
  });

  it('sin cupo no hay nada que cumplir: null', () => {
    const sinCupo = {
      ...diaTipo(['m1_0']),
      budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    } as DietCompletionLog;
    expect(adherenciaPorIntercambios(sinCupo, [])).toBeNull();
  });

  it('nada marcado es 0 %, no null: un día sin comer nada de lo pautado es un dato', () => {
    expect(adherenciaPorIntercambios(diaTipo([]), [])!.pct).toBe(0);
  });

  it('los mixtos se reparten entre sus dos categorías, en el cupo y en lo comido', () => {
    const conMix = {
      id: 'l', athleteId: 'a@x.com', date: '2026-09-16', dietId: 'd1',
      doneItemIds: ['m1_0'],
      budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 2, MIX_GRASA: 0 },
      meals: [{ id: 'm1', name: 'X', items: [{ category: 'MIX_HC', foodLabel: '200g yogur', quantity: 2 }] }],
    } as DietCompletionLog;
    const a = adherenciaPorIntercambios(conMix, [])!;
    expect(a.cupo).toEqual({ HC: 1, PROT: 1, GRASA: 0 });
    expect(a.comidos).toEqual({ HC: 1, PROT: 1, GRASA: 0 });
    expect(a.pct).toBe(100);
  });

  it('la banda de «en objetivo» es simétrica', () => {
    expect(enObjetivo({ pct: 90, comidos: { HC: 0, PROT: 0, GRASA: 0 }, cupo: { HC: 1, PROT: 0, GRASA: 0 } })).toBe(true);
    expect(enObjetivo({ pct: 110, comidos: { HC: 0, PROT: 0, GRASA: 0 }, cupo: { HC: 1, PROT: 0, GRASA: 0 } })).toBe(true);
    expect(enObjetivo({ pct: 89, comidos: { HC: 0, PROT: 0, GRASA: 0 }, cupo: { HC: 1, PROT: 0, GRASA: 0 } })).toBe(false);
  });
});
