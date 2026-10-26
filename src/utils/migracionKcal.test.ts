import { describe, expect, it } from 'vitest';
import type { MenuDay, NutritionProgram } from '../types';
import { parcheDeDieta, parcheDePrograma, parcheDeMenu } from './migracionKcal';
import { objetivoDeDieta } from './macrosLegado';

describe('migración a kcal', () => {
  it('una dieta vieja recibe el objetivo de su cupo; una nueva no se toca', () => {
    const vieja = { budget: { HC: 8, PROT: 6, GRASA: 4, MIX_HC: 0, MIX_GRASA: 0 } };
    expect(parcheDeDieta(vieja)).toEqual({ objetivo: objetivoDeDieta(vieja) });
    expect(parcheDeDieta({ ...vieja, objetivo: { kcal: 2000, p: 150, hc: 200, g: 66 } })).toBeNull();
  });

  it('el programa recibe gramos en ajustes, ciclado y reglas, sin perder lo viejo', () => {
    const programa = {
      cambiosSemana: [{ semana: 2, ajustes: [{ cat: 'HC' as const, delta: -1 }, { cat: 'GRASA' as const, delta: 1, gramos: 10 }] }],
      ciclado: { desde: 1, entreno: 1, descanso: -1 },
      reglasPeso: [{ id: 'r', tipo: 'bajar', semanas: 2, minKgSemana: 0.3, cat: 'HC', cantidad: 1 }],
    } as unknown as NutritionProgram;
    const p = parcheDePrograma(programa)!;
    expect(p.cambiosSemana![0].ajustes).toEqual([
      { cat: 'HC', delta: -1, gramos: -25 },
      { cat: 'GRASA', delta: 1, gramos: 10 },
    ]);
    expect(p.ciclado).toMatchObject({ entreno: 1, descanso: -1, entrenoG: 25, descansoG: -25 });
    expect(p.reglasPeso![0]).toMatchObject({ cantidad: 1, gramos: 25 });
    // Pasado una vez, ya no hay nada que añadir.
    expect(parcheDePrograma({ ...programa, ...p })).toBeNull();
  });

  it('los días de un menú viejo reciben su objetivo en kcal; los libres no', () => {
    const days: MenuDay[] = [
      { day: 'mon', dietId: 'd', target: { HC: 4, PROT: 4, GRASA: 2 }, meals: [] },
      { day: 'tue', dietId: null, target: { HC: 0, PROT: 0, GRASA: 0 }, meals: [] },
    ];
    const p = parcheDeMenu({ days })!;
    expect(p.days[0].objetivo).toMatchObject({ p: 100, hc: 100, g: 22 });
    expect(p.days[1].objetivo).toBeUndefined();
    expect(parcheDeMenu(p)).toBeNull();
  });
});
