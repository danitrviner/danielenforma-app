import { describe, it, expect } from 'vitest';
import type { WorkoutExercise, WorkoutLog } from '../types';
import {
  esEjercicioNuevo, ejerciciosNuevosDelBloque, ultimaVezQueLoHizo, esAislamiento, rangoDeEntrada,
  reglasDeEntrada, conRampaDeEntrada, tieneRampaDeEntrada,
} from './rampaDeEjercicioNuevo';
import { resolveExerciseForWeek } from './progression';

const log = (date: string, exerciseId: string, reps = 8): Pick<WorkoutLog, 'date' | 'entries'> => ({
  date, entries: [{ exerciseId, sets: [{ weight: 60, repsDone: reps, rir: 2 }] }],
});

describe('¿ejercicio nuevo?', () => {
  const logs = [log('2026-09-01', 'press'), log('2026-10-30', 'remo'), log('2026-11-10', 'curl', 0)];
  const inicio = '2026-11-23';

  it('nunca lo ha hecho → nuevo', () => {
    expect(esEjercicioNuevo('sentadilla', logs, inicio)).toBe(true);
  });
  it('lo hizo hace menos de 8 semanas → no es nuevo', () => {
    expect(esEjercicioNuevo('remo', logs, inicio)).toBe(false);
  });
  it('lo hizo hace más de 8 semanas → vuelve a ser nuevo', () => {
    expect(ultimaVezQueLoHizo('press', logs, inicio)).toBe('2026-09-01');
    expect(esEjercicioNuevo('press', logs, inicio)).toBe(true);
  });
  it('una entrada sin repeticiones (saltado) no cuenta como hecho', () => {
    expect(esEjercicioNuevo('curl', logs, inicio)).toBe(true);
  });
  it('lo que hace dentro del propio bloque no cuenta', () => {
    expect(esEjercicioNuevo('sentadilla', [log('2026-11-25', 'sentadilla')], inicio)).toBe(true);
  });
  it('lista de nuevos del bloque, sin repetir', () => {
    expect(ejerciciosNuevosDelBloque(['press', 'remo', 'press', 'sentadilla'], logs, inicio)).toEqual(['press', 'sentadilla']);
  });
});

describe('aislamiento o multiarticular', () => {
  it.each([
    ['Curl de bíceps con mancuernas', true],
    ['Elevaciones laterales en polea', true],
    ['Extensión de cuádriceps', true],
    ['Aperturas en máquina', true],
    ['Gemelo en prensa', true],
    ['Press francés', true],
    ['Press banca', false],
    ['Remo con barra', false],
    ['Sentadilla hack', false],
    ['Peso muerto rumano', false],
    ['Curl nórdico', false],
    ['Dominadas', false],
  ])('%s → aislamiento %s', (name, esperado) => {
    expect(esAislamiento({ name })).toBe(esperado);
  });
  it('sin pista en el nombre, manda el grupo', () => {
    expect(esAislamiento({ name: 'Máquina X', muscleGroup: 'biceps' })).toBe(true);
    expect(esAislamiento({ name: 'Máquina X', muscleGroup: 'pecho' })).toBe(false);
  });
  it('rango de entrada: 12-14 aislamiento, 10-12 multiarticular', () => {
    expect(rangoDeEntrada({ name: 'Curl en polea' })).toBe('12-14');
    expect(rangoDeEntrada({ name: 'Press inclinado' })).toBe('10-12');
  });
});

const we = (reps: string, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ exerciseId: 'press', order: 1, sets: 3, reps, rir: 2, restSeconds: 120, ...extra } as WorkoutExercise);

describe('reglas de entrada', () => {
  it('multiarticular a 7-9: semanas 1-3 a 10-12 y desde la 4 vuelve al 7-9', () => {
    const r = reglasDeEntrada(we('7-9'), { name: 'Press banca' });
    expect(r).toMatchObject({ entrada: '10-12', pautado: '7-9' });
    if ('sinRampa' in r) throw new Error('debía haber rampa');
    expect(r.reglas).toEqual([{ atWeek: 1, cambios: { reps: '10-12' } }, { atWeek: 4, cambios: { reps: '7-9' } }]);
  });

  it('se resuelve semana a semana: solo cambia el rango, no las series ni el RIR', () => {
    const conRampa = conRampaDeEntrada(we('8-9'), { name: 'Press banca' }, true);
    const s = (n: number) => resolveExerciseForWeek(conRampa, n);
    expect([1, 2, 3, 4, 8].map(n => s(n).reps)).toEqual(['10-12', '10-12', '10-12', '8-9', '8-9']);
    expect(s(2).sets).toBe(3);
    expect(s(2).rir).toBe(2);
  });

  it('aislamiento a 8-10: entrada 12-14', () => {
    const r = reglasDeEntrada(we('8-10'), { name: 'Elevaciones laterales' });
    expect(r).toMatchObject({ entrada: '12-14' });
  });

  it('no toca: ya alto, sin rango, varios bloques de series, o ya programado por el coach', () => {
    expect(reglasDeEntrada(we('12-15'), { name: 'Press banca' })).toEqual({ sinRampa: 'ya_es_alto' });
    expect(reglasDeEntrada(we('AMRAP'), { name: 'Press banca' })).toEqual({ sinRampa: 'reps_sin_rango' });
    expect(reglasDeEntrada(we('8', { setGroups: [{ sets: 1, reps: '6', rir: 1 }, { sets: 2, reps: '10', rir: 2 }] }), { name: 'Press banca' }))
      .toEqual({ sinRampa: 'bloques_de_series' });
    expect(reglasDeEntrada(we('8-9', { weeklyProgression: [{ atWeek: 2, cambios: { reps: '6-8' } }] }), { name: 'Press banca' }))
      .toEqual({ sinRampa: 'ya_programado' });
  });

  it('si no es nuevo, el ejercicio queda igual; y no se pone dos veces', () => {
    const base = we('8-9');
    expect(conRampaDeEntrada(base, { name: 'Press banca' }, false)).toBe(base);
    const una = conRampaDeEntrada(base, { name: 'Press banca' }, true);
    expect(tieneRampaDeEntrada(una)).toBe(true);
    expect(conRampaDeEntrada(una, { name: 'Press banca' }, true)).toBe(una);
  });

  it('respeta las reglas que ya tuviera y las ordena por semana', () => {
    const base = we('8-9', { weeklyProgression: [{ atWeek: 6, addSets: 1 }] });
    const r = conRampaDeEntrada(base, { name: 'Press banca' }, true);
    expect(r.weeklyProgression?.map(x => x.atWeek)).toEqual([1, 4, 6]);
  });
});
