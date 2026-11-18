import type { WorkoutAssignment, WorkoutEntryLog, WorkoutLog, WorkoutSetLog } from '../types.js';
import { rirEfectivo } from './oneRepMax.js';
import { addDays } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Sesiones FUERA del gimnasio habitual (17-11-2026)

   Dani: «Javier es aviador: una semana entrena en casa y otra fuera. Los pesos
   y las poleas son totalmente distintos, cada día apunta un peso y el registro
   de progresión se vuelve imposible; solo se guían por el RIR». Esos pesos
   emborronaban el RM, los récords, el tonelaje y la referencia de la sesión
   siguiente.

   Desde hoy el atleta (o el coach, si se le olvidó) marca la sesión como
   «fuera» desde Rutinas, con el panel de la semana (abajo). Desde el 18-11
   ya no se pregunta dentro de la sesión, y el panel solo sale si el atleta
   lo ha activado en Perfil › Mi gimnasio (`Gimnasio.entrenoFuera`). En esa
   sesión:

     · Cuenta como sesión hecha: adherencia. El RIR sí se cumple, y su
       estímulo cuenta para controlar la carga (IEM del seguimiento CDG).
     · No cuenta para la fuerza: ni RM, ni récords, ni tonelaje, ni historial
       de cargas, ni estancamiento, ni referencia de carga para la sesión
       siguiente, ni salto de carga, ni retos de carga.
     · Tampoco para las cifras del bloque (Dani, 17-11, noche): ni series
       hechas ni volumen por grupo ni RIR medio, en el cierre, en la
       progresión ni en el volumen del bloque siguiente. Con otras máquinas
       las series no son las mismas series; el cierre dice cuántas quedaron
       fuera para que no parezca que faltan.

   La marca va en el registro (`WorkoutLog.fuera`) y copiada en CADA serie
   (`WorkoutSetLog.fuera`): así cualquier motor que filtre por serie
   (rmValido.ts y los que leen pesos sueltos) la deja fuera sin saber de dónde
   viene. Módulo puro: lo alcanzan los motores de retos, que corren también en
   el servidor (importa con `.js`).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo que lee el atleta en el ajuste de Perfil › Mi gimnasio (18-11-2026). */
export const TEXTO_AJUSTE_FUERA = {
  titulo: 'A veces entreno fuera de mi gimnasio',
  apagado: 'Actívalo si algunas semanas entrenas en otro sitio. Al final de Rutinas podrás marcar qué sesiones haces fuera.',
  encendido: 'Al final de Rutinas marcas qué sesiones de esta semana haces fuera. Cuentan, pero sus pesos no se comparan con los de tu gimnasio.',
} as const;

/** ¿Esta serie se hizo fuera del gimnasio habitual? */
export function esSerieFuera(s: Pick<WorkoutSetLog, 'fuera'>): boolean {
  return s.fuera === true;
}

/** ¿La sesión se hizo fuera? Basta la marca del registro o la de una serie
 *  (las dos se escriben juntas; la de la serie cubre un registro a medias). */
export function esSesionFuera(log: { fuera?: boolean; entries: readonly { sets: readonly Pick<WorkoutSetLog, 'fuera'>[] }[] }): boolean {
  return log.fuera === true || log.entries.some(e => e.sets.some(esSerieFuera));
}

/** Las series que valen para la fuerza: todas menos las hechas fuera. */
export function seriesDeFuerza<T extends Pick<WorkoutSetLog, 'fuera'>>(sets: readonly T[]): T[] {
  return sets.filter(s => !esSerieFuera(s));
}

/** Los registros que valen para la fuerza: sin las sesiones hechas fuera. */
export function sinSesionesFuera<T extends { fuera?: boolean; entries: readonly { sets: readonly Pick<WorkoutSetLog, 'fuera'>[] }[] }>(
  logs: readonly T[],
): T[] {
  return logs.filter(l => !esSesionFuera(l));
}

/** Kilos movidos en una serie (peso × repeticiones). Una serie fuera no mueve
 *  kilos comparables: cuenta 0 en el tonelaje. */
export function kgDeSerie(s: Pick<WorkoutSetLog, 'weight' | 'repsDone' | 'fuera'>): number {
  return esSerieFuera(s) ? 0 : (Number(s.weight) || 0) * (Number(s.repsDone) || 0);
}

/** La serie con la marca puesta (`fuera`) o quitada. Quitarla borra el campo,
 *  no lo deja en `false`: así una corrección deja la serie como si nunca se
 *  hubiera marcado. */
export function serieConFuera<T extends Pick<WorkoutSetLog, 'fuera'>>(s: T, fuera: boolean): T {
  if (fuera) return s.fuera === true ? s : { ...s, fuera: true };
  if (!('fuera' in s)) return s;
  const { fuera: _quitada, ...resto } = s;
  return resto as T;
}

/** Todas las series de las entradas con la marca puesta o quitada. */
export function entradasConFuera(entries: readonly WorkoutEntryLog[], fuera: boolean): WorkoutEntryLog[] {
  return entries.map(e => ({ ...e, sets: e.sets.map(s => serieConFuera(s, fuera)) }));
}

/** El cambio que se escribe en el registro al marcar o desmarcar una sesión ya
 *  guardada (el coach desde el historial, o el atleta al corregirla). */
export function cambioDeFuera(log: Pick<WorkoutLog, 'entries'>, fuera: boolean): Pick<WorkoutLog, 'entries' | 'fuera'> {
  return { entries: entradasConFuera(log.entries, fuera), fuera };
}

/* ── El panel de la semana, en Rutinas ──────────────────────────────────────

   Dani (17-11, noche): el interruptor ya no se enciende solo porque el coach
   marcara la semana como viaje o vacaciones —«no, que lo pueda hacer él desde
   el panel de entrenamiento»—. El atleta, al final de Rutinas, marca qué
   sesiones de esta semana va a hacer fuera. Se guarda en su plan semanal
   (`PlanSemanal.sesionesFuera`, ids de asignación) y la sesión marcada
   arranca como «fuera». Desde el 18-11 el panel es lo único que manda (la
   sesión ya no tiene interruptor): si la desmarca, al volver a abrirla deja
   de serlo. Solo pregunta por la semana en curso, no por las siguientes. */

/** Lo que lee el atleta en el panel. */
export const TEXTO_PANEL_FUERA = {
  titulo: '¿Entrenas fuera esta semana?',
  ayuda: 'Esas sesiones cuentan, pero sus pesos no se comparan con los de tu gimnasio.',
} as const;

/** Las sesiones que salen en el panel: las pendientes de la semana natural
 *  que empieza el lunes `lunes`, por fecha. La semana natural y no la vuelta
 *  del ciclo porque es la clave del plan semanal (`{email}_{lunes}`). */
export function sesionesPendientesDeLaSemana<T extends Pick<WorkoutAssignment, 'id' | 'date' | 'status'>>(
  asignaciones: readonly T[], lunes: string,
): T[] {
  const domingo = addDays(lunes, 6);
  return asignaciones
    .filter(a => a.status === 'pending' && a.date >= lunes && a.date <= domingo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Marca o desmarca una sesión en la lista del panel. Lista nueva; sin repetidos. */
export function alternarSesionFuera(marcadas: readonly string[] | undefined, id: string): string[] {
  const lista = marcadas ?? [];
  return lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id];
}

/** ¿Arranca la sesión como «fuera»? Solo si el atleta tiene activado el
 *  ajuste en Mi gimnasio y la marcó en el panel de la semana. */
export function fueraAlAbrir(ajusteActivo: boolean, marcadaEnElPanel: boolean): boolean {
  return ajusteActivo && marcadaEnElPanel;
}

/* ── Lo que cuenta en una sesión fuera: el RIR ───────────────────────────── */

/** Margen con el que se da el RIR por cumplido: el RIR que se apunta uno mismo
 *  falla en torno a una repetición (Halperin 2022, ver rmValido.ts). */
export const MARGEN_RIR = 1;

/** ¿La serie se hizo al RIR pautado (± 1)? `pautado` como lo ve el atleta:
 *  '0'-'5' o 'fallo'. Sin pautado legible, se da por cumplida. */
export function cumpleElRir(s: Pick<WorkoutSetLog, 'rir' | 'alFallo'>, pautado: string | undefined): boolean {
  if (pautado === 'fallo') return !!s.alFallo || rirEfectivo(s.rir, s.alFallo) === 0;
  const objetivo = Number(pautado);
  if (pautado == null || pautado === '' || !Number.isFinite(objetivo)) return true;
  return Math.abs(rirEfectivo(s.rir, s.alFallo) - objetivo) <= MARGEN_RIR;
}

export interface RirCumplido { aTuRir: number; hechas: number; pautadas: number }

/** Cuántas series principales se hicieron al RIR pautado, de las hechas y de
 *  las pautadas. `principales` en orden de serie (sin bajadas ni miniseries),
 *  con `null` en las que no se hicieron: así cada una se mide con SU pautado. */
export function rirCumplido(
  principales: readonly (Pick<WorkoutSetLog, 'rir' | 'alFallo'> | null | undefined)[], pautados: readonly string[],
): RirCumplido {
  let aTuRir = 0;
  let hechas = 0;
  principales.forEach((s, i) => {
    if (!s) return;
    hechas++;
    if (cumpleElRir(s, pautados[i])) aTuRir++;
  });
  return { aTuRir, hechas, pautadas: Math.max(pautados.length, principales.length) };
}

/** Lo mismo con las filas de la tabla de la sesión (RIR como texto, '0'-'5' o
 *  'fallo'). Las bajadas y miniseries no cuentan; las filas sin hacer, tampoco. */
export function rirCumplidoDeFilas(
  filas: readonly { rir: string; done: boolean; segmento?: boolean }[], pautados: readonly string[],
): RirCumplido {
  return rirCumplido(
    filas.filter(f => !f.segmento).map(f => (f.done ? { rir: f.rir === 'fallo' ? 0 : Number(f.rir) || 0, alFallo: f.rir === 'fallo' } : null)),
    pautados,
  );
}

/** La frase de la tarjeta de cierre de un ejercicio hecho fuera: lo que se
 *  celebra es el RIR y las series, no los kilos. */
export function mensajeDeCierreFuera({ aTuRir, hechas, pautadas }: RirCumplido): string {
  if (hechas === 0) return 'Hoy entrenas fuera: aquí cuenta hacer las series a tu RIR, no los kilos.';
  const series = hechas >= pautadas ? `Las ${hechas} series hechas` : `${hechas} de ${pautadas} series hechas`;
  if (aTuRir === hechas) return `${series} y todas a tu RIR. Fuera de tu gimnasio es justo lo que cuenta.`;
  return `${series}, ${aTuRir} a tu RIR. Fuera de tu gimnasio los kilos dan igual: lo que cuenta es dejar las repeticiones que toca.`;
}

/** La pista que acompaña al peso vacío en una sesión fuera, con el rango y el
 *  RIR que ha pautado el coach. */
export function pistaDePesoFuera(reps: string | undefined, rir: number | string | undefined): string {
  const nums = (reps?.match(/\d+/g) ?? []).map(Number).filter(n => n > 0);
  const objetivo = rir === 'fallo' ? 'al fallo' : rir != null && rir !== '' ? `a RIR ${rir}` : null;
  if (nums.length === 0) {
    return objetivo ? `Elige un peso con el que llegues ${objetivo}.` : 'Elige un peso que te cueste de verdad.';
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const rango = min === max ? `${max}` : `${min}-${max}`;
  return `Elige un peso con el que hagas ${rango} repeticiones${objetivo ? ` ${objetivo}` : ''}.`;
}

/* ── Cuando cambia entre una apertura y otra ───────────────────────────── */

interface FilaCambiable { weight: string; repsDone: string; done: boolean; segmento?: boolean }

/**
 * Si la sesión se reabre con otro modo que el del borrador (el atleta la ha
 * marcado o desmarcado en el panel entre medias), las filas que siguen como
 * llegaron (sin hacer y sin tocar) pasan al prerrelleno del otro modo: con
 * «fuera», peso vacío y el objetivo del rango; sin él, lo de la última vez.
 * Lo que el atleta ya ha escrito o marcado no se toca. Devuelve el mismo
 * array si no cambia nada.
 */
export function cambiarPrerrelleno<T extends FilaCambiable>(
  filas: readonly T[][], desde: readonly FilaCambiable[][], hacia: readonly FilaCambiable[][],
): T[][] {
  let cambia = false;
  const out = filas.map((ex, exIdx) => {
    let cambiaEx = false;
    const nuevo = ex.map((f, sIdx) => {
      const a = desde[exIdx]?.[sIdx];
      const b = hacia[exIdx]?.[sIdx];
      if (!a || !b || f.done || f.segmento) return f;
      if (f.weight !== a.weight || f.repsDone !== a.repsDone) return f;
      if (f.weight === b.weight && f.repsDone === b.repsDone) return f;
      cambiaEx = true;
      return { ...f, weight: b.weight, repsDone: b.repsDone };
    });
    if (cambiaEx) cambia = true;
    return cambiaEx ? nuevo : ex;
  });
  return cambia ? out : (filas as T[][]);
}
