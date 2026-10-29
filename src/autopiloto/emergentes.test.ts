import { describe, it, expect } from 'vitest';
import type { BodyweightLog, DietCompletionLog, NutritionProgram, Questionnaire, QuestionnaireResponse, WeightCheckIn, WorkoutAssignment, WorkoutLog } from '../types';
import { addDays } from '../utils/trainingWeek';
import { promptDeEpisodio } from './episodios';
import {
  detectarEmergentes, detectarDolor, detectarPerdidas, detectarPesoSinRegistrar, detectarDesvioPeso, detectarDesvioAdherencia,
  detectarNotaLibre, detectarBienestar, adherenciaSemanal, hashTexto, type FotoEmergente,
} from './emergentes';

/* Los siete emergentes contra fotos mínimas. Cada detector: dispara cuando
   toca, no dispara cuando no, y el id es estable (el latido lo encola con
   `create`, así que detectar dos días seguidos lo mismo no duplica). */

const HOY = '2026-10-29';
const AHORA = `${HOY}T02:00:00.000Z`;
const d = (n: number) => addDays(HOY, n);

const PLANTILLA: Questionnaire = { id: 'q1', ownerId: 'coach', title: 'Tu semana', questions: [
  { id: 'txt', label: 'Comentarios', type: 'text', required: false },
  { id: 'sl', label: 'Sueño', type: 'numeric', required: false, signalKey: 'wellness.sleep_hours_weekly' },
  { id: 'st', label: 'Estrés', type: 'scale', required: false, signalKey: 'wellness.stress_weekly' },
  { id: 'mo', label: 'Motivación', type: 'scale', required: false, signalKey: 'wellness.motivation_weekly' },
] as Questionnaire['questions'] };
const respuesta = (id: string, fecha: string, answers: QuestionnaireResponse['answers']): QuestionnaireResponse =>
  ({ id, questionnaireId: 'q1', assignmentId: 'a', athleteId: 'ana@x.com', submittedAt: `${fecha}T09:00:00.000Z`, answers });
const checkin = (id: string, fecha: string, notes: string): WeightCheckIn =>
  ({ id, userId: 'u', email: 'ana@x.com', timestamp: new Date(`${fecha}T08:00:00.000Z`), dateStr: fecha, weight: 80, mood: '😐', adherence: 'Sí', notes });
const log = (id: string, fecha: string, note?: string, entryNote?: string): WorkoutLog =>
  ({ id, athleteId: 'ana@x.com', workoutId: 'w', assignmentId: 'a', date: fecha, completedAt: `${fecha}T19:00:00.000Z`, entries: [{ exerciseId: 'press', sets: [], ...(entryNote ? { note: entryNote } : {}) }], ...(note ? { note } : {}) });
const perdida = (fecha: string): WorkoutAssignment => ({ id: `as_${fecha}`, workoutId: 'w', athleteId: 'ana@x.com', date: fecha, status: 'perdido' });
const peso = (fecha: string, kg: number): BodyweightLog => ({ id: `p_${fecha}`, athleteId: 'ana@x.com', date: fecha, weight: kg, createdAt: `${fecha}T07:00:00.000Z` });
const PROGRAMA: NutritionProgram = { athleteId: 'ana@x.com', startDate: d(-56), phases: [{ id: 'f1', name: 'Déficit', weeks: 16, objetivo: 'deficit' } as NutritionProgram['phases'][number]] };
/** Un día registrado con `pct` % de su objetivo de 2.000 kcal. */
const dia = (fecha: string, pct: number): DietCompletionLog => ({
  id: `r_${fecha}`, athleteId: 'ana@x.com', date: fecha, dietId: 'd1', doneItemIds: ['m1_0'],
  meals: [{ id: 'm1', name: 'Comida', items: [{ category: 'HC', foodLabel: 'x', quantity: 1, nutrientes: { kcal: 2000 * pct / 100, p: 0, hc: 0, g: 0 } }] }],
  objetivo: { kcal: 2000, p: 150, hc: 200, g: 60 },
} as DietCompletionLog);

function foto(p: Partial<FotoEmergente> = {}): FotoEmergente {
  return {
    email: 'ana@x.com', hoy: HOY, ahora: AHORA, consentimiento: true, politica: 'proponer',
    asignaciones: [], logs: [], pesajes: [peso(d(-1), 80)], registros: [], dietas: [{ id: 'd1', athleteId: 'ana@x.com', name: 'Dieta', meals: [] } as never],
    programa: PROGRAMA, respuestas: [], plantillas: [PLANTILLA], checkins: [], alta: { athleteId: 'ana@x.com', injuries: '' } as never,
    ...p,
  };
}

describe('dolor', () => {
  it('una nota de entreno con molestia → episodio leve (sin alertas) con id por texto, y el guion pide alternativas y «Revisar ya»', () => {
    const [ep] = detectarDolor(foto({ logs: [log('l1', d(-1), undefined, 'me molesta el hombro en la última serie')] }));
    expect(ep.tipo).toBe('dolor');
    expect(ep.id).toBe(`dolor_ana@x.com_${hashTexto('me molesta el hombro en la última serie')}`);
    expect(ep.alertas).toBeUndefined();
    expect(ep.disparador).toEqual({ fuente: 'workoutLogs', docId: 'l1:press', fecha: d(-1) });
    const prompt = promptDeEpisodio(ep, { alias: 'Ana R.' });
    expect(prompt).toContain('get_alternativas_ejercicio');
    expect(prompt).toContain('Revisar ya:');
    expect(prompt).toContain('propose_week_plan');
  });
  it('lesión declarada en el alta o texto persistente → clínico: con alertas y guion que solo deja la nota', () => {
    const [a] = detectarDolor(foto({ checkins: [checkin('c1', d(-2), 'me duele la rodilla desde hace semanas')] }));
    expect(a.alertas?.[0]).toMatch(/^Suena persistente/);
    expect(promptDeEpisodio(a, { alias: 'A' })).toContain('ALERTA CLÍNICA');
    expect(promptDeEpisodio(a, { alias: 'A' })).not.toContain('propose_week_plan');
    const [b] = detectarDolor(foto({ alta: { athleteId: 'ana@x.com', injuries: 'hernia L5' } as never, respuestas: [respuesta('r1', d(0), [{ questionId: 'txt', value: 'dolor en la lumbar al remar' }])] }));
    expect(b.alertas?.[0]).toMatch(/^Lesión declarada/);
  });
  it('un texto de hace más de tres días, o sin dolor, no cuenta', () => {
    expect(detectarDolor(foto({ logs: [log('l1', d(-4), 'me duele todo')] }))).toEqual([]);
    expect(detectarDolor(foto({ logs: [log('l1', d(-1), 'buena sesión, muy a gusto')] }))).toEqual([]);
  });
});

describe('perdidas', () => {
  it('tres perdidas en catorce días → un episodio con clave de la última; dos, nada', () => {
    const [ep] = detectarPerdidas(foto({ asignaciones: [perdida(d(-10)), perdida(d(-5)), perdida(d(-2))] }));
    expect(ep.id).toBe(`perdidas_ana@x.com_${d(-2)}`);
    expect(promptDeEpisodio(ep, { alias: 'A' })).toContain('NO toques el plan');
    expect(detectarPerdidas(foto({ asignaciones: [perdida(d(-5)), perdida(d(-2))] }))).toEqual([]);
    expect(detectarPerdidas(foto({ asignaciones: [perdida(d(-20)), perdida(d(-5)), perdida(d(-2))] }))).toEqual([]);
  });
});

describe('peso_sin_registrar', () => {
  it('diez días sin pesarse en una fase con objetivo → episodio con clave del día en que se hizo viejo', () => {
    const [ep] = detectarPesoSinRegistrar(foto({ pesajes: [peso(d(-12), 80)] }));
    expect(ep.id).toBe(`peso_sin_registrar_ana@x.com_${d(-2)}`);
    expect(promptDeEpisodio(ep, { alias: 'A' })).toContain('peso_sin_registrar');
  });
  it('pesado hace poco, o sin fase con objetivo, nada; sin ningún pesaje, clave por semana', () => {
    expect(detectarPesoSinRegistrar(foto())).toEqual([]);
    expect(detectarPesoSinRegistrar(foto({ pesajes: [peso(d(-12), 80)], programa: null }))).toEqual([]);
    expect(detectarPesoSinRegistrar(foto({ pesajes: [] }))[0].id).toMatch(/^peso_sin_registrar_ana@x\.com_nunca_/);
  });
});

describe('adherenciaSemanal y desvio_adherencia', () => {
  it('suma kcal comidas entre kcal objetivo de los días registrados de esa semana ISO', () => {
    const r = adherenciaSemanal({ registros: [dia(d(-8), 50), dia(d(-9), 70), dia(d(-10), 60)], dietas: [] }, '2026-W43');
    expect(r).toEqual({ pct: 60, dias: 3 });
  });
  it('dos semanas cerradas por debajo del 70 % (o sin registrar) → episodio por semana; una buena lo evita', () => {
    const mal = [dia(d(-8), 50), dia(d(-9), 60), dia(d(-10), 55), dia(d(-15), 40), dia(d(-16), 65), dia(d(-17), 50)];
    const [ep] = detectarDesvioAdherencia(foto({ registros: mal }));
    expect(ep.id).toBe('desvio_adherencia_ana@x.com_2026-W43');
    expect(ep.paraDani).toContain('%');
    expect(detectarDesvioAdherencia(foto({ registros: [] }))).toHaveLength(1); // sin registrar tampoco sigue la dieta
    const bien = [dia(d(-8), 95), dia(d(-9), 100), dia(d(-10), 90), dia(d(-15), 40), dia(d(-16), 65), dia(d(-17), 50)];
    expect(detectarDesvioAdherencia(foto({ registros: bien }))).toEqual([]);
  });
});

describe('desvio_peso', () => {
  // Déficit desde hace 8 semanas, peso clavado en 80 → «lento» esta semana y la pasada.
  const estancado = Array.from({ length: 60 }, (_, i) => peso(d(-i), 80));
  it('ritmo fuera de rango dos semanas con la comida seguida → episodio con los números del motor', () => {
    const buenaComida = Array.from({ length: 14 }, (_, i) => dia(d(-7 - i), 95));
    const [ep] = detectarDesvioPeso(foto({ pesajes: estancado, registros: buenaComida }));
    expect(ep.tipo).toBe('desvio_peso');
    expect(ep.id).toBe('desvio_peso_ana@x.com_2026-W44');
    expect(ep.paraDani).toMatch(/^lento dos semanas · ritmo/);
    expect(promptDeEpisodio(ep, { alias: 'A' })).toContain('MOTOR:');
  });
  it('con la comida por debajo del 70 % no es desvío de peso (es de adherencia); sin objetivo, nada', () => {
    const malaComida = Array.from({ length: 14 }, (_, i) => dia(d(-7 - i), 50));
    expect(detectarDesvioPeso(foto({ pesajes: estancado, registros: malaComida }))).toEqual([]);
    expect(detectarDesvioPeso(foto({ pesajes: estancado, programa: null }))).toEqual([]);
  });
});

describe('nota_libre', () => {
  it('texto largo o con palabra clave, de los últimos tres días, sin dolor → episodio por hash', () => {
    const texto = 'La semana que viene me voy de viaje de trabajo y no sé si podré entrenar';
    const eps = detectarNotaLibre(foto({ respuestas: [respuesta('r1', d(-1), [{ questionId: 'txt', value: texto }])] }));
    expect(eps).toHaveLength(1);
    expect(eps[0].id).toBe(`nota_libre_ana@x.com_${hashTexto(texto)}`);
    expect(promptDeEpisodio(eps[0], { alias: 'A' })).toContain('viaje | enfermedad | disponibilidad');
  });
  it('un texto con dolor va como dolor, no como nota; uno corto y sin clave, nada', () => {
    expect(detectarNotaLibre(foto({ logs: [log('l1', d(-1), 'me duele la rodilla')] }))).toEqual([]);
    expect(detectarNotaLibre(foto({ logs: [log('l1', d(-1), 'todo bien')] }))).toEqual([]);
  });
});

describe('bienestar', () => {
  it('sueño < 6 h en la última respuesta → episodio por semana; dos semanas desfavorables también', () => {
    const [ep] = detectarBienestar(foto({ respuestas: [respuesta('r1', d(-1), [{ questionId: 'sl', value: 5 }])] }));
    expect(ep.id).toBe('bienestar_ana@x.com_2026-W44');
    expect(ep.paraDani).toContain('sueño 5 h');
    const dos = detectarBienestar(foto({ respuestas: [
      respuesta('r0', d(-8), [{ questionId: 'st', value: 8 }]),
      respuesta('r1', d(-1), [{ questionId: 'mo', value: 2 }]),
    ] }));
    expect(dos[0].paraDani).toBe('contexto desfavorable dos semanas seguidas');
  });
  it('contexto bueno, o la última respuesta vieja, nada', () => {
    expect(detectarBienestar(foto({ respuestas: [respuesta('r1', d(-1), [{ questionId: 'sl', value: 7.5 }, { questionId: 'st', value: 3 }])] }))).toEqual([]);
    expect(detectarBienestar(foto({ respuestas: [respuesta('r1', d(-9), [{ questionId: 'sl', value: 5 }])] }))).toEqual([]);
  });
});

describe('detectarEmergentes', () => {
  it('sin consentimiento, nada de nada; con varios, ordenados por prioridad (dolor primero)', () => {
    const f = foto({
      logs: [log('l1', d(-1), 'me duele el codo')], asignaciones: [perdida(d(-10)), perdida(d(-5)), perdida(d(-2))], dietas: [],
      respuestas: [respuesta('r1', d(-1), [{ questionId: 'sl', value: 5 }, { questionId: 'txt', value: 'Estoy de mudanza y con mucho estrés estos días, perdonad' }])],
    });
    expect(detectarEmergentes({ ...f, consentimiento: false })).toEqual([]);
    expect(detectarEmergentes(f).map(e => e.tipo)).toEqual(['dolor', 'nota_libre', 'perdidas', 'bienestar']);
  });
});
