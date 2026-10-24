import type { QuestionnaireQuestion } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué preguntas van juntas en una pantalla (K-03)

   Escalas, opciones, texto, sí/no y archivos: una por pantalla, con la pregunta
   grande. Las respuestas sencillas —numéricas y medidas— se agrupan de hasta
   tres seguidas, porque una pantalla entera para «¿cuánto mides de cintura?»
   alarga la revisión sin aportar nada.

   Solo agrupa preguntas CONTIGUAS y no cambia el orden: `QuestionnaireQuestion`
   no tiene campo de sección, así que no se inventa ninguna agrupación por tema.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_SENCILLAS_POR_PANTALLA = 3;

const esSencilla = (q: QuestionnaireQuestion) => q.type === 'numeric' || q.type === 'metric';

/** Cada elemento es una pantalla: la lista de posiciones (en `preguntas`) que lleva. */
export function pasosDeCuestionario(preguntas: QuestionnaireQuestion[]): number[][] {
  const pasos: number[][] = [];
  let i = 0;
  while (i < preguntas.length) {
    if (!esSencilla(preguntas[i])) { pasos.push([i]); i++; continue; }
    const grupo: number[] = [];
    while (i < preguntas.length && esSencilla(preguntas[i]) && grupo.length < MAX_SENCILLAS_POR_PANTALLA) {
      grupo.push(i); i++;
    }
    pasos.push(grupo);
  }
  return pasos;
}
