import { describe, it, expect } from 'vitest';
import { detectarEpisodios, DIAS_DE_VENTANA_CUESTIONARIO, type FotoParaDetectar } from './detectores';
import { idDeEpisodio, extraerParaDani, promptDeEpisodio, nuevoEpisodio, PRIORIDAD } from './episodios';
import type { Questionnaire, QuestionnaireAssignment, QuestionnaireResponse } from '../types';

const HOY = '2026-10-29';
const AHORA = `${HOY}T02:00:00.000Z`;

const plantilla: Questionnaire = {
  id: 'q1', ownerId: 'coach', title: 'Revisión semanal',
  questions: [
    { id: 'p_molestia', label: '¿Alguna molestia?', type: 'boolean', required: false, signalKey: 'alerta.molestia' },
    { id: 'p_animo', label: 'Ánimo', type: 'scale', required: false },
  ] as Questionnaire['questions'],
};
const asignacion = { id: 'a1', questionnaireId: 'q1', athleteId: 'ana@x.com', schedule: { kind: 'interval', intervalDays: 7 }, startDate: '2026-10-01', active: true, createdAt: AHORA } as unknown as QuestionnaireAssignment;
const respuesta = (id: string, submittedAt: string, answers: QuestionnaireResponse['answers'] = []): QuestionnaireResponse =>
  ({ id, questionnaireId: 'q1', assignmentId: 'a1', athleteId: 'ana@x.com', submittedAt, answers });

function foto(p: Partial<FotoParaDetectar> = {}): FotoParaDetectar {
  return {
    email: 'ana@x.com', hoy: HOY, ahora: AHORA, consentimiento: true, politica: 'sombra',
    respuestas: [respuesta('r1', `${HOY}T09:00:00.000Z`)], plantillas: [plantilla], asignaciones: [asignacion],
    ...p,
  };
}

describe('detectarEpisodios · cuestionario recibido', () => {
  it('una revisión de hoy → un episodio pendiente, en sombra, con id determinista', () => {
    const [ep] = detectarEpisodios(foto());
    expect(ep.id).toBe(idDeEpisodio('cuestionario_recibido', 'r1'));
    expect(ep).toMatchObject({ tipo: 'cuestionario_recibido', athleteId: 'ana@x.com', estado: 'pendiente', politica: 'sombra', ronda: 0, propuestas: [], paraDani: '' });
    expect(ep.disparador).toEqual({ fuente: 'questionnaireResponses', docId: 'r1', fecha: HOY });
    expect(ep.alertas).toBeUndefined();
  });

  it('sin consentimiento no se encola nada: el autopiloto no toca a ese atleta', () => {
    expect(detectarEpisodios(foto({ consentimiento: false }))).toEqual([]);
  });

  it('una respuesta de hace más de la ventana no cuenta; una del límite sí', () => {
    const vieja = respuesta('r0', `2026-10-${29 - DIAS_DE_VENTANA_CUESTIONARIO - 1}T09:00:00.000Z`);
    const limite = respuesta('rL', `2026-10-${29 - DIAS_DE_VENTANA_CUESTIONARIO}T09:00:00.000Z`);
    expect(detectarEpisodios(foto({ respuestas: [vieja, limite] })).map(e => e.disparador.docId)).toEqual(['rL']);
  });

  it('una molestia marcada viaja como alerta del episodio (lo detecta el motor, no el modelo)', () => {
    const [ep] = detectarEpisodios(foto({ respuestas: [respuesta('r2', `${HOY}T09:00:00.000Z`, [{ questionId: 'p_molestia', value: true }, { questionId: 'p_molestia__comentario', value: 'hombro derecho' }])] }));
    expect(ep.alertas).toEqual(['Molestia: hombro derecho']);
    const prompt = promptDeEpisodio(ep, { alias: 'Ana R.' });
    expect(prompt).toContain('ALERTAS');
    expect(prompt).toContain('Revisar ya:');
    expect(prompt).toContain('get_client_brief');
    expect(prompt).toMatch(/PARA DANI:/);
  });

  it('el prompt sin alertas pide propose_respuesta_revision y prohíbe tocar kcal o sesiones', () => {
    const [ep] = detectarEpisodios(foto());
    const prompt = promptDeEpisodio(ep, { alias: 'Ana R.' });
    expect(prompt).toContain('propose_respuesta_revision');
    expect(prompt).toContain('get_revision_engine');
    expect(prompt).toMatch(/NO toques kcal, sesiones ni reparto/);
    expect(prompt).not.toContain('Ana Ruiz');
  });

  it('un tipo sin guion no hace nada y lo dice', () => {
    const ep = nuevoEpisodio({ tipo: 'bienestar', athleteId: 'a@x.com', clave: 'x', disparador: { fuente: 'q', fecha: HOY }, politica: 'sombra', ahora: AHORA });
    expect(promptDeEpisodio(ep, { alias: 'A' })).toContain('sin guion');
    expect(ep.prioridad).toBe(PRIORIDAD.bienestar);
  });
});

describe('extraerParaDani', () => {
  it('coge la última línea «PARA DANI:» aunque haya texto antes', () => {
    expect(extraerParaDani('Hola.\n\nPARA DANI: respuesta propuesta; peso en rango.')).toBe('respuesta propuesta; peso en rango.');
  });
  it('sin la línea, se queda con el último párrafo recortado', () => {
    expect(extraerParaDani('Párrafo 1.\n\nPárrafo final.')).toBe('Párrafo final.');
  });
});
