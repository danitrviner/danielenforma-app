import { describe, it, expect } from 'vitest';
import type { Mesocycle, Workout } from '../types';
import { sesionesDeMesociclo, offsetsDelMesociclo, fechasDelMesociclo } from './asignacionMesociclo';

function w(id: string, name: string, mesocycleId?: string, dayIndex?: number): Workout {
  return { id, ownerId: 'coach', name, exercises: [], mesocycleId, dayIndex };
}

const MESO_BASE: Mesocycle = {
  id: 'm1',
  athleteId: 'atleta@enforma.com',
  number: 2,
  weeks: 4,
  startDate: '2026-09-07', // lunes
  objective: 'Hipertrofia',
  daysPerWeek: 3,
  groups: {} as Mesocycle['groups'],
};

describe('sesionesDeMesociclo · el orden lo manda dayIndex', () => {
  it('ordena por dayIndex aunque Firestore las devuelva al revés', () => {
    const workouts = [
      w('c', 'Full body · Ander · Meso 2', 'm1', 2),
      w('a', 'Full body · Ander · Meso 2', 'm1', 0),
      w('b', 'Full body · Ander · Meso 2', 'm1', 1),
    ];
    expect(sesionesDeMesociclo(workouts, 'm1').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('tres sesiones con el MISMO nombre siguen siendo tres', () => {
    // El agrupado por nombre las fundía en una: un full body de 3 días perdía
    // dos sesiones enteras.
    const workouts = [
      w('a', 'Full body · Ander · Meso 2', 'm1', 0),
      w('b', 'Full body · Ander · Meso 2', 'm1', 1),
      w('c', 'Full body · Ander · Meso 2', 'm1', 2),
    ];
    expect(sesionesDeMesociclo(workouts, 'm1')).toHaveLength(3);
  });

  it('ignora las rutinas de otros mesociclos y las de biblioteca', () => {
    const workouts = [
      w('a', 'Torso', 'm1', 0),
      w('x', 'Otro meso', 'm2', 0),
      w('lib', 'Rutina suelta'),
    ];
    expect(sesionesDeMesociclo(workouts, 'm1').map(x => x.id)).toEqual(['a']);
  });

  it('las rutinas antiguas sin dayIndex conservan el orden de lectura', () => {
    const workouts = [w('a', 'Día 1 – Meso #2', 'm1'), w('b', 'Día 2 – Meso #2', 'm1')];
    expect(sesionesDeMesociclo(workouts, 'm1').map(x => x.id)).toEqual(['a', 'b']);
  });
});

describe('offsetsDelMesociclo', () => {
  it('un calendario a mano manda, y se devuelve ordenado', () => {
    // El coach pulsa los días en cualquier orden; la sesión 1 tiene que ser
    // la que cae antes, no la primera que tocó.
    const meso = { ...MESO_BASE, customOffsets: [4, 0, 2] };
    expect(offsetsDelMesociclo(meso)).toEqual([0, 2, 4]);
  });

  it('un calendario a mano que ya no cuadra con las sesiones se ignora', () => {
    const meso = { ...MESO_BASE, daysPerWeek: 4, customOffsets: [0, 2, 4] };
    expect(offsetsDelMesociclo(meso)).toEqual([0, 1, 2, 3]);
  });
});

describe('fechasDelMesociclo', () => {
  it('la sesión 1 cae siempre antes que la 2 dentro de la misma vuelta', () => {
    const meso = { ...MESO_BASE, weeks: 1, customOffsets: [0, 2, 4] };
    const fechas = fechasDelMesociclo(meso, 3);
    expect(fechas.map(f => f.date)).toEqual(['2026-09-07', '2026-09-09', '2026-09-11']);
  });

  it('empezando en lunes, un L-X-V cae en lunes, miércoles y viernes', () => {
    const meso = { ...MESO_BASE, weeks: 1, customOffsets: [0, 2, 4] };
    const dias = fechasDelMesociclo(meso, 3).map(f => new Date(f.date + 'T00:00:00').getDay());
    expect(dias).toEqual([1, 3, 5]);
  });

  it('repite el microciclo una vez por vuelta', () => {
    const meso = { ...MESO_BASE, weeks: 4, customOffsets: [0, 2, 4] };
    const fechas = fechasDelMesociclo(meso, 3);
    expect(fechas).toHaveLength(12);
    expect(fechas[3].date).toBe('2026-09-14'); // el lunes siguiente
  });

  it('manda el número de sesiones REALES, no daysPerWeek', () => {
    // El coach subió a 4 sesiones pero solo hay 3 rutinas generadas: asignar
    // una cuarta fecha dejaría un hueco apuntando a nada.
    const meso = { ...MESO_BASE, weeks: 1, daysPerWeek: 4 };
    expect(fechasDelMesociclo(meso, 3)).toHaveLength(3);
  });
});
