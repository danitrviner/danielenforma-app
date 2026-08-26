import { describe, it, expect } from 'vitest';
import { CardioAssignment, CardioSession } from '../types';
import {
  createZoneAccumulator, flushZoneTime, setActiveZone, roundTimeInZone,
  elapsedSecFromWallClock, shouldDiscardSession, summarizeSamples, pickActiveZona2Assignment,
  pickActiveIntervalAssignment, weeklyCardioMinutesDone, dailyCardioMinutesForWeek, defaultWeeklyCardioGoal,
} from './cardioSession';

function session(date: string, durationSec: number): Pick<CardioSession, 'date' | 'durationSec'> {
  return { date, durationSec };
}

describe('cardioSession — acumulación de tiempo por zona', () => {
  it('imputa el tramo transcurrido a la zona que estaba activa, no a la nueva', () => {
    const t0 = 1_000_000;
    let acc = createZoneAccumulator(t0);
    acc = setActiveZone(acc, 'z2');
    // 10s en z2...
    acc = flushZoneTime(acc, t0 + 10_000);
    acc = setActiveZone(acc, 'z3');
    // ...luego 5s en z3
    acc = flushZoneTime(acc, t0 + 15_000);

    expect(roundTimeInZone(acc.timeInZoneSec)).toEqual({ z1: 0, z2: 10, z3: 5, z4: 0, z5: 0 });
  });

  it('mientras la zona es null (por debajo de Z1), el tramo va a belowZoneSec, no a las 5 zonas', () => {
    const t0 = 1_000_000;
    let acc = createZoneAccumulator(t0); // lastZone empieza en null
    acc = flushZoneTime(acc, t0 + 8_000);
    expect(roundTimeInZone(acc.timeInZoneSec)).toEqual({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 });
    expect(Math.round(acc.belowZoneSec)).toBe(8);
  });

  it('un flush final tras la última muestra no pierde el último tramo (bug de la sesión que se cortaba)', () => {
    // Simula: llegan muestras en z2 hasta el segundo 30, la banda calla
    // (pantalla bloqueada) y el usuario cierra a los 42s sin más muestras.
    // El tramo 30s→42s debe contarse igualmente al cerrar.
    const t0 = 0;
    let acc = createZoneAccumulator(t0);
    acc = setActiveZone(acc, 'z2');
    acc = flushZoneTime(acc, t0 + 30_000);
    // cierre de sesión, sin nueva muestra de por medio:
    acc = flushZoneTime(acc, t0 + 42_000);
    expect(roundTimeInZone(acc.timeInZoneSec)).toEqual({ z1: 0, z2: 42, z3: 0, z4: 0, z5: 0 });
  });
});

describe('cardioSession — reloj de pared, no contador de ticks', () => {
  it('deriva la duración de Date.now(), aunque no haya habido ningún tick', () => {
    const startedAt = 5_000;
    const now = startedAt + 187_400; // 187.4s reales, ningún setInterval de por medio
    expect(elapsedSecFromWallClock(startedAt, now)).toBe(187);
  });

  it('nunca da negativo si por lo que sea now < startedAt', () => {
    expect(elapsedSecFromWallClock(1_000, 500)).toBe(0);
  });
});

describe('cardioSession — una desconexión de la banda guarda, nunca descarta', () => {
  it('con mode="save" y sesión larga, no se descarta', () => {
    expect(shouldDiscardSession(1200, 'save')).toBe(false);
  });

  it('el bug original: el callback de desconexión ya no puede colar mode="discard"', () => {
    // Antes, `handleStop` (que sí descartaba con duración 0) se pasaba tal
    // cual como callback de desconexión. Ahora la única vía de descarte
    // automático sería llamar con mode='discard', y la desconexión SIEMPRE
    // llama con mode='save' (ver CardioScreen.tsx, requestAndConnect).
    // Esta prueba fija el contrato: 'save' con duración real no descarta.
    const elapsedSec = elapsedSecFromWallClock(0, 2_400_000); // 40 min de sesión
    expect(shouldDiscardSession(elapsedSec, 'save')).toBe(false);
  });

  it('sí se descarta una sesión demasiado corta (<10s), aunque sea mode="save"', () => {
    expect(shouldDiscardSession(5, 'save')).toBe(true);
  });

  it('mode="discard" descarta siempre, sea cual sea la duración', () => {
    expect(shouldDiscardSession(3600, 'discard')).toBe(true);
  });
});

describe('cardioSession — resumen de muestras', () => {
  it('calcula media y máximo', () => {
    expect(summarizeSamples([100, 120, 140])).toEqual({ avgHR: 120, maxHR: 140 });
  });

  it('sin muestras, no inventa valores', () => {
    expect(summarizeSamples([])).toEqual({});
  });
});

const HOY = '2026-08-27';

describe('pickActiveZona2Assignment — prescripción del coach para la sesión guiada', () => {
  const base: Omit<CardioAssignment, 'id' | 'type' | 'active' | 'createdAt'> = { athleteId: 'a@x.com' };

  it('ignora asignaciones inactivas o de otro tipo', () => {
    const assignments: CardioAssignment[] = [
      { ...base, id: '1', type: 'libre', active: true, createdAt: '2026-01-01' },
      { ...base, id: '2', type: 'zona2', active: false, createdAt: '2026-01-02' },
    ];
    expect(pickActiveZona2Assignment(assignments, HOY)).toBeUndefined();
  });

  it('coge la Zona 2 activa', () => {
    const target: CardioAssignment = { ...base, id: '2', type: 'zona2', active: true, createdAt: '2026-01-02', targetZone: 'z2', targetDurationSec: 2400 };
    const assignments: CardioAssignment[] = [
      { ...base, id: '1', type: 'libre', active: true, createdAt: '2026-01-01' },
      target,
    ];
    expect(pickActiveZona2Assignment(assignments, HOY)).toEqual(target);
  });

  it('con varias activas, se queda con la más reciente', () => {
    const older: CardioAssignment = { ...base, id: '1', type: 'zona2', active: true, createdAt: '2026-01-01' };
    const newer: CardioAssignment = { ...base, id: '2', type: 'zona2', active: true, createdAt: '2026-02-01' };
    expect(pickActiveZona2Assignment([older, newer], HOY)).toEqual(newer);
  });

  it('una sesión puntual para HOY gana a la recurrente', () => {
    const recurrente: CardioAssignment = { ...base, id: '1', type: 'zona2', active: true, createdAt: '2026-01-01' };
    const puntual: CardioAssignment = { ...base, id: '2', type: 'zona2', active: true, createdAt: '2026-08-20', date: HOY };
    expect(pickActiveZona2Assignment([recurrente, puntual], HOY)).toEqual(puntual);
  });

  it('una sesión puntual para OTRO día no se ve ni antes ni después de su fecha', () => {
    const puntualDeMañana: CardioAssignment = { ...base, id: '1', type: 'zona2', active: true, createdAt: '2026-08-20', date: '2026-08-28' };
    const recurrente: CardioAssignment = { ...base, id: '2', type: 'zona2', active: true, createdAt: '2026-01-01' };
    // Hoy: se ve la recurrente, no la puntual de mañana.
    expect(pickActiveZona2Assignment([puntualDeMañana, recurrente], HOY)).toEqual(recurrente);
    // Al día siguiente: ahora sí toca la puntual.
    expect(pickActiveZona2Assignment([puntualDeMañana, recurrente], '2026-08-28')).toEqual(puntualDeMañana);
    // Pasado el día: vuelve a no verse, cae otra vez a la recurrente.
    expect(pickActiveZona2Assignment([puntualDeMañana, recurrente], '2026-08-29')).toEqual(recurrente);
  });

  it('sin recurrente de respaldo, un día sin sesión puntual no coge una puntual de otro día', () => {
    const puntualDeOtroDia: CardioAssignment = { ...base, id: '1', type: 'zona2', active: true, createdAt: '2026-08-20', date: '2026-08-28' };
    expect(pickActiveZona2Assignment([puntualDeOtroDia], HOY)).toBeUndefined();
  });
});

describe('pickActiveIntervalAssignment — prescripción de intervalos del coach (§F6)', () => {
  const base: Omit<CardioAssignment, 'id' | 'type' | 'active' | 'createdAt'> = { athleteId: 'a@x.com' };
  const someBlocks = [{ label: 'Sprint', closeType: 'time' as const, durationSec: 30, targetZone: 'z5' as const }];

  it('exige al menos un bloque definido', () => {
    const noBlocks: CardioAssignment = { ...base, id: '1', type: 'intervalos', active: true, createdAt: '2026-01-01', intervals: [] };
    expect(pickActiveIntervalAssignment([noBlocks], HOY)).toBeUndefined();
  });

  it('coge la de intervalos activa con bloques', () => {
    const target: CardioAssignment = { ...base, id: '2', type: 'intervalos', active: true, createdAt: '2026-01-01', intervals: someBlocks };
    expect(pickActiveIntervalAssignment([target], HOY)).toEqual(target);
  });
});

describe('objetivo semanal de cardio (F3.9)', () => {
  const TODAY = '2026-07-08'; // miércoles, semana ISO 2026-W28: lunes 2026-07-06 → domingo 2026-07-12

  it('suma minutos solo de sesiones dentro de la semana ISO actual', () => {
    const sessions = [
      session('2026-07-05', 30 * 60), // domingo anterior: fuera
      session('2026-07-06', 20 * 60), // lunes: dentro
      session('2026-07-08', 25 * 60), // hoy: dentro
      session('2026-07-13', 40 * 60), // lunes siguiente: fuera
    ];
    expect(weeklyCardioMinutesDone(sessions, TODAY)).toBe(45);
  });

  it('sin sesiones esta semana, son 0 minutos', () => {
    expect(weeklyCardioMinutesDone([session('2026-06-01', 30 * 60)], TODAY)).toBe(0);
  });

  it('reparte los minutos por día de la semana, lunes primero', () => {
    const sessions = [session('2026-07-06', 20 * 60), session('2026-07-08', 25 * 60)];
    expect(dailyCardioMinutesForWeek(sessions, TODAY)).toEqual([20, 0, 25, 0, 0, 0, 0]);
  });

  it('sin prescripción activa, cae al objetivo genérico de 90 min/semana', () => {
    expect(defaultWeeklyCardioGoal([])).toEqual({ minutesGoal: 90 });
  });

  it('deriva el objetivo de la prescripción activa más reciente (timesPerWeek × duración)', () => {
    const assignments: CardioAssignment[] = [
      { athleteId: 'a@x.com', id: '1', type: 'zona2', active: true, createdAt: '2026-01-01', timesPerWeek: 3, targetDurationSec: 40 * 60 },
    ];
    expect(defaultWeeklyCardioGoal(assignments)).toEqual({ minutesGoal: 120, sessionsGoal: 3 });
  });

  it('sin targetDurationSec, asume 30 min por sesión', () => {
    const assignments: CardioAssignment[] = [
      { athleteId: 'a@x.com', id: '1', type: 'intervalos', active: true, createdAt: '2026-01-01', timesPerWeek: 2, intervals: [] },
    ];
    expect(defaultWeeklyCardioGoal(assignments)).toEqual({ minutesGoal: 60, sessionsGoal: 2 });
  });
});
