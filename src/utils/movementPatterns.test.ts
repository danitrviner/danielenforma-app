import { describe, expect, it } from 'vitest';
import { Exercise, MuscleGroup, Mesocycle, WorkoutLog } from '../types';
import { buildMovementPatternReport, patronPropioDeEjercicio, patronesDeEjercicio, patronesPonderados } from './movementPatterns';

const ex = (id: string, name: string, muscleGroup: MuscleGroup, secondary?: MuscleGroup[]): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, secondaryMuscleGroups: secondary,
  type: 'fuerza', isCustom: false,
});

const EJERCICIOS = [
  ex('press', 'Press banca', 'pecho', ['triceps']),
  ex('remo', 'Remo con barra', 'dorsal', ['biceps']),
  ex('curl', 'Curl bíceps', 'biceps'),
  ex('sentadilla', 'Sentadilla', 'cuadriceps'),
  ex('hip-thrust', 'Hip thrust', 'gluteo'),
  ex('plancha', 'Plancha', 'core'), // sin patrón asignado
  // Nombre que no dice qué es: cae al reparto por grupo de antes de F17.
  ex('convergente', 'Máquina convergente', 'pecho', ['triceps']),
  ex('laterales', 'Elevaciones laterales con mancuerna', 'deltoide_lat'),
  ex('frances', 'Press francés', 'triceps'),
];

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number }[]): WorkoutLog => ({
  id: `l-${date}-${exerciseId}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series.map(s => ({ ...s, rir: 2 })) }],
});

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@b.c', number: 2, weeks: 4, startDate: '2026-06-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: {} as Mesocycle['groups'],
  ...over,
});

describe('buildMovementPatternReport', () => {
  it('agrupa por patrón de movimiento, no por grupo muscular', () => {
    const logs = [
      log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }]),
      log('2026-06-03', 'sentadilla', [{ weight: 100, repsDone: 5 }]),
    ];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const torso = r.patterns.find(p => p.group === 'empuje_torso')!;
    const pierna = r.patterns.find(p => p.group === 'empuje_pierna')!;
    // F17: el press de banca es un empuje de torso y cuenta entero UNA vez (antes 960:
    // el tríceps secundario sumaba otro medio press al mismo patrón).
    expect(torso.tonnage).toBe(640);
    expect(pierna.tonnage).toBe(500); // 100kg x 5 reps, sentadilla sin secundarios
  });

  it('sin dato fiable del ejercicio, reparte por grupo como antes (tríceps secundario: torso Y brazo)', () => {
    const logs = [log('2026-06-02', 'convergente', [{ weight: 80, repsDone: 8 }])];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const torso = r.patterns.find(p => p.group === 'empuje_torso')!;
    const brazo = r.patterns.find(p => p.group === 'brazo')!;
    // Principal (pecho->torso) pesa 1 (640), secundario (tríceps->torso+brazo) pesa 0.5 en cada uno (320).
    expect(torso.tonnage).toBe(960);
    expect(brazo.tonnage).toBe(320);
  });

  it('un ejercicio sin patrón asignado (core) no aporta a ningún bucket', () => {
    const logs = [log('2026-06-02', 'plancha', [{ weight: 0, repsDone: 1 }])];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    expect(r.patterns.every(p => p.sets === 0)).toBe(true);
  });

  it('calcula el delta de 1RM medio contra el mesociclo anterior', () => {
    const anterior = meso({ id: 'm1', number: 1, startDate: '2026-05-01' });
    const logs = [
      log('2026-05-05', 'sentadilla', [{ weight: 80, repsDone: 5 }]),
      log('2026-06-05', 'sentadilla', [{ weight: 100, repsDone: 5 }]),
    ];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso(), anterior],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: 'm1' },
    });
    const pierna = r.patterns.find(p => p.group === 'empuje_pierna')!;
    expect(pierna.ormDeltaPct).not.toBeNull();
    expect(pierna.ormDeltaPct!).toBeGreaterThan(0);
  });
});

describe('F17 · el patrón lo decide el ejercicio', () => {
  const informe = (logs: WorkoutLog[]) => buildMovementPatternReport({
    logs, exercises: EJERCICIOS, mesocycles: [meso()],
    periodStart: '2026-06-01', periodEnd: '2026-06-28',
    comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
  });
  const de = (r: ReturnType<typeof informe>, g: string) => r.patterns.find(p => p.group === g)!;

  it('el curl de bíceps cuenta en «Brazo» y ya no en «Tracciones»', () => {
    const r = informe([log('2026-06-02', 'curl', [{ weight: 15, repsDone: 10 }])]);
    expect(de(r, 'brazo').tonnage).toBe(150);
    expect(de(r, 'traccion').tonnage).toBe(0);
    expect(de(r, 'traccion').meanOrm).toBeNull();
  });

  it('la elevación lateral y el press francés no son empujes de torso', () => {
    const r = informe([
      log('2026-06-02', 'laterales', [{ weight: 10, repsDone: 12 }]),
      log('2026-06-02', 'frances', [{ weight: 30, repsDone: 10 }]),
    ]);
    expect(de(r, 'empuje_torso').tonnage).toBe(0);
    expect(de(r, 'brazo').tonnage).toBe(420);
  });

  it('un multiarticular cuenta entero en su patrón y no suma a «Brazo» por el secundario', () => {
    const r = informe([
      log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }]),
      log('2026-06-02', 'remo', [{ weight: 60, repsDone: 10 }]),
    ]);
    expect(de(r, 'empuje_torso').tonnage).toBe(640);
    expect(de(r, 'traccion').tonnage).toBe(600);
    expect(de(r, 'brazo').tonnage).toBe(0);
    expect(de(r, 'empuje_torso').sets).toBe(1);
  });

  const patron = (name: string, muscleGroup?: MuscleGroup, type: Exercise['type'] = 'fuerza') =>
    patronPropioDeEjercicio({ name, muscleGroup, type });

  it('clasifica por nombre cuando el grupo es coherente con él', () => {
    expect(patron('Press militar con barra', 'deltoide_ant')).toBe('empuje_torso');
    expect(patron('Fondos en paralelas', 'triceps')).toBe('empuje_torso');
    expect(patron('Press banca agarre cerrado', 'triceps')).toBe('empuje_torso');
    expect(patron('Jalón al pecho', 'dorsal')).toBe('traccion');
    expect(patron('Dominadas supinas', 'biceps')).toBe('traccion');
    expect(patron('Pull-up lastrado', 'dorsal')).toBe('traccion');
    expect(patron('Face pull', 'deltoide_post')).toBe('traccion');
    expect(patron('Prensa inclinada', 'cuadriceps')).toBe('empuje_pierna');
    expect(patron('Leg press', 'cuadriceps')).toBe('empuje_pierna');
    expect(patron('Extensión de cuádriceps', 'cuadriceps')).toBe('empuje_pierna');
    expect(patron('Sentadilla sumo', 'gluteo')).toBe('empuje_pierna');
    expect(patron('Peso muerto rumano', 'isquios')).toBe('empuje_cadera');
    expect(patron('Peso muerto convencional', 'lumbares')).toBe('empuje_cadera');
    expect(patron('Hip thrust con barra', 'gluteo')).toBe('empuje_cadera');
    expect(patron('Curl femoral tumbado', 'isquios')).toBe('empuje_cadera');
    expect(patron('Hiperextensiones en banco romano', 'lumbares')).toBe('empuje_cadera');
  });

  it('el aislamiento de bíceps, tríceps y antebrazo va a «Brazo», aunque el nombre lleve «press» o «jalón»', () => {
    expect(patron('Curl martillo', 'biceps')).toBe('brazo');
    expect(patron('Extensión de tríceps en polea', 'triceps')).toBe('brazo');
    expect(patron('Press francés con barra Z', 'triceps')).toBe('brazo');
    expect(patron('Jalón de tríceps en polea', 'triceps')).toBe('brazo');
    expect(patron('Curl de muñeca', 'antebrazo')).toBe('brazo');
    expect(patron('Spider', 'biceps')).toBe('brazo');
  });

  it('las elevaciones y aperturas de deltoides van a «Brazo»; el press y el remo de hombro, a lo suyo', () => {
    expect(patron('Elevaciones frontales', 'deltoide_ant')).toBe('brazo');
    expect(patron('Pájaros con mancuerna', 'deltoide_post')).toBe('brazo');
    expect(patron('Aperturas invertidas en peck deck', 'deltoide_post')).toBe('brazo');
    expect(patron('Press Arnold', 'deltoide_lat')).toBe('empuje_torso');
    expect(patron('Remo al mentón', 'deltoide_lat')).toBe('traccion');
  });

  it('respeta la dominancia que trae el nombre del catálogo CDG', () => {
    expect(patron('Sentadilla búlgara (dominante cadera)', 'gluteo')).toBe('empuje_cadera');
    expect(patron('Sentadilla búlgara (dominante rodilla)', 'cuadriceps')).toBe('empuje_pierna');
  });

  it('sin dato fiable devuelve null y manda el grupo', () => {
    expect(patron('Press Pallof', 'core')).toBeNull();         // «press» que no es un empuje
    expect(patron('Press banca')).toBeNull();                  // sin grupo no hay con qué contrastar
    expect(patron('Remo', 'dorsal', 'cardio')).toBeNull();     // el ergómetro no es una tracción
    expect(patron('Aperturas con mancuernas', 'pecho')).toBeNull();
    expect(patronesDeEjercicio({ name: 'Aperturas con mancuernas', muscleGroup: 'pecho' })).toEqual(['empuje_torso']);
    expect(patronesDeEjercicio({ name: 'Plancha', muscleGroup: 'core' })).toEqual([]);
    expect(patronesDeEjercicio(undefined)).toEqual([]);
  });

  it('patronesPonderados: uno entero si el ejercicio decide; si no, principal 1 y secundarios 0,5', () => {
    expect(patronesPonderados('remo', EJERCICIOS)).toEqual([{ group: 'traccion', weight: 1 }]);
    expect(patronesPonderados('convergente', EJERCICIOS)).toEqual([
      { group: 'empuje_torso', weight: 1 }, { group: 'empuje_torso', weight: 0.5 }, { group: 'brazo', weight: 0.5 },
    ]);
    expect(patronesPonderados('no-existe', EJERCICIOS)).toEqual([{ group: 'none', weight: 1 }]);
  });
});
