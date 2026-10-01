import { describe, expect, it } from 'vitest';
import type { Diet, NutritionProgram } from '../types';
import {
  semanaDelPrograma, faseDeLaSemana, aplicarAjustes, dietaDeLaSemana, programarAjuste, kcalPorSemana,
  novedadesNutricion, suplementosDeLaSemana, quitarCambiosNutricion, objetivoDePasos,
  salidaDeDeficit, descansosDeDieta, bajadaProgresiva, evaluarReglasDePeso, proteinaGKgPorSemana, habitosPorSemana,
  semanaQueNecesitaMenu,
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

describe('días altos/bajos y pasos por semana', () => {
  const p: NutritionProgram = {
    ...programa,
    ciclado: { desde: 2, entreno: 2, descanso: -1 },
    pasosPorSemana: [{ semana: 3, pasos: 10000 }, { semana: 6, pasos: 12000 }],
  };
  const conEntreno: Diet = { ...dieta, meals: dieta.meals.map(m => m.slot === 1 ? { ...m, aroundTraining: true } : m) };
  it('día de entreno: +2 HC en la comida del entreno; descanso: −1', () => {
    expect(dietaDeLaSemana(conEntreno, p, '2026-09-15', true).meals[0].items[0].quantity).toBe(5);
    expect(dietaDeLaSemana(conEntreno, p, '2026-09-15', false).budget.HC).toBe(10);
  });
  it('antes de empezar el ciclado, o sin saber si entrena, no cambia nada', () => {
    expect(dietaDeLaSemana(conEntreno, p, '2026-09-08', true).budget.HC).toBe(11);
    expect(dietaDeLaSemana(conEntreno, p, '2026-09-15').budget.HC).toBe(11);
  });
  it('pasos: manda el último objetivo que haya empezado', () => {
    expect(objetivoDePasos(p, '2026-09-14', 8000)).toBe(8000);   // S2
    expect(objetivoDePasos(p, '2026-09-21', 8000)).toBe(10000);  // S3
    expect(objetivoDePasos(p, '2026-10-19', 8000)).toBe(12000);  // S7
  });
});

describe('progresiones de nutrición, reglas por peso y proteína', () => {
  it('salida de déficit: +1 HC por semana hasta rozar el objetivo', () => {
    const p = salidaDeDeficit(programa, [dieta], 3, 2700);  // parte de 2.395
    const kcal = kcalPorSemana(p, [dieta]);
    expect([kcal[2], kcal[3], kcal[4], kcal[5], kcal[6]]).toEqual([2395, 2495, 2595, 2695, 2695]);
  });
  it('descanso de dieta cada 6 semanas', () => {
    expect(descansosDeDieta(programa, 6, 1, 12).semanasMantenimiento).toEqual([6, 12]);
  });
  it('bajada progresiva de grasa cada 2 semanas con suelo', () => {
    const p = bajadaProgresiva(programa, [dieta], 2, 2, 'GRASA', 2150);
    expect(p.cambiosSemana?.map(c => c.semana)).toEqual([2, 4]);
  });
  it('regla: 2 semanas bajando menos de 0,3 kg → propone −1 HC la semana siguiente', () => {
    const p: NutritionProgram = { ...programa, reglasPeso: [{ id: 'r', tipo: 'bajar', ritmoMinimo: 0.3, semanas: 2, cat: 'HC', cantidad: 1 }] };
    const lento = evaluarReglasDePeso(p, [80, 79.8, 79.7, 79.6], 5);
    expect(lento).toHaveLength(1);
    expect(lento[0].semana).toBe(6);
    expect(lento[0].ajuste).toEqual({ cat: 'HC', delta: -1 });
    expect(evaluarReglasDePeso(p, [80, 79.5, 79, 78.4], 5)).toEqual([]);
    const yaProgramado = { ...p, cambiosSemana: [{ semana: 6, ajustes: [{ cat: 'HC' as const, delta: -1 }] }] };
    expect(evaluarReglasDePeso(yaProgramado, [80, 79.8, 79.7, 79.6], 5)).toEqual([]);
  });
  it('proteína en g/kg por semana', () => {
    expect(proteinaGKgPorSemana(programa, [dieta], 100)[1]).toBe(2);  // 8 × 25 / 100
  });
});

describe('hábitos por semana', () => {
  it('media de agua y raciones solo con los días apuntados', () => {
    const base = { athleteId: 'x', dietId: 'd', doneItemIds: [] };
    const h = habitosPorSemana(programa, [
      { ...base, id: '1', date: '2026-09-07', aguaMl: 2000, racionesVegetales: 4 },
      { ...base, id: '2', date: '2026-09-08', aguaMl: 1000 },
      { ...base, id: '3', date: '2026-09-15' },
    ]);
    expect(h[1]).toEqual({ aguaL: 1.5, raciones: 4, dias: 2 });
    expect(h[2]).toBeNull();
  });
});

describe('menú semanal automático', () => {
  const p: NutritionProgram = { ...programa, cambiosSemana: [{ semana: 5, ajustes: [{ slot: 5, cat: 'HC', delta: -1 }] }] };
  it('toca al empezar una semana en la que la dieta cambia', () => {
    expect(semanaQueNecesitaMenu(p, { semanaPrograma: 4 }, [], '2026-10-05')).toBe(5);  // S5
  });
  it('no toca si la dieta es la misma que la del menú publicado', () => {
    expect(semanaQueNecesitaMenu(p, { semanaPrograma: 5 }, [], '2026-10-12')).toBeNull(); // S6 = S5
    expect(semanaQueNecesitaMenu(p, { semanaPrograma: 2 }, [], '2026-09-28')).toBeNull(); // S4 = S2
  });
  it('no repite si ya hay borrador de esa semana, ni sin menú publicado', () => {
    expect(semanaQueNecesitaMenu(p, { semanaPrograma: 4 }, [{ semanaPrograma: 5 }], '2026-10-05')).toBeNull();
    expect(semanaQueNecesitaMenu(p, null, [], '2026-10-05')).toBeNull();
  });
  it('un menú de antes de esto cuenta como semana sin ajustes', () => {
    expect(semanaQueNecesitaMenu(p, {}, [], '2026-10-05')).toBe(5);
    expect(semanaQueNecesitaMenu(p, {}, [], '2026-09-28')).toBeNull();
  });
});
