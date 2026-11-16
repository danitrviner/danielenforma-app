import { describe, expect, it } from 'vitest';
import type { Exercise, MuscleGroup, WorkoutAssignment, WorkoutLog } from '../types';
import { buildProgresionDelBloque } from './progresionDelBloque';

const ex = (id: string, name: string, muscleGroup: MuscleGroup): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, type: 'fuerza', isCustom: false,
});
const EJ = [
  ex('sent', 'Sentadilla', 'cuadriceps'),
  ex('press', 'Press banca', 'pecho'),
  ex('remo', 'Remo', 'dorsal'),
  ex('plancha', 'Dead bug', 'core'),
];

type S = { weight: number; repsDone: number; rir?: number; segmento?: boolean };
const log = (date: string, entries: Record<string, S[]>, extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date, completedAt: `${date}T10:00:00.000Z`,
  entries: Object.entries(entries).map(([exerciseId, sets]) => ({ exerciseId, sets: sets.map(s => ({ rir: 2, ...s })) })),
  ...extra,
});

const base = { exercises: EJ, inicio: '2026-09-07', fin: '2026-10-04', semanas: 4 };

describe('buildProgresionDelBloque', () => {
  it('compara la mejor serie de la primera semana con la mejor de las últimas', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { sent: [{ weight: 100, repsDone: 6 }, { weight: 90, repsDone: 8 }] }),
        log('2026-09-14', { sent: [{ weight: 105, repsDone: 6 }] }),
        log('2026-09-21', { sent: [{ weight: 110, repsDone: 6 }] }),
        log('2026-09-28', { sent: [{ weight: 115, repsDone: 6 }] }),
      ],
    });
    const s = p.ejercicios.find(e => e.exerciseId === 'sent')!;
    expect(s.inicio).toMatchObject({ kg: 100, reps: 6, semana: 1 });
    expect(s.final).toMatchObject({ kg: 115, reps: 6, semana: 4 });
    expect(s.estado).toBe('mejora');
    expect(s.via).toBe('mas_carga');
    expect(s.lectura).toBe('100 kg × 6 → 115 kg × 6');
    expect(s.comoMejora).toBe('+15 kg con las mismas reps');
    expect(s.deltaPct).toBeGreaterThan(14);
    expect(s.semanal.every(v => v != null)).toBe(true);
    expect(p.resumen).toMatchObject({ comparables: 1, mejoran: 1 });
  });

  it('una semana de descarga al final no tapa lo ganado', () => {
    const p = buildProgresionDelBloque({
      ...base,
      semanasDescarga: [4],
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }] }),
        log('2026-09-21', { press: [{ weight: 90, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 60, repsDone: 8 }] }),
      ],
    });
    const e = p.ejercicios[0];
    expect(e.final).toMatchObject({ kg: 90, semana: 3 });
    expect(e.estado).toBe('mejora');
    expect(p.semanas[3].esDescarga).toBe(true);
  });

  it('mismo peso con más repeticiones es mejora por reps', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { remo: [{ weight: 50, repsDone: 8 }] }),
        log('2026-09-28', { remo: [{ weight: 50, repsDone: 11 }] }),
      ],
    });
    expect(p.ejercicios[0]).toMatchObject({ via: 'mas_reps', comoMejora: '+3 reps con el mismo peso' });
  });

  it('marca como baja lo que cae y no compara lo que solo aparece una semana', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 50, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 70, repsDone: 8 }] }),
      ],
    });
    expect(p.ejercicios.find(e => e.exerciseId === 'press')!.estado).toBe('baja');
    const remo = p.ejercicios.find(e => e.exerciseId === 'remo')!;
    expect(remo.estado).toBe('sin_referencia');
    expect(remo.deltaPct).toBeNull();
    // Los que no se pueden comparar van al final de la lista.
    expect(p.ejercicios[p.ejercicios.length - 1].exerciseId).toBe('remo');
  });

  it('sin peso compara repeticiones', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { plancha: [{ weight: 0, repsDone: 15 }] }),
        log('2026-09-28', { plancha: [{ weight: 0, repsDone: 20 }] }),
      ],
    });
    expect(p.ejercicios[0]).toMatchObject({ metrica: 'reps', deltaPct: 33.3, lectura: '15 reps → 20 reps' });
  });

  it('resume las semanas: sesiones hechas y programadas, tonelaje, RIR e índice de fuerza', () => {
    const asig = (date: string): WorkoutAssignment => ({ id: date, workoutId: 'w', athleteId: 'a@b.c', date, status: 'completed' });
    const p = buildProgresionDelBloque({
      ...base,
      assignments: [asig('2026-09-07'), asig('2026-09-09'), asig('2026-09-14')],
      logs: [
        log('2026-09-07', { sent: [{ weight: 100, repsDone: 5, rir: 3 }] }, { duracionSeg: 3600 }),
        log('2026-09-14', { sent: [{ weight: 110, repsDone: 5, rir: 1 }] }),
      ],
    });
    expect(p.semanas).toHaveLength(4);
    expect(p.semanas[0]).toMatchObject({ semana: 1, inicio: '2026-09-07', sesionesHechas: 1, sesionesProgramadas: 2, tonelaje: 500, rirMedio: 3, indiceFuerza: 100, duracionMediaMin: 60 });
    expect(p.semanas[1].indiceFuerza).toBeGreaterThan(100);
    expect(p.resumen.rir).toEqual({ inicio: 3, final: 1 });
    expect(p.resumen.tonelajeSemanal).toMatchObject({ inicio: 500, final: 550 });
  });

  it('los segmentos (drop/myo) no cuentan como serie ni como mejor serie', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }, { weight: 100, repsDone: 4, segmento: true }] }),
        log('2026-09-28', { press: [{ weight: 82.5, repsDone: 8 }] }),
      ],
    });
    expect(p.ejercicios[0].series).toBe(2);
    expect(p.ejercicios[0].inicio?.kg).toBe(80);
  });

  it('agrega por patrón y por grupo con la media de sus ejercicios', () => {
    const p = buildProgresionDelBloque({
      ...base,
      logs: [
        log('2026-09-07', { press: [{ weight: 80, repsDone: 8 }], remo: [{ weight: 60, repsDone: 8 }] }),
        log('2026-09-28', { press: [{ weight: 88, repsDone: 8 }], remo: [{ weight: 60, repsDone: 8 }] }),
      ],
    });
    const empuje = p.porPatron.find(f => f.clave === 'empuje_torso')!;
    expect(empuje).toMatchObject({ ejercicios: 1, mejoran: 1, mejor: { nombre: 'Press banca' } });
    expect(p.porPatron[0].clave).toBe('empuje_torso'); // ordenado de más a menos
    expect(p.porGrupo.find(f => f.clave === 'dorsal')!.deltaMedioPct).toBe(0);
  });
});
