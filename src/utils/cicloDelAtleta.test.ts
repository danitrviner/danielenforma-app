import { describe, it, expect } from 'vitest';
import type { Mesocycle, Workout, WorkoutAssignment } from '../types';
import { bloquesDelCiclo, bloqueActual, estadoDeSesion } from './cicloDelAtleta';

// Mesociclo de 6 sesiones con microciclo de 6 días: la vuelta NO cuadra con la
// semana de lunes a domingo, que es exactamente el caso que desordenaba la
// pantalla (una semana natural cogía «Día 2…Día 6, Día 1, Día 2»).
const MESO: Mesocycle = {
  id: 'm1',
  athleteId: 'atleta@enforma.com',
  number: 3,
  weeks: 4,
  startDate: '2026-08-31', // lunes
  objective: 'Hipertrofia',
  daysPerWeek: 6,
  cycleDays: 6,
  groups: {} as Mesocycle['groups'],
};

const WORKOUTS: Workout[] = Array.from({ length: 6 }, (_, i) => ({
  id: `w${i}`, ownerId: 'coach', name: `Día ${i + 1}`, exercises: [], mesocycleId: 'm1', dayIndex: i,
}));

function asig(vuelta: number, dia: number, status: WorkoutAssignment['status'] = 'pending'): WorkoutAssignment {
  const d = new Date(Date.UTC(2026, 7, 31));
  d.setUTCDate(d.getUTCDate() + (vuelta - 1) * 6 + dia);
  return {
    id: `v${vuelta}d${dia}`,
    workoutId: `w${dia}`,
    athleteId: 'atleta@enforma.com',
    date: d.toISOString().split('T')[0],
    status,
    mesocycleId: 'm1',
  };
}

/** Las dos primeras vueltas enteras, en orden de lectura aleatorio. */
const DOS_VUELTAS = [
  ...Array.from({ length: 6 }, (_, i) => asig(2, i)),
  ...Array.from({ length: 6 }, (_, i) => asig(1, i)),
].reverse();

describe('bloquesDelCiclo · agrupa por vuelta del microciclo, no por semana natural', () => {
  it('la vuelta actual sale entera y en orden Día 1 → Día 6', () => {
    const hoy = '2026-09-08'; // 3er día de la 2ª vuelta (empieza el 6 de septiembre)
    const bloque = bloqueActual(bloquesDelCiclo(DOS_VUELTAS, WORKOUTS, [MESO], hoy), hoy);
    expect(bloque?.dias.map(d => d.assignment.workoutId)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4', 'w5']);
    expect(bloque?.primeraFecha).toBe('2026-09-06');
    expect(bloque?.ultimaFecha).toBe('2026-09-11');
    // Ni una sesión de la vuelta anterior colada en medio.
    expect(bloque?.dias).toHaveLength(6);
  });

  it('el estado de cada día: hechos en verde, el de hoy, los pasados perdidos y los futuros pendientes', () => {
    const hoy = '2026-09-08';
    const asignaciones = [
      asig(2, 0, 'completed'), // 6 sep — hecho
      asig(2, 1),              // 7 sep — se lo saltó sin marcar nada
      asig(2, 2),              // 8 sep — hoy
      asig(2, 3),              // 9 sep — aún por venir
      asig(2, 4, 'skipped'),   // 10 sep — saltado a propósito
    ];
    const bloque = bloqueActual(bloquesDelCiclo(asignaciones, WORKOUTS, [MESO], hoy), hoy);
    expect(bloque?.dias.map(d => d.estado)).toEqual(['completado', 'perdido', 'hoy', 'pendiente', 'saltado']);
  });

  it('en un día de descanso sigue enseñando la vuelta en curso, no la siguiente', () => {
    // Vuelta de 6 días con solo 4 sesiones: el 5º y 6º día no hay entreno.
    const meso = { ...MESO, daysPerWeek: 4 };
    const asignaciones = Array.from({ length: 4 }, (_, i) => asig(2, i));
    const hoy = '2026-09-10'; // 5º día de la vuelta, sin sesión
    const bloque = bloqueActual(bloquesDelCiclo(asignaciones, WORKOUTS, [meso], hoy), hoy);
    expect(bloque?.clave).toBe('meso:m1:2');
    expect(bloque?.dias).toHaveLength(4);
  });

  it('las asignaciones sin mesociclo se agrupan por semana natural', () => {
    const suelta: WorkoutAssignment = {
      id: 's1', workoutId: 'libre', athleteId: 'atleta@enforma.com', date: '2026-09-09', status: 'pending',
    };
    const bloques = bloquesDelCiclo([suelta], [], [], '2026-09-09');
    expect(bloques[0].clave).toBe('semana:2026-09-07');
    expect(bloques[0].fin).toBe('2026-09-13');
  });

  it('el orden lo manda dayIndex, no el orden de lectura de Firestore', () => {
    const hoy = '2026-09-06';
    const desordenadas = [asig(1, 5), asig(1, 0), asig(1, 3)];
    const bloques = bloquesDelCiclo(desordenadas, WORKOUTS, [MESO], hoy);
    expect(bloques[0].dias.map(d => d.assignment.workoutId)).toEqual(['w0', 'w3', 'w5']);
  });
});

describe('estadoDeSesion', () => {
  it('una sesión hecha hoy es «completado», no «hoy»', () => {
    expect(estadoDeSesion(asig(1, 0, 'completed'), '2026-08-31')).toBe('completado');
  });
  it('una pendiente de ayer es «perdido» aunque Firestore la siga marcando pending', () => {
    expect(estadoDeSesion(asig(1, 0), '2026-09-01')).toBe('perdido');
  });
});
