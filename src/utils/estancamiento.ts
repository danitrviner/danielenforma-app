import type { WorkoutLog } from '../types.js';
import type { VolumeZone } from './volumeZones.js';
import type { MotivoDeParada } from './queTeParo.js';
import { ARREGLO_POR_MOTIVO } from './queTeParo.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { rmDeSerie } from './oneRepMax.js';
import { marcaDelPunto, tramoComparable, type PuntoDelHistorial } from './comparabilidad.js';
import { DESFASE_QUE_IMPORTA } from './calibracionRir.js';
import { MEJORA_SOSTENIDA_RM, SESIONES_DEL_NIVEL } from './ruidoDeMedida.js';
import { diasEntreFechas } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Estancamiento honesto (S1, 11-11-2026; en semanas desde el 17-11-2026)

   «No progresa» solo se puede decir cuando:
     1. lleva SEIS SEMANAS o más de la misma tarea (S3: mismo orden, descanso,
        RIR, rango y máquina) sin mejorar su nivel, con al menos seis sesiones
        con marca en ese tramo;
     2. el esfuerzo es creíble (no para a 4-5 del fallo ni se queda lejos
        cuando se comprueba, F4);
     3. el contexto acompaña (sueño, estrés y agujetas).
   Sin el 1 no se dice nada. Sin el 2 o el 3, el plan no tiene la culpa y no
   se toca.

   Cómo se mide el 1 (auditoría de cifras, 17-11-2026). Antes se contaban
   SESIONES y «mejorar» era superar la mejor marca en un 3 % de un salto. La
   simulación sobre el motor real enseñó tres fallos: una repetición ganada
   (un 2,3 % de RM) no contaba nunca, y quien ganaba una en doce semanas salía
   con doce sesiones «sin mejorar» y con la propuesta de cambiar de variante;
   con una repetición de más o de menos en una de cada tres sesiones se
   avisaba al 98-100 % de quienes progresaban con normalidad; y a frecuencia 2
   seis sesiones son tres semanas, cuando el curso pide no reaccionar a 1-2.
   Desde hoy:

     · el NIVEL de un ejercicio es la mediana de sus tres últimas marcas
       (`SESIONES_DEL_NIVEL`): una sesión rara no lo mueve;
     · MEJORAR es que el nivel suba un 2 % o más (`MEJORA_SOSTENIDA_RM`, lo
       que mueve una repetición) sobre el mejor nivel que había tenido;
     · la mejora tiene que SOSTENERSE: se mira desde hoy hacia atrás. «Sin
       mejorar desde el día X» quiere decir que el nivel de hoy no supera en
       un 2 % el mejor nivel que ya tenía el día X. Un pico de dos sesiones
       buenas que luego se deshace no reinicia la cuenta (ese pico era lo que
       tapaba el 20-25 % de los estancamientos de verdad), y tampoco tapa la
       repetición que se gana después;
     · el tiempo se cuenta en SEMANAS, con las fechas reales de las sesiones,
       desde ese día X hasta la última sesión con marca. Si en todo el tramo
       comparable no hay ninguna mejora, se cuenta desde su primera sesión.

   La prueba de `estancamiento.test.ts` deja fijada la simulación (500 atletas
   por caso, 12 semanas): se avisa a más del 85 % de los que están planos de
   verdad y a menos del 30 % de los que progresan con normalidad.

   Y cuando sí lo es, la respuesta no es siempre «más series»:
     · lo que para la serie no es el músculo → arreglar eso primero (D2);
     · el grupo ya va alto de volumen → repartir o reducir;
     · lleva doce semanas o más igual → cambiar la variante: cambiar de
       ejercicio es cosa de meses, no de tres semanas;
     · si no → +1-2 series del grupo, varias semanas.

   La marca de cada sesión es el 1RM estimado de su mejor serie VÁLIDA
   (`marcaDeSesion.ts`, D2 17-11-2026), que ya cuenta el RIR apuntado: hacer
   las mismas reps con una más de margen es mejorar.

   Una sesión sin ninguna serie válida (todo a RIR 3 o más, a más de 15
   repeticiones, o con el RIR pautado sin tocar) no tiene marca: no cuenta ni
   como mejora ni como sesión sin mejorar. Antes entraba con el RM de lo que
   hubiera y podía tanto tapar un estancamiento como inventarlo. De quien
   entrena siempre lejos del fallo no hay marcas con las que medir: lo único
   que se le dice es «que apriete» (ver `detectarEstancamiento`), y el cierre
   cuenta sus sesiones «sin marca».
   ═══════════════════════════════════════════════════════════════════════════ */

/** Semanas sin mejorar a partir de las cuales se habla de estancamiento
 *  (el curso: 1-2 semanas no son motivo; decisión de Dani, 17-11-2026). */
export const SEMANAS_SIN_MEJORAR = 6;
/** A partir de aquí ya no es cuestión de dosis: se cambia la variante. */
export const SEMANAS_PARA_CAMBIAR_VARIANTE = 12;
/** Sesiones con marca que tiene que haber, como mínimo, en el tramo parado:
 *  seis semanas con tres sesiones sueltas no dicen nada. (Hasta el 17-11-2026
 *  esta cifra ERA el umbral: seis sesiones sin mejorar.) */
export const SESIONES_SIN_MEJORAR = 6;
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
  /** Semanas sin mejorar el nivel, con las fechas reales de las sesiones. */
  semanas: number;
  /** Sesiones comparables con marca en ese tramo (incluida la primera). */
  sesiones: number;
  veredicto: VeredictoDeEstancamiento;
  /** Qué hacer, para el coach. */
  accion: string;
}

/** Una sesión con su marca, de la más antigua a la más nueva. */
export interface MarcaConFecha { date: string; marca: number }

export interface TramoSinMejorar {
  /** Día (`YYYY-MM-DD`) desde el que el nivel de hoy no es una mejora. */
  desde: string;
  /** Semanas enteras desde ese día hasta la última sesión. */
  semanas: number;
  /** Sesiones del tramo, contando la de ese día. */
  sesiones: number;
}

const medianaDe = (xs: readonly number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** El nivel tras cada sesión: la mediana de sus `SESIONES_DEL_NIVEL` últimas
 *  marcas. Las primeras sesiones, sin ventana completa, no tienen nivel. */
export function nivelesDe(marcas: readonly number[]): number[] {
  const niveles: number[] = [];
  for (let i = SESIONES_DEL_NIVEL - 1; i < marcas.length; i++) niveles.push(medianaDe(marcas.slice(i - SESIONES_DEL_NIVEL + 1, i + 1)));
  return niveles;
}

/**
 * Desde cuándo no mejora: el primer día en el que el mejor nivel alcanzado
 * ya estaba a menos de un 2 % del nivel de hoy. Si ese día es el del primer
 * nivel del tramo, no ha mejorado en todo el tramo y se cuenta desde su
 * primera sesión. `null` con menos sesiones de las que hacen falta para un nivel.
 */
export function tramoSinMejorar(puntos: readonly MarcaConFecha[]): TramoSinMejorar | null {
  const niveles = nivelesDe(puntos.map(p => p.marca));
  if (niveles.length === 0) return null;
  const hoy = niveles[niveles.length - 1];
  let mejor = -Infinity;
  let idx = 0;
  for (let j = 0; j < niveles.length; j++) {
    mejor = Math.max(mejor, niveles[j]);
    if (hoy < mejor * (1 + MEJORA_SOSTENIDA_RM)) { idx = j === 0 ? 0 : j + SESIONES_DEL_NIVEL - 1; break; }
  }
  const desde = puntos[idx].date;
  const semanas = Math.max(0, Math.floor(diasEntreFechas(desde, puntos[puntos.length - 1].date) / 7));
  return { desde, semanas, sesiones: puntos.length - idx };
}

/** ¿El tramo sin mejorar ya es estancamiento? Seis semanas y seis sesiones. */
const esEstancamiento = (t: TramoSinMejorar | null): t is TramoSinMejorar =>
  t != null && t.semanas >= SEMANAS_SIN_MEJORAR && t.sesiones >= SESIONES_SIN_MEJORAR;

const ACCION: Record<Exclude<VeredictoDeEstancamiento, 'arreglar_limitante'>, string> = {
  mantener: 'El contexto no acompaña (sueño, estrés o agujetas): mantén carga y series y vuelve a mirar cuando se recupere',
  apretar: 'Se queda lejos del fallo: antes de tocar el plan, que apriete. Comprueba el RIR con una serie al máximo',
  repartir_o_reducir: 'El grupo ya va alto de volumen: reparte las series en más días o quita 1-2 antes de añadir nada',
  cambiar_variante: 'Lleva demasiadas semanas igual: cambia la variante del ejercicio y empieza referencia nueva',
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
    // sus últimas seis sesiones no tienen UNA serie válida porque para a 4 o
    // más del fallo, y con lo apuntado (orientativo) lleva seis semanas sin
    // que se le vea subir. Ahí lo que hay que decir es lo de siempre: antes
    // de tocar el plan, que apriete.
    const ultimas = todo.slice(-SESIONES_SIN_MEJORAR);
    if (ultimas.length < SESIONES_SIN_MEJORAR || ultimas.some(p => marcaDelPunto(p) != null)) return null;
    if ((rirMedioDe(ultimas) ?? 0) < RIR_LEJOS) return null;
    const parada = tramoSinMejorar(todo.map(p => ({ date: p.date, marca: marcaOrientativa(p) })));
    if (!esEstancamiento(parada)) return null;
    const veredicto: VeredictoDeEstancamiento = contexto.recuperacionMala ? 'mantener' : 'apretar';
    return { exerciseId, semanas: parada.semanas, sesiones: parada.sesiones, veredicto, accion: ACCION[veredicto] };
  }

  const parada = tramoSinMejorar(tramo);
  if (!esEstancamiento(parada)) return null;
  const { semanas, sesiones } = parada;

  const rirMedio = rirMedioDe(tramo.slice(-sesiones)) ?? 0;

  let veredicto: VeredictoDeEstancamiento;
  if (contexto.recuperacionMala) veredicto = 'mantener';
  else if (rirMedio >= RIR_LEJOS || (contexto.desfaseRir ?? 0) >= DESFASE_QUE_IMPORTA) veredicto = 'apretar';
  else if (contexto.limitante) veredicto = 'arreglar_limitante';
  else if (contexto.zona === 'mrv') veredicto = 'repartir_o_reducir';
  else if (semanas >= SEMANAS_PARA_CAMBIAR_VARIANTE) veredicto = 'cambiar_variante';
  else veredicto = 'subir_series';

  const accion = veredicto === 'arreglar_limitante'
    ? `Lo que le para no es el músculo: ${ARREGLO_POR_MOTIVO[contexto.limitante!]}`
    : ACCION[veredicto];
  return { exerciseId, semanas, sesiones, veredicto, accion };
}

/** «6 semanas», «1 semana». */
export const textoDeSemanas = (n: number) => `${n} ${n === 1 ? 'semana' : 'semanas'}`;
