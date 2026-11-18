import { describe, expect, it } from 'vitest';
import type { NutritionPhase, NutritionProgram } from '../../types';
import { bloqueEnDeficit, diasEnDeficit } from './bloqueEnDeficit';

/* ¿El bloque cae en déficit? (auditoría de cifras, 17-11-2026). El bloque de
   las pruebas: 12 semanas desde el lunes 23-11-2026 (acaba el 14-02-2027). */

const INICIO = '2026-11-23';
const FIN = '2027-02-14';
const fase = (id: string, weeks: number, extra: Partial<NutritionPhase> = {}): NutritionPhase => ({ id, name: id, weeks, dietId: 'd', ...extra });
const programa = (startDate: string, phases: NutritionPhase[]): NutritionProgram => ({ athleteId: 'ana@x.com', startDate, phases });

describe('bloqueEnDeficit', () => {
  it('sin periodización nutricional no hay déficit', () => {
    expect(bloqueEnDeficit(null, INICIO, FIN)).toBe(false);
    expect(bloqueEnDeficit(undefined, INICIO, FIN)).toBe(false);
    expect(bloqueEnDeficit(programa(INICIO, []), INICIO, FIN)).toBe(false);
  });

  it('todo el bloque dentro de una fase de déficit', () => {
    const p = programa('2026-11-02', [fase('Definición', 20, { objetivo: 'deficit' })]);
    expect(diasEnDeficit(p, INICIO, FIN)).toBe(84);
    expect(bloqueEnDeficit(p, INICIO, FIN)).toBe(true);
  });

  it('«mayoritariamente»: más de la mitad de sus días; la mitad justa no basta', () => {
    // 7 semanas de déficit y 5 de mantenimiento.
    expect(bloqueEnDeficit(programa(INICIO, [fase('a', 7, { objetivo: 'deficit' }), fase('b', 10, { objetivo: 'mantenimiento' })]), INICIO, FIN)).toBe(true);
    // 6 y 6.
    const mitad = programa(INICIO, [fase('a', 6, { objetivo: 'deficit' }), fase('b', 10, { objetivo: 'volumen' })]);
    expect(diasEnDeficit(mitad, INICIO, FIN)).toBe(42);
    expect(bloqueEnDeficit(mitad, INICIO, FIN)).toBe(false);
    // El déficit llega al final: 4 semanas de 12.
    expect(bloqueEnDeficit(programa(INICIO, [fase('a', 8, { objetivo: 'volumen' }), fase('b', 12, { objetivo: 'deficit' })]), INICIO, FIN)).toBe(false);
  });

  it('la pérdida acelerada también es déficit; volumen, mantenimiento, salida de déficit y recomposición, no', () => {
    const con = (objetivo: NutritionPhase['objetivo']) => bloqueEnDeficit(programa(INICIO, [fase('a', 12, { objetivo })]), INICIO, FIN);
    expect(con('deficit_acelerado')).toBe(true);
    expect(con('volumen')).toBe(false);
    expect(con('mantenimiento')).toBe(false);
    expect(con('salida_deficit')).toBe(false);
    expect(con('recomposicion')).toBe(false);
  });

  it('lee la fase como el cierre de bloque: sin objetivo marcado, por su tipo o por su nombre', () => {
    expect(bloqueEnDeficit(programa(INICIO, [fase('Fase 1', 12, { phaseType: 'deficit' })]), INICIO, FIN)).toBe(true);
    expect(bloqueEnDeficit(programa(INICIO, [fase('Definición de verano', 12)]), INICIO, FIN)).toBe(true);
    expect(bloqueEnDeficit(programa(INICIO, [fase('Volumen limpio', 12)]), INICIO, FIN)).toBe(false);
  });

  it('los días fuera del programa no son déficit', () => {
    // El déficit acabó dos semanas después de empezar el bloque.
    expect(bloqueEnDeficit(programa('2026-09-28', [fase('a', 10, { objetivo: 'deficit' })]), INICIO, FIN)).toBe(false);
    // El programa aún no ha empezado cuando acaba el bloque.
    expect(diasEnDeficit(programa('2027-03-01', [fase('a', 10, { objetivo: 'deficit' })]), INICIO, FIN)).toBe(0);
  });

  it('fechas rotas: no hay déficit, sin romper', () => {
    const p = programa('', [fase('a', 12, { objetivo: 'deficit' })]);
    expect(bloqueEnDeficit(p, INICIO, FIN)).toBe(false);
    expect(bloqueEnDeficit(programa(INICIO, [fase('a', 12, { objetivo: 'deficit' })]), FIN, INICIO)).toBe(false);
  });
});
