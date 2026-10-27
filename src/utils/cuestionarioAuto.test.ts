import { describe, it, expect } from 'vitest';
import { calcularAutoRellenos, cumplimientoDeSesiones, zonasEntrenadas } from './cuestionarioAuto';

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
