import type { WorkoutLog } from '../types.js';
import type { VolumeZone } from './volumeZones.js';
import type { MotivoDeParada } from './queTeParo.js';
import { ARREGLO_POR_MOTIVO } from './queTeParo.js';
import { rmDeSerie } from './oneRepMax.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { tramoComparable, type PuntoDelHistorial } from './comparabilidad.js';
import { DESFASE_QUE_IMPORTA } from './calibracionRir.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Estancamiento honesto (S1, 11-11-2026)

   «No progresa» solo se puede decir cuando:
     1. hay al menos TRES sesiones seguidas de la misma tarea (S3: mismo orden,
        descanso, RIR, rango y máquina) sin mejorar la marca;
     2. el esfuerzo es creíble (no para a 4-5 del fallo ni se queda lejos
        cuando se comprueba, F4);
     3. el contexto acompaña (sueño, estrés y agujetas).
   Sin el 1 no se dice nada: una sesión igual que la anterior no es
   estancamiento. Sin el 2 o el 3, el plan no tiene la culpa y no se toca.

   Y cuando sí lo es, la respuesta no es siempre «más series»:
     · lo que para la serie no es el músculo → arreglar eso primero (D2);
     · el grupo ya va alto de volumen → repartir o reducir;
     · lleva muchas sesiones igual → cambiar la variante;
     · si no → +1-2 series del grupo, varias semanas.

   La marca de cada sesión es el mejor 1RM estimado de sus series, que ya
   cuenta el RIR apuntado: hacer las mismas reps con una más de margen es
   mejorar.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Sesiones comparables sin mejorar a partir de las cuales se habla de estancamiento. */
export const SESIONES_SIN_MEJORAR = 3;
/** A partir de aquí ya no es cuestión de dosis: se cambia la variante. */
export const SESIONES_PARA_CAMBIAR_VARIANTE = 6;
/** Mejora mínima para contarla como tal (una repetición más son ~2,5-3 %). */
const MEJORA_MINIMA = 0.01;
/** RIR medio a partir del cual el esfuerzo no es creíble como estímulo. */
const RIR_LEJOS = 4;

export type VeredictoDeEstancamiento =
  | 'mantener' | 'apretar' | 'arreglar_limitante' | 'repartir_o_reducir' | 'cambiar_variante' | 'subir_series';

export interface ContextoDeEstancamiento {
  /** Sueño, estrés o agujetas malos en la ventana. */
  recuperacionMala?: boolean;
  /** Desfase medio del RIR comprobado (F4). */
  desfaseRir?: number;
  /** Lo que le para la serie, si no es el músculo (D2). */
  limitante?: Exclude<MotivoDeParada, 'musculo'>;
  /** Zona de volumen del grupo principal del ejercicio. */
  zona?: VolumeZone;
}

export interface Estancamiento {
  exerciseId: string;
  /** Sesiones comparables seguidas sin mejorar la marca (incluida la de la marca). */
  sesiones: number;
  veredicto: VeredictoDeEstancamiento;
  /** Qué hacer, para el coach. */
  accion: string;
}

const marcaDe = (p: PuntoDelHistorial) => Math.max(0, ...seriesPrincipales(p.entry.sets).map(rmDeSerie));

/**
 * Sesiones seguidas, al final del tramo, sin superar la mejor marca del tramo
 * (contando la sesión de esa marca). 1 = la última sesión es la mejor.
 */
export function sesionesSinMejorar(marcas: readonly number[]): number {
  let mejor = -Infinity;
  let idxMejor = 0;
  marcas.forEach((m, i) => { if (m > mejor * (1 + MEJORA_MINIMA)) { mejor = m; idxMejor = i; } });
  return marcas.length - idxMejor;
}

const ACCION: Record<Exclude<VeredictoDeEstancamiento, 'arreglar_limitante'>, string> = {
  mantener: 'El contexto no acompaña (sueño, estrés o agujetas): mantén carga y series y vuelve a mirar cuando se recupere',
  apretar: 'Se queda lejos del fallo: antes de tocar el plan, que apriete. Comprueba el RIR con una serie al máximo',
  repartir_o_reducir: 'El grupo ya va alto de volumen: reparte las series en más días o quita 1-2 antes de añadir nada',
  cambiar_variante: 'Lleva demasiadas sesiones igual: cambia la variante del ejercicio y empieza referencia nueva',
  subir_series: 'Esfuerzo y contexto en orden: súbele 1-2 series semanales al grupo y mantenlo unas semanas',
};

/** El veredicto del ejercicio, o `null` si no está estancado (o no hay con qué decirlo). */
export function detectarEstancamiento(
  logs: readonly WorkoutLog[], exerciseId: string, contexto: ContextoDeEstancamiento = {},
): Estancamiento | null {
  const tramo = tramoComparable(logs, exerciseId);
  if (tramo.length < SESIONES_SIN_MEJORAR) return null;
  const sesiones = sesionesSinMejorar(tramo.map(marcaDe));
  if (sesiones < SESIONES_SIN_MEJORAR) return null;

  const ultimas = tramo.slice(-sesiones);
  const rirs = ultimas.flatMap(p => seriesPrincipales(p.entry.sets).filter(s => s.weight > 0 && s.repsDone > 0).map(s => (s.alFallo ? 0 : s.rir ?? 0)));
  const rirMedio = rirs.reduce((a, b) => a + b, 0) / Math.max(1, rirs.length);

  let veredicto: VeredictoDeEstancamiento;
  if (contexto.recuperacionMala) veredicto = 'mantener';
  else if (rirMedio >= RIR_LEJOS || (contexto.desfaseRir ?? 0) >= DESFASE_QUE_IMPORTA) veredicto = 'apretar';
  else if (contexto.limitante) veredicto = 'arreglar_limitante';
  else if (contexto.zona === 'mrv') veredicto = 'repartir_o_reducir';
  else if (sesiones >= SESIONES_PARA_CAMBIAR_VARIANTE) veredicto = 'cambiar_variante';
  else veredicto = 'subir_series';

  const accion = veredicto === 'arreglar_limitante'
    ? `Lo que le para no es el músculo: ${ARREGLO_POR_MOTIVO[contexto.limitante!]}`
    : ACCION[veredicto];
  return { exerciseId, sesiones, veredicto, accion };
}
