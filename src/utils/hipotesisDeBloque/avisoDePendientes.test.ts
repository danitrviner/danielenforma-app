import { describe, expect, it } from 'vitest';
import type { HipotesisDeZona, Mesocycle } from '../../types';
import { MUSCLE_ORDER } from '../../types';
import { camposAlConfirmar, completarHipotesis, hipotesisPendientes } from '../hipotesisDelMeso';
import { avisoDePendientes } from './avisoDePendientes';

const propia = (ref: number): HipotesisDeZona => ({
  palanca: 'volumen', iemMedioAnterior: ref, iemFinalAnterior: ref, semanasDeReferencia: 2,
  iemMedioObjetivo: Math.round(ref * 1.05 * 10) / 10, iemArranque: ref, iemTecho: Math.round(ref * 1.1 * 10) / 10, rmObjetivoPct: 5,
});
const PROPUESTA = { hipotesis: { pectoral: propia(41.2), cuadriceps: propia(30) } };

const meso = (o: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm1', athleteId: 'a@b.c', number: 1, weeks: 10, startDate: '2026-10-19', daysPerWeek: 4,
  groups: Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: 8, priority: g === 'pecho' || g === 'cuadriceps' ? 'alta' : 'media' }])) as Mesocycle['groups'],
  ...o,
} as Mesocycle);

describe('hipotesisPendientes', () => {
  it('una zona con estrella sin hipótesis guardada está pendiente; sin estrellas, nada', () => {
    expect(hipotesisPendientes(meso(), PROPUESTA)).toEqual([{ zona: 'pectoral', falta: 'hipotesis' }, { zona: 'cuadriceps', falta: 'hipotesis' }]);
    const sinEstrellas = meso({ groups: Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: 8, priority: 'media' }])) as Mesocycle['groups'] });
    expect(hipotesisPendientes(sinEstrellas, PROPUESTA)).toEqual([]);
  });

  it('una hipótesis guardada sin cifras está pendiente solo cuando la propuesta ya las tiene', () => {
    const m = meso({ hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 5 }, cuadriceps: propia(30) } });
    expect(hipotesisPendientes(m, PROPUESTA)).toEqual([{ zona: 'pectoral', falta: 'cifras' }]);
    // Primeras dos semanas del bloque: la propuesta tampoco tiene cifras todavía.
    expect(hipotesisPendientes(m, { hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 5 } } })).toEqual([]);
  });

  it('con todo confirmado y con cifras no queda nada', () => {
    expect(hipotesisPendientes(meso({ hipotesis: PROPUESTA.hipotesis }), PROPUESTA)).toEqual([]);
  });
});

describe('completarHipotesis', () => {
  it('pone la propuesta donde falta y respeta lo que el coach ya confirmó', () => {
    const m = meso({ hipotesis: { pectoral: { palanca: 'volumen', rmObjetivoPct: 8, limite: 'hombro sin molestias' } } });
    const h = completarHipotesis(m, PROPUESTA);
    // Pectoral recibe las cifras sin perder su objetivo de RM ni su límite; cuádriceps, la propuesta entera.
    expect(h.pectoral).toEqual({ ...propia(41.2), rmObjetivoPct: 8, limite: 'hombro sin molestias' });
    expect(h.cuadriceps).toEqual(propia(30));
  });

  it('lo que se escribe al confirmar: hipótesis, techos y modo por zona, sin tocar el objetivo de un bloque sin tipo', () => {
    const m = meso({ objective: 'Recomposición' });
    const campos = camposAlConfirmar(m, completarHipotesis(m, PROPUESTA));
    expect(Object.keys(campos.hipotesis ?? {})).toEqual(['pectoral', 'cuadriceps']);
    expect(campos.cdgObjetivosIem).toEqual({ pectoral: 45.3, cuadriceps: 33 });
    expect(campos.cdgModoPorZona).toMatchObject({ pectoral: 'dinamico', cuadriceps: 'dinamico', dorsal: 'estatico' });
    expect('objective' in campos).toBe(false);
  });
});

describe('avisoDePendientes', () => {
  const pendientes = [{ zona: 'cuadriceps' as const, falta: 'hipotesis' as const }, { zona: 'pectoral' as const, falta: 'hipotesis' as const }];

  it('sin pendientes no hay aviso', () => {
    expect(avisoDePendientes({ pendientes: [], hipotesis: PROPUESTA.hipotesis })).toBeNull();
  });

  it('dos zonas con estrella sin hipótesis en un primer bloque ya empezado', () => {
    const a = avisoDePendientes({ pendientes, hipotesis: PROPUESTA.hipotesis, semanaActual: 6, semanas: 10 })!;
    expect(a).toMatchObject({ zonas: ['pectoral', 'cuadriceps'], titulo: 'Pectoral y Cuádriceps', estado: 'Sin hipótesis', accion: 'Confirmar la propuesta' });
    expect(a.detalle).toBe('Semana 6 de 10. Sin confirmar no hay semáforo ni veredicto al cerrar. Propuesta: más volumen en las dos, +5 % sobre sus primeras 2 semanas.');
  });

  it('con bloque anterior lo dice; con palancas distintas, cada una con sus zonas', () => {
    const { semanasDeReferencia: _a, ...pec } = propia(58);
    const { semanasDeReferencia: _b, ...cua } = { ...propia(30), palanca: 'intensidad' as const };
    const a = avisoDePendientes({ pendientes, hipotesis: { pectoral: pec, cuadriceps: cua }, semanaActual: 2, semanas: 12 })!;
    expect(a.detalle).toBe('Semana 2 de 12. Sin confirmar no hay semáforo ni veredicto al cerrar. Propuesta: más volumen en Pectoral y más intensidad en Cuádriceps, +5 % sobre donde acabó el bloque anterior.');
  });

  it('si la propuesta no sube (bloque en déficit), no dice «más volumen»: sostener y no perder', () => {
    const sostener = (ref: number): HipotesisDeZona => ({ ...propia(ref), iemMedioObjetivo: Math.round(ref * 0.95 * 10) / 10, iemTecho: ref, rmObjetivoPct: 0 });
    const a = avisoDePendientes({ pendientes, hipotesis: { pectoral: sostener(41.2), cuadriceps: sostener(30) }, semanaActual: 3, semanas: 5 })!;
    expect(a.detalle).toBe('Semana 3 de 5. Sin confirmar no hay semáforo ni veredicto al cerrar. Propuesta: sostener el estímulo de sus primeras 2 semanas en las dos, sin perder fuerza.');
  });

  it('con cifras bajas el 5 % de la regla no sale exacto en cada zona: se resume igual', () => {
    const a = avisoDePendientes({ pendientes, hipotesis: { pectoral: { ...propia(12.6), iemMedioObjetivo: 13.2 }, cuadriceps: { ...propia(27.5), iemMedioObjetivo: 28.9 } } })!;
    expect(a.detalle).toBe('Sin confirmar no hay semáforo ni veredicto al cerrar. Propuesta: más volumen en las dos, +5 % sobre sus primeras 2 semanas.');
  });

  it('primer bloque en sus dos primeras semanas: se puede confirmar, y avisa de que aún no hay cifras', () => {
    const sin = { palanca: 'volumen' as const, rmObjetivoPct: 5 };
    const a = avisoDePendientes({ pendientes: [pendientes[1]], hipotesis: { pectoral: sin }, semanaActual: 1, semanas: 8 })!;
    expect(a.titulo).toBe('Pectoral');
    expect(a.detalle).toBe('Semana 1 de 8. Sin confirmar no hay semáforo ni veredicto al cerrar. Propuesta: más volumen en Pectoral. Aún sin cifras de estímulo: saldrán de sus dos primeras semanas entrenadas.');
  });

  it('confirmada sin cifras y ya las hay: otro estado y otro botón', () => {
    const a = avisoDePendientes({ pendientes: [{ zona: 'pectoral', falta: 'cifras' }], hipotesis: PROPUESTA.hipotesis, semanaActual: 3, semanas: 10 })!;
    expect(a).toMatchObject({ estado: 'Sin cifras de proceso', accion: 'Poner las cifras' });
    expect(a.detalle).toBe('Semana 3 de 10. Está confirmada sin cifras de estímulo: el veredicto se daría solo por el RM. Propuesta: más volumen en Pectoral, +5 % sobre sus primeras 2 semanas.');
  });
});
