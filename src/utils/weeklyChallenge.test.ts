import { describe, expect, it } from 'vitest';
import { StepLog, WorkoutLog, Exercise, WorkoutAssignment, WeeklyChallenge, CardioSession } from '../types';
import { isoWeekKey, isoWeekBounds, generateAutoChallenge, evaluateChallengeProgress, ChallengeData, AutoChallengeInput } from './weeklyChallenge';
import { addDays } from './trainingWeek';

const EMPTY_DATA: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: [], exercises: [],
  completionLogs: [], coachDiets: [], assignments: [], projection: null,
};

// Miércoles 2026-07-08 → semana ISO 28 de 2026 (lunes 6 - domingo 12).
const TODAY = '2026-07-08';

function stepLog(date: string, steps: number): StepLog {
  return { id: `s-${date}`, athleteId: 'a@x.com', date, steps, source: 'manual', createdAt: date };
}

function input(overrides: Partial<AutoChallengeInput> = {}): AutoChallengeInput {
  return { ...EMPTY_DATA, athleteId: 'a@x.com', today: TODAY, ...overrides };
}

describe('isoWeekKey', () => {
  it('computes the ISO week of a mid-year date', () => {
    expect(isoWeekKey('2026-07-08')).toBe('2026-W28');
  });

  it('assigns early January to the previous ISO year when it belongs to week 53', () => {
    // 1 ene 2027 es viernes → pertenece a la semana 53 del año ISO 2026.
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
  });

  it('is stable across the whole week (idempotencia del doc ID)', () => {
    // No se fija un literal para weekEnd: addDays (trainingWeek.ts) parsea la
    // fecha en hora local y serializa en UTC, así que en husos adelantados a
    // UTC (p.ej. Europe/Madrid) el resultado puede quedar un día por detrás.
    // Ver nota separada — bug preexistente fuera del alcance de este cambio.
    const { weekStart, weekEnd } = isoWeekBounds(TODAY);
    expect(isoWeekKey(weekStart)).toBe(isoWeekKey(TODAY));
    expect(isoWeekKey(weekEnd)).toBe(isoWeekKey(TODAY));
    expect(weekStart).toBe('2026-07-06');
  });
});

describe('generateAutoChallenge', () => {
  it('manda un reto de registro cuando no hay ningún dato (en vez del genérico de 8.000 pasos)', () => {
    const ch = generateAutoChallenge(input());
    expect(ch.kind).toBe('racha_registro');
    expect(ch.metric.unit).toBe('días');
    expect(ch.metric.target).toBe(3);   // suelo del reto de hábito: 3 de 7 días
    expect(ch.origin).toBe('auto');
    expect(ch.status).toBe('activo');
    expect(ch.id).toBe('a@x.com_2026-W28');
  });

  it('proposes beating the 4-week step average by 5% when steps are logged', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const logs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) logs.push(stepLog(addDays(weekStart, -i), 10000));
    const ch = generateAutoChallenge(input({ stepLogs: logs }));
    expect(ch.kind).toBe('pasos_media');
    expect(ch.metric.target).toBe(10500);
    expect(ch.metric.baseline).toBe(10000);
  });

  it('rotates away from last week\'s kind when another candidate is viable', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const logs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) logs.push(stepLog(addDays(weekStart, -i), 10000));
    const exercises: Exercise[] = [
      { id: 'ex1', ownerId: 'c', name: 'Sentadilla trasera', primaryFocus: 'pierna', type: 'fuerza', isCustom: false },
    ];
    const workoutLogs: WorkoutLog[] = [{
      id: 'w1', athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
      date: addDays(weekStart, -3), completedAt: addDays(weekStart, -3),
      entries: [{ exerciseId: 'ex1', sets: [{ weight: 100, repsDone: 5, rir: 2 }] }],
    }];
    const ch = generateAutoChallenge(input({ stepLogs: logs, exercises, workoutLogs, previousKind: 'pasos_media' }));
    expect(ch.kind).toBe('carga_ejercicio');
    expect(ch.metric.exerciseName).toBe('Sentadilla trasera');
    // target = min(epley(102.5,5), epley(100,6)) = min(119.6, 120) = 119.6
    expect(ch.metric.target).toBeCloseTo(119.6, 1);
  });

  it('prefers a viable non-repeated option over the generic fallback', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const logs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) logs.push(stepLog(addDays(weekStart, -i), 10000));
    // Se registra también el peso para que el reto de hábito no se dispare: con
    // los dos registros cubiertos, la racha baja a score 40 y la competición
    // queda entre pasos_media (penalizado por rotación) y pasos_total.
    const bodyweightLogs = Array.from({ length: 14 }, (_, i) => ({
      id: `bw-${i}`, athleteId: 'a@x.com', date: addDays(weekStart, -(i + 1)), weight: 80, createdAt: 'x',
    }));
    const ch = generateAutoChallenge(input({ stepLogs: logs, bodyweightLogs, previousKind: 'pasos_media' }));
    expect(ch.kind).toBe('pasos_total');
    expect(ch.metric.target).toBe(74000); // avg=10000 * 7 * 1.05 redondeado a miles
  });
});

describe('evaluateChallengeProgress', () => {
  const baseChallenge: WeeklyChallenge = {
    id: 'a@x.com_2026-W28', athleteId: 'a@x.com', isoWeek: '2026-W28',
    weekStart: '2026-07-06', weekEnd: '2026-07-12',
    kind: 'pasos_media', title: 't', description: 'd', origin: 'auto',
    metric: { unit: 'pasos', target: 10000 }, status: 'activo', createdAt: '2026-07-06',
  };

  it('does not mark a steps average achieved mid-week with too few logged days', () => {
    const data = { ...EMPTY_DATA, stepLogs: [stepLog('2026-07-06', 15000)] };
    const res = evaluateChallengeProgress(baseChallenge, data, '2026-07-07');
    expect(res.progressValue).toBe(15000);
    expect(res.achieved).toBe(false); // 1 día registrado, mínimo 5 en mitad de semana
  });

  it('marks a steps average achieved once the week is over', () => {
    const data = { ...EMPTY_DATA, stepLogs: [stepLog('2026-07-06', 15000)] };
    const res = evaluateChallengeProgress(baseChallenge, data, '2026-07-13');
    expect(res.achieved).toBe(true);
  });

  it('measures lift progress against the baseline→target span', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'carga_ejercicio',
      metric: { unit: 'kg', target: 120, baseline: 110, exerciseId: 'ex1' },
    };
    const data: ChallengeData = {
      ...EMPTY_DATA,
      workoutLogs: [{
        id: 'w1', athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
        date: '2026-07-07', completedAt: '2026-07-07',
        entries: [{ exerciseId: 'ex1', sets: [{ weight: 100, repsDone: 5, rir: 1 }] }],
      }],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-08');
    expect(res.progressValue).toBeCloseTo(116.7, 1); // epley(100,5)
    expect(res.achieved).toBe(false);
    expect(res.pct).toBeGreaterThan(0);
    expect(res.pct).toBeLessThan(100);
  });

  it('resolves a weight-loss target from the last weigh-in of the week', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'peso_objetivo',
      metric: { unit: 'kg', target: 82, baseline: 83 },
    };
    const data: ChallengeData = {
      ...EMPTY_DATA,
      bodyweightLogs: [
        { id: 'b1', athleteId: 'a@x.com', date: '2026-07-07', weight: 82.4, createdAt: '2026-07-07' },
        { id: 'b2', athleteId: 'a@x.com', date: '2026-07-10', weight: 81.9, createdAt: '2026-07-10' },
      ],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-11');
    expect(res.progressValue).toBe(81.9);
    expect(res.achieved).toBe(true);
  });

  it('counts completed workout assignments within the week', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'entrenos_completados',
      metric: { unit: 'sesiones', target: 3 },
    };
    const mk = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment =>
      ({ id: `a-${date}`, workoutId: 'w', athleteId: 'uid', date, status });
    const data: ChallengeData = {
      ...EMPTY_DATA,
      assignments: [mk('2026-07-06', 'completed'), mk('2026-07-08', 'completed'), mk('2026-07-10', 'pending')],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-09');
    expect(res.progressValue).toBe(2);
    expect(res.achieved).toBe(false);
    expect(res.pct).toBeCloseTo(66.7, 1);
  });

  // ── Tipos añadidos ──────────────────────────────────────────────────────────

  it('reps_ejercicio: cuenta las mejores reps al peso pactado, no a uno menor', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'reps_ejercicio',
      metric: { unit: 'reps', target: 9, baseline: 8, exerciseId: 'ex1', atWeight: 80 },
    };
    const data: ChallengeData = {
      ...EMPTY_DATA,
      workoutLogs: [{
        id: 'w1', athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
        date: '2026-07-08', completedAt: '2026-07-08',
        entries: [{ exerciseId: 'ex1', sets: [
          { weight: 70, repsDone: 15, rir: 1 },  // más reps pero con menos peso: no vale
          { weight: 80, repsDone: 8, rir: 0 },
        ] }],
      }],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-09');
    expect(res.progressValue).toBe(8);
    expect(res.achieved).toBe(false);
  });

  it('reps_ejercicio: se consigue al llegar a las reps objetivo', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'reps_ejercicio',
      metric: { unit: 'reps', target: 9, baseline: 8, exerciseId: 'ex1', atWeight: 80 },
    };
    const data: ChallengeData = {
      ...EMPTY_DATA,
      workoutLogs: [{
        id: 'w1', athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
        date: '2026-07-08', completedAt: '2026-07-08',
        entries: [{ exerciseId: 'ex1', sets: [{ weight: 80, repsDone: 10, rir: 0 }] }],
      }],
    };
    expect(evaluateChallengeProgress(ch, data, '2026-07-09').achieved).toBe(true);
  });

  it('series_grupo: suma series fraccionales del grupo dentro de la semana', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'series_grupo',
      metric: { unit: 'series', target: 10, muscleGroup: 'cuadriceps' },
    };
    const exercises: Exercise[] = [
      { id: 'sq', ownerId: 'c', name: 'Sentadilla', primaryFocus: 'pierna', muscleGroup: 'cuadriceps', type: 'fuerza', isCustom: false },
      { id: 'pm', ownerId: 'c', name: 'Peso muerto', primaryFocus: 'pierna', muscleGroup: 'isquios', secondaryMuscleGroups: ['cuadriceps'], type: 'fuerza', isCustom: false },
    ];
    const sets = (n: number) => Array.from({ length: n }, () => ({ weight: 100, repsDone: 8, rir: 2 }));
    const data: ChallengeData = {
      ...EMPTY_DATA, exercises,
      workoutLogs: [
        {
          id: 'w1', athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
          date: '2026-07-07', completedAt: '2026-07-07',
          entries: [{ exerciseId: 'sq', sets: sets(4) }, { exerciseId: 'pm', sets: sets(4) }],
        },
        {
          // Fuera de la semana del reto: no cuenta.
          id: 'w0', athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
          date: '2026-07-01', completedAt: '2026-07-01',
          entries: [{ exerciseId: 'sq', sets: sets(10) }],
        },
      ],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-09');
    expect(res.progressValue).toBe(6);  // 4 principales + 4 secundarias × 0,5
    expect(res.achieved).toBe(false);
  });

  it('cardio_zona2: acumula minutos de la semana y descarta sesiones manuales', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'cardio_zona2', metric: { unit: 'min', target: 60 },
    };
    const s = (date: string, min: number, manual = false): CardioSession => ({
      id: `cs-${date}`, athleteId: 'a@x.com', type: 'zona2', date, startedAt: date,
      durationSec: min * 60, timeInZoneSec: { z1: 0, z2: min * 60, z3: 0, z4: 0, z5: 0 },
      samples: [], sampleIntervalSec: 5, manual,
    });
    const data: ChallengeData = {
      ...EMPTY_DATA,
      cardioSessions: [s('2026-07-07', 30), s('2026-07-09', 30), s('2026-07-09', 60, true)],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-10');
    expect(res.progressValue).toBe(60);
    expect(res.achieved).toBe(true);
  });

  it('racha_registro: cuenta días distintos con registro de la fuente indicada', () => {
    const ch: WeeklyChallenge = {
      ...baseChallenge, kind: 'racha_registro',
      metric: { unit: 'días', target: 4, streakSource: 'peso' },
    };
    const bw = (date: string, id: string) => ({ id, athleteId: 'a@x.com', date, weight: 80, createdAt: date });
    const data: ChallengeData = {
      ...EMPTY_DATA,
      bodyweightLogs: [
        bw('2026-07-06', 'b1'), bw('2026-07-06', 'b1b'),  // dos veces el mismo día = 1
        bw('2026-07-07', 'b2'), bw('2026-07-08', 'b3'),
        bw('2026-07-01', 'b0'),                            // semana anterior: fuera
      ],
    };
    const res = evaluateChallengeProgress(ch, data, '2026-07-09');
    expect(res.progressValue).toBe(3);
    expect(res.achieved).toBe(false);
    expect(res.pct).toBe(75);
  });
});
