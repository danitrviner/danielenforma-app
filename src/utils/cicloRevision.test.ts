import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  diasDelCiclo, aperturaDelCiclo, caducidadDelCiclo, aperturaDesde, enPausa,
  fechaSemanaDelBloque, esBloqueDeDescarga, normalizarDiaRevision, semanaPedida, semanaDeCierreEnCalendario,
  esCuestionarioDeCierre, idsDeCuestionariosDeCierre,
} from './cicloRevision';
import { presetPorTitulo } from '../data/questionnairePresets';
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

describe('semana del cierre a elegir (18-11-2026)', () => {
  const meso8 = { startDate: '2026-09-07', weeks: 8, objective: 'Hipertrofia' } as Mesocycle; // lunes
  const ultima = { type: 'mesocycle_week' as const, semanaDelBloque: 'ultima' as const };
  const cierre = { conElCierre: true };

  it('sin elegir, la última; con `semanaDeCierre`, esa semana (solo el cuestionario de cierre)', () => {
    expect(semanaPedida(ultima, meso8, cierre)).toBe(8);
    expect(semanaPedida(ultima, { ...meso8, semanaDeCierre: 6 }, cierre)).toBe(6);
    // Semana 6 = del 12 al 18 de octubre: se abre el viernes 16.
    expect(fechaSemanaDelBloque(ultima, { ...meso8, semanaDeCierre: 6 }, undefined, cierre)).toBe('2026-10-16');
  });

  it('las mediciones (y cualquier otra «última») siguen en la última semana real', () => {
    expect(semanaPedida(ultima, { ...meso8, semanaDeCierre: 6 })).toBe(8);
    expect(semanaPedida(ultima, { ...meso8, semanaDeCierre: 6 }, { conElCierre: false })).toBe(8);
    // Semana 8 = del 26 de octubre al 1 de noviembre: se abre el viernes 30.
    expect(fechaSemanaDelBloque(ultima, { ...meso8, semanaDeCierre: 6 })).toBe('2026-10-30');
  });

  it('nunca pasa de las vueltas del bloque', () => {
    expect(semanaPedida(ultima, { ...meso8, semanaDeCierre: 12 }, cierre)).toBe(8);
    expect(semanaDeCierreEnCalendario({ ...meso8, semanaDeCierre: 0 })).toBeNull();
  });

  it('en ciclos de 14 días la semana elegida es una vuelta: la 3 acaba en la semana 6', () => {
    const quincenal = { ...meso8, cycleDays: 14 };
    expect(semanaPedida(ultima, { ...quincenal, semanaDeCierre: 3 }, cierre)).toBe(6);
    expect(semanaPedida(ultima, { ...quincenal, semanaDeCierre: 4 }, cierre)).toBe(8);
    expect(semanaPedida(ultima, { ...quincenal, semanaDeCierre: 9 }, cierre)).toBe(8); // solo hay 4 vueltas
  });

  it('con el bloque entero manda su reparto; un ciclo de 10 días no se sale del bloque', () => {
    const diez = { ...meso8, daysPerWeek: 4, cycleDays: 10 } as Mesocycle;
    expect(semanaPedida(ultima, { ...diez, semanaDeCierre: 2 }, cierre)).toBe(3); // días 10-19 → acaba en la semana 3
    expect(semanaPedida(ultima, { ...diez, semanaDeCierre: 6 }, cierre)).toBe(8); // 6 vueltas = 60 días > 56
  });

  it('el cierre elegido no mueve «primera» ni «mitad»', () => {
    const m = { ...meso8, semanaDeCierre: 5 };
    expect(semanaPedida({ type: 'mesocycle_week', semanaDelBloque: 'primera' }, m, cierre)).toBe(1);
    expect(semanaPedida({ type: 'mesocycle_week', semanaDelBloque: 'mitad' }, m, cierre)).toBe(4);
  });

  it('una semana concreta en la asignación manda, con tope en las semanas del bloque', () => {
    expect(semanaPedida({ type: 'mesocycle_week', semanaNumero: 3 }, { ...meso8, semanaDeCierre: 5 }, cierre)).toBe(3);
    expect(semanaPedida({ type: 'mesocycle_week', semanaNumero: 10 }, meso8)).toBe(8);
    expect(fechaSemanaDelBloque({ type: 'mesocycle_week', semanaNumero: 3 }, meso8)).toBe('2026-09-25');
    // La semana es de calendario aunque el bloque vaya en ciclos de 14 días.
    expect(semanaPedida({ type: 'mesocycle_week', semanaNumero: 3 }, { ...meso8, cycleDays: 14 })).toBe(3);
  });
});

describe('cuál es el cuestionario de cierre (18-11-2026)', () => {
  const q = (id: string, title: string, signals: (string | undefined)[]) => ({
    id, title, questions: signals.map((signalKey, i) => ({ id: `p${i}`, label: 'x', type: 'text', required: false, signalKey })),
  }) as never;

  it('el de las plantillas oficiales: Cierre de bloque sí, Mediciones del bloque no', () => {
    const cierre = presetPorTitulo('Cierre de bloque')!;
    const mediciones = presetPorTitulo('Mediciones del bloque')!;
    expect(esCuestionarioDeCierre(cierre as never)).toBe(true);
    expect(esCuestionarioDeCierre(mediciones as never)).toBe(false);
  });

  it('por sus señales `meso_end.*`, aunque se llame distinto; o por el título oficial', () => {
    expect(esCuestionarioDeCierre(q('a', 'Final de mesociclo', ['meso_end.rating']))).toBe(true);
    expect(esCuestionarioDeCierre(q('b', 'Cierre de bloque', []))).toBe(true);
    expect(esCuestionarioDeCierre(q('c', 'Mediciones', [undefined, 'cintura']))).toBe(false);
  });

  it('ids de entre las plantillas (las que faltan, fuera)', () => {
    const ids = idsDeCuestionariosDeCierre([q('a', 'Final', ['meso_end.effort']), q('m', 'Mediciones del bloque', []), null, undefined]);
    expect([...ids]).toEqual(['a']);
  });
});

describe('la semana de cierre en el calendario de las asignaciones (18-11-2026)', () => {
  afterEach(() => vi.useRealTimers());
  const en = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso + 'T10:00:00')); };
  const meso8 = { id: 'm', startDate: '2026-09-07', weeks: 8, objective: 'Hipertrofia', semanaDeCierre: 6 } as Mesocycle;
  const base = { athleteId: 'x@x.com', active: true, createdAt: '2026-09-01', startDate: '2026-09-01', schedule: { type: 'mesocycle_week' as const, semanaDelBloque: 'ultima' as const } };
  const cierre: QuestionnaireAssignment = { ...base, id: 'ac', questionnaireId: 'qc' };
  const mediciones: QuestionnaireAssignment = { ...base, id: 'am', questionnaireId: 'qm' };
  const ctx = { mesocycles: [meso8], cuestionariosDeCierre: new Set(['qc']) };

  it('en la semana 6 sale el cierre y no las mediciones', () => {
    en('2026-10-16');
    expect(isOverdue(cierre, ctx)).toBe(true);
    expect(isOverdue(mediciones, ctx)).toBe(false);
  });

  it('en la semana 8 salen las mediciones (el cierre ya pasó)', () => {
    en('2026-10-30');
    expect(isOverdue(mediciones, ctx)).toBe(true);
    expect(isOverdue(cierre, ctx)).toBe(false);
  });

  it('sin saber cuál es el cierre, ninguno se mueve', () => {
    en('2026-10-16');
    expect(isOverdue(cierre, { mesocycles: [meso8] })).toBe(false);
    en('2026-10-30');
    expect(isOverdue(cierre, { mesocycles: [meso8] })).toBe(true);
  });
});
