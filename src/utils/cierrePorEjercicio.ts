import type { MuscleGroup, QuestionnaireQuestion } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Cierre de bloque por ejercicio (17-11-2026)

   El método pide preguntarle al cliente qué ejercicios QUITARÍA y cuáles echa
   de menos. Antes era una caja de texto («¿qué quieres mantener y qué
   cambiar?») que casi nadie rellenaba y que ningún motor podía leer. Ahora la
   pregunta enseña los ejercicios que ha hecho en el bloque y cada uno se
   contesta en un toque: «se queda» o «lo quitaría». No hace falta contestar
   todos.

   Cómo viaja la respuesta (una sola pregunta `keep_change` con la señal
   `meso_end.quitar`):

     · su VALOR es la lista de ids con el voto delante: `-id` lo quitaría,
       `+id` se queda («-a1,-b2,+c3»). Es lo que leen los motores
       (`leerVotos`). Lleva también los que se quedan porque es un dato: un
       ejercicio que el atleta dice que le gusta no es candidato a cambio.
     · su COMENTARIO (`${id}__comentario`, el mismo hueco que ya usan las
       escalas y mantener/cambiar) es la frase con los nombres: «Quitaría:
       Press banca. Se quedan: Sentadilla.». Es lo que lee el coach, y ya se
       pinta debajo de la respuesta en Recibidas sin tocar nada.

   Puro: no sabe de dónde salen los ejercicios (ver `ejerciciosDelBloque` en
   cuestionarioAuto.ts).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ejercicios que el atleta quitaría (ids). Pregunta `keep_change`. */
export const SEÑAL_QUITAR = 'meso_end.quitar';
/** «¿Echas de menos algún ejercicio?», texto corto. */
export const SEÑAL_ECHA_DE_MENOS = 'meso_end.echa_de_menos';

export type VotoDeEjercicio = 'queda' | 'quitar';
/** id de ejercicio → voto. Sin clave = no ha opinado. */
export type VotosDeEjercicios = Record<string, VotoDeEjercicio>;

/** Un ejercicio que el atleta ha hecho en el bloque que se cierra. */
export interface EjercicioDelBloque {
  id: string;
  nombre: string;
  grupo?: MuscleGroup;
  /** Días del bloque en que lo hizo. */
  sesiones: number;
}

export const esPreguntaPorEjercicio = (q: Pick<QuestionnaireQuestion, 'signalKey'>) => q.signalKey === SEÑAL_QUITAR;

const SIGNO: Record<VotoDeEjercicio, string> = { quitar: '-', queda: '+' };

/** Votos → valor de la respuesta. Vacío si no ha opinado de ninguno. */
export function votosATexto(votos: VotosDeEjercicios): string {
  return Object.entries(votos).map(([id, v]) => `${SIGNO[v]}${id}`).join(',');
}

/**
 * Valor de la respuesta → votos. Tolera lo que no es suyo: un `mantener` o
 * `cambiar` de una pregunta de mantener/cambiar normal, un número, nada.
 */
export function leerVotos(valor: unknown): VotosDeEjercicios {
  const votos: VotosDeEjercicios = {};
  if (typeof valor !== 'string') return votos;
  for (const trozo of valor.split(',')) {
    const t = trozo.trim();
    const id = t.slice(1);
    if (!id) continue;
    if (t[0] === '-') votos[id] = 'quitar';
    else if (t[0] === '+') votos[id] = 'queda';
  }
  return votos;
}

/** Los ids con ese voto, en el orden en que se contestaron. */
export function idsConVoto(votos: VotosDeEjercicios, voto: VotoDeEjercicio): string[] {
  return Object.keys(votos).filter(id => votos[id] === voto);
}

/** Marca un voto. Tocar el mismo otra vez lo quita: no es obligatorio opinar. */
export function conVoto(votos: VotosDeEjercicios, id: string, voto: VotoDeEjercicio): VotosDeEjercicios {
  const { [id]: anterior, ...resto } = votos;
  return anterior === voto ? resto : { ...resto, [id]: voto };
}

/**
 * La frase que lee el coach: «Quitaría: Press banca, Curl. Se quedan:
 * Sentadilla.». Un id sin nombre (el ejercicio ya no está en el catálogo) no
 * se menciona: su voto sigue en el valor.
 */
export function fraseDeVotos(votos: VotosDeEjercicios, nombreDe: (id: string) => string | undefined): string {
  const nombres = (voto: VotoDeEjercicio) =>
    idsConVoto(votos, voto).map(nombreDe).filter((n): n is string => !!n).join(', ');
  const quitar = nombres('quitar');
  const quedan = nombres('queda');
  return [quitar && `Quitaría: ${quitar}.`, quedan && `Se quedan: ${quedan}.`].filter(Boolean).join(' ');
}

/** «2 que quitaría · 3 se quedan», para el repaso y para quien pinte el valor. */
export function cuentaDeVotos(valor: unknown): string {
  const votos = leerVotos(valor);
  const quitar = idsConVoto(votos, 'quitar').length;
  const quedan = idsConVoto(votos, 'queda').length;
  return [
    quitar > 0 && `${quitar} que quitaría`,
    quedan > 0 && `${quedan} se ${quedan === 1 ? 'queda' : 'quedan'}`,
  ].filter(Boolean).join(' · ');
}
