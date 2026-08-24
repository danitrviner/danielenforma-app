import { describe, expect, it } from 'vitest';
import {
  Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutAssignment, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import { buildCierreMesociclo } from './cierreMesociclo';

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@b.c', number: 2, weeks: 4, startDate: '2026-06-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: grupos({ pecho: 10, dorsal: 10 }),
  ...over,
});

const ex = (id: string, name: string, muscleGroup: MuscleGroup): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, type: 'fuerza', isCustom: false,
});

const EJERCICIOS = [ex('press', 'Press banca', 'pecho'), ex('remo', 'Remo con barra', 'dorsal')];

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number }[]): WorkoutLog => ({
  id: `l-${date}-${exerciseId}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series.map(s => ({ ...s, rir: 2 })) }],
});

const asig = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({
  id: `a-${date}`, workoutId: 'w', athleteId: 'uid', date, status, mesocycleId: 'm2',
});

describe('buildCierreMesociclo', () => {
  it('acota la ventana al mesociclo: semanas × 7 días desde su inicio', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.inicio).toBe('2026-06-01');
    expect(c.fin).toBe('2026-06-28'); // 4 semanas = 28 días, el último es el 28
    expect(c.enCurso).toBe(false);
  });

  it('marca el mesociclo como en curso si hoy cae dentro', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-06-10',
    });
    expect(c.enCurso).toBe(true);
  });

  it('calcula la adherencia sobre las asignaciones del propio mesociclo', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], exercises: EJERCICIOS, hoy: '2026-07-15',
      assignments: [
        asig('2026-06-01', 'completed'),
        asig('2026-06-02', 'completed'),
        asig('2026-06-03', 'perdido'),
        asig('2026-06-04', 'pending'),
        { ...asig('2026-06-05', 'completed'), mesocycleId: 'otro' }, // de otro meso: no cuenta
      ],
    });
    expect(c.sesiones.programadas).toBe(4);
    expect(c.sesiones.completadas).toBe(2);
    expect(c.sesiones.adherenciaPct).toBe(50);
  });

  it('sin asignaciones no inventa un 0% de adherencia', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.sesiones.adherenciaPct).toBeNull();
  });

  it('compara volumen programado (semanales × semanas) con el realizado', () => {
    const logs = [
      log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }, { weight: 80, repsDone: 8 }]),
      log('2026-06-09', 'press', [{ weight: 82, repsDone: 8 }]),
      log('2026-06-16', 'remo', [{ weight: 60, repsDone: 10 }]),
      log('2026-07-20', 'press', [{ weight: 90, repsDone: 8 }]), // fuera de la ventana
    ];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-08-01',
    });
    const pecho = c.volumen.filas.find(f => f.group === 'pecho')!;
    expect(pecho.programadas).toBe(40); // 10 series/sem × 4 semanas
    expect(pecho.realizadas).toBe(3);   // las del 20 de julio quedan fuera
    expect(pecho.pct).toBe(8);
    expect(c.volumen.totalProgramadas).toBe(80);
    expect(c.volumen.totalRealizadas).toBe(4);
  });

  it('deja fuera los grupos sin volumen programado ni series registradas', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.volumen.filas.map(f => f.group).sort()).toEqual(['dorsal', 'pecho']);
  });

  it('trae el volumen semanal del mesociclo anterior para ver la progresión', () => {
    const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-01', groups: grupos({ pecho: 8, dorsal: 12 }) });
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [previo, meso()], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.comparacion).toBe('Meso #1');
    expect(c.volumen.filas.find(f => f.group === 'pecho')!.semanalesPrevias).toBe(8);
  });

  it('sin mesociclo anterior lo dice en vez de comparar contra la nada', () => {
    const c = buildCierreMesociclo({
      meso: meso({ number: 1 }), mesocycles: [meso({ number: 1 })], logs: [], assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    expect(c.comparacion).toBe('sin mesociclo previo');
    expect(c.volumen.filas.every(f => f.semanalesPrevias === null)).toBe(true);
  });

  it('detecta récord de 1RM estimado frente al historial anterior', () => {
    const previo = meso({ id: 'm1', number: 1, startDate: '2026-05-01' });
    const logs = [
      log('2026-05-05', 'press', [{ weight: 80, repsDone: 8 }]),  // 1RM est. ≈ 101,3
      log('2026-06-05', 'press', [{ weight: 90, repsDone: 8 }]),  // 1RM est. ≈ 114
    ];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [previo, meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    const press = c.informe.perExercise.find(e => e.exerciseId === 'press')!;
    expect(press.isPR).toBe(true);
    expect(c.titulares.some(t => t.includes('récord'))).toBe(true);
  });

  it('avisa de los grupos que se quedaron por debajo del 80% de lo previsto', () => {
    const logs = [log('2026-06-02', 'press', Array.from({ length: 35 }, () => ({ weight: 80, repsDone: 8 })))];
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs, assignments: [], exercises: EJERCICIOS, hoy: '2026-07-15',
    });
    const aviso = c.titulares.find(t => t.startsWith('Por debajo de lo previsto'));
    expect(aviso).toContain('Dorsal (0%)');
    expect(aviso).not.toContain('Pecho');
  });

  it('el borrador para el cliente no es el mismo texto dos veces (usa sus datos)', () => {
    const c = buildCierreMesociclo({
      meso: meso(), mesocycles: [meso()], logs: [], assignments: [asig('2026-06-01', 'completed')],
      exercises: EJERCICIOS, athleteName: 'Marta López', hoy: '2026-07-15',
    });
    expect(c.resumenParaCliente).toContain('Marta');
    expect(c.resumenParaCliente).toContain('bloque 2');
    expect(c.resumenParaCliente).toContain('Hipertrofia');
  });

  it('es determinista: dos llamadas con los mismos datos dan el mismo texto', () => {
    const args = {
      meso: meso(), mesocycles: [meso()], logs: [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }])],
      assignments: [asig('2026-06-01', 'completed')], exercises: EJERCICIOS, hoy: '2026-07-15',
    };
    expect(buildCierreMesociclo(args).resumenParaCliente).toBe(buildCierreMesociclo(args).resumenParaCliente);
    expect(buildCierreMesociclo(args).titulares).toEqual(buildCierreMesociclo(args).titulares);
  });
});
