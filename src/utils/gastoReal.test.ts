import { describe, it, expect } from 'vitest';
import type { Diet, DietCompletionLog } from '../types';
import { calcularGastoReal, evolucionDelGasto, kcalDelDia, kcalParaObjetivo } from './gastoReal';

// Un día = una comida de N intercambios de HC (100 kcal cada uno), todos marcados.
function registro(date: string, intercambios: number): DietCompletionLog {
  return {
    id: date, athleteId: 'a@b.com', date, dietId: 'd',
    meals: [{ id: 'm', name: 'Todo', items: [{ category: 'HC', foodLabel: 'arroz', quantity: intercambios }] }],
    doneItemIds: ['m_0'],
  } as DietCompletionLog;
}
const dias = (desde: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});
const HASTA = '2026-09-27';
const VENTANA = dias('2026-08-31', 28); // 28 días que acaban en HASTA

describe('kcalDelDia', () => {
  it('suma lo marcado; sin marcas = sin registrar', () => {
    expect(kcalDelDia(registro('2026-09-01', 25), [])).toBe(2500);
    expect(kcalDelDia({ ...registro('2026-09-01', 25), doneItemIds: [] }, [])).toBeNull();
  });
});

describe('calcularGastoReal', () => {
  const diets: Diet[] = [];

  it('come 2.500 y el peso no se mueve → gasta 2.500', () => {
    const g = calcularGastoReal({
      registros: VENTANA.map(d => registro(d, 25)),
      pesos: VENTANA.map(date => ({ date, weight: 80 })), diets, hasta: HASTA,
    });
    expect(g.kcal).toBe(2500);
    expect(g.confianza).toBe('alta');
  });

  it('come 2.500 y baja 0,5 kg/sem → gasta unas 3.050', () => {
    const g = calcularGastoReal({
      registros: VENTANA.map(d => registro(d, 25)),
      pesos: VENTANA.map((date, i) => ({ date, weight: 80 - (0.5 / 7) * i })), diets, hasta: HASTA,
    });
    expect(g.kcal).toBe(3050);
    expect(g.cambioKgSemana).toBeCloseTo(-0.5, 2);
  });

  it('las semanas con menos de 5 días registrados no cuentan, ni inventan comida', () => {
    // Solo 3 días por semana registrados → ninguna semana vale → sin gasto real.
    const pocos = VENTANA.filter((_, i) => i % 7 < 3).map(d => registro(d, 25));
    const g = calcularGastoReal({
      registros: pocos, pesos: VENTANA.map(date => ({ date, weight: 80 })), diets, hasta: HASTA,
    });
    expect(g.kcal).toBeNull();
    expect(g.confianza).toBe('insuficiente');
    expect(g.diasRegistrados).toBe(12);
  });

  it('pesajes insuficientes o todos juntos → sin gasto', () => {
    const g = calcularGastoReal({
      registros: VENTANA.map(d => registro(d, 25)),
      pesos: VENTANA.slice(-3).map(date => ({ date, weight: 80 })), diets, hasta: HASTA,
    });
    expect(g.kcal).toBeNull();
  });

  it('avisa de infra-registro si sale muy por debajo de la fórmula', () => {
    const g = calcularGastoReal({
      registros: VENTANA.map(d => registro(d, 15)),               // registra 1.500
      pesos: VENTANA.map(date => ({ date, weight: 80 })),          // y no baja
      diets, hasta: HASTA, gastoFormula: 2600,
    });
    expect(g.kcal).toBe(1500);
    expect(g.sospechaInfraRegistro).toBe(true);
  });
});

describe('evolucionDelGasto y kcalParaObjetivo', () => {
  it('un punto por semana con datos', () => {
    const todos = dias('2026-06-01', 119);
    const serie = evolucionDelGasto({
      registros: todos.map(d => registro(d, 25)),
      pesos: todos.map(date => ({ date, weight: 80 })), diets: [], hoy: HASTA, puntos: 6,
    });
    expect(serie).toHaveLength(6);
    expect(serie.every(p => p.kcal === 2500)).toBe(true);
  });
  it('kcal para el centro del rango', () => {
    expect(kcalParaObjetivo(2800, 'deficit', 80)).toBe(2350);  // −0,5 % de 80 = −0,4 kg/sem ≈ −440
    expect(kcalParaObjetivo(2800, 'mantenimiento', 80)).toBe(2800);
    expect(kcalParaObjetivo(2800, 'volumen', 80)).toBe(3100);  // +0,325 % = +0,26 kg ≈ +286
  });
});
