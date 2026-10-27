import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  diasDelCiclo, aperturaDelCiclo, caducidadDelCiclo, aperturaDesde, enPausa,
  fechaSemanaDelBloque, esBloqueDeDescarga, normalizarDiaRevision,
} from './cicloRevision';
import { isOverdue, hasAnsweredThisOccurrence } from './questionnaireSchedule';
import type { Mesocycle, QuestionnaireAssignment, QuestionnaireResponse } from '../types';

// 2026-10-26 es lunes.
describe('diasDelCiclo', () => {
  it('lunes por defecto: se abre el viernes y caduca el martes', () => {
    expect(diasDelCiclo()).toEqual({ revision: 1, apertura: 5, caducidad: 2 });
  });
  it('martes: se abre el sábado y caduca el miércoles', () => {
    expect(diasDelCiclo(2)).toEqual({ revision: 2, apertura: 6, caducidad: 3 });
  });
  it('miércoles: se abre el domingo y caduca el jueves', () => {
    expect(diasDelCiclo(3)).toEqual({ revision: 3, apertura: 0, caducidad: 4 });
  });
  it('un valor raro cae al lunes', () => {
    expect(normalizarDiaRevision(9)).toBe(1);
    expect(normalizarDiaRevision(undefined)).toBe(1);
  });
});

describe('aperturaDelCiclo', () => {
  it('con revisión el lunes, igual que el viernes del ciclo de siempre', () => {
    expect(aperturaDelCiclo('2026-10-26')).toBe('2026-10-23'); // lunes → viernes anterior
    expect(aperturaDelCiclo('2026-10-27')).toBe('2026-10-30'); // martes → viernes siguiente
    expect(aperturaDelCiclo('2026-10-30')).toBe('2026-10-30');
  });
  it('con revisión el martes, el ciclo va de miércoles a martes', () => {
    expect(aperturaDelCiclo('2026-10-27', 2)).toBe('2026-10-24'); // martes → sábado anterior
    expect(aperturaDelCiclo('2026-10-28', 2)).toBe('2026-10-31'); // miércoles → sábado siguiente
  });
  it('caduca 4 días después de abrirse', () => {
    expect(caducidadDelCiclo('2026-10-24')).toBe('2026-10-28');
  });
  it('primera apertura desde una fecha', () => {
    expect(aperturaDesde('2026-10-26', 3)).toBe('2026-11-01'); // domingo
  });
});

describe('enPausa', () => {
  it('cuenta los extremos', () => {
    const p = { desde: '2026-10-20', hasta: '2026-10-30' };
    expect(enPausa('2026-10-30', p)).toBe(true);
    expect(enPausa('2026-10-31', p)).toBe(false);
    expect(enPausa('2026-10-30', undefined)).toBe(false);
  });
});

describe('semana del bloque', () => {
  const meso6 = { startDate: '2026-09-07', weeks: 6, objective: 'Hipertrofia' } as Mesocycle; // lunes
  it('última semana: el viernes de la semana 6', () => {
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaDelBloque: 'ultima' }, meso6)).toBe('2026-10-16');
  });
  it('primera semana y mitad', () => {
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaDelBloque: 'primera' }, meso6)).toBe('2026-09-11');
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaDelBloque: 'mitad' }, meso6)).toBe('2026-09-25');
  });
  it('con revisión el miércoles cae en domingo', () => {
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaDelBloque: 'ultima' }, meso6, 3)).toBe('2026-10-18');
  });
  it('en bloques cortos no toca si pide un mínimo de semanas', () => {
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaDelBloque: 'mitad', minSemanasBloque: 8 }, meso6)).toBeNull();
  });
  it('en una descarga no toca', () => {
    const descarga = { startDate: '2026-10-19', weeks: 1, objective: 'Descarga' } as Mesocycle;
    expect(esBloqueDeDescarga(descarga)).toBe(true);
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaDelBloque: 'ultima' }, descarga)).toBeNull();
  });
});

describe('isOverdue con el día del atleta', () => {
  afterEach(() => vi.useRealTimers());
  const semanal: QuestionnaireAssignment = {
    id: 'a1', questionnaireId: 'q', athleteId: 'x@x.com', active: true, createdAt: '2026-09-01',
    schedule: { type: 'weekdays', weekdays: [5] }, startDate: '2026-09-04',
  };
  const hoy = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso + 'T10:00:00')); };

  it('revisión el martes: el sábado ya está pendiente, el miércoles caduca', () => {
    hoy('2026-10-31'); // sábado
    expect(isOverdue(semanal, { diaRevision: 2 })).toBe(true);
    expect(isOverdue(semanal)).toBe(true); // por defecto (viernes) también
    hoy('2026-10-27'); // martes: con revisión el lunes ya caducó; con el martes sigue
    expect(isOverdue(semanal)).toBe(false);
    expect(isOverdue(semanal, { diaRevision: 2 })).toBe(true);
    hoy('2026-10-28'); // miércoles
    expect(isOverdue(semanal, { diaRevision: 2 })).toBe(false);
  });

  it('en pausa no se pide', () => {
    hoy('2026-10-31');
    expect(isOverdue(semanal, { diaRevision: 2, pausa: { desde: '2026-10-25', hasta: '2026-11-08' } })).toBe(false);
  });

  it('semana del bloque: pendiente una semana y se cierra al responder', () => {
    const cierre: QuestionnaireAssignment = { ...semanal, id: 'c1', schedule: { type: 'mesocycle_week', semanaDelBloque: 'ultima' } };
    const ctx = { mesocycles: [{ startDate: '2026-09-07', weeks: 6, objective: '' } as Mesocycle] };
    hoy('2026-10-16');
    expect(isOverdue(cierre, ctx)).toBe(true);
    hoy('2026-10-22');
    expect(isOverdue(cierre, ctx)).toBe(true);
    hoy('2026-10-23');
    expect(isOverdue(cierre, ctx)).toBe(false);
    hoy('2026-10-18');
    const r = { assignmentId: 'c1', submittedAt: '2026-10-17T09:00:00Z' } as QuestionnaireResponse;
    expect(hasAnsweredThisOccurrence(cierre, [r], ctx)).toBe(true);
    expect(hasAnsweredThisOccurrence(cierre, [{ ...r, submittedAt: '2026-10-10T09:00:00Z' }], ctx)).toBe(false);
  });
});
