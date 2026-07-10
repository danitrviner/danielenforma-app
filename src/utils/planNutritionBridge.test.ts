import { describe, expect, it } from 'vitest';
import { PlanPhase, NutritionProgram } from '../types';
import { buildNutritionProgramDraft, computePhaseWeightStatus } from './planNutritionBridge';
import { ProjectionResult, WeeklyProjectionPoint } from './nutritionPeriodization';

function phase(overrides: Partial<PlanPhase>): PlanPhase {
  return {
    id: 'p1', order: 0, name: 'Fase', color: '#fbcb1a', icon: 'route',
    status: 'futura', metrics: [], ...overrides,
  };
}

describe('buildNutritionProgramDraft — mode full', () => {
  it('chains target weight across deficit/superavit/mantenimiento phases', () => {
    const planPhases: PlanPhase[] = [
      phase({ id: 'p1', order: 0, status: 'actual', suggestedWeeks: 4, weightDirection: 'deficit', weightRateKgWeek: 0.5 }),
      phase({ id: 'p2', order: 1, status: 'futura', suggestedWeeks: 8, weightDirection: 'mantenimiento' }),
      phase({ id: 'p3', order: 2, status: 'futura', suggestedWeeks: 10, weightDirection: 'superavit', weightRateKgWeek: 0.25 }),
    ];
    const { program, linkedPlanPhases } = buildNutritionProgramDraft({
      athleteId: 'a@x.com', planPhases, currentWeightKg: 90, startDate: '2026-07-06',
      existing: null, mode: 'full', today: '2026-07-06',
    });

    expect(program.phases).toHaveLength(3);
    expect(program.phases[0]).toMatchObject({ id: 'nph_p1', weeks: 4, targetWeight: 88 }); // 90 - 0.5*4
    expect(program.phases[1]).toMatchObject({ id: 'nph_p2', weeks: 8, targetWeight: undefined });
    // Fase 3 arranca desde el peso encadenado de la fase 2 (mantenimiento → sigue en 88)
    expect(program.phases[2]).toMatchObject({ id: 'nph_p3', weeks: 10, targetWeight: 90.5 }); // 88 + 0.25*10
    expect(program.phases.every(p => p.dietId === '')).toBe(true);

    expect(linkedPlanPhases.find(p => p.id === 'p1')?.nutritionPhaseId).toBe('nph_p1');
    expect(linkedPlanPhases.find(p => p.id === 'p3')?.nutritionPhaseId).toBe('nph_p3');
  });

  it('excludes completed plan phases from the draft', () => {
    const planPhases: PlanPhase[] = [
      phase({ id: 'done', order: 0, status: 'completada' }),
      phase({ id: 'p2', order: 1, status: 'actual', suggestedWeeks: 6, weightDirection: 'mantenimiento' }),
    ];
    const { program } = buildNutritionProgramDraft({
      athleteId: 'a@x.com', planPhases, currentWeightKg: 80, startDate: '2026-07-06',
      existing: null, mode: 'full', today: '2026-07-06',
    });
    expect(program.phases).toHaveLength(1);
    expect(program.phases[0].id).toBe('nph_p2');
  });

  it('defaults weeks to 6 and rate to 0.5 when the plan phase omits them', () => {
    const planPhases: PlanPhase[] = [phase({ id: 'p1', order: 0, status: 'actual', weightDirection: 'deficit' })];
    const { program } = buildNutritionProgramDraft({
      athleteId: 'a@x.com', planPhases, currentWeightKg: 90, startDate: '2026-07-06',
      existing: null, mode: 'full', today: '2026-07-06',
    });
    expect(program.phases[0]).toMatchObject({ weeks: 6, targetWeight: 87 }); // 90 - 0.5*6
  });
});

describe('buildNutritionProgramDraft — mode futuras', () => {
  const existing: NutritionProgram = {
    athleteId: 'a@x.com',
    startDate: '2026-01-01',
    phases: [
      { id: 'nph_done', name: 'Pasada', weeks: 4, dietId: 'd1', targetWeight: 92 },
      { id: 'nph_active', name: 'Activa', weeks: 8, dietId: 'd1', targetWeight: 88 },
    ],
  };

  it('keeps past + active nutrition phases and chains new ones from the last target weight', () => {
    const planPhases: PlanPhase[] = [
      phase({ id: 'done', order: 0, status: 'completada' }),
      phase({ id: 'active', order: 1, status: 'actual' }), // ya tiene su nutritionPhase existente
      phase({ id: 'next', order: 2, status: 'futura', suggestedWeeks: 10, weightDirection: 'superavit', weightRateKgWeek: 0.25 }),
    ];
    // 2026-01-01 + 4 semanas = 2026-01-29 (fin fase 1) — active corre desde ahí;
    // hoy cae dentro de la fase activa (semana 8 total desde el inicio de fase 2).
    const { program, linkedPlanPhases } = buildNutritionProgramDraft({
      athleteId: 'a@x.com', planPhases, currentWeightKg: 88, startDate: '2026-01-01',
      existing, mode: 'futuras', today: '2026-02-10',
    });

    expect(program.phases).toHaveLength(3);
    expect(program.phases[0]).toEqual(existing.phases[0]);
    expect(program.phases[1]).toEqual(existing.phases[1]);
    expect(program.phases[2]).toMatchObject({ id: 'nph_next', targetWeight: 90.5 }); // 88 + 0.25*10

    expect(linkedPlanPhases.find(p => p.id === 'next')?.nutritionPhaseId).toBe('nph_next');
    // Las fases ya enlazadas no se tocan (no hay nph_active/nph_done en `regenerated`).
    expect(linkedPlanPhases.find(p => p.id === 'active')?.nutritionPhaseId).toBeUndefined();
  });
});

describe('computePhaseWeightStatus', () => {
  function point(overrides: Partial<WeeklyProjectionPoint>): WeeklyProjectionPoint {
    return { week: 0, date: '2026-07-06', phaseId: 'nph_1', targetKcal: 2000, expected100: null, expectedAdherence: null, real: null, isProjected: false, ...overrides };
  }

  it('computes progress toward the phase target using real weigh-ins', () => {
    const projection: ProjectionResult = {
      points: [
        point({ week: 0, expected100: 90, expectedAdherence: 90, real: 90 }),
        point({ week: 1, expected100: 89.3, expectedAdherence: 89.5, real: 89 }),
        point({ week: 2, expected100: 88.6, expectedAdherence: 89, real: null }),
      ],
      currentWeek: 1, totalWeeks: 4, startWeightKg: 90, dietAdherenceWeekly: [], stepAdherenceWeekly: [],
    };
    const program: NutritionProgram = { athleteId: 'a', startDate: '2026-07-06', phases: [{ id: 'nph_1', name: 'F', weeks: 4, dietId: '', targetWeight: 86 }] };

    const status = computePhaseWeightStatus(projection, program, 'nph_1');
    expect(status).not.toBeNull();
    expect(status!.startKg).toBe(90);
    expect(status!.currentKg).toBe(89);
    expect(status!.targetKg).toBe(86);
    expect(status!.projectedKg).toBe(89.5);
    expect(status!.deltaVsPlanKg).toBeCloseTo(-0.5, 5); // 89 - 89.5
    expect(status!.pct).toBeCloseTo(25, 5); // (90-89)/(90-86)*100
  });

  it('returns null when the phase has no projection points', () => {
    const projection: ProjectionResult = { points: [], currentWeek: 0, totalWeeks: 0, startWeightKg: null, dietAdherenceWeekly: [], stepAdherenceWeekly: [] };
    const program: NutritionProgram = { athleteId: 'a', startDate: '2026-07-06', phases: [] };
    expect(computePhaseWeightStatus(projection, program, 'nph_missing')).toBeNull();
  });
});
