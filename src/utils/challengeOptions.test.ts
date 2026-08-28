import { describe, expect, it } from 'vitest';
import {
  StepLog, WorkoutLog, Exercise, WeeklyChallenge, ChallengeKind,
  Diet, DietCompletionLog, CardioSession, WorkoutAssignment,
} from '../types';
import {
  nextRoundMilestone, eligibleLiftIds, generateChallengeOptions, isCoachGraceDay,
  isoWeekBounds, AutoChallengeInput, ChallengeData,
} from './challengeOptions';
import { addDays } from '../utils/trainingWeek';

const EMPTY_DATA: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: [], exercises: [],
  completionLogs: [], coachDiets: [], assignments: [], projection: null,
};

// Miércoles 2026-07-08 → semana ISO 28 de 2026 (lunes 6 - domingo 12).
const TODAY = '2026-07-08';

function input(overrides: Partial<AutoChallengeInput> = {}): AutoChallengeInput {
  return { ...EMPTY_DATA, athleteId: 'a@x.com', today: TODAY, ...overrides };
}

function stepLog(date: string, steps: number): StepLog {
  return { id: `s-${date}`, athleteId: 'a@x.com', date, steps, source: 'manual', createdAt: date };
}

const BENCH: Exercise = { id: 'bench', ownerId: 'c', name: 'Press banca', primaryFocus: 'pecho', type: 'fuerza', isCustom: false };

function benchLog(date: string, weight: number, reps: number): WorkoutLog {
  return {
    id: `w-${date}`, athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
    date, completedAt: date,
    entries: [{ exerciseId: 'bench', sets: [{ weight, repsDone: reps, rir: 1 }] }],
  };
}

describe('isCoachGraceDay', () => {
  it('is true only on Monday', () => {
    expect(isCoachGraceDay('2026-07-06')).toBe(true);  // lunes
    expect(isCoachGraceDay('2026-07-07')).toBe(false); // martes
    expect(isCoachGraceDay('2026-07-12')).toBe(false); // domingo
  });
});

describe('nextRoundMilestone', () => {
  it('proposes 100 when 2.5 kg away (classic bench press case)', () => {
    expect(nextRoundMilestone(97.5)).toEqual({ milestone: 100, distance: 2.5 });
  });

  it('returns null exactly on a round number — does not re-propose an already-hit milestone', () => {
    expect(nextRoundMilestone(100)).toBeNull();
  });

  it('proposes 150 when within the 3% threshold for large weights', () => {
    expect(nextRoundMilestone(147.5)).toEqual({ milestone: 150, distance: 2.5 });
    expect(nextRoundMilestone(146.5)).toEqual({ milestone: 150, distance: 3.5 });
  });

  it('returns null when too far from the next round number', () => {
    expect(nextRoundMilestone(96)).toBeNull();
  });

  it('uses a 5kg step for small weights', () => {
    expect(nextRoundMilestone(17.5)).toEqual({ milestone: 20, distance: 2.5 });
    expect(nextRoundMilestone(13)).toEqual({ milestone: 15, distance: 2 });
    expect(nextRoundMilestone(11)).toBeNull();
  });

  it('returns null for non-positive weights', () => {
    expect(nextRoundMilestone(0)).toBeNull();
    expect(nextRoundMilestone(-5)).toBeNull();
  });
});

describe('eligibleLiftIds', () => {
  const exercises: Exercise[] = [
    BENCH,
    { id: 'curl', ownerId: 'c', name: 'Curl con barra', primaryFocus: 'brazo', type: 'fuerza', isCustom: false },
  ];

  it('falls back to basic keywords when the coach has no config', () => {
    const ids = eligibleLiftIds(exercises, undefined);
    expect(ids.has('bench')).toBe(true);
    expect(ids.has('curl')).toBe(false);
  });

  it('uses the coach-configured list when present, even for a non-basic lift', () => {
    const ids = eligibleLiftIds(exercises, ['curl']);
    expect(ids.has('curl')).toBe(true);
    expect(ids.has('bench')).toBe(false);
  });
});

describe('generateChallengeOptions', () => {
  it('propone un reto de HÁBITO cuando no hay ningún dato, no un objetivo genérico', () => {
    // Antes esto devolvía [] y el motor caía a "8.000 pasos" para todo el
    // mundo. Un atleta sin registros no puede recibir ningún reto medible: el
    // reto correcto es generar el primer dato, y por eso puntúa por encima
    // incluso de un hito de carga.
    const opts = generateChallengeOptions(input());
    expect(opts).toHaveLength(1);
    expect(opts[0].kind).toBe('racha_registro');
    expect(opts[0].score).toBe(95);
    expect(opts[0].metric.unit).toBe('días');
  });

  it('scores a lift milestone at 96 and prioritizes it over a regular step-based option', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const stepLogs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) stepLogs.push(stepLog(addDays(weekStart, -i), 10000));
    const workoutLogs = [benchLog(addDays(weekStart, -3), 97.5, 5)];
    const opts = generateChallengeOptions(input({ stepLogs, workoutLogs, exercises: [BENCH] }));
    expect(opts[0].kind).toBe('carga_ejercicio');
    expect(opts[0].isMilestone).toBe(true);
    // 96 y no 100: el hito sigue siendo la opción estrella pero deja hueco a
    // que un atleta sin ningún registro reciba antes el reto de hábito (95).
    expect(opts[0].score).toBe(96);
    expect(opts[0].title).toContain('100 kg');
    expect(opts.some(o => o.kind === 'pasos_media')).toBe(true);
  });

  it('does not grant milestone exemption to a lift that is not close to a round number', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const workoutLogs = [benchLog(addDays(weekStart, -3), 80, 5)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH] }));
    const lift = opts.find(o => o.kind === 'carga_ejercicio');
    expect(lift?.isMilestone).toBeUndefined();
    expect(lift?.score).toBe(70);
  });

  it('only proposes lifts within the coach-configured eligible exercises', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const workoutLogs = [benchLog(addDays(weekStart, -3), 97.5, 5)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH], liftExerciseIds: ['other-ex'] }));
    expect(opts.some(o => o.kind === 'carga_ejercicio')).toBe(false);
  });

  it('penalizes repeating last week\'s kind, except for milestones', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const stepLogs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) stepLogs.push(stepLog(addDays(weekStart, -i), 5000));
    const withoutPenalty = generateChallengeOptions(input({ stepLogs }));
    const withPenalty = generateChallengeOptions(input({ stepLogs, previousKind: 'pasos_media' }));
    const before = withoutPenalty.find(o => o.kind === 'pasos_media')!;
    const after = withPenalty.find(o => o.kind === 'pasos_media')!;
    expect(after.score).toBe(before.score - 30);
  });

  it('does not apply the rotation penalty to a milestone option', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const workoutLogs = [benchLog(addDays(weekStart, -3), 97.5, 5)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH], previousKind: 'carga_ejercicio' }));
    expect(opts[0].isMilestone).toBe(true);
    expect(opts[0].score).toBe(96);
  });

  it('boosts the steps option score when the average is low', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const lowSteps: StepLog[] = [];
    for (let i = 1; i <= 20; i++) lowSteps.push(stepLog(addDays(weekStart, -i), 5000));
    const highSteps: StepLog[] = [];
    for (let i = 1; i <= 20; i++) highSteps.push(stepLog(addDays(weekStart, -i), 9000));
    const low = generateChallengeOptions(input({ stepLogs: lowSteps })).find(o => o.kind === 'pasos_media')!;
    const high = generateChallengeOptions(input({ stepLogs: highSteps })).find(o => o.kind === 'pasos_media')!;
    expect(low.score).toBe(75); // 65 + 10
    expect(high.score).toBe(65);
  });
});

// ── Comportamiento nuevo: memoria, hitos quemados y tipos añadidos ────────────

const { weekStart: WEEK_START } = isoWeekBounds(TODAY);

function past(kind: ChallengeKind, status: WeeklyChallenge['status'], extra: Partial<WeeklyChallenge> = {}, week = 27): WeeklyChallenge {
  return {
    id: `a@x.com_2026-W${week}`, athleteId: 'a@x.com', isoWeek: `2026-W${week}`,
    weekStart: '2026-06-29', weekEnd: '2026-07-05',
    kind, title: kind, description: '', origin: 'auto',
    metric: { unit: 'x', target: 100 }, status,
    progressValue: status === 'conseguido' ? 100 : 40,
    createdAt: '2026-06-29T00:00:00.000Z', ...extra,
  };
}

function fullSteps(daily = 10000): StepLog[] {
  return Array.from({ length: 20 }, (_, i) => stepLog(addDays(WEEK_START, -(i + 1)), daily));
}

function fullWeights() {
  return Array.from({ length: 14 }, (_, i) => ({
    id: `bw-${i}`, athleteId: 'a@x.com', date: addDays(WEEK_START, -(i + 1)), weight: 80, createdAt: 'x',
  }));
}

describe('hitos redondos: dos intentos y a otra cosa', () => {
  const workoutLogs = [benchLog(addDays(WEEK_START, -3), 97.5, 5)];

  it('mantiene el hito tras UN fallo, bajando su score', () => {
    const history = [past('carga_ejercicio', 'fallido', {
      isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' },
    })];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH], history }));
    const lift = opts.find(o => o.kind === 'carga_ejercicio')!;
    expect(lift.isMilestone).toBe(true);
    expect(lift.score).toBe(86);
    expect(lift.description).toContain('Segundo asalto');
  });

  it('aparca el hito tras DOS fallos y pasa a progresión normal', () => {
    const history = [
      past('carga_ejercicio', 'fallido', { isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' } }, 27),
      past('carga_ejercicio', 'fallido', { isMilestone: true, metric: { unit: 'kg', target: 120, exerciseId: 'bench' } }, 26),
    ];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH], history }));
    const lift = opts.find(o => o.kind === 'carga_ejercicio')!;
    expect(lift.isMilestone).toBeUndefined();
    // Y el PR de repeticiones sube de prioridad como vía alternativa de
    // progreso en ese mismo ejercicio.
    const reps = opts.find(o => o.kind === 'reps_ejercicio')!;
    expect(reps.score).toBeGreaterThan(lift.score);
    expect(reps.reason).toContain('hito de carga se ha agotado');
  });
});

describe('reps_ejercicio', () => {
  it('propone una repetición más al mismo peso', () => {
    const workoutLogs = [benchLog(addDays(WEEK_START, -3), 80, 8)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH] }));
    const reps = opts.find(o => o.kind === 'reps_ejercicio')!;
    expect(reps.metric.target).toBe(9);
    expect(reps.metric.atWeight).toBe(80);
    expect(reps.title).toContain('9 repeticiones con 80 kg');
  });

  it('no se propone fuera del rango 3-12 reps', () => {
    const pesado = generateChallengeOptions(input({
      workoutLogs: [benchLog(addDays(WEEK_START, -3), 120, 2)], exercises: [BENCH],
    }));
    const ligero = generateChallengeOptions(input({
      workoutLogs: [benchLog(addDays(WEEK_START, -3), 30, 20)], exercises: [BENCH],
    }));
    expect(pesado.some(o => o.kind === 'reps_ejercicio')).toBe(false);
    expect(ligero.some(o => o.kind === 'reps_ejercicio')).toBe(false);
  });
});

describe('adherencia a la dieta', () => {
  const diet: Diet = {
    id: 'd1', athleteId: 'a@x.com', name: 'Dieta',
    budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [{ id: 'm1', name: 'Comida', items: Array.from({ length: 10 }, (_, i) => ({ category: 'HC' as const, foodLabel: `alimento ${i}`, quantity: 1 })) }],
  };

  function completions(pct: number): DietCompletionLog[] {
    const done = Array.from({ length: Math.round(pct / 10) }, (_, i) => `m1_${i}`);
    return Array.from({ length: 14 }, (_, i) => ({
      id: `dc-${i}`, athleteId: 'a@x.com', date: addDays(WEEK_START, -(i + 1)), dietId: 'd1', doneItemIds: done,
    }));
  }

  it('sube en tramos sobre lo que ya hace — nunca del 50% al 80% de golpe', () => {
    const opts = generateChallengeOptions(input({ coachDiets: [diet], completionLogs: completions(50) }));
    const adh = opts.find(o => o.kind === 'adherencia_dieta')!;
    expect(adh.metric.baseline).toBe(50);
    expect(adh.metric.target).toBe(60);   // suelo del reto, no un salto a 80
    expect(adh.metric.target - adh.metric.baseline!).toBeLessThanOrEqual(10);
  });

  it('nunca pide el 100% de adherencia', () => {
    const opts = generateChallengeOptions(input({ coachDiets: [diet], completionLogs: completions(100) }));
    const adh = opts.find(o => o.kind === 'adherencia_dieta')!;
    expect(adh.metric.target).toBe(97);
  });
});

describe('series_grupo', () => {
  const SQUAT: Exercise = {
    id: 'squat', ownerId: 'c', name: 'Sentadilla', primaryFocus: 'pierna',
    muscleGroup: 'cuadriceps', type: 'fuerza', isCustom: false,
  };

  function squatLog(date: string, sets: number): WorkoutLog {
    return {
      id: `w-${date}`, athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
      date, completedAt: date,
      entries: [{ exerciseId: 'squat', sets: Array.from({ length: sets }, () => ({ weight: 100, repsDone: 8, rir: 2 })) }],
    };
  }

  it('detecta el grupo que se está saltando y pide sus propias series', () => {
    // 3 semanas a 8 series y la última a 1: media 6,25, caída del 84%.
    const workoutLogs = [
      squatLog(addDays(WEEK_START, -22), 8),
      squatLog(addDays(WEEK_START, -15), 8),
      squatLog(addDays(WEEK_START, -8), 8),
      squatLog(addDays(WEEK_START, -3), 1),
    ];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [SQUAT] }));
    const vol = opts.find(o => o.kind === 'series_grupo')!;
    expect(vol.metric.muscleGroup).toBe('cuadriceps');
    expect(vol.reason).toContain('se está saltando');
    expect(vol.metric.target).toBeGreaterThan(1);
  });

  it('ignora grupos con menos de 3 series semanales de media (ruido de secundarios)', () => {
    const workoutLogs = [squatLog(addDays(WEEK_START, -3), 2)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [SQUAT] }));
    expect(opts.some(o => o.kind === 'series_grupo')).toBe(false);
  });
});

describe('cardio_zona2', () => {
  function session(date: string, z2Min: number, manual = false): CardioSession {
    return {
      id: `cs-${date}`, athleteId: 'a@x.com', type: 'zona2', date, startedAt: date,
      durationSec: z2Min * 60,
      timeInZoneSec: { z1: 0, z2: z2Min * 60, z3: 0, z4: 0, z5: 0 },
      samples: [], sampleIntervalSec: 5, manual,
    };
  }

  it('propone minutos sobre la media de las últimas 4 semanas', () => {
    const cardioSessions = [
      session(addDays(WEEK_START, -20), 40),
      session(addDays(WEEK_START, -10), 40),
      session(addDays(WEEK_START, -3), 40),
      session(addDays(WEEK_START, -2), 40),
    ];
    const opts = generateChallengeOptions(input({ cardioSessions }));
    const z2 = opts.find(o => o.kind === 'cardio_zona2')!;
    expect(z2.metric.unit).toBe('min');
    expect(z2.metric.baseline).toBe(40);   // 160 min / 4 semanas
    expect(z2.metric.target).toBeGreaterThan(40);
  });

  it('no se propone con sesiones añadidas a mano (sin banda no hay zonas reales)', () => {
    const cardioSessions = [
      session(addDays(WEEK_START, -10), 40, true),
      session(addDays(WEEK_START, -3), 40, true),
    ];
    expect(generateChallengeOptions(input({ cardioSessions })).some(o => o.kind === 'cardio_zona2')).toBe(false);
  });

  it('no se propone a quien no hace cardio', () => {
    expect(generateChallengeOptions(input()).some(o => o.kind === 'cardio_zona2')).toBe(false);
  });
});

describe('racha_registro', () => {
  it('elige el registro peor cubierto y lo prioriza cuando bloquea al motor', () => {
    // Camina y lo registra todos los días, pero no se pesa nunca.
    const opts = generateChallengeOptions(input({ stepLogs: fullSteps() }));
    const racha = opts.find(o => o.kind === 'racha_registro')!;
    expect(racha.metric.streakSource).toBe('peso');
    expect(racha.score).toBe(62);
  });

  it('baja a segundo plano cuando el atleta ya registra de todo', () => {
    const opts = generateChallengeOptions(input({ stepLogs: fullSteps(), bodyweightLogs: fullWeights() }));
    const racha = opts.find(o => o.kind === 'racha_registro')!;
    expect(racha.score).toBe(40);
  });
});

describe('entrenos_completados', () => {
  const assignments: WorkoutAssignment[] = Array.from({ length: 4 }, (_, i) => ({
    id: `as-${i}`, workoutId: 'wk', athleteId: 'a@x.com',
    date: addDays(WEEK_START, i), status: 'pending' as const,
  }));

  it('pide el pleno por defecto', () => {
    const opts = generateChallengeOptions(input({ assignments }));
    expect(opts.find(o => o.kind === 'entrenos_completados')!.metric.target).toBe(4);
  });

  it('rebaja a 3 de 4 tras dos semanas fallando el pleno', () => {
    const history = [
      past('entrenos_completados', 'fallido', {}, 27),
      past('entrenos_completados', 'fallido', {}, 26),
      past('pasos_media', 'conseguido', {}, 25),
      past('pasos_media', 'conseguido', {}, 24),
    ];
    const opts = generateChallengeOptions(input({ assignments, history }));
    const ent = opts.find(o => o.kind === 'entrenos_completados')!;
    expect(ent.metric.target).toBe(3);
    expect(ent.title).toContain('3 de 4');
  });
});

describe('rotación sobre 4 semanas', () => {
  it('penaliza con memoria larga, no solo la semana anterior', () => {
    const stepLogs = fullSteps(5000);
    const base = generateChallengeOptions(input({ stepLogs, bodyweightLogs: fullWeights() }));
    const conMemoria = generateChallengeOptions(input({
      stepLogs, bodyweightLogs: fullWeights(),
      history: [
        past('adherencia_dieta', 'conseguido', {}, 27),
        past('pasos_media', 'conseguido', {}, 26),   // hace 2 semanas → -18
      ],
    }));
    const antes = base.find(o => o.kind === 'pasos_media')!.score;
    const despues = conMemoria.find(o => o.kind === 'pasos_media')!.score;
    expect(despues).toBe(antes - 18);
  });
});
