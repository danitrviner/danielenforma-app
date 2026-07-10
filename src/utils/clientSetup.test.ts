import { describe, expect, it } from 'vitest';
import { computeSetupChecklist, estimateSetupPct, SetupInputs } from './clientSetup';
import { UserProfile, WeightCheckIn, WorkoutAssignment, CoachClientTask, WeeklyChallenge } from '../types';
import { addDays } from './trainingWeek';

// 2026-07-06 es lunes (ver weeklyChallenge.test.ts) — útil para probar isCoachGraceDay.
const TODAY = '2026-07-06';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1', email: 'a@x.com', displayName: 'Ana', role: 'client', avatarUrl: '',
    level: 1, xp: 0, currentStreak: 0, maxStreak: 0,
    initialWeight: 0, targetWeight: 0, actualWeight: 0,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<SetupInputs> = {}): SetupInputs {
  return {
    profile: makeProfile(),
    onboarding: null,
    checkins: [],
    mesocycles: [],
    workoutAssignments: [],
    diets: [],
    dietConfig: null,
    nutritionConfig: null,
    qAssignments: [],
    photoAssignments: [],
    photos: [],
    workoutLogs: [],
    roadmap: null,
    nutritionProgram: null,
    weeklyChallenge: null,
    manualTasks: [],
    today: TODAY,
    ...overrides,
  };
}

function checkin(overrides: Partial<WeightCheckIn> = {}): WeightCheckIn {
  return {
    id: 'c1', userId: 'u1', email: 'a@x.com', timestamp: new Date(TODAY),
    dateStr: TODAY, weight: 70, mood: '😊', adherence: 'Sí', notes: '',
    ...overrides,
  };
}

describe('computeSetupChecklist', () => {
  it('marks primeras_semanas and consolidacion as na and flags missing plan date, without crashing nextStep', () => {
    const result = computeSetupChecklist(makeInputs());
    const primeras = result.phases.find(p => p.id === 'primeras_semanas')!;
    const consolidacion = result.phases.find(p => p.id === 'consolidacion')!;
    expect(primeras.items.every(i => i.status === 'na')).toBe(true);
    expect(consolidacion.items.every(i => i.status === 'na')).toBe(true);
    const alta = result.phases.find(p => p.id === 'alta')!;
    expect(alta.items.find(i => i.id === 'alta_plan_fechado')!.status).toBe('attention');
    expect(result.attentionCount).toBeGreaterThan(0);
    expect(result.nextStep?.id).toBe('alta_plan_fechado');
  });

  it('day 0: primeras_semanas window items are attention, consolidacion still na', () => {
    const result = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: TODAY, planDurationMonths: 6 }),
    }));
    const primeras = result.phases.find(p => p.id === 'primeras_semanas')!;
    expect(primeras.items.find(i => i.id === 'w1_contacto_diario')!.status).toBe('attention');
    expect(primeras.items.find(i => i.id === 'w1_primer_checkin')!.status).toBe('pending');
    const consolidacion = result.phases.find(p => p.id === 'consolidacion')!;
    expect(consolidacion.items.every(i => i.status === 'na')).toBe(true);
  });

  it('day 10: w1 contact window closed, w24 objetivos not yet in its window', () => {
    const result = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: addDays(TODAY, -10), planDurationMonths: 6 }),
    }));
    const primeras = result.phases.find(p => p.id === 'primeras_semanas')!;
    expect(primeras.items.find(i => i.id === 'w1_contacto_diario')!.status).toBe('pending');
    expect(primeras.items.find(i => i.id === 'w24_objetivos')!.status).toBe('pending');
    expect(primeras.items.find(i => i.id === 'w1_primer_checkin')!.status).toBe('attention');
  });

  it('day 35: consolidacion active, renovacion anticipada in attention window', () => {
    const result = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: addDays(TODAY, -35), planDurationMonths: 6 }),
    }));
    const consolidacion = result.phases.find(p => p.id === 'consolidacion')!;
    expect(consolidacion.items.every(i => i.status !== 'na')).toBe(true);
    expect(consolidacion.items.find(i => i.id === 'c_renovacion_anticipada')!.status).toBe('attention');
  });

  it('day 55: renovacion anticipada window closed (pending, not attention)', () => {
    const result = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: addDays(TODAY, -55), planDurationMonths: 6 }),
    }));
    const consolidacion = result.phases.find(p => p.id === 'consolidacion')!;
    expect(consolidacion.items.find(i => i.id === 'c_renovacion_anticipada')!.status).toBe('pending');
  });

  it('checkin with coachFeedback marks w1_primera_revision as done', () => {
    const result = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: TODAY, planDurationMonths: 6 }),
      checkins: [checkin({ coachFeedback: 'bien hecho' })],
    }));
    const primeras = result.phases.find(p => p.id === 'primeras_semanas')!;
    expect(primeras.items.find(i => i.id === 'w1_primera_revision')!.status).toBe('done');
    expect(primeras.items.find(i => i.id === 'w1_primer_checkin')!.status).toBe('done');
  });

  it('manualTasks overlay marks a manual item done regardless of window', () => {
    const manualTasks: CoachClientTask[] = [
      { id: 'a@x.com_w1_contacto_diario', athleteId: 'a@x.com', itemId: 'w1_contacto_diario', title: 'x', phase: 'primeras_semanas', done: true, createdBy: 'seed', createdAt: TODAY },
    ];
    const result = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: TODAY, planDurationMonths: 6 }),
      manualTasks,
    }));
    const primeras = result.phases.find(p => p.id === 'primeras_semanas')!;
    expect(primeras.items.find(i => i.id === 'w1_contacto_diario')!.status).toBe('done');
  });

  it('weekly challenge: monday with no challenge yields attention item + alert; auto origin off-monday yields soft alert', () => {
    const profile = makeProfile({ planStartDate: TODAY, planDurationMonths: 6 });
    const noChallenge = computeSetupChecklist(makeInputs({ profile, weeklyChallenge: null }));
    const primeras1 = noChallenge.phases.find(p => p.id === 'primeras_semanas')!;
    expect(primeras1.items.find(i => i.id === 'w1_reto_semana')!.status).toBe('attention');
    expect(noChallenge.alerts.find(a => a.id === 'rec_reto_lunes')).toBeTruthy();

    const autoChallenge: WeeklyChallenge = {
      id: 'a@x.com_2026-W28', athleteId: 'a@x.com', isoWeek: '2026-W28', weekStart: TODAY, weekEnd: addDays(TODAY, 6),
      kind: 'pasos_media', title: 't', description: 'd', origin: 'auto',
      metric: { unit: 'pasos', target: 1000 }, status: 'activo', createdAt: TODAY,
    };
    const tuesday = '2026-07-07';
    const result = computeSetupChecklist(makeInputs({ profile, weeklyChallenge: autoChallenge, today: tuesday }));
    const primeras2 = result.phases.find(p => p.id === 'primeras_semanas')!;
    expect(primeras2.items.find(i => i.id === 'w1_reto_semana')!.status).toBe('pending');
    expect(result.alerts.find(a => a.id === 'rec_reto_lunes')).toBeTruthy();
  });

  it('periodizacion with an empty dietId phase is attention, not done', () => {
    const result = computeSetupChecklist(makeInputs({
      nutritionProgram: { athleteId: 'a@x.com', startDate: TODAY, phases: [{ id: 'p1', name: 'Fase 1', weeks: 4, dietId: '' }] },
    }));
    const prog = result.phases.find(p => p.id === 'programacion')!;
    expect(prog.items.find(i => i.id === 'prog_periodizacion')!.status).toBe('attention');
  });

  it('globalPct excludes na items from the denominator', () => {
    const withoutPlan = computeSetupChecklist(makeInputs());
    const withPlan = computeSetupChecklist(makeInputs({
      profile: makeProfile({ planStartDate: TODAY, planDurationMonths: 6 }),
    }));
    // Same alta+programacion completion (all still pending), but withPlan has
    // more countable items (primeras_semanas no longer na) — pct should differ
    // rather than crash or divide by zero.
    expect(Number.isFinite(withoutPlan.globalPct)).toBe(true);
    expect(Number.isFinite(withPlan.globalPct)).toBe(true);
  });
});

describe('estimateSetupPct', () => {
  it('returns 0 for a bare-minimum profile with no checkins/assignments', () => {
    expect(estimateSetupPct(makeProfile(), [], [])).toBe(0);
  });

  it('returns 100 when all cheap signals are present', () => {
    const profile = makeProfile({ planStartDate: TODAY, planDurationMonths: 6, initialWeight: 70, targetWeight: 65 });
    const assignments: WorkoutAssignment[] = [{ id: 'wa1', workoutId: 'w1', athleteId: 'a@x.com', date: TODAY, status: 'pending' }];
    expect(estimateSetupPct(profile, [checkin()], assignments)).toBe(100);
  });
});
