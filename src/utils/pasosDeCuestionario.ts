import type { QuestionnaireQuestion } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué preguntas van juntas en una pantalla (K-03)

   Escalas, opciones, texto, sí/no y archivos: una por pantalla, con la pregunta
   grande. Las respuestas sencillas —numéricas y medidas— se agrupan de hasta
   tres seguidas, porque una pantalla entera para «¿cuánto mides de cintura?»
   alarga la revisión sin aportar nada.

   Solo agrupa preguntas CONTIGUAS y no cambia el orden. Nunca junta preguntas
   de dos bloques distintos (`bloque`, 27-10).

   Agujetas (27-10): las preguntas `agujetas.<zona>` seguidas van TODAS en una
   pantalla, la del mapa corporal. Antes eran 14 pantallas, una por músculo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_SENCILLAS_POR_PANTALLA = 3;

const esSencilla = (q: QuestionnaireQuestion) => q.type === 'numeric' || q.type === 'metric';

/** Pregunta de agujetas por zona del IEM (escala 1–5). */
export const esDeAgujetas = (q: QuestionnaireQuestion) => !!q.signalKey?.startsWith('agujetas.');

/** Cada elemento es una pantalla: la lista de posiciones (en `preguntas`) que lleva. */
export function pasosDeCuestionario(preguntas: QuestionnaireQuestion[]): number[][] {
  const pasos: number[][] = [];
  let i = 0;
  while (i < preguntas.length) {
    const bloque = preguntas[i].bloque;
    const mismoBloque = (j: number) => preguntas[j].bloque === bloque;
    if (esDeAgujetas(preguntas[i])) {
      const grupo: number[] = [];
      while (i < preguntas.length && esDeAgujetas(preguntas[i]) && mismoBloque(i)) { grupo.push(i); i++; }
      pasos.push(grupo);
      continue;
    }
    if (!esSencilla(preguntas[i])) { pasos.push([i]); i++; continue; }
    const grupo: number[] = [];
    while (i < preguntas.length && esSencilla(preguntas[i]) && mismoBloque(i) && grupo.length < MAX_SENCILLAS_POR_PANTALLA) {
      grupo.push(i); i++;
    }
    pasos.push(grupo);
  }
  return pasos;
}
