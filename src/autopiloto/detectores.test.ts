import { describe, it, expect } from 'vitest';
import { detectarEpisodios, detectarSemanaNueva, detectarRevision, detectarAltaCompletada, detectarFinDeBloque, detectarRenovacion, finDelPlan, DIAS_DE_VENTANA_CUESTIONARIO, DIAS_DE_VENTANA_ALTA, type FotoParaDetectar } from './detectores';
import { idDeEpisodio, extraerParaDani, promptDeEpisodio, nuevoEpisodio, PRIORIDAD, type TipoEpisodio } from './episodios';
import type { Mesocycle, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse } from '../types';

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
    const ep = nuevoEpisodio({ tipo: 'inventado' as TipoEpisodio, athleteId: 'a@x.com', clave: 'x', disparador: { fuente: 'q', fecha: HOY }, politica: 'sombra', ahora: AHORA });
    expect(promptDeEpisodio(ep, { alias: 'A' })).toContain('sin guion');
    expect(PRIORIDAD.renovacion).toBe(9);
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

describe('detectarSemanaNueva', () => {
  const meso = (p: Partial<Mesocycle> = {}): Mesocycle => ({ id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: '2026-10-05', objective: 'H', daysPerWeek: 4, groups: {}, ...p } as Mesocycle);

  it('el lunes 26-10 empieza la semana 4 del bloque del 05-10: episodio con la semana en la clave', () => {
    const eps = detectarSemanaNueva(foto({ hoy: '2026-10-26', respuestas: [], mesociclos: [meso()] }));
    expect(eps).toHaveLength(1);
    expect(eps[0].id).toBe('semana_nueva_ana@x.com_m1_S4');
    expect(eps[0].disparador).toEqual({ fuente: 'mesocycles', docId: 'm1', fecha: '2026-10-26' });
    expect(promptDeEpisodio(eps[0], { alias: 'Ana R.' })).toContain('propose_mensaje_atleta');
  });
  it('un martes no es semana nueva; el primer día del bloque tampoco; sin bloque en curso, nada', () => {
    expect(detectarSemanaNueva(foto({ hoy: '2026-10-27', respuestas: [], mesociclos: [meso()] }))).toEqual([]);
    expect(detectarSemanaNueva(foto({ hoy: '2026-10-05', respuestas: [], mesociclos: [meso()] }))).toEqual([]);
    expect(detectarSemanaNueva(foto({ hoy: '2026-12-28', respuestas: [], mesociclos: [meso()] }))).toEqual([]);
  });
  it('con ciclo de 10 días la semana cambia cada 10 días, no cada lunes', () => {
    const m = meso({ cycleDays: 10, startDate: '2026-10-05' });
    expect(detectarSemanaNueva(foto({ hoy: '2026-10-15', respuestas: [], mesociclos: [m] }))).toHaveLength(1);
    expect(detectarSemanaNueva(foto({ hoy: '2026-10-12', respuestas: [], mesociclos: [m] }))).toEqual([]);
  });
  it('detectarEpisodios ordena: el cuestionario (prioridad 2), la semana nueva (5) y la revisión (7)', () => {
    const eps = detectarEpisodios(foto({ hoy: '2026-10-26', respuestas: [respuesta('r1', '2026-10-26T01:00:00.000Z')], mesociclos: [meso()] }));
    // el 26-10 es además la semana 4 de 8: la revisión de mitad (prioridad 7) va la última
    expect(eps.map(e => e.tipo)).toEqual(['cuestionario_recibido', 'semana_nueva', 'revision']);
  });
});

describe('detectarAltaCompletada', () => {
  it('alta cerrada + fecha de inicio reciente + consentimiento → un episodio por atleta, id por email', () => {
    const [ep] = detectarAltaCompletada(foto({ onboardingCompletado: true, planStartDate: HOY }));
    expect(ep.id).toBe('alta_completada_ana@x.com');
    expect(ep.disparador).toEqual({ fuente: 'onboarding', docId: 'ana@x.com', fecha: HOY });
    const prompt = promptDeEpisodio(ep, { alias: 'Ana R.' });
    expect(prompt).toContain('ESPERO:');
    expect(prompt).toContain('get_setup_status');
    expect(prompt).toContain('2 g/kg');
  });
  it('sin alta cerrada, sin fecha de inicio, o con un alta vieja (plan montado a mano), nada', () => {
    expect(detectarAltaCompletada(foto({ onboardingCompletado: false, planStartDate: HOY }))).toEqual([]);
    expect(detectarAltaCompletada(foto({ onboardingCompletado: true }))).toEqual([]);
    expect(detectarAltaCompletada(foto({ onboardingCompletado: true, planStartDate: `2026-10-${29 - DIAS_DE_VENTANA_ALTA - 1}` }))).toEqual([]);
    expect(detectarAltaCompletada(foto({ onboardingCompletado: true, planStartDate: HOY, consentimiento: false }))).toEqual([]);
  });
});

describe('detectarRevision', () => {
  const meso = (p: Partial<Mesocycle> = {}): Mesocycle => ({ id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: '2026-10-05', objective: 'H', daysPerWeek: 4, groups: {}, ...p } as Mesocycle);
  it('en la semana 4 de 8 (mitad) y en la 8 (fin), con ids distintos; en la 3, nada', () => {
    const mitad = detectarRevision(foto({ hoy: '2026-10-28', respuestas: [], mesociclos: [meso()] }));
    expect(mitad.map(e => e.id)).toEqual(['revision_ana@x.com_m1_mitad']);
    expect(promptDeEpisodio(mitad[0], { alias: 'Ana R.' })).toContain('cerrar_esperado');
    const fin = detectarRevision(foto({ hoy: '2026-11-25', respuestas: [], mesociclos: [meso()] }));
    expect(fin.map(e => e.id)).toEqual(['revision_ana@x.com_m1_fin']);
    expect(promptDeEpisodio(fin[0], { alias: 'Ana R.' })).toContain('la última semana');
    expect(detectarRevision(foto({ hoy: '2026-10-21', respuestas: [], mesociclos: [meso()] }))).toEqual([]);
  });
  it('un bloque de 3 semanas solo tiene revisión de fin', () => {
    expect(detectarRevision(foto({ hoy: '2026-10-12', respuestas: [], mesociclos: [meso({ weeks: 3 })] }))).toEqual([]);
    expect(detectarRevision(foto({ hoy: '2026-10-20', respuestas: [], mesociclos: [meso({ weeks: 3 })] })).map(e => e.id)).toEqual(['revision_ana@x.com_m1_fin']);
  });
});

describe('detectarFinDeBloque', () => {
  const meso = (p: Partial<Mesocycle> = {}): Mesocycle => ({ id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 8, startDate: '2026-09-07', objective: 'H', daysPerWeek: 4, groups: {}, ...p } as Mesocycle);
  // Bloque del 07-09 de 8 semanas: último día 01-11.
  it('el día después de acabar → episodio por bloque, con el estado del plan contratado en el contexto', () => {
    const [ep] = detectarFinDeBloque(foto({ hoy: '2026-11-02', respuestas: [], mesociclos: [meso()], planStartDate: '2026-09-07', planDurationMonths: 3 }));
    expect(ep.id).toBe('fin_de_bloque_ana@x.com_m1');
    expect(ep.contexto).toBe('El plan contratado sigue vigente hasta el 2026-12-07.'); // a 35 días: fuera del aviso de 14
  });
  it('dentro de la ventana de 3 días sí; después no; el último día del bloque tampoco', () => {
    expect(detectarFinDeBloque(foto({ hoy: '2026-11-04', respuestas: [], mesociclos: [meso()] }))).toHaveLength(1);
    expect(detectarFinDeBloque(foto({ hoy: '2026-11-05', respuestas: [], mesociclos: [meso()] }))).toEqual([]);
    expect(detectarFinDeBloque(foto({ hoy: '2026-11-01', respuestas: [], mesociclos: [meso()] }))).toEqual([]);
  });
  it('si Dani ya creó el bloque siguiente, no hay nada que proponer', () => {
    const siguiente = meso({ id: 'm2', number: 2, startDate: '2026-11-02' });
    expect(detectarFinDeBloque(foto({ hoy: '2026-11-02', respuestas: [], mesociclos: [meso(), siguiente] }))).toEqual([]);
  });
  it('plan que vence en menos de 14 días o sin fecha: el guion lo dice y manda la tarea de renovación', () => {
    const [vence] = detectarFinDeBloque(foto({ hoy: '2026-11-02', respuestas: [], mesociclos: [meso()], planStartDate: '2026-08-10', planDurationMonths: 3 }));
    expect(vence.contexto).toBe('El plan contratado VENCE el 2026-11-10.');
    expect(promptDeEpisodio(vence, { alias: 'A' })).toContain('Renovación:');
    const [sin] = detectarFinDeBloque(foto({ hoy: '2026-11-02', respuestas: [], mesociclos: [meso()] }));
    expect(sin.contexto).toBe('Sin fecha de fin del plan contratado en el perfil.');
    expect(promptDeEpisodio(sin, { alias: 'A' })).toContain('qué cambia respecto al bloque anterior');
  });
});

describe('detectarRenovacion', () => {
  it('finDelPlan suma meses en fecha local', () => {
    expect(finDelPlan('2026-08-10', 3)).toBe('2026-11-10');
    expect(finDelPlan('2026-01-31', 1)).toBe('2026-03-03'); // JS desborda febrero: aceptado, mismo criterio que Date
  });
  it('vence en ≤ 14 días → episodio por fecha de fin; más lejos, ya vencido o sin plan, nada', () => {
    const [ep] = detectarRenovacion(foto({ planStartDate: '2026-08-10', planDurationMonths: 3 }));
    expect(ep.id).toBe('renovacion_ana@x.com_2026-11-10');
    expect(ep.contexto).toBe('vence el 2026-11-10');
    expect(promptDeEpisodio(ep, { alias: 'A' })).toContain('Esto lo decide Dani');
    expect(detectarRenovacion(foto({ planStartDate: '2026-09-07', planDurationMonths: 3 }))).toEqual([]);
    expect(detectarRenovacion(foto({ planStartDate: '2026-07-01', planDurationMonths: 3 }))).toEqual([]);
    expect(detectarRenovacion(foto({ planStartDate: '2026-08-10' }))).toEqual([]);
  });
});
