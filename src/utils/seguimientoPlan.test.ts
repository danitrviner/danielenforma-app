import { describe, it, expect } from 'vitest';
import type { Diet, DietCompletionLog, NutritionProgram } from '../types';
import { addDays } from './trainingWeek';
import { semanasDelPlan, evaluarPlan } from './seguimientoPlan';

const INICIO = '2026-09-07'; // lunes
const program: NutritionProgram = {
  athleteId: 'a', startDate: INICIO,
  phases: [
    { id: 'd', name: 'Definición', weeks: 12, dietId: '', objetivo: 'deficit', targetWeight: 76.5, targetKcal: 2200 },
    { id: 'm', name: 'Mantenimiento', weeks: 4, dietId: '', objetivo: 'mantenimiento', targetKcal: 2650 },
  ],
};
// Peso medio de cada semana: sube 4 semanas y luego baja ~0,5 kg/sem.
const medias = [81, 81.4, 82.8, 83.4, 84.1, 83.6, 83.1, 82.6];
const pesos = medias.flatMap((m, s) => [0, 2, 4].map(d => ({ date: addDays(INICIO, s * 7 + d), weight: m })));
const kcal = (date: string, k: number) => ({
  athleteId: 'a', date, dietId: '', doneItemIds: ['m_0'],
  meals: [{ id: 'm', name: 'Comida', items: [{ category: 'HC', foodLabel: 'x', quantity: 1, nutrientes: { kcal: k, p: 0, hc: 0, g: 0 } }] }],
}) as unknown as DietCompletionLog;
const registros = Array.from({ length: 56 }, (_, d) => kcal(addDays(INICIO, d), d % 2 ? 2250 : 2600));
const pasos = Array.from({ length: 56 }, (_, d) => ({ date: addDays(INICIO, d), steps: 9000 }));
const hoy = addDays(INICIO, 7 * 7 + 4); // jueves de la semana 8
const diets: Diet[] = [];

const semanas = semanasDelPlan({ program, diets, pesos, registros, pasos, pasosBase: 12000, hoy });

describe('semanasDelPlan', () => {
  it('una fila por semana del programa, con su fase y lo pautado', () => {
    expect(semanas).toHaveLength(16);
    expect(semanas[0]).toMatchObject({ semana: 1, desde: INICIO, kcalPlan: 2200, pasosPlan: 12000, faseIdx: 0 });
    expect(semanas[12]).toMatchObject({ semana: 13, kcalPlan: 2650, faseIdx: 1 });
  });

  it('peso real, esperado y estado de las semanas vividas; las futuras solo con plan', () => {
    expect(semanas[0].real).toBe(81);
    expect(semanas[4].estado).toBe('por-encima');
    expect(semanas[7].enCurso).toBe(true);
    expect(semanas[9]).toMatchObject({ futura: true, real: null, estado: null });
    expect(semanas[9].esperado).toBeLessThan(semanas[1].esperado!);
    // El mantenimiento sale de donde acaba la definición: 76,5.
    expect(semanas[13].esperado).toBe(76.5);
  });

  it('kcal registradas, adherencia (±10 %) y pasos de la semana', () => {
    expect(semanas[1].kcalRegistradas).toBe(2400);
    expect(semanas[1].diasRegistrados).toBe(7);
    expect(semanas[1].adherencia).toBe(57); // 4 de 7 días en 2.250 (dentro del ±10 %)
    expect(semanas[1].pasosReales).toBe(9000);
    expect(semanas[7].diasRegistrados).toBe(5); // la semana en curso solo cuenta hasta hoy
  });
});

describe('evaluarPlan', () => {
  const ev = evaluarPlan(program, semanas)!;

  it('evalúa la última semana con peso y explica el ritmo', () => {
    expect(ev.semana.semana).toBe(8);
    expect(ev.estado).toBe('por-encima');
    expect(ev.desvio).toBeGreaterThan(4);
    expect(ev.ritmo).toBeLessThan(-0.4);
    expect(ev.explicacion).toContain('baja');
    expect(ev.explicacion).toContain('S12');
  });

  it('propone alargar (va en buena dirección) y apretar, sin aplicar nada', () => {
    const alargar = ev.opciones.find(o => o.tipo === 'alargar')!;
    expect(alargar.programa.phases[0].weeks).toBeGreaterThan(12);
    expect(program.phases[0].weeks).toBe(12);
    const apretar = ev.opciones.find(o => o.tipo === 'apretar')!;
    expect(apretar.programa.phases[0].targetKcal).toBeLessThan(2200);
  });

  it('dentro del plan no hay opciones', () => {
    const enPlan = semanas.map(s => (s.real != null ? { ...s, estado: 'en-plan' as const, real: s.esperado } : s));
    expect(evaluarPlan(program, enPlan)!.opciones).toEqual([]);
  });

  it('sin pesos no hay evaluación', () => {
    expect(evaluarPlan(program, semanasDelPlan({ program, diets, pesos: [], registros: [], pasos: [], pasosBase: 12000, hoy }))).toBeNull();
  });
});
