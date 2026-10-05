import { describe, expect, it } from 'vitest';
import { WorkoutExercise, WorkoutLog } from '../types';
import { programarCambio } from './semanasDelBloque';
import {
  claveEjercicioClave, describirCelda, cambiaEn, realDeLaSemana, novedadesDeLaSesion,
} from './planificadorProgresion';

const banca: WorkoutExercise = { exerciseId: 'banca', order: 0, sets: 3, reps: '6-8', rir: 2, restSeconds: 150 };
const conS3 = (): WorkoutExercise => ({ ...banca, weeklyProgression: programarCambio(banca, 3, false, { ...banca, sets: 4, rir: 1 }) });
const meso = { id: 'm1', startDate: '2026-09-07' };

const log = (date: string, sets: [number, number][], extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: date, athleteId: 'a@b.c', workoutId: 'w1', assignmentId: `as-${date}`, mesocycleId: 'm1', date, completedAt: date,
  entries: [{ exerciseId: 'banca', sets: sets.map(([weight, repsDone]) => ({ weight, repsDone, rir: 2 })) }],
  ...extra,
});

describe('planificar progresión', () => {
  it('la clave del ejercicio usa el día, no su posición', () => {
    expect(claveEjercicioClave({ dayIndex: 2, name: 'Empuje B' }, 'banca')).toBe('d2::banca');
    expect(claveEjercicioClave({ name: 'Empuje B' }, 'banca')).toBe('n:Empuje B::banca');
  });

  it('describe una casilla normal y una con bloques', () => {
    expect(describirCelda(banca)).toEqual({ esquema: '3×6-8', rir: 'RIR 2' });
    const bloques = { ...banca, setGroups: [{ sets: 1, reps: '4-6', rir: 1 }, { sets: 3, reps: '8-10', rir: 2 }] };
    expect(describirCelda(bloques)).toEqual({ esquema: '1×4-6 + 3×8-10', rir: 'RIR 1/2' });
  });

  it('marca solo la semana en la que algo cambia', () => {
    const we = conS3();
    expect(cambiaEn(we, 2)).toBe(false);
    expect(cambiaEn(we, 3)).toBe(true);
    expect(cambiaEn(we, 4)).toBe(false);
  });

  it('plan contra lo hecho: cumple con todas las series en rango', () => {
    const r = realDeLaSemana([log('2026-09-08', [[80, 8], [80, 7], [80, 6]])], meso, 7, ['w1'], banca, 1);
    expect(r).toMatchObject({ hechas: 3, pautadas: 3, cumple: true });
    expect(r?.mejor).toMatchObject({ weight: 80, repsDone: 8 });
  });

  it('plan contra lo hecho: se queda corto si falta una serie o no llega al mínimo', () => {
    const we = conS3();
    expect(realDeLaSemana([log('2026-09-22', [[82.5, 8], [82.5, 7], [82.5, 6]])], meso, 7, ['w1'], we, 3)?.cumple).toBe(false);
    expect(realDeLaSemana([log('2026-09-08', [[80, 8], [80, 7], [80, 5]])], meso, 7, ['w1'], banca, 1)?.cumple).toBe(false);
  });

  it('plan contra lo hecho: ignora otras semanas y otros días, y lee si vio el aviso', () => {
    const logs = [log('2026-09-15', [[80, 8]], { novedadesVistas: true }), { ...log('2026-09-16', [[90, 8]]), workoutId: 'otro' }];
    expect(realDeLaSemana(logs, meso, 7, ['w1'], banca, 1)).toBeNull();
    expect(realDeLaSemana(logs, meso, 7, ['w1'], banca, 2)).toMatchObject({ hechas: 1, novedadesVistas: true });
  });

  it('aviso de la sesión: cambios por ejercicio en su orden', () => {
    const remo: WorkoutExercise = { ...banca, exerciseId: 'remo', order: 1 };
    const n = novedadesDeLaSesion([conS3(), remo], {}, 3, 'Empuje A', id => id);
    expect(n.porEjercicio).toEqual([['3 → 4 series', 'RIR 2 → 1'], []]);
    expect(n.novedades.cambios).toHaveLength(1);
    expect(novedadesDeLaSesion([conS3(), remo], {}, 4, 'Empuje A', id => id).porEjercicio).toEqual([[], []]);
  });
});
