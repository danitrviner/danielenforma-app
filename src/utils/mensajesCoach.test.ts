import { describe, it, expect } from 'vitest';
import { traducirCambio, cambiosSinContar, loUltimoDeDani, proximaRevision, acuseDeProblema } from './mensajesCoach';
import type { CambioAtleta } from './cambiosAtleta';
import type { MensajeCoach, QuestionnaireResponse } from '../types';

const HOY = '2026-10-29';
const cambio = (p: Partial<CambioAtleta>): CambioAtleta =>
  ({ id: 'c1', athleteId: 'a@x.com', area: 'nutricion', objeto: 'dieta:1', titulo: 'Dieta «Déficit»', lineas: ['Kcal 2.200 → 2.050'], at: `${HOY}T10:00:00.000Z`, autor: 'coach', ...p });
const mensaje = (p: Partial<MensajeCoach>): MensajeCoach =>
  ({ id: 'm1', athleteId: 'a@x.com', tipo: 'libre', texto: 'Hola', estado: 'aprobado', autor: 'coach', fecha: HOY, creadoEn: '', ...p });

describe('traducirCambio', () => {
  it('kcal arriba o abajo', () => {
    expect(traducirCambio(cambio({}))).toBe('He bajado la dieta Déficit a 2.050 kcal.');
    expect(traducirCambio(cambio({ lineas: ['Kcal 2.000 → 2.300'] }))).toBe('He subido la dieta Déficit a 2.300 kcal.');
  });
  it('un ejercicio por otro', () => {
    expect(traducirCambio(cambio({ titulo: 'Sesión Pierna A', lineas: ['Sentadilla → Prensa'] }))).toBe('En la sesión Pierna A he cambiado Sentadilla por Prensa.');
  });
  it('lo demás, genérico y sin inventar', () => {
    expect(traducirCambio(cambio({ titulo: 'Mesociclo Meso #2', lineas: ['Objetivo editado'] }))).toBe('He ajustado el objetivo de el bloque Meso #2.');
    expect(traducirCambio(cambio({ titulo: 'Calendario de dietas', lineas: ['Lunes: otra dieta → otra dieta', 'Activa B'] }))).toBe('He tocado Calendario de dietas: activa b.');
  });
});

describe('cambiosSinContar', () => {
  it('excluye los que ya tienen mensaje y los de hace más de una semana', () => {
    const viejo = cambio({ id: 'c0', at: '2026-10-01T10:00:00.000Z' });
    const contado = cambio({ id: 'c2' });
    const nuevo = cambio({ id: 'c3', at: `${HOY}T12:00:00.000Z` });
    const r = cambiosSinContar([viejo, contado, nuevo, cambio({})], [mensaje({ origen: { coleccion: 'cambiosAtleta', id: 'c2' } })], HOY);
    expect(r.map(c => c.id)).toEqual(['c3', 'c1']);
  });
});

describe('loUltimoDeDani', () => {
  const respuesta = (p: Partial<QuestionnaireResponse>): QuestionnaireResponse =>
    ({ id: 'r1', questionnaireId: 'q', assignmentId: 'a', athleteId: 'a@x.com', submittedAt: '', answers: [], ...p });

  it('mezcla mensajes aprobados, la respuesta y la nota de hoy, lo más nuevo primero', () => {
    const items = loUltimoDeDani({
      mensajes: [
        mensaje({ id: 'm_borrador', estado: 'borrador', fecha: HOY }),
        mensaje({ id: 'm_cambio', tipo: 'cambio', texto: 'He bajado la dieta a 2.050 kcal.', porque: 'el peso iba más rápido', fecha: '2026-10-27' }),
        mensaje({ id: 'm_viejo', fecha: '2026-10-10' }),
        mensaje({ id: 'm_acuse', tipo: 'problema', autor: 'app', texto: 'Recibido: …', problema: { estado: 'recibido', actualizadoEn: '' }, fecha: '2026-10-28' }),
      ],
      respuestas: [respuesta({ respuestaCoach: { texto: 'Buena semana.', enviadaEn: '2026-10-26T09:00:00.000Z', bloques: { comoHaIdo: 'Buena semana, Ana.', queCambia: '', queEspero: '' } } })],
      notaDeHoy: { id: 'n', athleteId: 'a@x.com', date: HOY, text: 'Hoy la última serie al fallo.', createdAt: '' },
      hoy: HOY,
    });
    expect(items.map(i => i.id)).toEqual(['nota_n', 'm_acuse', 'm_cambio', 'rc_r1']);
    expect(items[1].firmado).toBe(false);
    expect(items[2]).toMatchObject({ etiqueta: 'Cambio en tu plan', porque: 'el peso iba más rápido', destino: 'nutrition' });
    expect(items[3]).toMatchObject({ etiqueta: 'Ha revisado tu semana', texto: 'Buena semana, Ana.', destino: 'checkin' });
  });

  it('la respuesta por WhatsApp se cuenta sin texto', () => {
    const items = loUltimoDeDani({ mensajes: [], respuestas: [respuesta({ respuestaCoach: { texto: '', canal: 'whatsapp', enviadaEn: `${HOY}T09:00:00.000Z` } })], hoy: HOY });
    expect(items[0]).toMatchObject({ etiqueta: 'Te ha escrito por WhatsApp' });
  });
});

describe('proximaRevision', () => {
  it('es el viernes que viene (miércoles 29 → viernes 31)', () => {
    expect(proximaRevision('2026-10-29')).toBe('2026-10-30');
  });
  it('un viernes, la del viernes siguiente', () => {
    expect(proximaRevision('2026-10-30')).toBe('2026-11-06');
  });
});

describe('acuseDeProblema', () => {
  it('neutro, con lo que marcó, sin firma', () => {
    expect(acuseDeProblema([{ tipo: 'molestia', texto: 'Molestia: rodilla derecha en sentadilla' }]))
      .toBe('Recibido: rodilla derecha en sentadilla. Lo lee Dani en tu revisión y te dice qué cambia.');
    expect(acuseDeProblema([{ tipo: 'molestia', texto: 'Ha marcado una molestia o lesión' }]))
      .toMatch(/^Recibido: la molestia que has marcado\./);
  });
});
