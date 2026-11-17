import type { WorkoutLog } from '../types.js';
import type { VolumeZone } from './volumeZones.js';
import type { MotivoDeParada } from './queTeParo.js';
import { ARREGLO_POR_MOTIVO } from './queTeParo.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { rmDeSerie } from './oneRepMax.js';
import { marcaDelPunto, tramoComparable, type PuntoDelHistorial } from './comparabilidad.js';
import { DESFASE_QUE_IMPORTA } from './calibracionRir.js';
import { RUIDO_RM } from './ruidoDeMedida.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Estancamiento honesto (S1, 11-11-2026)

   «No progresa» solo se puede decir cuando:
     1. hay al menos SEIS sesiones seguidas de la misma tarea (S3: mismo orden,
        descanso, RIR, rango y máquina) sin mejorar la marca. A frecuencia 2
        son unas tres semanas: el curso pide no reaccionar a una caída de 1-2
        semanas (17-11-2026; antes eran tres sesiones, semana y media);
     2. el esfuerzo es creíble (no para a 4-5 del fallo ni se queda lejos
        cuando se comprueba, F4);
     3. el contexto acompaña (sueño, estrés y agujetas).
   Sin el 1 no se dice nada: una sesión igual que la anterior no es
   estancamiento. Sin el 2 o el 3, el plan no tiene la culpa y no se toca.

   Y cuando sí lo es, la respuesta no es siempre «más series»:
     · lo que para la serie no es el músculo → arreglar eso primero (D2);
     · el grupo ya va alto de volumen → repartir o reducir;
     · lleva muchas sesiones igual (doce, unas seis semanas) → cambiar la
       variante: cambiar de ejercicio es cosa de 6-8 semanas, no de tres;
     · si no → +1-2 series del grupo, varias semanas.

   La marca de cada sesión es el 1RM estimado de su mejor serie VÁLIDA
   (`marcaDeSesion.ts`, D2 17-11-2026), que ya cuenta el RIR apuntado: hacer
   las mismas reps con una más de margen es mejorar. «Mejorar» es superar el
   ruido de medida (`ruidoDeMedida.ts`): un 1 % de RM estimado no se distingue
   del error de medir.

   Una sesión sin ninguna serie válida (todo a RIR 3 o más, a 15 repeticiones,
   o con el RIR pautado sin tocar) no tiene marca: no cuenta ni como mejora ni
   como sesión sin mejorar. Antes entraba con el RM de lo que hubiera y podía
   tanto tapar un estancamiento como inventarlo. De quien entrena siempre
   lejos del fallo no hay marcas con las que medir: lo único que se le dice
   es «que apriete» (ver `detectarEstancamiento`), y el cierre cuenta sus
   sesiones «sin marca».
   ═══════════════════════════════════════════════════════════════════════════ */

/** Sesiones comparables sin mejorar a partir de las cuales se habla de
 *  estancamiento: unas 3 semanas a frecuencia 2 (el curso: 1-2 semanas no son motivo). */
export const SESIONES_SIN_MEJORAR = 6;
/** A partir de aquí ya no es cuestión de dosis: se cambia la variante
 *  (unas 6 semanas a frecuencia 2; el curso cambia de ejercicio a las 6-8). */
export const SESIONES_PARA_CAMBIAR_VARIANTE = 12;
/** Mejora mínima para contarla como tal: el ruido de medida del RM estimado
 *  (una repetición más son ~2,5-3 %; por debajo no se distingue de medir mal). */
const MEJORA_MINIMA = RUIDO_RM;
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

/** RIR medio de unas sesiones, solo con el que apuntó el atleta (el pautado
 *  sin tocar no dice si aprieta o no). `null` si no apuntó ninguno. */
function rirMedioDe(puntos: readonly Pick<PuntoDelHistorial, 'entry'>[]): number | null {
  const rirs = puntos.flatMap(p => seriesPrincipales(p.entry.sets)
    .filter(s => s.weight > 0 && s.repsDone > 0 && (s.alFallo || s.rirApuntado !== false))
    .map(s => (s.alFallo ? 0 : s.rir ?? 0)));
  return rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
}

/** El RM de la mejor serie SIN filtrar. Solo para el caso de quien no tiene
 *  marcas por parar lejos del fallo: no es una marca, es lo único que hay. */
const marcaOrientativa = (p: Pick<PuntoDelHistorial, 'entry'>) => Math.max(0, ...seriesPrincipales(p.entry.sets).map(rmDeSerie));

/** El veredicto del ejercicio, o `null` si no está estancado (o no hay con qué decirlo). */
export function detectarEstancamiento(
  logs: readonly WorkoutLog[], exerciseId: string, contexto: ContextoDeEstancamiento = {},
): Estancamiento | null {
  const todo = tramoComparable(logs, exerciseId);
  // Solo las sesiones del tramo que tienen marca: las demás no dicen nada.
  const tramo = todo
    .map(p => ({ ...p, marca: marcaDelPunto(p) }))
    .filter((p): p is typeof p & { marca: number } => p.marca != null);

  if (tramo.length < SESIONES_SIN_MEJORAR) {
    // Sin marcas suficientes no se habla de estancamiento, con una excepción:
    // lleva seis sesiones seguidas sin UNA serie válida porque para a 4 o más
    // del fallo, y con lo apuntado (orientativo) tampoco se le ve subir. Ahí
    // lo que hay que decir es lo de siempre: antes de tocar el plan, que apriete.
    const ultimas = todo.slice(-SESIONES_SIN_MEJORAR);
    if (ultimas.length < SESIONES_SIN_MEJORAR || ultimas.some(p => marcaDelPunto(p) != null)) return null;
    if ((rirMedioDe(ultimas) ?? 0) < RIR_LEJOS) return null;
    const sesiones = sesionesSinMejorar(todo.map(marcaOrientativa));
    if (sesiones < SESIONES_SIN_MEJORAR) return null;
    const veredicto: VeredictoDeEstancamiento = contexto.recuperacionMala ? 'mantener' : 'apretar';
    return { exerciseId, sesiones, veredicto, accion: ACCION[veredicto] };
  }

  const sesiones = sesionesSinMejorar(tramo.map(p => p.marca));
  if (sesiones < SESIONES_SIN_MEJORAR) return null;

  const rirMedio = rirMedioDe(tramo.slice(-sesiones)) ?? 0;

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
