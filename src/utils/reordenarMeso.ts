import type { Mesocycle, RepartoPropio } from '../types.js';
import { huellaDeReparto, repartoDelMesociclo, type Reordenacion } from './trainingSplits.js';
import { cicloDiasDeMeso, offsetsDelMesociclo } from './asignacionMesociclo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Reordenar los días del ciclo SIN perder lo que ya está hecho

   Todo lo que cuelga de un mesociclo se apunta por ÍNDICE de sesión: la
   distribución (`distribution.days[i]`), los nombres puestos a mano
   (`nombresSesion[i]`), el entreno prediseñado (`days[i]`), los ejercicios
   clave (`d<i>::<exerciseId>`) y las rutinas del atleta (`Workout.dayIndex`).
   Si el coach pasa de Push-Pull-Legs a Legs-Pull-Push, cada una de esas cosas
   tiene que viajar con su día; si no, el lunes seguiría siendo «Push» con los
   ejercicios de pierna dentro.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * El reparto que un mesociclo SIN reparto ya sigue de hecho: sus días del
 * calendario (tocado a mano o automático), con el nombre de cada sesión y los
 * grupos que le puso la distribución. `null` si ya tiene reparto.
 *
 * Muchos bloques reales no tienen ninguno de la lista porque se tocó el
 * calendario; sin esto no se podían reordenar ni compararse en la calculadora.
 */
export function repartoImplicito(meso: Mesocycle): RepartoPropio | null {
  if (repartoDelMesociclo(meso) || meso.daysPerWeek <= 0) return null;
  const cicloDias = cicloDiasDeMeso(meso);
  const offsets = offsetsDelMesociclo(meso);
  const dist = meso.distribution && meso.distribution.days.length === meso.daysPerWeek ? meso.distribution : undefined;
  const dias: RepartoPropio['dias'] = Array.from({ length: cicloDias }, () => null);
  offsets.forEach((o, k) => {
    if (o < 0 || o >= cicloDias) return;
    dias[o] = {
      tipo: meso.nombresSesion?.[k]?.trim() || dist?.days[k]?.dayType || `Sesión ${k + 1}`,
      grupos: dist ? dist.days[k].assignments.map(a => a.group) : [],
    };
  });
  return dias.some(Boolean) ? { nombre: 'Reparto del calendario', dias } : null;
}

/** Lista indexada por sesión, en el orden nuevo. Si su longitud no cuadra, no se toca. */
export function permutarPorSesion<T>(lista: T[] | undefined, sesionAnterior: number[]): T[] | undefined {
  if (!lista || lista.length !== sesionAnterior.length) return lista;
  return sesionAnterior.map(o => lista[o]);
}

/** Índice de sesión NUEVO de cada sesión vieja. */
export function nuevoIndiceDeSesion(sesionAnterior: number[]): Map<number, number> {
  return new Map(sesionAnterior.map((viejo, nuevo) => [viejo, nuevo]));
}

/** `d<i>::<id>` con el índice de sesión ya movido; las claves por nombre (`n:`) no dependen del orden. */
export function moverClavesDeEjercicio(claves: string[] | undefined, sesionAnterior: number[]): string[] | undefined {
  if (!claves) return claves;
  const nuevo = nuevoIndiceDeSesion(sesionAnterior);
  return claves.map(c => {
    const m = /^d(\d+)::(.*)$/.exec(c);
    if (!m) return c;
    const n = nuevo.get(Number(m[1]));
    return n === undefined ? c : `d${n}::${m[2]}`;
  });
}

/** Lo que un reparto propio fija del calendario: cuántas sesiones y cuánto dura el ciclo. */
export function camposDeCalendario(reparto: RepartoPropio): Pick<Mesocycle, 'daysPerWeek' | 'cycleDays' | 'customOffsets' | 'splitId'> {
  const dias = reparto.dias.length;
  return {
    daysPerWeek: reparto.dias.filter(Boolean).length,
    // Semanal = sin `cycleDays`, como al elegir un reparto semanal de la lista.
    cycleDays: dias === 7 ? undefined : dias,
    // El reparto trae sus propios días: pisa cualquier patrón tocado a mano.
    customOffsets: undefined,
    // Ya no es ninguno de la lista (el de partida queda en `reparto.basadoEn`).
    splitId: undefined,
  };
}

/**
 * El mesociclo con el reparto reordenado y todo lo indexado por sesión movido
 * con su día. No toca Firestore: las rutinas (`Workout.dayIndex`) las mueve
 * quien llama, con `nuevoIndiceDeSesion`.
 */
export function aplicarReordenacionAlMeso(meso: Mesocycle, r: Reordenacion): Mesocycle {
  const perm = r.sesionAnterior;
  const siguiente: Mesocycle = {
    ...meso,
    ...camposDeCalendario(r.reparto),
    reparto: r.reparto,
    nombresSesion: meso.nombresSesion
      ? perm.map(o => meso.nombresSesion?.[o] ?? '')
      : undefined,
    days: permutarPorSesion(meso.days, perm),
    ejerciciosClave: moverClavesDeEjercicio(meso.ejerciciosClave, perm),
  };
  if (meso.distribution) {
    const resuelto = repartoDelMesociclo(siguiente);
    siguiente.distribution = {
      ...meso.distribution,
      days: permutarPorSesion(meso.distribution.days, perm) ?? meso.distribution.days,
      // La foto se pone al día: los grupos no han cambiado, solo el orden, así
      // que la distribución sigue valiendo (ver `isStale`).
      snapshot: {
        ...meso.distribution.snapshot,
        daysPerWeek: siguiente.daysPerWeek,
        cycleDays: siguiente.cycleDays,
        splitId: undefined,
        customOffsets: undefined,
        reparto: resuelto ? huellaDeReparto(resuelto) : undefined,
      },
    };
  }
  return siguiente;
}

/* ── Cambiar la duración del ciclo de un reparto propio ───────────────────── */

/**
 * El reparto con `dias` días, añadiendo o quitando DESCANSOS al final. `null`
 * si no se puede sin cortar una sesión: en ese caso el ciclo nuevo no es este
 * reparto y quien llama decide (normalmente, soltarlo).
 */
export function ajustarDiasDelReparto(reparto: RepartoPropio, dias: number): RepartoPropio | null {
  const actual = reparto.dias.length;
  if (dias === actual) return reparto;
  if (dias > actual) return { ...reparto, dias: [...reparto.dias, ...Array<null>(dias - actual).fill(null)] };
  if (reparto.dias.slice(dias).some(Boolean)) return null;
  return { ...reparto, dias: reparto.dias.slice(0, dias) };
}

/** Quita el descanso del día `i` (acorta el ciclo un día). Si `i` es una sesión, no hace nada. */
export function quitarDescanso(reparto: RepartoPropio, i: number): RepartoPropio {
  if (reparto.dias[i] !== null || reparto.dias.filter(Boolean).length === reparto.dias.length) return reparto;
  return { ...reparto, dias: reparto.dias.filter((_, k) => k !== i) };
}

/** Una reordenación que no mueve ninguna sesión de sitio relativo (solo descansos). */
export function sinMoverSesiones(reparto: RepartoPropio): Reordenacion {
  const n = reparto.dias.filter(Boolean).length;
  return { reparto, sesionAnterior: Array.from({ length: n }, (_, i) => i) };
}
