import type { ExcepcionDeFecha, QuestionnaireAssignment, QuestionnaireResponse } from '../types.js';
import {
  fijarAlViernes, finDeLaExcepcion, ultimaOcasionDeCadencia, type ScheduleContext,
} from './questionnaireSchedule.js';
import { addDays } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Cambiar una fecha puntual y «Mandar ahora» (18-11-2026)

   Dani quiere, sin tocar la cadencia de un cuestionario ni duplicarlo:
   - «Cambiar esta fecha»: que UNA ocasión se abra otro día (y caduque según el
     día nuevo). Se guarda `{ ocurrencia, nuevaFecha }`.
   - «Mandar ahora»: que le salga hoy, pendiente 7 días o hasta que conteste.
     Es una ocasión extra: `{ nuevaFecha: hoy }`, sin `ocurrencia`.

   Todo vive en `QuestionnaireAssignment.excepciones`. Aquí, las funciones puras
   que calculan la lista nueva; la escritura está en db/questionnaires.ts y el
   efecto sobre «pendiente» y «contestado» en utils/questionnaireSchedule.ts.

   Para que la lista no crezca sin fin, cada vez que se guarda se quitan las
   excepciones que ya no pueden cambiar nada (`limpiarExcepciones`).
   ═══════════════════════════════════════════════════════════════════════════ */

type Asignacion = Pick<QuestionnaireAssignment, 'schedule' | 'startDate' | 'excepciones'>;

const esExtra = (e: ExcepcionDeFecha) => !e.ocurrencia;

/** La asignación con el día de revisión del atleta (igual que la ve «Próxima»). */
function conDia<T extends Asignacion>(a: T, ctx?: ScheduleContext): T {
  return fijarAlViernes(a, ctx?.diaRevision);
}

/**
 * Las excepciones que todavía pueden cambiar algo, a fecha `hoy`.
 *
 * - Una extra se quita cuando ya ha caducado (sus 7 días han pasado).
 * - Una movida se quita cuando ya ha empezado OTRA ocasión de la cadencia
 *   posterior a sus dos fechas y la suya ya no está abierta: desde entonces
 *   manda esa. Mientras no, hay que guardarla, o la ocasión original volvería
 *   a salir pendiente en su fecha de siempre.
 */
export function limpiarExcepciones<T extends Asignacion>(
  a: T, lista: ExcepcionDeFecha[], ctx: ScheduleContext | undefined, hoy: string,
): ExcepcionDeFecha[] {
  const anclada = conDia({ ...a, excepciones: undefined }, ctx);
  const ultima = ultimaOcasionDeCadencia(anclada, ctx, hoy, a.startDate);
  return lista.filter(e => {
    const fin = finDeLaExcepcion(e, anclada, ctx);
    const cerrada = fin != null && fin <= hoy;
    if (esExtra(e)) return !cerrada;
    const posterior = !!ultima && ultima.clave > (e.ocurrencia as string) && ultima.clave > e.nuevaFecha;
    return !(posterior && (cerrada || fin == null));
  });
}

/** «Mandar ahora»: una ocasión extra que empieza `hoy`. Si ya hay una de hoy,
 *  la lista no cambia (pulsar dos veces no manda dos). */
export function conMandarAhora<T extends Asignacion>(a: T, ctx: ScheduleContext | undefined, hoy: string): ExcepcionDeFecha[] {
  const lista = a.excepciones ?? [];
  const yaEsta = lista.some(e => esExtra(e) && e.nuevaFecha === hoy);
  return limpiarExcepciones(a, yaEsta ? lista : [...lista, { nuevaFecha: hoy }], ctx, hoy);
}

/** «Cambiar esta fecha»: la ocasión de `ocurrencia` pasa a `nuevaFecha`. Volver
 *  a su fecha original es deshacer el cambio. */
export function conFechaMovida<T extends Asignacion>(
  a: T, ocurrencia: string, nuevaFecha: string, ctx: ScheduleContext | undefined, hoy: string,
): ExcepcionDeFecha[] {
  const resto = (a.excepciones ?? []).filter(e => e.ocurrencia !== ocurrencia);
  const lista = nuevaFecha === ocurrencia ? resto : [...resto, { ocurrencia, nuevaFecha }];
  return limpiarExcepciones(a, lista, ctx, hoy);
}

/** Deshacer una excepción (una fecha movida o un «Mandar ahora»). */
export function sinExcepcion<T extends Asignacion>(
  a: T, quitar: ExcepcionDeFecha, ctx: ScheduleContext | undefined, hoy: string,
): ExcepcionDeFecha[] {
  const lista = (a.excepciones ?? []).filter(e => quitar.ocurrencia
    ? e.ocurrencia !== quitar.ocurrencia
    : !(esExtra(e) && e.nuevaFecha === quitar.nuevaFecha));
  return limpiarExcepciones(a, lista, ctx, hoy);
}

export interface ExtraVigente {
  excepcion: ExcepcionDeFecha;
  /** Último día en que sigue pendiente (inclusive). */
  hasta: string;
  contestada: boolean;
}

/** Los «Mandar ahora» que siguen abiertos hoy, para enseñarlos en Asignadas. */
export function extrasVigentes(
  a: Pick<QuestionnaireAssignment, 'id' | 'schedule' | 'excepciones'>,
  respuestas: Pick<QuestionnaireResponse, 'assignmentId' | 'submittedAt'>[],
  hoy: string,
): ExtraVigente[] {
  return (a.excepciones ?? [])
    .filter(esExtra)
    .map(e => {
      const fin = finDeLaExcepcion(e, a) as string;
      const contestada = respuestas.some(r => r.assignmentId === a.id
        && r.submittedAt.slice(0, 10) >= e.nuevaFecha && r.submittedAt.slice(0, 10) <= hoy);
      return { excepcion: e, hasta: addDays(fin, -1), contestada, fin };
    })
    .filter(x => x.excepcion.nuevaFecha <= hoy && hoy < x.fin)
    .map(({ excepcion, hasta, contestada }) => ({ excepcion, hasta, contestada }));
}
