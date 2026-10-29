import { describe, it, expect } from 'vitest';
import { calcularSenales, senalesIguales, type FotoParaSenales } from './senalesDelAtleta';
import type { WorkoutAssignment, WorkoutLog } from '../types';

const HOY = '2026-10-28';

function foto(p: Partial<FotoParaSenales> = {}): FotoParaSenales {
  return {
    assignments: [], workoutLogs: [], bodyweightLogs: [], stepLogs: [], dietLogs: [],
    respuestas: [], cuestionarios: [],
    ...p,
  };
}
const asig = (id: string, date: string, status: WorkoutAssignment['status']): WorkoutAssignment =>
  ({ id, athleteId: 'a@x.com', workoutId: 'w', date, status });
const log = (date: string): WorkoutLog =>
  ({ id: `l_${date}`, athleteId: 'a@x.com', workoutId: 'w', assignmentId: '', date, completedAt: `${date}T19:00:00.000Z`, entries: [] });

describe('calcularSenales', () => {
  it('sin nada registrado: todo a cero y sin fechas', () => {
    expect(calcularSenales(foto(), HOY)).toEqual({
      calculadoEn: HOY, ultimoRegistro: null, registros14d: 0, perdidas14d: 0,
      ultimaRespuesta: null, tieneCuestionarios: false,
    });
  });

  it('el último registro es el más reciente de cualquier fuente, y los días no se duplican', () => {
    const s = calcularSenales(foto({
      workoutLogs: [log('2026-10-20')],
      bodyweightLogs: [{ id: 'p', athleteId: 'a@x.com', date: '2026-10-25', weight: 80, createdAt: '' }],
      stepLogs: [{ id: 's', athleteId: 'a@x.com', date: '2026-10-25', steps: 8000, source: 'manual', createdAt: '' }],
      dietLogs: [{ id: 'd', athleteId: 'a@x.com', date: '2026-10-27', dietId: 'x', doneItemIds: [] }],
      respuestas: [{ id: 'r', questionnaireId: 'q', assignmentId: 'as', athleteId: 'a@x.com', submittedAt: '2026-10-24T10:00:00.000Z', answers: [] }],
    }), HOY);
    expect(s.ultimoRegistro).toBe('2026-10-27');
    expect(s.registros14d).toBe(4); // 20, 24, 25, 27
    expect(s.ultimaRespuesta).toBe('2026-10-24');
  });

  it('un registro de mañana no cuenta como hoy (relojes adelantados)', () => {
    const s = calcularSenales(foto({ workoutLogs: [log('2026-10-29')] }), HOY);
    expect(s.ultimoRegistro).toBeNull();
  });

  it('solo cuenta los días dentro de la ventana de 14', () => {
    const s = calcularSenales(foto({ workoutLogs: [log('2026-10-01'), log('2026-10-15'), log('2026-10-16')] }), HOY);
    expect(s.registros14d).toBe(2);
    expect(s.ultimoRegistro).toBe('2026-10-16');
  });

  it('cuenta las perdidas de la ventana y respeta el entreno guardado aunque el status diga perdido', () => {
    const s = calcularSenales(foto({
      assignments: [
        asig('1', '2026-10-20', 'perdido'),
        asig('2', '2026-10-22', 'perdido'),
        asig('3', '2026-10-01', 'perdido'), // fuera de ventana
        asig('4', '2026-10-24', 'perdido'), // pero tiene log: hecha
        asig('5', '2026-10-26', 'pending'),
      ],
      workoutLogs: [log('2026-10-24')],
    }), HOY);
    expect(s.perdidas14d).toBe(2);
  });

  it('tieneCuestionarios solo con asignaciones activas', () => {
    const base = { id: 'q', questionnaireId: 'x', athleteId: 'a@x.com', schedule: { type: 'weekdays' as const }, startDate: '2026-09-01', createdAt: '' };
    expect(calcularSenales(foto({ cuestionarios: [{ ...base, active: false }] as never }), HOY).tieneCuestionarios).toBe(false);
    expect(calcularSenales(foto({ cuestionarios: [{ ...base, active: true }] as never }), HOY).tieneCuestionarios).toBe(true);
  });
});

describe('senalesIguales', () => {
  const s = calcularSenales(foto({ workoutLogs: [log('2026-10-27')] }), HOY);
  it('ignora la fecha de cálculo', () => {
    expect(senalesIguales({ ...s, calculadoEn: '2026-10-27' }, s)).toBe(true);
  });
  it('sin señales previas no son iguales', () => {
    expect(senalesIguales(undefined, s)).toBe(false);
  });
  it('detecta un cambio', () => {
    expect(senalesIguales({ ...s, perdidas14d: 1 }, s)).toBe(false);
  });
});
