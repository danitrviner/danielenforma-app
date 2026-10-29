import { describe, it, expect } from 'vitest';
import { calcularPanelRetencion, mediana } from './panelRetencion';
import type { Contacto, QuestionnaireResponse, SenalesDelAtleta, UserProfile } from '../types';

const HOY = '2026-10-28';
const senales = (p: Partial<SenalesDelAtleta> = {}): SenalesDelAtleta => ({
  calculadoEn: HOY, ultimoRegistro: HOY, registros14d: 10, perdidas14d: 0, ultimaRespuesta: null, tieneCuestionarios: true, ...p,
});
const atleta = (email: string, p: Partial<UserProfile> = {}): UserProfile =>
  ({ userId: email, email, displayName: email.split('@')[0], role: 'client', planPublishedAt: '2026-09-01T10:00:00.000Z', senales: senales(), ...p }) as UserProfile;
const respuesta = (email: string, submittedAt: string, enviadaEn?: string): QuestionnaireResponse =>
  ({ id: `${email}_${submittedAt}`, questionnaireId: 'q', assignmentId: 'a', athleteId: email, submittedAt, answers: [],
    respuestaCoach: enviadaEn ? { texto: 'ok', enviadaEn } : undefined });

describe('calcularPanelRetencion · estados', () => {
  it('clasifica en marcha, apagándose, callado y sin plan', () => {
    const r = calcularPanelRetencion({
      atletas: [
        atleta('a@x.com'),
        atleta('b@x.com', { senales: senales({ ultimoRegistro: '2026-10-25' }) }),          // 3 días: apagándose
        atleta('c@x.com', { senales: senales({ perdidas14d: 3 }) }),                         // perdidas: apagándose
        atleta('d@x.com', { senales: senales({ ultimoRegistro: '2026-10-01' }) }),          // 27 días: callado
        atleta('e@x.com', { senales: senales({ ultimoRegistro: null }) }),                  // nunca: callado
        atleta('f@x.com', { planPublishedAt: undefined }),                                   // sin plan
        atleta('g@x.com', { senales: undefined }),                                           // sin latido: en marcha
      ],
      respuestas: [], contactos: [], hoy: HOY,
    });
    expect(r).toMatchObject({ enMarcha: 2, apagandose: 2, callados: 2, sinPlan: 1 });
  });

  it('la primera semana cuenta desde el día en que se publicó el plan', () => {
    const r = calcularPanelRetencion({
      atletas: [atleta('nuevo@x.com', { displayName: 'Nuevo', planPublishedAt: '2026-10-26T09:00:00.000Z' }), atleta('viejo@x.com')],
      respuestas: [], contactos: [], hoy: HOY,
    });
    expect(r.primeraSemana).toEqual([{ nombre: 'Nuevo', dia: 3, email: 'nuevo@x.com' }]);
  });
});

describe('calcularPanelRetencion · latencia', () => {
  it('sin revisiones no hay porcentaje', () => {
    const r = calcularPanelRetencion({ atletas: [], respuestas: [], contactos: [], hoy: HOY });
    expect(r.latenciaMedianaH).toBeNull();
    expect(r.pctContestadas48h).toBeNull();
  });

  it('mide horas hasta la respuesta en la app y cuenta las de ≤ 48 h', () => {
    const r = calcularPanelRetencion({
      atletas: [],
      respuestas: [
        respuesta('a@x.com', '2026-10-24T10:00:00.000Z', '2026-10-25T10:00:00.000Z'), // 24 h
        respuesta('b@x.com', '2026-10-20T10:00:00.000Z', '2026-10-27T10:00:00.000Z'), // 168 h
        respuesta('c@x.com', '2026-10-27T10:00:00.000Z'),                              // sin contestar
      ],
      contactos: [], hoy: HOY,
    });
    expect(r.latenciaMedianaH).toBe(96);
    expect(r.pctContestadas48h).toBe(33);
    expect(r.sinContestar).toBe(1);
  });

  it('un contacto por WhatsApp posterior al envío cuenta como respuesta', () => {
    const c: Contacto = { id: 'x', athleteId: 'a@x.com', fecha: '2026-10-25', motivo: 'sin_respuesta', canal: 'whatsapp', createdAt: '2026-10-25T09:00:00.000Z' };
    const r = calcularPanelRetencion({
      atletas: [], respuestas: [respuesta('a@x.com', '2026-10-24T10:00:00.000Z')], contactos: [c], hoy: HOY,
    });
    expect(r.latenciaMedianaH).toBe(23);
    expect(r.sinContestar).toBe(0);
  });

  it('ignora revisiones fuera de la ventana de 28 días', () => {
    const r = calcularPanelRetencion({ atletas: [], respuestas: [respuesta('a@x.com', '2026-09-01T10:00:00.000Z')], contactos: [], hoy: HOY });
    expect(r.pctContestadas48h).toBeNull();
  });
});

describe('mediana', () => {
  it('impar, par y vacío', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(3);
    expect(mediana([])).toBeNull();
  });
});
