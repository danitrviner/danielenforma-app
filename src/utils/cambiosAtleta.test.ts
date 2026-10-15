import { describe, it, expect } from 'vitest';
import type { Diet, Mesocycle, NutritionProgram } from '../types';
import { resumirDieta, resumirPrograma, resumirCalendarioDietas, resumirMeso, resumirConfigNutricion } from './cambiosAtleta';

const dieta = (over: Partial<Diet> = {}): Diet => ({
  id: 'd1', athleteId: 'a@x.com', name: 'Entreno',
  budget: { HC: 10, PROT: 8, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 },
  meals: [{ id: 'm1', name: 'Desayuno', items: [{ name: 'Avena' }] as never }],
  ...over,
});

describe('resumirDieta', () => {
  it('sin cambios no dice nada', () => expect(resumirDieta(dieta(), dieta())).toEqual([]));

  it('cuenta kcal, hidratos y alimentos añadidos o quitados', () => {
    const l = resumirDieta(dieta(), dieta({
      budget: { HC: 12, PROT: 8, GRASA: 6, MIX_HC: 0, MIX_GRASA: 0 },
      meals: [{ id: 'm1', name: 'Desayuno', items: [{ name: 'Pan' }] as never }],
    }));
    expect(l.some(x => x.startsWith('Kcal'))).toBe(true);
    expect(l).toContain('Hidratos 10 → 12 int.');
    expect(l).toContain('Añade Pan');
    expect(l).toContain('Quita Avena');
  });
});

describe('resumirPrograma', () => {
  const prog = (kcal: number, rate?: number): NutritionProgram => ({
    athleteId: 'a@x.com', startDate: '2026-09-01',
    phases: [{ id: 'f1', name: 'Déficit', weeks: 8, dietId: 'd1', targetKcal: kcal, targetRateKgWeek: rate }],
  });
  it('detecta cambio de kcal y de ritmo por fase', () => {
    const l = resumirPrograma(prog(2300, -0.5), prog(2150, -0.7));
    expect(l).toContain('«Déficit» kcal 2.300 → 2.150');
    expect(l.some(x => x.includes('ritmo'))).toBe(true);
  });
  it('fase añadida y eliminada', () => {
    const a = prog(2300);
    const b = { ...a, phases: [{ id: 'f2', name: 'Volumen', weeks: 6, dietId: 'd1', targetKcal: 2900 }] };
    const l = resumirPrograma(a, b);
    expect(l.some(x => x.startsWith('Fase nueva «Volumen»'))).toBe(true);
    expect(l).toContain('Fase «Déficit» eliminada');
  });
});

describe('resumirCalendarioDietas y config', () => {
  it('traduce ids a nombres y marca libres', () => {
    const l = resumirCalendarioDietas(
      { athleteId: 'a', activeDietIds: ['d1'], weeklySchedule: { mon: 'd1', sat: 'd1' } },
      { athleteId: 'a', activeDietIds: ['d1', 'd2'], weeklySchedule: { mon: 'd1', sat: 'd2', sun: null } },
      { d1: 'Entreno', d2: 'Descanso' },
    );
    expect(l).toContain('Sábado: Entreno → Descanso');
    expect(l).toContain('Activa Descanso');
  });
  it('pasos objetivo', () => {
    expect(resumirConfigNutricion({ athleteId: 'a', enabledModes: [], stepGoal: 8000 }, { athleteId: 'a', enabledModes: [], stepGoal: 10000 }))
      .toEqual(['Objetivo de pasos 8.000 → 10.000']);
  });
});

describe('resumirMeso', () => {
  const meso = (series: number, over: Partial<Mesocycle> = {}) => ({
    id: 'm', athleteId: 'a', number: 1, weeks: 6, startDate: '2026-10-01', objective: '', daysPerWeek: 4,
    groups: { pecho: { series, priority: 'alta' } }, ...over,
  }) as unknown as Mesocycle;
  it('series por grupo y sesiones por ciclo', () => {
    const l = resumirMeso(meso(12), meso(14, { daysPerWeek: 5 }));
    expect(l).toContain('Pecho 12 → 14 series');
    expect(l).toContain('Sesiones por ciclo 4 → 5');
  });
  it('un meso nuevo (sin antes) no registra nada', () => expect(resumirMeso(undefined, meso(12))).toEqual([]));
});
