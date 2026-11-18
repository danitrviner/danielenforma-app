import { describe, it, expect } from 'vitest';
import { avisosDeLimitante, dondePreguntar, esMotivoDeParada, MOTIVOS_DE_PARADA } from './queTeParo';
import type { WorkoutLog } from '../types';
import type { MotivoDeParada } from './queTeParo';

const log = (date: string, exerciseId: string, queParo?: MotivoDeParada): WorkoutLog => ({
  id: `${date}_${exerciseId}`, athleteId: 'a@a.com', workoutId: 'w', assignmentId: 'as', date, completedAt: '',
  entries: [{ exerciseId, sets: [{ weight: 60, repsDone: 10, rir: 1 }], ...(queParo ? { queParo } : {}) }],
});

describe('¿qué te paró?', () => {
  it('la primera opción es el músculo, que es lo que se busca', () => {
    expect(MOTIVOS_DE_PARADA[0].clave).toBe('musculo');
    expect(esMotivoDeParada('agarre')).toBe(true);
    expect(esMotivoDeParada('cansancio')).toBe(false);
  });

  it('avisa cuando lo que para la serie se repite y no es el músculo', () => {
    const logs = [log('2026-11-01', 'jalon', 'agarre'), log('2026-11-04', 'jalon', 'musculo'), log('2026-11-08', 'jalon', 'agarre')];
    expect(avisosDeLimitante(logs)).toEqual([
      { exerciseId: 'jalon', motivo: 'agarre', veces: 2, de: 3, arreglo: 'ponle straps o un agarre más cómodo' },
    ]);
  });

  it('una sola vez no es un patrón, y si para el músculo no hay nada que arreglar', () => {
    expect(avisosDeLimitante([log('2026-11-08', 'prensa', 'aire'), log('2026-11-04', 'prensa', 'musculo')])).toEqual([]);
    expect(avisosDeLimitante([log('2026-11-08', 'curl', 'musculo'), log('2026-11-04', 'curl', 'musculo')])).toEqual([]);
  });

  it('solo mira las 4 respuestas más recientes; las sesiones sin respuesta no cuentan', () => {
    const logs = [
      log('2026-10-01', 'prensa', 'aire'), log('2026-10-05', 'prensa', 'aire'),
      log('2026-11-01', 'prensa', 'musculo'), log('2026-11-03', 'prensa'), log('2026-11-05', 'prensa', 'musculo'),
      log('2026-11-08', 'prensa', 'musculo'), log('2026-11-10', 'prensa', 'musculo'),
    ];
    expect(avisosDeLimitante(logs)).toEqual([]);
  });

  it('se puede limitar a los ejercicios de la ventana', () => {
    const logs = [log('2026-11-01', 'jalon', 'agarre'), log('2026-11-08', 'jalon', 'agarre'), log('2026-11-01', 'remo', 'aire'), log('2026-11-08', 'remo', 'aire')];
    expect(avisosDeLimitante(logs, ['remo']).map(a => a.exerciseId)).toEqual(['remo']);
  });
});

describe('dondePreguntar', () => {
  it('en los ejercicios clave del mesociclo que caen en esta sesión', () => {
    expect(dondePreguntar(['banca', 'curl', 'remo'], ['d0::remo', 'd1::sentadilla'])).toEqual([false, false, true]);
  });
  it('sin claves en esta sesión, en los dos primeros', () => {
    expect(dondePreguntar(['banca', 'curl', 'remo'], ['d1::sentadilla'])).toEqual([true, true, false]);
    expect(dondePreguntar(['banca'], undefined)).toEqual([true]);
  });
});
