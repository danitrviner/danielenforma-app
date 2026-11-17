import { describe, it, expect } from 'vitest';
import {
  bloqueQueSeCierra, calcularAutoRellenos, cumplimientoDeSesiones, ejerciciosDelBloque, zonasEntrenadas,
} from './cuestionarioAuto';

const hoy = '2026-10-30';

describe('calcularAutoRellenos', () => {
  it('media de pasos y peso solo de los últimos 7 días', () => {
    const r = calcularAutoRellenos({
      hoy,
      steps: [{ date: '2026-10-20', steps: 99999 }, { date: '2026-10-28', steps: 8000 }, { date: '2026-10-30', steps: 10000 }],
      pesos: [{ date: '2026-10-25', weight: 80 }, { date: '2026-10-29', weight: 81 }],
    });
    expect(r.pasos_media).toBe(9000);
    expect(r.peso_medio).toBe(80.5);
  });
  it('cumplimiento: sesiones hechas frente a programadas', () => {
    const r = calcularAutoRellenos({
      hoy,
      programadas: [{ date: '2026-10-26' }, { date: '2026-10-28' }, { date: '2026-10-30' }, { date: '2026-10-31' }],
      logs: [{ date: '2026-10-26', workoutId: 'a', entries: [] }, { date: '2026-10-28', workoutId: 'b', entries: [] }],
    });
    expect(r.cumplimiento_entrenos).toBe(3); // 2 de 3 en la ventana
  });
  it('sin datos no propone nada', () => {
    expect(calcularAutoRellenos({ hoy })).toEqual({});
    expect(cumplimientoDeSesiones(3, 0)).toBeNull();
  });
});

describe('zonasEntrenadas', () => {
  it('agrupa por zona del IEM y guarda la última fecha', () => {
    const exercises = [
      { id: 'sent', muscleGroup: 'cuadriceps' as const },
      { id: 'peso', muscleGroup: 'isquios' as const },
      { id: 'press', muscleGroup: 'deltoide_ant' as const },
    ];
    const z = zonasEntrenadas({
      hoy, exercises,
      logs: [
        { date: '2026-10-27', workoutId: 'p', entries: [{ exerciseId: 'sent', sets: [] }, { exerciseId: 'peso', sets: [] }] },
        { date: '2026-10-29', workoutId: 't', entries: [{ exerciseId: 'press', sets: [] }, { exerciseId: 'sent', sets: [] }] },
        { date: '2026-10-10', workoutId: 'v', entries: [{ exerciseId: 'press', sets: [] }] },
      ],
    });
    expect(z).toEqual([
      { zona: 'deltoides', fecha: '2026-10-29' },
      { zona: 'cuadriceps', fecha: '2026-10-29' },
      { zona: 'isquios', fecha: '2026-10-27' },
    ]);
  });
});

describe('bloqueQueSeCierra', () => {
  const m1 = { id: 'm1', startDate: '2026-09-07', weeks: 4 }; // acaba el 04-10
  const m2 = { id: 'm2', startDate: '2026-10-05', weeks: 4 }; // acaba el 01-11
  it('el que está en curso', () => {
    expect(bloqueQueSeCierra([m1, m2], '2026-10-30')?.id).toBe('m2');
  });
  it('recién terminado y sin siguiente: sigue siendo ese', () => {
    expect(bloqueQueSeCierra([m1], '2026-10-10')?.id).toBe('m1');
  });
  it('si el siguiente acaba de empezar, el cierre es del anterior', () => {
    expect(bloqueQueSeCierra([m1, m2], '2026-10-07')?.id).toBe('m1');
    expect(bloqueQueSeCierra([m1, m2], '2026-10-12')?.id).toBe('m2');
  });
  it('sin bloques, o con el último ya lejos, ninguno', () => {
    expect(bloqueQueSeCierra([], hoy)).toBeNull();
    expect(bloqueQueSeCierra(undefined, hoy)).toBeNull();
    expect(bloqueQueSeCierra([m1], '2026-11-20')).toBeNull();
  });
});

describe('ejerciciosDelBloque', () => {
  const exercises = [
    { id: 'sent', name: 'Sentadilla', muscleGroup: 'cuadriceps' as const },
    { id: 'press', name: 'Press banca', muscleGroup: 'pecho' as const },
    { id: 'curl', name: 'Curl en polea', muscleGroup: 'biceps' as const },
  ];
  const serie = { weight: 50, repsDone: 8, rir: 2 };
  const mesocycles = [{ id: 'm2', startDate: '2026-10-05', weeks: 4 }];

  it('solo los del bloque, en el orden en que aparecieron y con sus días', () => {
    const r = ejerciciosDelBloque({
      hoy, mesocycles, exercises,
      logs: [
        { date: '2026-10-20', mesocycleId: 'm2', entries: [{ exerciseId: 'press', sets: [serie] }] },
        { date: '2026-10-06', mesocycleId: 'm2', entries: [{ exerciseId: 'sent', sets: [serie] }, { exerciseId: 'press', sets: [serie] }] },
        // De otro bloque: fuera, aunque la fecha caiga dentro.
        { date: '2026-10-08', mesocycleId: 'm1', entries: [{ exerciseId: 'curl', sets: [serie] }] },
      ],
    });
    expect(r).toEqual([
      { id: 'sent', nombre: 'Sentadilla', grupo: 'cuadriceps', sesiones: 1 },
      { id: 'press', nombre: 'Press banca', grupo: 'pecho', sesiones: 2 },
    ]);
  });

  it('un registro antiguo sin mesociclo entra por fechas', () => {
    const r = ejerciciosDelBloque({
      hoy, mesocycles, exercises,
      logs: [
        { date: '2026-10-10', entries: [{ exerciseId: 'curl', sets: [serie] }] },
        { date: '2026-09-20', entries: [{ exerciseId: 'sent', sets: [serie] }] },
      ],
    });
    expect(r.map(e => e.id)).toEqual(['curl']);
  });

  it('no sale el que se saltó siempre ni el que no tiene nombre', () => {
    const r = ejerciciosDelBloque({
      hoy, mesocycles, exercises,
      logs: [{
        date: '2026-10-10', mesocycleId: 'm2',
        entries: [
          { exerciseId: 'press', sets: [], note: 'No lo hice: máquina ocupada' },
          { exerciseId: 'borrado', sets: [serie] },
          { exerciseId: 'sent', sets: [serie] },
        ],
      }],
    });
    expect(r.map(e => e.id)).toEqual(['sent']);
  });

  it('sin bloque que cerrar, lo de las últimas seis semanas', () => {
    const r = ejerciciosDelBloque({
      hoy, exercises,
      logs: [
        { date: '2026-10-25', entries: [{ exerciseId: 'press', sets: [serie] }] },
        { date: '2026-08-01', entries: [{ exerciseId: 'sent', sets: [serie] }] },
      ],
    });
    expect(r.map(e => e.id)).toEqual(['press']);
  });

  it('sin datos, lista vacía', () => {
    expect(ejerciciosDelBloque({ hoy })).toEqual([]);
  });
});
