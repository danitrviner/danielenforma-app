import { describe, it, expect } from 'vitest';
import type { Exercise, Mesocycle, WorkoutAssignment, WorkoutLog, WorkoutSetLog } from '../types';
import { addDays } from './trainingWeek';
import { bloqueTerminadoParaElAtleta } from './bloqueTerminado';

/* «Bloque terminado» (A2). Bloque de 6 semanas, dos sesiones por semana. */

const INICIO = '2026-09-07';
const EMAIL = 'ana@x.com';
const FIN = addDays(INICIO, 6 * 7 - 1);
const HOY = addDays(FIN, 3);

const EJERCICIOS = [
  { id: 'press', name: 'Press banca', muscleGroup: 'pecho' },
  { id: 'remo', name: 'Remo con barra', muscleGroup: 'dorsal' },
  { id: 'curl', name: 'Curl de bíceps', muscleGroup: 'biceps' },
  { id: 'prensa', name: 'Prensa', muscleGroup: 'cuadriceps' },
  { id: 'jalon', name: 'Jalón al pecho', muscleGroup: 'dorsal' },
] as unknown as Exercise[];

const meso = (extra: Partial<Mesocycle> = {}): Mesocycle =>
  ({ id: 'm1', athleteId: EMAIL, number: 1, name: 'Hipertrofia 1', startDate: INICIO, weeks: 6, daysPerWeek: 2, ...extra } as unknown as Mesocycle);

const serie = (weight: number, repsDone: number, rir = 1): WorkoutSetLog => ({ weight, repsDone, rir, rirApuntado: true });

/** Seis semanas: `de(semana)` da las series de cada ejercicio. */
const logs = (de: (s: number) => Record<string, WorkoutSetLog[]>): WorkoutLog[] => Array.from({ length: 6 }, (_, i) => {
  const date = addDays(INICIO, i * 7);
  return { id: `l_${date}`, athleteId: EMAIL, workoutId: 'w', mesocycleId: 'm1', date, completedAt: `${date}T19:00:00.000Z`, entries: Object.entries(de(i + 1)).map(([exerciseId, sets]) => ({ exerciseId, sets })) } as unknown as WorkoutLog;
});

/** 12 asignaciones (lunes y jueves); las `hechas` primeras, completadas. */
const asignaciones = (hechas: number): WorkoutAssignment[] => Array.from({ length: 12 }, (_, i) => {
  const date = addDays(INICIO, Math.floor(i / 2) * 7 + (i % 2) * 3);
  return { id: `a${i}`, athleteId: EMAIL, workoutId: 'w', mesocycleId: 'm1', date, status: i < hechas ? 'completed' : 'perdido' } as unknown as WorkoutAssignment;
});

const base = { exercises: EJERCICIOS, hoy: HOY };

describe('bloqueTerminadoParaElAtleta', () => {
  it('sin ningún bloque acabado en los últimos 14 días no hay cierre', () => {
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: [], logs: [], hoy: addDays(INICIO, 10) })).toBeNull();
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: [], logs: [], hoy: addDays(FIN, 15) })).toBeNull();
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: [], logs: [], hoy: addDays(FIN, 14) })).not.toBeNull();
  });

  it('enseña hasta tres «antes → después», de más a menos subida y solo los que superan el ruido', () => {
    const b = bloqueTerminadoParaElAtleta({
      ...base, mesociclos: [meso()], assignments: asignaciones(12),
      logs: logs(s => ({
        press: [serie(s <= 2 ? 60 : s <= 4 ? 62.5 : 67.5, 8)],   // +12,5 %
        remo: [serie(70, s <= 3 ? 8 : 10)],                        // mismas cargas, +2 repeticiones
        curl: [serie(s <= 3 ? 14 : 15, 10)],                       // +7 %
        prensa: [serie(s <= 3 ? 150 : 152, 10)],                   // +1,3 %: ruido
        jalon: [serie(s <= 3 ? 50 : 55, 10)],                      // +10 %
      })),
    })!;
    expect(b.antesDespues.map(a => a.nombre)).toEqual(['Press banca', 'Jalón al pecho', 'Curl de bíceps']);
    expect(b.antesDespues[0]).toMatchObject({ antes: '60 kg × 8', despues: '67,5 kg × 8', cambio: '+7,5 kg' });
    expect(b.antesDespues.some(a => a.nombre === 'Prensa')).toBe(false);
  });

  it('las mismas cargas con más repeticiones también cuentan, y lo dice así', () => {
    const b = bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: asignaciones(12), logs: logs(s => ({ remo: [serie(70, s <= 3 ? 8 : 10)] })) })!;
    expect(b.antesDespues).toEqual([{ exerciseId: 'remo', nombre: 'Remo con barra', antes: '70 kg × 8', despues: '70 kg × 10', cambio: '+2 reps' }]);
  });

  it('menos peso con más repeticiones no se enseña aunque la estimación suba', () => {
    const b = bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: asignaciones(12), logs: logs(s => ({ press: [s <= 3 ? serie(60, 5) : serie(55, 12)] })) })!;
    expect(b.antesDespues).toEqual([]);
  });

  it('sin marcas no opina de fuerza: solo la constancia y lo que viene', () => {
    // Series a 15 repeticiones: no valen para medir.
    const b = bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: asignaciones(11), logs: logs(s => ({ press: [serie(40 + s, 15)] })) })!;
    expect(b.antesDespues).toEqual([]);
    expect(b.constancia).toEqual({ hechas: 11, tocaban: 12, pct: 92, texto: 'Has hecho 11 de las 12 sesiones del bloque.' });
    expect(b.queViene).toBe('Tu entrenador está preparando el siguiente bloque.');
  });

  it('con todas las sesiones hechas lo celebra; sin sesiones asignadas no inventa constancia', () => {
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: asignaciones(12), logs: [] })!.constancia?.texto).toBe('Has hecho las 12 sesiones del bloque. Todas.');
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: [], logs: [] })!.constancia).toBeNull();
  });

  it('una sesión con registro cuenta como hecha aunque la asignación diga otra cosa', () => {
    const asig = asignaciones(0).slice(0, 1).map(a => ({ ...a, status: 'pending' as const }));
    const l = [{ id: 'l', athleteId: EMAIL, workoutId: 'w', assignmentId: asig[0].id, date: asig[0].date, completedAt: '', entries: [] } as unknown as WorkoutLog];
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: asig, logs: l })!.constancia).toMatchObject({ hechas: 1, tocaban: 1 });
  });

  it('dice qué viene: nada creado, bloque ya en marcha o con fecha', () => {
    const enMarcha = meso({ id: 'm2', name: 'Hipertrofia 2', startDate: addDays(FIN, 1) });
    const b1 = bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso(), enMarcha], assignments: [], logs: [] })!;
    expect(b1.mesocycleId).toBe('m1');
    expect(b1.siguiente).toEqual({ nombre: 'Hipertrofia 2', desde: addDays(FIN, 1), empezado: true });
    expect(b1.queViene).toBe('Tu siguiente bloque ya está en marcha.');
    const futuro = meso({ id: 'm2', name: 'Hipertrofia 2', startDate: '2026-10-26' });
    expect(bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso(), futuro], assignments: [], logs: [] })!.queViene).toBe('Tu siguiente bloque empieza el lunes, 26 de octubre.');
  });

  it('el texto del atleta no lleva tecnicismos', () => {
    const b = bloqueTerminadoParaElAtleta({ ...base, mesociclos: [meso()], assignments: asignaciones(10), logs: logs(s => ({ press: [serie(s <= 3 ? 60 : 65, 8)] })) })!;
    const todo = [b.queViene, b.constancia?.texto, ...b.antesDespues.flatMap(a => [a.antes, a.despues, a.cambio])].join(' ');
    expect(todo).not.toMatch(/IEM|índice|hipótesis|veredicto|RM\b|RIR|estimad|\bIA\b/i);
  });
});
