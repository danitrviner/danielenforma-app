import { describe, it, expect } from 'vitest';
import type { AiProposal, QuestionnaireResponse } from '../types';
import type { CambioAtleta } from '../utils/cambiosAtleta';
import { compararSombra, compararUna, informeDeSombra, solapeDeFrases, VENTANA_DIAS, type VeredictoSombra } from './sombra';

/* Decisiones en sombra de tres atletas frente a lo que hizo Dani: la misma
   respuesta, las mismas kcal (o no), el mismo menú, nada. Lo que se comprueba
   es el veredicto de cada una y el informe por tipo con su recomendación. */

const AHORA = '2026-10-29T12:00:00.000Z';
const prop = (id: string, p: Partial<AiProposal>): AiProposal => ({
  id, athleteId: 'ana@x.com', kind: 'diet', status: 'sombra', chatId: 'c', createdAt: '2026-10-15T07:00:00.000Z',
  summary: `S ${id}`, rationale: '', payload: {} as never, autor: 'asistente', politica: 'sombra', ...p,
} as AiProposal);
const dieta = (kcal: number) => ({ name: 'D', objetivo: { kcal, p: 150, hc: 100, g: 60 }, meals: [] });
const deDani = (id: string, p: Partial<AiProposal>): AiProposal => prop(id, { status: 'approved', politica: 'proponer', autor: 'asistente', reviewedAt: '2026-10-17T18:00:00.000Z', ...p });
const cambio = (id: string, c: Partial<CambioAtleta>): CambioAtleta => ({ id, athleteId: 'ana@x.com', area: 'nutricion', objeto: 'dieta:d1', titulo: 'Dieta «Déficit»', lineas: [], at: '2026-10-16T10:00:00.000Z', autor: 'coach', ...c });

describe('compararUna', () => {
  it('respuesta rutinaria: coincide si Dani contestó la misma revisión en la ventana', () => {
    const s = prop('s1', { kind: 'respuestaRevision', payload: { responseId: 'r1', texto: 'x' } as never, paraAtleta: 'Buena semana' });
    const respuestas = [{ id: 'r1', respuestaCoach: { texto: 'Genial, sigue así', enviadaEn: '2026-10-16T09:00:00.000Z' } } as unknown as QuestionnaireResponse];
    expect(compararUna(s, { propuestas: [], cambios: [], respuestas }, AHORA)).toMatchObject({ veredicto: 'coincide', tipo: 'respuesta_rutinaria' });
    expect(compararUna(s, { propuestas: [], cambios: [], respuestas: [] }, AHORA).veredicto).toBe('nada');
  });
  it('kcal: a ±5 % coincide, más lejos es distinto, y sin objetivo de Dani es parecido o nada', () => {
    const s = prop('s2', { payload: dieta(2200) as never, baseEntityId: 'd1', cambios: ['Objetivo 2.300 → 2.200 kcal'] });
    const base = { kind: 'diet' as const, payload: dieta(2150) as never, baseEntityId: 'd1' };
    expect(compararUna(s, { propuestas: [deDani('d_ok', base)], cambios: [] }, AHORA)).toMatchObject({ veredicto: 'coincide', detalle: 'Sombra 2200 kcal, Dani 2150 kcal (2 %).' });
    expect(compararUna(s, { propuestas: [deDani('d_no', { ...base, payload: dieta(2500) as never })], cambios: [] }, AHORA).veredicto).toBe('distinto');
    // A mano: la cifra sale de las frases del historial de cambios.
    expect(compararUna(s, { propuestas: [], cambios: [cambio('c1', { lineas: ['Objetivo 2.300 → 2.250 kcal'] })] }, AHORA)).toMatchObject({ veredicto: 'coincide', referencia: { fecha: '2026-10-16' } });
    expect(compararUna(s, { propuestas: [], cambios: [cambio('c2', { lineas: ['Quitó el salmón de la cena'] })] }, AHORA).veredicto).toBe('parecido');
    expect(compararUna(s, { propuestas: [], cambios: [] }, AHORA).veredicto).toBe('nada');
  });
  it('fuera de la ventana no cuenta; dentro de la ventana sin referencia es pendiente', () => {
    const s = prop('s3', { payload: dieta(2200) as never, baseEntityId: 'd1', createdAt: '2026-10-27T07:00:00.000Z' });
    const tarde = deDani('d_tarde', { kind: 'diet', payload: dieta(2200) as never, baseEntityId: 'd1', reviewedAt: '2026-11-10T18:00:00.000Z' });
    expect(compararUna(s, { propuestas: [tarde], cambios: [] }, AHORA).veredicto).toBe('pendiente');
    expect(compararUna(s, { propuestas: [tarde], cambios: [] }, `2026-11-${String(27 + VENTANA_DIAS - 30).padStart(2, '0')}T12:00:00.000Z`).veredicto).toBe('nada');
  });
  it('mismo tipo: todas las frases en común coincide, ninguna distinto, algunas coincide', () => {
    const s = prop('s4', { kind: 'weeklyChallenge', cambios: ['Reto: 8.000 pasos × 4', 'Nivel intermedio'] });
    const igual = deDani('r_ok', { kind: 'weeklyChallenge', cambios: ['Reto: 8.000 pasos × 4', 'Nivel intermedio'] });
    const otro = deDani('r_no', { kind: 'weeklyChallenge', cambios: ['Reto: 3 de 3 sesiones'] });
    const medio = deDani('r_medio', { kind: 'weeklyChallenge', cambios: ['Reto: 8.000 pasos × 4'] });
    expect(compararUna(s, { propuestas: [igual], cambios: [] }, AHORA)).toMatchObject({ veredicto: 'coincide', detalle: 'Mismos 2 cambios.' });
    expect(compararUna(s, { propuestas: [otro], cambios: [] }, AHORA).veredicto).toBe('distinto');
    expect(compararUna(s, { propuestas: [medio], cambios: [] }, AHORA)).toMatchObject({ veredicto: 'coincide', detalle: '1 de 2 cambios en común.' });
  });
  it('sin propuesta de Dani pero con un cambio a mano de la misma área: parecido (o coincide si se solapan)', () => {
    const s = prop('s5', { kind: 'weekPlan', cambios: ['Press banca 3 → 4 series'] });
    const aMano = cambio('c3', { area: 'entreno', objeto: 'meso:m1', titulo: 'Mesociclo #2', lineas: ['Press banca 3 → 4 series', 'Jalón RIR 2 → 1'] });
    expect(compararUna(s, { propuestas: [], cambios: [aMano] }, AHORA)).toMatchObject({ veredicto: 'coincide', tipo: 'progresion_programada' });
    expect(compararUna(s, { propuestas: [], cambios: [{ ...aMano, lineas: ['Descarga adelantada'] }] }, AHORA).veredicto).toBe('parecido');
    expect(compararUna(s, { propuestas: [], cambios: [{ ...aMano, area: 'nutricion' }] }, AHORA).veredicto).toBe('nada');
  });
  it('no compara con las decisiones del propio asistente ni con las de otro atleta', () => {
    const s = prop('s6', { kind: 'weeklyChallenge', cambios: ['Reto: 8.000 pasos × 4'] });
    const automatica = prop('auto', { kind: 'weeklyChallenge', status: 'aplicada', politica: 'automatico', aplicadaEn: '2026-10-16T07:00:00.000Z', cambios: ['Reto: 8.000 pasos × 4'] });
    const otroAtleta = deDani('otro', { kind: 'weeklyChallenge', athleteId: 'javi@x.com', cambios: ['Reto: 8.000 pasos × 4'] });
    expect(compararUna(s, { propuestas: [automatica, otroAtleta], cambios: [] }, AHORA).veredicto).toBe('nada');
  });
});

describe('solapeDeFrases', () => {
  it('ignora tildes, mayúsculas y signos, y acepta que una frase contenga a la otra', () => {
    expect(solapeDeFrases(['Objetivo 2.300 → 2.200 kcal', 'Proteína 180 g'], ['objetivo 2300 -> 2200 kcal', 'PROTEINA 180 G fija'])).toBe(2);
    expect(solapeDeFrases(['x'], [])).toBe(0);
  });
});

describe('compararSombra e informeDeSombra', () => {
  const sombras = [
    prop('a1', { kind: 'weeklyChallenge', cambios: ['Reto: 8.000 pasos × 4'], createdAt: '2026-10-05T07:00:00.000Z' }),
    prop('a2', { kind: 'weeklyChallenge', cambios: ['Reto: 3 de 3 sesiones'], createdAt: '2026-10-12T07:00:00.000Z' }),
    prop('a3', { kind: 'weeklyChallenge', cambios: ['Reto: 4 de 4 sesiones'], createdAt: '2026-10-27T07:00:00.000Z' }),
    prop('k1', { payload: dieta(2200) as never, baseEntityId: 'd1', createdAt: '2026-10-12T07:00:00.000Z' }),
    prop('ya', { status: 'approved', kind: 'weeklyChallenge' }), // no es sombra: fuera
  ];
  const ref = {
    propuestas: [
      deDani('d1', { kind: 'weeklyChallenge', cambios: ['Reto: 8.000 pasos × 4'], reviewedAt: '2026-10-06T18:00:00.000Z' }),
      deDani('d2', { kind: 'weeklyChallenge', cambios: ['Reto: 5.000 pasos × 7'], reviewedAt: '2026-10-13T18:00:00.000Z' }),
      deDani('d3', { kind: 'diet', payload: dieta(2600) as never, baseEntityId: 'd1', reviewedAt: '2026-10-13T18:00:00.000Z' }),
    ],
    cambios: [],
  };
  it('compara solo las sombras, lo más reciente primero', () => {
    const c = compararSombra(sombras, ref, AHORA);
    expect(c.map(x => `${x.proposalId}:${x.veredicto}`)).toEqual(['a3:pendiente', 'a2:distinto', 'k1:distinto', 'a1:coincide']);
  });
  it('el informe agrupa por tipo, calcula la tasa sobre las decididas y recomienda', () => {
    const inf = informeDeSombra(compararSombra(sombras, ref, AHORA));
    expect(inf).toMatchObject({ total: 4, decididas: 3, desde: '2026-10-05', hasta: '2026-10-27' });
    expect(inf.tasaGlobal).toBeCloseTo(1 / 3);
    const reto = inf.filas.find(f => f.tipo === 'reto')!;
    expect(reto).toMatchObject({ total: 3, coincide: 1, distinto: 1, pendiente: 1, recomendacion: 'pocos_datos' });
    expect(reto.tasa).toBeCloseTo(0.5);
    expect(inf.filas.find(f => f.tipo === 'ajuste_kcal_grande')).toMatchObject({ total: 1, distinto: 1, tasa: 0 });
  });
  it('con ocho decididas y 7/8 de acierto recomienda subir; con menos acierto, seguir', () => {
    const muchas = Array.from({ length: 8 }, (_, i) => ({ proposalId: `p${i}`, athleteId: 'a', tipo: 'menu_semanal' as const, fecha: '2026-10-01', resumen: '', veredicto: (i < 7 ? 'coincide' : 'distinto') as VeredictoSombra, detalle: '' }));
    expect(informeDeSombra(muchas).filas[0].recomendacion).toBe('subir');
    expect(informeDeSombra(muchas.map((m, i) => ({ ...m, veredicto: i < 5 ? 'coincide' : 'distinto' }))).filas[0].recomendacion).toBe('seguir');
    expect(informeDeSombra(muchas.map(m => ({ ...m, tipo: 'clinico' as const }))).filas[0].recomendacion).toBe('siempre_humano');
    expect(informeDeSombra([])).toMatchObject({ filas: [], total: 0, decididas: 0, tasaGlobal: null });
  });
});
