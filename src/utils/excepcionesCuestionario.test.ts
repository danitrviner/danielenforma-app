import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mesocycle, QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { hasAnsweredThisOccurrence, isOverdue } from './questionnaireSchedule';
import { isDueToday, proximaOcurrencia, proximaOcurrenciaDetallada } from './scheduleEngine';
import { conFechaMovida, conMandarAhora, extrasVigentes, limpiarExcepciones, sinExcepcion } from './excepcionesCuestionario';

/* Calendario: 2026-11-20 es viernes. Revisión el lunes (por defecto): la
   semanal se abre el viernes y caduca el martes. */

afterEach(() => vi.useRealTimers());
const el = (dia: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${dia}T12:00:00`)); };
const pendiente = (a: QuestionnaireAssignment, rs: QuestionnaireResponse[] = [], ctx?: Parameters<typeof isOverdue>[1]) =>
  isOverdue(a, ctx) && !hasAnsweredThisOccurrence(a, rs, ctx);
const respuesta = (id: string, dia: string) =>
  ({ id: `r-${dia}`, assignmentId: id, questionnaireId: 'q', athleteId: 'x@x.com', submittedAt: `${dia}T10:00:00`, answers: [] }) as unknown as QuestionnaireResponse;

const semanal: QuestionnaireAssignment = {
  id: 'sem', questionnaireId: 'q', athleteId: 'x@x.com', active: true, createdAt: '2026-10-01',
  schedule: { type: 'weekdays', weekdays: [5] }, startDate: '2026-10-02',
};
const mensual: QuestionnaireAssignment = {
  id: 'mes', questionnaireId: 'q', athleteId: 'x@x.com', active: true, createdAt: '2026-09-01',
  schedule: { type: 'monthly', dayOfMonth: 26 }, startDate: '2026-09-01',
};

describe('Cambiar esta fecha: una excepción mueve solo esa ocasión', () => {
  // Viernes 20 → lunes 23.
  const movida = { ...semanal, excepciones: [{ ocurrencia: '2026-11-20', nuevaFecha: '2026-11-23' }] };

  it('el día original ya no toca y el nuevo sí', () => {
    el('2026-11-20');
    expect(isOverdue(movida)).toBe(false);
    expect(isDueToday(movida)).toBe(false);
    el('2026-11-23');
    expect(isOverdue(movida)).toBe(true);
    expect(isDueToday(movida)).toBe(true);
  });

  it('caduca según la fecha nueva (los mismos 4 días que tenía)', () => {
    el('2026-11-26');
    expect(isOverdue(movida)).toBe(true);
    el('2026-11-27'); // se abre la siguiente, la normal
    expect(hasAnsweredThisOccurrence(movida, [respuesta('sem', '2026-11-23')])).toBe(false);
  });

  it('la semana anterior y la siguiente no cambian', () => {
    el('2026-11-13');
    expect(isOverdue(movida)).toBe(true);
    el('2026-11-27');
    expect(isOverdue(movida)).toBe(true);
    expect(isDueToday(movida)).toBe(true);
    expect(pendiente(movida, [respuesta('sem', '2026-11-27')])).toBe(false);
  });

  it('«Próxima» enseña la fecha nueva y de cuál viene', () => {
    el('2026-11-18');
    expect(proximaOcurrenciaDetallada(movida)).toEqual({ fecha: '2026-11-23', original: '2026-11-20' });
    expect(proximaOcurrencia(movida)).toBe('2026-11-23');
    el('2026-11-24');
    expect(proximaOcurrencia(movida)).toBe('2026-11-27');
  });

  it('volver a su fecha la deshace, y moverla otra vez no deja dos', () => {
    el('2026-11-18');
    expect(conFechaMovida(movida, '2026-11-20', '2026-11-20', undefined, '2026-11-18')).toEqual([]);
    expect(conFechaMovida(movida, '2026-11-20', '2026-11-19', undefined, '2026-11-18'))
      .toEqual([{ ocurrencia: '2026-11-20', nuevaFecha: '2026-11-19' }]);
    expect(sinExcepcion(movida, { ocurrencia: '2026-11-20', nuevaFecha: '2026-11-23' }, undefined, '2026-11-18')).toEqual([]);
  });

  it('adelantarla también: se abre antes y la original no vuelve a salir', () => {
    const antes = { ...semanal, excepciones: [{ ocurrencia: '2026-11-20', nuevaFecha: '2026-11-18' }] };
    el('2026-11-18');
    expect(pendiente(antes)).toBe(true);
    el('2026-11-20');
    expect(pendiente(antes, [respuesta('sem', '2026-11-18')])).toBe(false);
    expect(isDueToday(antes)).toBe(false);
  });

  it('en «semana del bloque» mueve la del bloque y abre 7 días desde la nueva', () => {
    const meso = { id: 'm', athleteId: 'x@x.com', startDate: '2026-09-07', weeks: 6, objective: 'Hipertrofia' } as Mesocycle;
    const cierre: QuestionnaireAssignment = {
      ...semanal, id: 'cie', schedule: { type: 'mesocycle_week', semanaDelBloque: 'ultima' }, startDate: '2026-09-01',
      excepciones: [{ ocurrencia: '2026-10-16', nuevaFecha: '2026-10-20' }],
    };
    const ctx = { mesocycles: [meso] };
    el('2026-10-16');
    expect(isOverdue(cierre, ctx)).toBe(false);
    el('2026-10-20');
    expect(isOverdue(cierre, ctx)).toBe(true);
    el('2026-10-26');
    expect(isOverdue(cierre, ctx)).toBe(true);
    el('2026-10-27');
    expect(isOverdue(cierre, ctx)).toBe(false);
  });
});

describe('Mandar ahora', () => {
  it('queda pendiente 7 días desde hoy y desaparece al contestar', () => {
    const a = { ...mensual, excepciones: conMandarAhora(mensual, undefined, '2026-11-02') };
    expect(a.excepciones).toEqual([{ nuevaFecha: '2026-11-02' }]);
    el('2026-11-02');
    expect(pendiente(a)).toBe(true);
    el('2026-11-08');
    expect(pendiente(a)).toBe(true);
    expect(pendiente(a, [respuesta('mes', '2026-11-03')])).toBe(false);
    el('2026-11-09');
    expect(pendiente(a)).toBe(false);
  });

  it('contestarla no se come la ocasión normal siguiente', () => {
    const a = { ...mensual, excepciones: [{ nuevaFecha: '2026-11-02' }] };
    el('2026-11-26');
    expect(pendiente(a, [respuesta('mes', '2026-11-03')])).toBe(true);
    expect(pendiente(a, [respuesta('mes', '2026-11-03'), respuesta('mes', '2026-11-26')])).toBe(false);
  });

  it('en la semanal: mandada el miércoles y contestada, el viernes vuelve a tocar', () => {
    const a = { ...semanal, excepciones: [{ nuevaFecha: '2026-11-18' }] };
    el('2026-11-18');
    expect(pendiente(a, [respuesta('sem', '2026-11-13')])).toBe(true);
    expect(pendiente(a, [respuesta('sem', '2026-11-18')])).toBe(false);
    el('2026-11-20');
    expect(pendiente(a, [respuesta('sem', '2026-11-18')])).toBe(true);
    expect(pendiente(a, [respuesta('sem', '2026-11-18'), respuesta('sem', '2026-11-20')])).toBe(false);
    el('2026-11-24'); // la normal ya caducó y la extra sigue abierta, pero contestada
    expect(pendiente(a, [respuesta('sem', '2026-11-18'), respuesta('sem', '2026-11-20')])).toBe(false);
  });

  it('mandarla otra vez después de contestar la normal la vuelve a pedir', () => {
    const a = { ...semanal, excepciones: [{ nuevaFecha: '2026-11-21' }] };
    el('2026-11-21');
    expect(pendiente(a, [respuesta('sem', '2026-11-20')])).toBe(true);
  });

  it('un hito sin contestar no desaparece cuando caduca la extra', () => {
    const hito: QuestionnaireAssignment = { ...semanal, id: 'hito', schedule: { type: 'plan_week', planWeek: 1 }, startDate: '2026-10-02', excepciones: [{ nuevaFecha: '2026-11-02' }] };
    el('2026-11-20');
    expect(pendiente(hito)).toBe(true);
    expect(pendiente(hito, [respuesta('hito', '2026-11-03')])).toBe(false);
  });

  it('pulsar dos veces el mismo día no la duplica, ni la asignación ni su cadencia cambian', () => {
    const una = { ...mensual, excepciones: conMandarAhora(mensual, undefined, '2026-11-02') };
    expect(conMandarAhora(una, undefined, '2026-11-02')).toEqual([{ nuevaFecha: '2026-11-02' }]);
    expect(una.schedule).toEqual(mensual.schedule);
  });

  it('isDueToday y la próxima fecha la cuentan', () => {
    const a = { ...mensual, excepciones: [{ nuevaFecha: '2026-11-18' }] };
    el('2026-11-18');
    expect(isDueToday(a)).toBe(true);
    expect(proximaOcurrenciaDetallada(a)).toEqual({ fecha: '2026-11-18', extra: true });
    expect(proximaOcurrenciaDetallada(a, undefined, { sinExtras: true })).toEqual({ fecha: '2026-11-26' });
  });

  it('extrasVigentes: hasta cuándo sigue y si ya está contestada', () => {
    const a = { ...mensual, excepciones: [{ nuevaFecha: '2026-11-02' }] };
    expect(extrasVigentes(a, [respuesta('mes', '2026-11-04')], '2026-11-05'))
      .toEqual([{ excepcion: { nuevaFecha: '2026-11-02' }, hasta: '2026-11-08', contestada: true }]);
    expect(extrasVigentes(a, [], '2026-11-09')).toEqual([]);
  });
});

describe('limpiarExcepciones: la lista no crece sin fin', () => {
  it('quita las extras ya caducadas y conserva las vigentes', () => {
    const lista = [{ nuevaFecha: '2026-10-01' }, { nuevaFecha: '2026-11-15' }];
    expect(limpiarExcepciones(mensual, lista, undefined, '2026-11-18')).toEqual([{ nuevaFecha: '2026-11-15' }]);
  });

  it('una movida se queda hasta que empieza otra ocasión posterior y la suya ha caducado', () => {
    const lista = [{ ocurrencia: '2026-11-20', nuevaFecha: '2026-11-18' }];
    expect(limpiarExcepciones(semanal, lista, undefined, '2026-11-21')).toEqual(lista); // la original aún podría salir
    expect(limpiarExcepciones(semanal, lista, undefined, '2026-11-27')).toEqual([]);
  });

  it('una movida a más tarde se queda mientras siga abierta', () => {
    const lista = [{ ocurrencia: '2026-11-20', nuevaFecha: '2026-11-25' }];
    expect(limpiarExcepciones(semanal, lista, undefined, '2026-11-28')).toEqual(lista);
    expect(limpiarExcepciones(semanal, lista, undefined, '2026-11-29')).toEqual([]);
  });

  it('se limpia al guardar: mandar ahora con una vieja la tira', () => {
    const a = { ...mensual, excepciones: [{ nuevaFecha: '2026-09-02' }, { ocurrencia: '2026-09-26', nuevaFecha: '2026-09-28' }] };
    expect(conMandarAhora(a, undefined, '2026-11-18')).toEqual([{ nuevaFecha: '2026-11-18' }]);
  });
});
