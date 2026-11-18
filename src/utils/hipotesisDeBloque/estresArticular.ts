import type { WorkoutLog } from '../../types.js';
import { semanaRealizadaDesdeLogs, type NombreCdgDe } from '../cdg/adaptadores.js';
import type { MotorCdg } from '../cdg/motor.js';
import { calcularSemana } from '../cdg/seguimiento.js';
import { ZONA_POR_CLAVE, limitesValidos, type ZonaIem } from '../cdg/zonas.js';
import { addDays } from '../trainingWeek.js';
import type { EstadoDelBloque } from './estadoDelBloqueAnterior.js';
import { enLista, nombreCortoDeZona } from './tiposDeBloque.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Molestias en una zona → vigilar el estrés articular (Dani, 18-11-2026)

   Una molestia apuntada en una zona con estrella ya contaba como límite
   pasado: aunque la apuesta se confirme, el techo no sube (`veredicto.ts`).
   Dani lo confirmó y pidió un paso más: «incluso que se controle el índice
   articular de la zona». De ahí salen dos cosas para el bloque siguiente:

     · una línea, «Vigilar el estrés articular de {articulaciones de la zona}»
       (las de `ZONAS_IEM[].articulaciones`, que es como el método relaciona
       cada zona con el tejido pasivo que carga);
     · una SUGERENCIA de límite semanal para esas articulaciones: lo que
       tuvieron de media por semana en el bloque que se cierra, nunca más alto.
       El límite es el de siempre (`UserProfile.cdgUmbralesCarga.
       limitesArticulares`, X1 del 17-11-2026): es del ATLETA, no del bloque,
       lo avisan el panel de índices y el Seguimiento, y no bloquea nada. Solo
       se escribe si el coach lo acepta.

   El estrés articular realizado sale del mismo cálculo que el IEM del cierre
   (`estimulo.ts::iemDeLogs`): los registros de cada semana pasados por el
   motor CDG. Aquí no hay fórmula nueva; solo se lee la otra salida del motor.

   Puro: no lee ni escribe nada.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un decimal hacia ABAJO: el límite propuesto no puede quedar por encima de la media. */
const haciaAbajo = (v: number) => Math.floor(v * 10 + 1e-6) / 10;
const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/**
 * Estrés articular MEDIO por semana de cada articulación en un bloque, con
 * lo registrado. Cuentan las mismas semanas que para el IEM del veredicto
 * (`EstadoDelBloque.semanas`: sin descargas, puentes, test ni la semana en
 * curso) y, de esas, solo las entrenadas: una semana sin entrenar no dice
 * cuánto carga una semana normal y bajaría el límite sin motivo. Clave = el
 * nombre de la articulación en el motor («Hombro Articular»). Sin semanas
 * entrenadas, vacío.
 */
export function estresArticularMedioDelBloque(o: {
  motor: MotorCdg;
  /** Los registros del bloque (`logsDelBloque`). */
  logs: readonly WorkoutLog[];
  nombreCdgDe: NombreCdgDe;
  semanas: EstadoDelBloque['semanas'];
}): Record<string, number> {
  const cuentan = o.semanas.filter(s => s.cuenta && s.entrenada);
  if (cuentan.length === 0) return {};
  const suma = new Array<number>(o.motor.articulaciones.length).fill(0);
  for (const s of cuentan) {
    const fin = addDays(s.inicio, 6);
    const deLaSemana = o.logs.filter(l => l.date >= s.inicio && l.date <= fin);
    // Toda la semana en «un día», como `iemDeLogs`: aquí solo importa el total.
    const estres = calcularSemana(o.motor, semanaRealizadaDesdeLogs(deLaSemana, o.nombreCdgDe, () => 0)).estresArticular[0] ?? [];
    estres.forEach((v, j) => { suma[j] += v; });
  }
  const out: Record<string, number> = {};
  o.motor.articulaciones.forEach((nombre, j) => {
    const media = suma[j] / cuentan.length;
    if (media > 0.005) out[nombre] = Math.round(media * 100) / 100;
  });
  return out;
}

/**
 * Las articulaciones en una frase, juntas por la parte del cuerpo: «hombro
 * (articular, tendinoso compresivo y tendinoso tensil)», «cadera (articular) y
 * columna (cizalla)». Los nombres del motor son «Hombro Articular», «Columna
 * Sagital flexión»…: la primera palabra es la articulación y el resto, el tipo
 * de estrés.
 */
export function articulacionesEnFrase(articulaciones: readonly string[]): string {
  const porParte = new Map<string, string[]>();
  for (const a of articulaciones) {
    const [parte, ...tipo] = a.trim().split(/\s+/);
    const clave = parte.toLowerCase();
    if (!porParte.has(clave)) porParte.set(clave, []);
    if (tipo.length) porParte.get(clave)!.push(tipo.join(' ').toLowerCase());
  }
  return enLista([...porParte].map(([parte, tipos]) => (tipos.length ? `${parte} (${enLista(tipos)})` : parte)));
}

/** «Vigilar el estrés articular de hombro (…)». `null` si el método no le asigna articulaciones a la zona (bíceps, tríceps, antebrazo, gemelos). */
export function textoDeVigilar(zona: ZonaIem): string | null {
  const articulaciones = ZONA_POR_CLAVE[zona]?.articulaciones ?? [];
  return articulaciones.length ? `Vigilar el estrés articular de ${articulacionesEnFrase(articulaciones)}` : null;
}

export interface MolestiaDeZona {
  zona: ZonaIem;
  /** Sesiones con molestia apuntada en ejercicios de la zona. */
  veces: number;
  /** La más alta (1-10); `null` si solo dijo que le paró una molestia. */
  maxima: number | null;
}

export interface VigilanciaArticular {
  zona: ZonaIem;
  /** Nombres de las articulaciones en el motor CDG. */
  articulaciones: string[];
  /** «Vigilar el estrés articular de hombro (…): molestia apuntada en pectoral (2 sesiones, hasta 6/10).» */
  texto: string;
}

export interface LimiteArticularPropuesto {
  /** Nombre de la articulación en el motor CDG: la clave de `limitesArticulares`. */
  articulacion: string;
  /** El límite semanal que se propone: su media semanal en el bloque, hacia abajo. */
  limite: number;
  /** El que tiene hoy el atleta en esa articulación, si tiene uno (siempre más alto: si no, no se propone). */
  actual?: number;
}

export interface PropuestaArticular {
  /** Una por zona con molestia y articulaciones asignadas. */
  vigilar: VigilanciaArticular[];
  /** Límites semanales que se sugiere fijar. Vacío si no se pudo calcular o ya los tiene iguales o más bajos. */
  limites: LimiteArticularPropuesto[];
}

/**
 * Lo que se propone para el bloque siguiente cuando alguna zona con estrella
 * trae molestias: la línea de «vigilar» por zona y, si hay con qué
 * calcularlo, el límite semanal de sus articulaciones.
 *
 * El límite propuesto es la media semanal del bloque que se cierra, redondeada
 * hacia abajo («no más alto»). Si el atleta ya tiene en esa articulación un
 * límite igual o más bajo, no se propone nada: una sugerencia nunca lo sube.
 */
export function propuestaArticular(o: {
  molestias: readonly MolestiaDeZona[];
  /** `estresArticularMedioDelBloque`. Sin él (sin motor CDG) solo sale la línea. */
  estresMedio?: Partial<Record<string, number>> | null;
  /** Los límites que ya tiene el atleta (`UserProfile.cdgUmbralesCarga.limitesArticulares`). */
  limitesActuales?: Partial<Record<string, unknown>> | null;
}): PropuestaArticular {
  const vigilar: VigilanciaArticular[] = [];
  for (const m of o.molestias) {
    if (!(m.veces > 0)) continue;
    const base = textoDeVigilar(m.zona);
    if (!base) continue;
    const cuanto = `${m.veces} ${m.veces === 1 ? 'sesión' : 'sesiones'}${m.maxima != null ? `, hasta ${fmt(m.maxima)}/10` : ''}`;
    vigilar.push({
      zona: m.zona,
      articulaciones: [...ZONA_POR_CLAVE[m.zona].articulaciones],
      texto: `${base}: molestia apuntada en ${nombreCortoDeZona(m.zona).toLowerCase()} (${cuanto}).`,
    });
  }
  const actuales = limitesValidos(o.limitesActuales);
  const limites: LimiteArticularPropuesto[] = [];
  for (const articulacion of new Set(vigilar.flatMap(v => v.articulaciones))) {
    const media = o.estresMedio?.[articulacion];
    if (media == null || !(media > 0)) continue;
    const limite = haciaAbajo(media);
    if (!(limite > 0)) continue;
    const actual = actuales[articulacion];
    if (actual != null && actual <= limite) continue;
    limites.push({ articulacion, limite, ...(actual != null ? { actual } : {}) });
  }
  return { vigilar, limites };
}

/** «Hombro Articular 6,2 · Hombro Tendinoso Tensil 3,1 (tenía 4)». */
export function limitesEnLinea(limites: readonly LimiteArticularPropuesto[]): string {
  return limites.map(l => `${l.articulacion} ${fmt(l.limite)}${l.actual != null ? ` (tenía ${fmt(l.actual)})` : ''}`).join(' · ');
}

/**
 * Los límites del atleta tras aceptar la sugerencia: los que tenía más los
 * propuestos. Por si acaso, uno propuesto nunca sube el que ya había.
 */
export function limitesTrasAceptar(
  actuales: Partial<Record<string, unknown>> | null | undefined, propuestos: readonly LimiteArticularPropuesto[],
): Record<string, number> {
  const out = limitesValidos(actuales);
  for (const p of propuestos) out[p.articulacion] = out[p.articulacion] != null ? Math.min(out[p.articulacion], p.limite) : p.limite;
  return out;
}

/** La nota privada del coach para la semana 1 del bloque nuevo: las líneas de «vigilar», juntas. */
export function notaDeVigilancia(p: Pick<PropuestaArticular, 'vigilar'>): string {
  return p.vigilar.map(v => v.texto).join(' ');
}
