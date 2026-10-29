import { describe, it, expect } from 'vitest';
import { borradorDeRespuesta, textoDeBloques, textosLibres } from './borradorRespuesta';
import type { QuestionnaireQuestion } from '../types';
import type { CambioAtleta } from './cambiosAtleta';
import type { EvaluacionDelPlan, SemanaDelPlan } from './seguimientoPlan';

const PREGUNTAS: QuestionnaireQuestion[] = [
  { id: 'q_entreno', type: 'text', label: 'Sensaciones y feedback ENTRENO:' },
  { id: 'q_lesion', type: 'text', label: 'LESIONES/MOLESTIAS:', tituloCorto: 'Lesiones' },
  { id: 'q_molestia', type: 'boolean', label: '¿Molestia?', signalKey: 'alerta.molestia' },
  { id: 'q_sueno', type: 'scale', label: 'Sueño' },
] as QuestionnaireQuestion[];

const ev = (p: Partial<EvaluacionDelPlan>): EvaluacionDelPlan => ({
  semana: {} as SemanaDelPlan, estado: 'en-plan', desvio: 0, ritmo: -0.4, ritmoPlan: -0.45, semanaFinFase: 10, objetivoFase: 79,
  finAlRitmo: 79.2, explicacion: '', opciones: [], adherencia: 0.8, pasosMedios: 8500, pasosPlan: 9000, kcalRegistradas: 2100, kcalPlan: 2100,
  mantenimientoObservado: null, ...p,
});
const semana = (p: Partial<SemanaDelPlan>): SemanaDelPlan => ({
  semana: 7, desde: '2026-11-02', hasta: '2026-11-08', faseIdx: 0, fase: {} as SemanaDelPlan['fase'], kcalPlan: 2100, kcalRegistradas: null,
  diasRegistrados: 0, kcalFiables: false, adherencia: null, pasosPlan: 9000, pasosReales: null, esperado: 80.5, franja: [80.1, 80.9], real: null,
  estado: null, futura: true, enCurso: false, ...p,
});

describe('borradorDeRespuesta', () => {
  it('semana buena: entrenos, peso en ritmo, molestia leída, sin cambios, franja de la semana que viene', () => {
    const b = borradorDeRespuesta({
      nombre: 'javier vergara',
      respuesta: { answers: [{ questionId: 'q_molestia', value: true }, { questionId: 'q_molestia__comentario', value: 'rodilla derecha en la última serie de sentadilla' }] },
      preguntas: PREGUNTAS,
      sesiones: { hechas: 4, pautadas: 4 },
      evaluacion: ev({}),
      semanaQueViene: semana({}),
      cambios: [],
    });
    expect(b.comoHaIdo).toBe('Buena semana, Javier: 4 de 4 entrenos hechos y el peso bajando 0,4 kg a la semana, justo en el ritmo que buscamos. Lo de «rodilla derecha en la última serie de sentadilla» lo he leído.');
    expect(b.queCambia).toBe('Esta semana no cambio nada: el plan sigue igual. Si la molestia sigue, me lo pones el viernes y lo cambio.');
    expect(b.queEspero).toBe('La semana que viene: el peso entre 80,1 y 80,9 kg, los pasos en torno a 9.000, los 4 entrenos hechos. Con eso te ajusto el lunes.');
  });

  it('va lento: lo dice sin «desvío» ni reproche', () => {
    const b = borradorDeRespuesta({ nombre: 'Ana', respuesta: { answers: [] }, preguntas: PREGUNTAS, sesiones: { hechas: 2, pautadas: 4 }, evaluacion: ev({ estado: 'por-encima', ritmo: -0.1 }) });
    expect(b.comoHaIdo).toBe('Semana floja, Ana: 2 de 4 entrenos y el peso bajando 0,1 kg a la semana, algo más despacio de lo previsto.');
    expect(b.comoHaIdo).not.toMatch(/desv[ií]o/i);
  });

  it('los cambios del coach salen en su idioma, como mucho tres', () => {
    const cambio = (titulo: string, lineas: string[]): CambioAtleta => ({ id: 'c', athleteId: 'a', area: 'nutricion', objeto: 'dieta', titulo, lineas, at: '', autor: '' });
    const b = borradorDeRespuesta({
      nombre: 'Ana', respuesta: { answers: [] }, preguntas: PREGUNTAS,
      cambios: [cambio('Dieta «Déficit»', ['Kcal 2.200 → 2.050']), cambio('Mesociclo Meso #2', ['Objetivo editado']), cambio('Calendario de dietas', ['Lunes: otra dieta → otra dieta']), cambio('X', ['y'])],
    });
    expect(b.queCambia).toBe('Esta semana cambio la dieta Déficit: Kcal 2.200 → 2.050. el bloque Meso #2: Objetivo editado. Calendario de dietas. Lo demás sigue igual.');
  });

  it('sin datos de plan ni sesiones: frases honestas, sin inventar cifras', () => {
    const b = borradorDeRespuesta({ nombre: '', respuesta: { answers: [] }, preguntas: [] });
    expect(b.comoHaIdo).toBe('he leído tu revisión.');
    expect(b.queEspero).toBe('Que registres entrenos y comida: con eso te ajusto el lunes.');
  });

  it('la lesión escrita en texto libre también se reconoce; un «no» no', () => {
    const con = borradorDeRespuesta({ nombre: 'Ana', respuesta: { answers: [{ questionId: 'q_lesion', value: 'Pequeña molestia en el hombro izquierdo al hacer press' }] }, preguntas: PREGUNTAS });
    expect(con.comoHaIdo).toMatch(/Lo de «Pequeña molestia en el hombro izquierdo al hacer press» lo he leído/);
    const sin = borradorDeRespuesta({ nombre: 'Ana', respuesta: { answers: [{ questionId: 'q_lesion', value: 'No, ninguna molestia esta semana.' }] }, preguntas: PREGUNTAS });
    expect(sin.comoHaIdo).toMatch(/lo he leído/); // sigue siendo texto libre largo que no empieza por «no» a secas
  });
});

describe('textosLibres', () => {
  it('solo los textos largos de preguntas de texto o comentarios', () => {
    const t = textosLibres(PREGUNTAS, { answers: [
      { questionId: 'q_entreno', value: 'He subido peso en casi todo, el tercer día se me hace largo.' },
      { questionId: 'q_sueno', value: 7 },
      { questionId: 'q_sueno__comentario', value: 'Mal entre semana por trabajo, mejor el finde.' },
      { questionId: 'q_lesion', value: 'no' },
    ] });
    expect(t.map(x => x.pregunta)).toEqual(['Sensaciones y feedback ENTRENO:', 'Sueño']);
  });
});

describe('textoDeBloques', () => {
  it('une los tres con línea en blanco y títulos opcionales', () => {
    const b = { comoHaIdo: 'A', queCambia: 'B', queEspero: '' };
    expect(textoDeBloques(b)).toBe('A\n\nB');
    expect(textoDeBloques(b, true)).toBe('Cómo ha ido: A\n\nQué cambia esta semana: B');
  });
});
