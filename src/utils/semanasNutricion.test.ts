import { describe, expect, it } from 'vitest';
import type { Diet, NutritionProgram } from '../types';
import {
  semanaDelPrograma, faseDeLaSemana, aplicarAjustes, dietaDeLaSemana, programarAjuste, kcalPorSemana,
  novedadesNutricion, suplementosDeLaSemana, quitarCambiosNutricion,
} from './semanasNutricion';

const dieta: Diet = {
  id: 'd1', athleteId: 'x@x.com', name: 'Déficit',
  budget: { HC: 11, PROT: 8, GRASA: 5, MIX_HC: 0, MIX_GRASA: 0 },
  meals: [
    { id: 'm1', name: 'Desayuno', slot: 1, items: [{ category: 'HC', foodLabel: 'Avena', quantity: 3 }, { category: 'PROT', foodLabel: 'Claras', quantity: 2 }] },
    { id: 'm4', name: 'Cena', slot: 5, items: [{ category: 'HC', foodLabel: 'Patata', quantity: 2 }, { category: 'HC', foodLabel: 'Pan', quantity: 1 }] },
  ],
};
const programa: NutritionProgram = {
  athleteId: 'x@x.com', startDate: '2026-09-07',
  phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'd1' }, { id: 'f2', name: 'Mantenimiento', weeks: 4, dietId: 'd1' }],
};

describe('semanas del programa nutricional', () => {
  it('cuenta semanas desde el inicio y sabe en qué fase cae cada una', () => {
    expect(semanaDelPrograma(programa, '2026-09-07')).toBe(1);
    expect(semanaDelPrograma(programa, '2026-09-14')).toBe(2);
    expect(faseDeLaSemana(programa, 9)?.fase.name).toBe('Mantenimiento');
    expect(faseDeLaSemana(programa, 9)?.semanaEnFase).toBe(1);
  });

  it('−1 HC en la cena quita de la patata y baja el cupo', () => {
    const d = aplicarAjustes(dieta, [{ slot: 5, cat: 'HC', delta: -1 }]);
    expect(d.meals[1].items.map(i => [i.foodLabel, i.quantity])).toEqual([['Patata', 1], ['Pan', 1]]);
    expect(d.budget.HC).toBe(10);
  });

  it('quitar más de lo que hay en un alimento sigue por el siguiente y borra el que queda a 0', () => {
    const d = aplicarAjustes(dieta, [{ slot: 5, cat: 'HC', delta: -2.5 }]);
    expect(d.meals[1].items.map(i => [i.foodLabel, i.quantity])).toEqual([['Pan', 0.5]]);
  });

  it('sin franja, va a la comida que más lleva de ese macro', () => {
    const d = aplicarAjustes(dieta, [{ cat: 'HC', delta: 1 }]);
    expect(d.meals[0].items[0].quantity).toBe(4);
  });

  it('mantenimiento: +1 HC en cada comida', () => {
    expect(aplicarAjustes(dieta, [], { mantenimiento: true }).budget.HC).toBe(13);
  });

  it('los cambios «desde» se acumulan y los «solo» valen su semana', () => {
    let p: NutritionProgram = { ...programa, cambiosSemana: programarAjuste(programa, 4, false, { slot: 5, cat: 'HC', delta: -1 }) };
    p = { ...p, cambiosSemana: programarAjuste(p, 6, true, { slot: 1, cat: 'PROT', delta: 1 }) };
    const hc = (fecha: string) => dietaDeLaSemana(dieta, p, fecha).budget.HC;
    expect(hc('2026-09-21')).toBe(11); // S3
    expect(hc('2026-09-28')).toBe(10); // S4
    expect(dietaDeLaSemana(dieta, p, '2026-10-12').budget.PROT).toBe(9);  // S6
    expect(dietaDeLaSemana(dieta, p, '2026-10-19').budget.PROT).toBe(8);  // S7
    expect(hc('2026-10-19')).toBe(10);
  });

  it('compensar un ajuste hasta cero lo quita', () => {
    const p = { ...programa, cambiosSemana: programarAjuste(programa, 4, false, { slot: 5, cat: 'HC', delta: -1 }) };
    expect(programarAjuste(p, 4, false, { slot: 5, cat: 'HC', delta: 1 })).toBeUndefined();
    expect(quitarCambiosNutricion(p, [4])).toBeUndefined();
  });

  it('comida libre del sábado marca la cena ese día', () => {
    const p: NutritionProgram = { ...programa, comidasLibres: [{ dia: 'sat', slot: 5, desde: 3 }] };
    expect(dietaDeLaSemana(dieta, p, '2026-09-26').meals[1].libre).toBe(true);   // S3, sábado
    expect(dietaDeLaSemana(dieta, p, '2026-09-25').meals[1].libre).toBeUndefined(); // viernes
    expect(dietaDeLaSemana(dieta, p, '2026-09-19').meals[1].libre).toBeUndefined(); // S2, sábado
  });

  it('kcal por semana, novedades y suplementos', () => {
    const p: NutritionProgram = {
      ...programa,
      cambiosSemana: [{ semana: 4, ajustes: [{ slot: 5, cat: 'HC', delta: -1 }] }],
      semanasMantenimiento: [6],
      suplementos: [{ id: 's1', nombre: 'Creatina', dosis: '5 g', desde: 4 }],
    };
    const kcal = kcalPorSemana(p, [dieta]);
    expect(kcal[3]! - kcal[4]!).toBe(100);
    expect(kcal[6]! - kcal[5]!).toBe(200);
    const n4 = novedadesNutricion(p, 4);
    expect(n4.ajustes).toEqual(['Cena: −1 intercambio de hidratos']);
    expect(n4.suplementos).toEqual(['Creatina · 5 g']);
    expect(novedadesNutricion(p, 7).vuelveDeMantenimiento).toBe(true);
    expect(suplementosDeLaSemana(p, 3)).toEqual([]);
  });
});

describe('comidas con alimentos mixtos', () => {
  it('si no hay hidratos puros, el ajuste va al mixto (el doble)', () => {
    const conMixto: Diet = { ...dieta, meals: [{ id: 'c', name: 'Comida', slot: 3, items: [{ category: 'MIX_HC', foodLabel: 'Lentejas', quantity: 4 }] }] };
    const d = aplicarAjustes(conMixto, [{ slot: 3, cat: 'HC', delta: -1 }]);
    expect(d.meals[0].items[0].quantity).toBe(2);
  });
});
