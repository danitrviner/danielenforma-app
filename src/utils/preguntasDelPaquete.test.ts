import { describe, it, expect } from 'vitest';
import type { QuestionnaireQuestion } from '../types';
import { buildQuestionnaireFromPreset, presetPorTitulo } from '../data/questionnairePresets';
import { anadirPreguntasDelPaquete, insertarEnSuSeccion, preguntasQueFaltan } from './preguntasDelPaquete';

/* El cierre de bloque que Dani creó antes del 17-11: la caja de texto «mantener
   o cambiar» en lugar de la lista de ejercicios y el «echas de menos». */
function cierreAntiguo() {
  const actual = buildQuestionnaireFromPreset(presetPorTitulo('Cierre de bloque')!, 'coach');
  const sinNuevas = actual.questions.filter(q => q.signalKey !== 'meso_end.quitar' && q.signalKey !== 'meso_end.echa_de_menos');
  const antigua: QuestionnaireQuestion = {
    id: 'q-vieja', type: 'text', required: true, bloque: 'Siguiente bloque', tituloCorto: 'Mantener y probar',
    label: '¿Qué ejercicios quieres mantener sí o sí, y qué te apetece probar o cambiar?',
  };
  const i = sinNuevas.findIndex(q => q.signalKey === 'meso_end.overload_groups');
  const questions = [...sinNuevas.slice(0, i + 1), antigua, ...sinNuevas.slice(i + 1)];
  return { id: 'cierre', ownerId: 'coach', title: 'Cierre de bloque', questions };
}

const ids = (i: number) => `nueva-${i}`;

describe('preguntas nuevas del paquete oficial', () => {
  it('añade las que faltan al final de su sección, sin tocar las existentes ni su orden', () => {
    const viejo = cierreAntiguo();
    const { cuestionario, anadidas } = anadirPreguntasDelPaquete(viejo, ids);
    expect(anadidas.map(q => q.signalKey)).toEqual(['meso_end.quitar', 'meso_end.echa_de_menos']);
    expect(anadidas.map(q => q.id)).toEqual(['nueva-0', 'nueva-1']);

    // Las de antes, las mismas y en el mismo orden.
    const antes = cuestionario.questions.filter(q => !q.id.startsWith('nueva-'));
    expect(antes).toEqual(viejo.questions);

    // Al final de «Siguiente bloque»: después de la última pregunta de esa sección.
    const orden = cuestionario.questions.map(q => q.id);
    const ultimaDeLaSeccion = viejo.questions.map(q => q.bloque).lastIndexOf('Siguiente bloque');
    expect(orden.indexOf('nueva-0')).toBe(ultimaDeLaSeccion + 1);
    expect(orden.indexOf('nueva-1')).toBe(ultimaDeLaSeccion + 2);
  });

  it('no borra la pregunta sustituida y lo dice en el resumen', () => {
    const { cuestionario, sustituidas, resumen } = anadirPreguntasDelPaquete(cierreAntiguo(), ids);
    expect(sustituidas.map(q => q.id)).toEqual(['q-vieja']);
    expect(cuestionario.questions.some(q => q.id === 'q-vieja')).toBe(true);
    expect(resumen).toMatch(/^Al paquete oficial se le han añadido 2 preguntas: «/);
    expect(resumen).toContain('Sustituyen a «¿Qué ejercicios quieres mantener');
    expect(resumen).toContain('no se borra');
  });

  it('pulsar dos veces no duplica: la segunda ya no falta nada', () => {
    const primera = anadirPreguntasDelPaquete(cierreAntiguo(), ids).cuestionario;
    const segunda = anadirPreguntasDelPaquete(primera, ids);
    expect(segunda.anadidas).toEqual([]);
    expect(segunda.resumen).toBe('');
    expect(segunda.cuestionario).toBe(primera);
    expect(preguntasQueFaltan(primera)).toEqual([]);
  });

  it('un cuestionario recién creado del paquete, o con otro título, no tiene nada que añadir', () => {
    const nuevo = buildQuestionnaireFromPreset(presetPorTitulo('Cierre de bloque')!, 'coach');
    expect(preguntasQueFaltan(nuevo)).toEqual([]);
    expect(preguntasQueFaltan({ ...cierreAntiguo(), title: 'Mi cierre' })).toEqual([]);
  });

  it('sin su sección, al final', () => {
    const q = { id: 'x', label: 'x', type: 'text', required: false, bloque: 'Otra' } as QuestionnaireQuestion;
    const n = { id: 'n', label: 'n', type: 'text', required: false, bloque: 'Nueva' } as QuestionnaireQuestion;
    expect(insertarEnSuSeccion([q], [n]).map(p => p.id)).toEqual(['x', 'n']);
  });
});
