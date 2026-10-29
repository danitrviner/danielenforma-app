import { describe, it, expect } from 'vitest';
import type { PlatoDelPlan } from '../types';
import { balanceDelPlan, estadoDeMacro, macrosDeAlimento, objetivoDeLaSemana, totalDelPlan } from './planSemanal';
import { macrosDesdeGramos } from './macros';

const plato = (over: Partial<PlatoDelPlan>): PlatoDelPlan => ({
  id: 'x', nombre: 'Plato', origen: { tipo: 'receta', id: 'r' }, macros: macrosDesdeGramos(40, 60, 15), veces: 1, grupo: 'tanda', ...over,
});

describe('planSemanal', () => {
  it('un plato suma su ración por las veces que se come', () => {
    const t = totalDelPlan([plato({ veces: 5 }), plato({ id: 'y', macros: macrosDesdeGramos(20, 50, 10), veces: 7, grupo: 'cadaDia' })]);
    expect(t.p).toBe(40 * 5 + 20 * 7);
    expect(t.hc).toBe(60 * 5 + 50 * 7);
  });

  it('suma solo un grupo si se pide', () => {
    const lista = [plato({ veces: 5 }), plato({ id: 'y', veces: 2, grupo: 'suelto' })];
    expect(totalDelPlan(lista, 'suelto').p).toBe(80);
  });

  it('el objetivo de la semana suma los días con dieta y no los libres', () => {
    const entreno = macrosDesdeGramos(170, 260, 70);
    const descanso = macrosDesdeGramos(170, 180, 70);
    const { objetivo, dias } = objetivoDeLaSemana([entreno, descanso, entreno, descanso, entreno, null, descanso]);
    expect(dias).toBe(6);
    expect(objetivo.hc).toBe(260 * 3 + 180 * 3);
  });

  it('macros de un alimento por sus gramos', () => {
    const m = macrosDeAlimento({ kcal: 130, p: 2.7, hc: 28, g: 0.3 }, 250);
    expect(m.hc).toBeCloseTo(70);
    expect(m.kcal).toBeCloseTo(325);
  });

  it('estado de cada macro con un margen del 5 %', () => {
    expect(estadoDeMacro(96, 100)).toBe('ok');
    expect(estadoDeMacro(94, 100)).toBe('falta');
    expect(estadoDeMacro(106, 100)).toBe('sobra');
  });

  it('el plan cuadra cuando las tres macros están dentro del margen', () => {
    const objetivo = macrosDesdeGramos(40 * 7, 60 * 7, 15 * 7);
    const b = balanceDelPlan([plato({ veces: 7 })], objetivo, 7);
    expect(b.cuadra).toBe(true);
    expect(b.mediaPorDia.p).toBe(40);
    expect(b.diferencia.hc).toBe(0);
  });

  it('un plan vacío no cuadra y dice cuánto falta', () => {
    const objetivo = macrosDesdeGramos(1000, 1500, 400);
    const b = balanceDelPlan([], objetivo, 7);
    expect(b.cuadra).toBe(false);
    expect(b.diferencia.p).toBe(1000);
    expect(b.estado.p).toBe('falta');
  });
});
