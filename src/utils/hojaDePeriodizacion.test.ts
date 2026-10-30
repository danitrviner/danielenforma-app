import { describe, it, expect } from 'vitest';
import {
  pesoAlFinal, ritmoKgSem, encadenarFases, fasesParaGuardar, kcalParaElRitmo, macrosPorKg, avisoAcelerada,
  escalonesDeFase, confirmarEscalones, confirmarTodosLosEscalones, filasSemanaASemana, fasesDesdePlantilla, plantillaDesdeFases, PLANTILLAS_POR_DEFECTO, ritmoPorDefecto,
} from './hojaDePeriodizacion';
import type { Diet, NutritionPhase, NutritionProgram } from '../types';

const dieta = (id: string, kcal: number): Diet => ({ id, athleteId: 'a@x.com', name: id, meals: [], budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 }, objetivo: { kcal, p: 160, g: 70, hc: (kcal - 160 * 4 - 70 * 9) / 4 } });

describe('ritmo y semanas → peso al final', () => {
  it('82,3 kg a −0,55 %/sem durante 12 semanas acaban en 76,9', () => {
    expect(pesoAlFinal(82.3, -0.55, 12)).toBe(76.9);
    expect(ritmoKgSem(82.3, -0.55)).toBe(-0.45);
  });
  it('encadena: cada fase empieza donde acaba la anterior; mantenimiento no mueve el peso', () => {
    const c = encadenarFases(82.3, [
      { modo: 'ritmo', ritmoPctSem: -0.55, weeks: 12, objetivo: 'deficit' },
      { modo: 'ritmo', ritmoPctSem: 0.1, weeks: 2, objetivo: 'salida_deficit' },
      { modo: 'ritmo', ritmoPctSem: 0, weeks: 4, objetivo: 'mantenimiento' },
    ]);
    expect(c.map(f => [f.pesoInicio, f.pesoFinal, f.weeks, f.pesoCalculado])).toEqual([[82.3, 76.9, 12, true], [76.9, 77.1, 2, true], [77.1, 77.1, 4, true]]);
  });
  it('las fases de antes (peso objetivo + kg/sem) siguen sacando las semanas', () => {
    const c = encadenarFases(87, [{ targetWeight: 79, targetRateKgWeek: -0.8, weeks: 4 }]);
    expect(c[0]).toMatchObject({ weeks: 10, pesoFinal: 79, semanasCalculadas: true, pesoCalculado: false });
  });
  it('fasesParaGuardar escribe el peso y los kg/sem calculados para el resto del motor', () => {
    const f = fasesParaGuardar(82.3, [{ id: 'f1', name: 'Def', weeks: 12, dietId: 'd', modo: 'ritmo', ritmoPctSem: -0.55, objetivo: 'deficit' }]);
    expect(f[0]).toMatchObject({ targetWeight: 76.9, targetRateKgWeek: -0.45, weeks: 12 });
  });
  it('ritmo por defecto: el centro del rango de la doctrina, con signo', () => {
    expect(ritmoPorDefecto('deficit')).toBe(-0.5);
    expect(ritmoPorDefecto('volumen')).toBe(0.28);
    expect(ritmoPorDefecto('mantenimiento')).toBe(0);
  });
});

describe('kcal y macros', () => {
  it('kcal de media para el ritmo: mantenimiento + pasos + déficit diario, a decenas', () => {
    expect(kcalParaElRitmo({ mantenimientoKcal: 2650, pasosKcal: 310, ritmoKgSem: -0.45 })).toBe(2470);
  });
  it('macros por kg: proteína y grasa fijas, hidratos el resto, todo a 5 g', () => {
    const m = macrosPorKg({ pesoKg: 82.3, proteinaGKg: 2, grasaGKg: 0.8, kcal: 2150 });
    expect(m).toEqual({ p: 165, g: 65, hc: 225, kcal: 165 * 4 + 65 * 9 + 225 * 4 });
  });
  it('pérdida acelerada avisa de semanas, proteína y ritmo fuera de límites', () => {
    expect(avisoAcelerada({ objetivo: 'deficit_acelerado', weeks: 6, proteinaGKg: 1.9, ritmoPctSem: -0.8 })).toBeNull();
    const a = avisoAcelerada({ objetivo: 'deficit_acelerado', weeks: 10, proteinaGKg: 2.4, ritmoPctSem: -0.4 })!;
    expect(a).toMatch(/más de 8 semanas/);
    expect(a).toMatch(/proteína fuera de 1,8-2 g\/kg/);
    expect(a).toMatch(/ritmo fuera/);
    expect(avisoAcelerada({ objetivo: 'deficit', weeks: 20 })).toBeNull();
  });
});

describe('escalones', () => {
  const fase: NutritionPhase = { id: 'f1', name: 'Definición', weeks: 12, dietId: 'd1', targetKcal: 2300, pasos: 10000, escalon: { cadaSemanas: 3, kcal: -100, pasos: 1000 }, objetivo: 'deficit' };
  const program: NutritionProgram = { athleteId: 'a@x.com', startDate: '2026-09-04', phases: [fase, { id: 'f2', name: 'Salida', weeks: 2, dietId: 'd2', objetivo: 'salida_deficit' }] };
  const diets = [dieta('d1', 2300), dieta('d2', 2450)];

  it('propone cuatro tramos y solo el primero coincide con lo programado', () => {
    const e = escalonesDeFase(program, diets, 0, 8000);
    expect(e.map(x => [x.desde, x.hasta, x.kcal, x.pasos, x.confirmado])).toEqual([
      [1, 3, 2300, 10000, false], [4, 6, 2200, 11000, false], [7, 9, 2100, 12000, false], [10, 12, 2000, 13000, false],
    ]);
  });
  it('confirmar escribe hidratos desde cada tramo y los pasos por semana; después todo coincide', () => {
    const p = confirmarEscalones(program, diets, 0, 8000);
    expect(p.cambiosSemana?.map(c => [c.semana, c.ajustes[0].gramos])).toEqual([[4, -25], [7, -25], [10, -25]]);
    expect(p.pasosPorSemana).toEqual([{ semana: 1, pasos: 10000 }, { semana: 4, pasos: 11000 }, { semana: 7, pasos: 12000 }, { semana: 10, pasos: 13000 }]);
    expect(escalonesDeFase(p, diets, 0, 8000).every(x => x.confirmado)).toBe(true);
    // Idempotente: confirmar otra vez no añade nada.
    expect(confirmarEscalones(p, diets, 0, 8000)).toEqual(p);
  });
  it('la tabla semana a semana lleva las kcal con escalones; la fase siguiente arranca limpia', () => {
    const p = confirmarTodosLosEscalones(program, diets, 8000);
    // La Salida no hereda los −300 kcal de la Definición: su primera semana se vuelve a cuadrar.
    expect(p.cambiosSemana?.find(c => c.semana === 13)?.ajustes[0].gramos).toBe(75);
    const filas = filasSemanaASemana(p, diets, 8000);
    expect(filas).toHaveLength(14);
    expect(filas.map(f => f.kcal).slice(0, 12)).toEqual([2300, 2300, 2300, 2200, 2200, 2200, 2100, 2100, 2100, 2000, 2000, 2000]);
    expect(filas[12]).toMatchObject({ semana: 13, faseIdx: 1, kcal: 2450, pasos: 13000 });
  });
  it('sin escalón, un solo tramo con las kcal de la fase', () => {
    const p: NutritionProgram = { ...program, phases: [{ ...fase, escalon: undefined, pasos: undefined }] };
    expect(escalonesDeFase(p, diets, 0, 8000)).toEqual([{ desde: 1, hasta: 12, kcal: 2300, pasos: 8000, confirmado: true }]);
  });
});

describe('plantillas', () => {
  it('las cuatro por defecto dan fases en modo ritmo sin dieta', () => {
    const f = fasesDesdePlantilla(PLANTILLAS_POR_DEFECTO[0], 1);
    expect(f.map(x => [x.name, x.weeks, x.modo, x.dietId])).toEqual([['Definición', 12, 'ritmo', ''], ['Salida de déficit', 2, 'ritmo', ''], ['Mantenimiento', 4, 'ritmo', '']]);
  });
  it('guardar como plantilla se queda con lo reutilizable, sin ids ni dietas', () => {
    const pl = plantillaDesdeFases('Mía', [{ id: 'x', name: 'Def', weeks: 8, dietId: 'd9', targetWeight: 70, ritmoPctSem: -0.5, proteinaGKg: 2, objetivo: 'deficit' }], 'pl1');
    expect(pl).toEqual({ id: 'pl1', nombre: 'Mía', fases: [{ name: 'Def', weeks: 8, ritmoPctSem: -0.5, proteinaGKg: 2, objetivo: 'deficit' }] });
  });
});
