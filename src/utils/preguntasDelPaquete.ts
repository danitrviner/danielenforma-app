import type { Questionnaire, QuestionnaireQuestion } from '../types.js';
import { PAQUETE_OFICIAL, presetPorTitulo } from '../data/questionnairePresets.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Preguntas nuevas del paquete oficial en un cuestionario que ya existe
   (18-11-2026)

   Cuando el paquete oficial gana una pregunta (el cierre de bloque ganó «qué
   ejercicios quitarías» y «echas de menos alguno»), los cuestionarios que el
   coach ya creó a partir de él no se enteran: se copiaron el día que se
   crearon. Esto compara por `signalKey` —la única clave estable de una
   pregunta: el `id` se genera al copiar— y devuelve el cuestionario con las que
   falten añadidas al final de su sección (`bloque`), con id nuevo.

   No toca nada de lo que ya hay: ni las preguntas, ni su orden, ni las
   respuestas guardadas (que van por id). Si el paquete SUSTITUYÓ una pregunta
   antigua, la antigua se queda y se dice en el resumen: borrarla es decisión
   del coach. Nada se hace solo: lo aplica el botón «Añadirlas» del editor.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Preguntas antiguas que el paquete oficial cambió por otras. */
const SUSTITUCIONES: { nuevas: string[]; esLaAntigua: (q: QuestionnaireQuestion) => boolean }[] = [
  {
    // Cierre de bloque (17-11-2026): la caja de texto «¿Qué ejercicios quieres
    // mantener sí o sí, y qué te apetece probar o cambiar?» pasó a ser la lista
    // de ejercicios (se queda / lo quitaría) más un texto corto.
    nuevas: ['meso_end.quitar', 'meso_end.echa_de_menos'],
    esLaAntigua: q => q.type === 'text' && !q.signalKey && /mantener/i.test(q.label) && /(probar|cambiar)/i.test(q.label),
  },
];

const TITULOS_DEL_PAQUETE = new Set(PAQUETE_OFICIAL.items.map(i => i.titulo));

export interface PreguntasNuevasDelPaquete<T> {
  /** El cuestionario con las que faltaban añadidas. Si no falta ninguna, el mismo. */
  cuestionario: T;
  anadidas: QuestionnaireQuestion[];
  /** Preguntas que el paquete sustituyó: se conservan. */
  sustituidas: QuestionnaireQuestion[];
  /** Una o dos frases para el coach; vacío si no falta nada. */
  resumen: string;
}

function idNuevo(i: number): string {
  return `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Las preguntas del preset del paquete oficial con el mismo título que aún no
 *  están (por `signalKey`). Las del preset sin señal no se pueden comparar y no
 *  cuentan. Sin preset oficial con ese título, ninguna. */
export function preguntasQueFaltan(q: Pick<Questionnaire, 'title' | 'questions'>): Omit<QuestionnaireQuestion, 'id'>[] {
  if (!TITULOS_DEL_PAQUETE.has(q.title)) return [];
  const preset = presetPorTitulo(q.title);
  if (!preset) return [];
  const tiene = new Set(q.questions.map(p => p.signalKey).filter(Boolean));
  return preset.questions.filter(p => p.signalKey && !tiene.has(p.signalKey));
}

/** Mete cada pregunta detrás de la última de su sección (o al final si su
 *  sección no está), en el orden dado. Las existentes no se mueven. */
export function insertarEnSuSeccion(
  preguntas: QuestionnaireQuestion[], nuevas: QuestionnaireQuestion[],
): QuestionnaireQuestion[] {
  const lista = [...preguntas];
  for (const nueva of nuevas) {
    let ultima = -1;
    if (nueva.bloque) lista.forEach((p, i) => { if (p.bloque === nueva.bloque) ultima = i; });
    if (ultima === -1) lista.push(nueva);
    else lista.splice(ultima + 1, 0, nueva);
  }
  return lista;
}

/** Ver la cabecera. Pulsarlo dos veces no duplica: la segunda ya no falta nada. */
export function anadirPreguntasDelPaquete<T extends Pick<Questionnaire, 'title' | 'questions'>>(
  q: T, crearId: (i: number) => string = idNuevo,
): PreguntasNuevasDelPaquete<T> {
  const faltan = preguntasQueFaltan(q);
  if (faltan.length === 0) return { cuestionario: q, anadidas: [], sustituidas: [], resumen: '' };

  const anadidas = faltan.map((p, i) => ({ ...p, id: crearId(i) }) as QuestionnaireQuestion);
  const claves = new Set(anadidas.map(p => p.signalKey));
  const sustituidas = SUSTITUCIONES
    .filter(s => s.nuevas.some(k => claves.has(k)))
    .flatMap(s => q.questions.filter(s.esLaAntigua));

  const n = anadidas.length;
  let resumen = `Al paquete oficial se le ${n === 1 ? 'ha añadido 1 pregunta' : `han añadido ${n} preguntas`}: `
    + `${anadidas.map(p => `«${p.label}»`).join(', ')}.`;
  if (sustituidas.length > 0) {
    resumen += ` ${n === 1 ? 'Sustituye' : 'Sustituyen'} a ${sustituidas.map(p => `«${p.label}»`).join(', ')}, `
      + (sustituidas.length === 1
        ? 'que no se borra: quítala tú si ya no la quieres.'
        : 'que no se borran: quítalas tú si ya no las quieres.');
  }
  return { cuestionario: { ...q, questions: insertarEnSuSeccion(q.questions, anadidas) }, anadidas, sustituidas, resumen };
}
