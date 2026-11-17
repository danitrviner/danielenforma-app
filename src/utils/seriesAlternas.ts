import type { Exercise, MuscleGroup } from '../types.js';
import { tipoDeEjercicio } from './seleccionEjercicios.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Series alternas (P4, 11-11-2026) — las REGLAS. La pantalla del coach es
   mesociclo/AvisoDeAlternas.tsx y la del atleta training/ParejaAlternaCard.tsx.

   Alternar dos ejercicios que no compiten deja que un músculo descanse
   mientras trabaja el otro: la sesión se acorta sin recortar el descanso real
   de cada uno. La doctrina (§9) ya lo pide cuando el plan no cabe en el tiempo
   del atleta, pero la app no tenía cómo proponerlo.

   No vale cualquier pareja. Dos ejercicios compiten si:
     · comparten algún músculo, principal o secundario (espalda + bíceps:
       los flexores del codo ya vienen cargados del remo);
     · los dos tiran del agarre;
     · los dos son multiarticulares libres de pierna o de espalda baja
       (sentadilla + peso muerto rumano: el cansancio general limita antes).
   Y lo prioritario no se toca: los primeros ejercicios de la sesión se hacen
   solos, con su descanso entero.
   ═══════════════════════════════════════════════════════════════════════════ */

type Ej = Pick<Exercise, 'muscleGroup' | 'secondaryMuscleGroups' | 'guiado' | 'equipment'>;

const AGARRE: MuscleGroup[] = ['dorsal', 'trapecio', 'biceps', 'antebrazo', 'deltoide_post'];
const CARGA_GENERAL: MuscleGroup[] = ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'lumbares'];

const musculosDe = (e: Ej): MuscleGroup[] => [...(e.muscleGroup ? [e.muscleGroup] : []), ...(e.secondaryMuscleGroups ?? [])];
const cargaGeneral = (e: Ej) => tipoDeEjercicio(e) === 'libre' && !!e.muscleGroup && CARGA_GENERAL.includes(e.muscleGroup);

/** ¿Hacer uno perjudica al otro? Sin grupo muscular no se sabe: se asume que sí. */
export function compiten(a: Ej, b: Ej): boolean {
  if (!a.muscleGroup || !b.muscleGroup) return true;
  const ma = musculosDe(a);
  const mb = musculosDe(b);
  if (ma.some(m => mb.includes(m))) return true;
  if (AGARRE.includes(a.muscleGroup) && AGARRE.includes(b.muscleGroup)) return true;
  if (cargaGeneral(a) && cargaGeneral(b)) return true;
  return false;
}

/** Lo que dura una serie, igual que en el tiempo estimado de sesión. */
const SEGUNDOS_POR_SERIE = 45;
/** Pausa mínima entre un ejercicio y el otro: cambiar de sitio y respirar. */
const PAUSA_MINIMA = 15;

/**
 * Segundos que ahorra CADA vuelta (una serie de cada uno) al alternarlos, sin
 * que ninguno descanse menos de lo que tiene pautado: entre dos series del
 * mismo ejercicio pasan dos pausas y la serie del otro.
 */
export function ahorroPorVuelta(descansoA: number, descansoB: number): number {
  return Math.max(0, descansoA + descansoB - 2 * pausaEntreTurnos(descansoA, descansoB));
}

/**
 * Segundos de pausa entre la serie de un ejercicio y la del otro. Sale de que
 * el que más descanso pide lo siga teniendo entero: dos pausas más la serie
 * del compañero.
 */
export function pausaEntreTurnos(descansoA: number, descansoB: number): number {
  return Math.max(PAUSA_MINIMA, Math.ceil((Math.max(descansoA, descansoB) - SEGUNDOS_POR_SERIE) / 2));
}

export interface EjercicioDeSesion extends Ej {
  sets: number;
  restSeconds: number;
  /** No se alterna: lleva bajadas o miniseries, que se hacen seguidas. */
  fijo?: boolean;
}

export interface ParejaAlterna {
  /** Índices dentro de la sesión, en su orden. */
  a: number;
  b: number;
  /** Segundos que ahorra la pareja entera. */
  ahorroSeg: number;
}

/** Cuántos ejercicios del principio se dejan solos: son los prioritarios. */
export const PRIORITARIOS_SIN_ALTERNAR = 2;

/**
 * Parejas que se podrían alternar en una sesión, de la que más ahorra a la que
 * menos. Cada ejercicio entra en una sola pareja; los primeros no entran.
 */
export function parejasPosibles(sesion: readonly EjercicioDeSesion[]): ParejaAlterna[] {
  const candidatas: ParejaAlterna[] = [];
  for (let a = PRIORITARIOS_SIN_ALTERNAR; a < sesion.length; a++) {
    for (let b = a + 1; b < sesion.length; b++) {
      if (sesion[a].fijo || sesion[b].fijo) continue;
      if (compiten(sesion[a], sesion[b])) continue;
      const vueltas = Math.min(sesion[a].sets, sesion[b].sets);
      const ahorroSeg = vueltas * ahorroPorVuelta(sesion[a].restSeconds, sesion[b].restSeconds);
      if (ahorroSeg > 0) candidatas.push({ a, b, ahorroSeg });
    }
  }
  // La que más ahorra primero; a igualdad, la de ejercicios más cercanos (menos paseos).
  candidatas.sort((x, y) => y.ahorroSeg - x.ahorroSeg || (x.b - x.a) - (y.b - y.a) || x.a - y.a);
  const usados = new Set<number>();
  const elegidas: ParejaAlterna[] = [];
  for (const p of candidatas) {
    if (usados.has(p.a) || usados.has(p.b)) continue;
    usados.add(p.a); usados.add(p.b);
    elegidas.push(p);
  }
  return elegidas;
}

/** Duración estimada de la sesión en segundos, sin alternar nada. */
export function duracionEstimada(sesion: readonly EjercicioDeSesion[]): number {
  return sesion.reduce((s, e) => s + Math.max(0, e.sets) * (SEGUNDOS_POR_SERIE + Math.max(0, e.restSeconds)), 0);
}

/**
 * Las parejas justas para que la sesión quepa en el tiempo del atleta. Si ya
 * cabe, ninguna: alternar tiene un coste (se percibe más dura) y no se propone
 * por sistema. `cabe` dice si con ellas se llega.
 */
export function proponerAlternas(sesion: readonly EjercicioDeSesion[], minutosDisponibles: number, yaAhorradoSeg = 0): { parejas: ParejaAlterna[]; cabe: boolean; sobranSeg: number } {
  let sobran = duracionEstimada(sesion) - yaAhorradoSeg - minutosDisponibles * 60;
  const parejas: ParejaAlterna[] = [];
  for (const p of parejasPosibles(sesion)) {
    if (sobran <= 0) break;
    parejas.push(p);
    sobran -= p.ahorroSeg;
  }
  return { parejas, cabe: sobran <= 0, sobranSeg: Math.max(0, sobran) };
}

// ── Parejas ya pautadas ─────────────────────────────────────────────────────
// La pareja se guarda en los dos ejercicios con la misma clave
// (`WorkoutExercise.alterna`). Una clave que no esté exactamente en dos
// ejercicios no es una pareja (se borró el compañero): se ignora.

type ConClave = { alterna?: string };

/** Parejas pautadas en una sesión: índices [a, b] con a < b, por orden de a. */
export function parejasPautadas(ejercicios: readonly ConClave[]): [number, number][] {
  const porClave = new Map<string, number[]>();
  ejercicios.forEach((e, i) => {
    if (!e.alterna) return;
    porClave.set(e.alterna, [...(porClave.get(e.alterna) ?? []), i]);
  });
  return [...porClave.values()]
    .filter(idx => idx.length === 2)
    .map(([a, b]): [number, number] => [a, b])
    .sort((x, y) => x[0] - y[0]);
}

/**
 * Las páginas del reproductor: cada ejercicio va solo salvo las parejas, que
 * comparten página en el sitio del primero de los dos.
 */
export function paginasDeSesion(ejercicios: readonly ConClave[], sePuede: (i: number) => boolean = () => true): number[][] {
  const parejas = parejasPautadas(ejercicios).filter(([a, b]) => sePuede(a) && sePuede(b));
  const companero = new Map<number, number>(parejas.map(([a, b]) => [a, b]));
  const segundos = new Set(parejas.map(([, b]) => b));
  const paginas: number[][] = [];
  ejercicios.forEach((_, i) => {
    if (segundos.has(i)) return;
    const b = companero.get(i);
    paginas.push(b == null ? [i] : [i, b]);
  });
  return paginas;
}

export interface Turno {
  /** 0 = el primero de la pareja, 1 = el segundo. */
  ej: 0 | 1;
  /** Serie de ese ejercicio, desde 0. */
  serie: number;
}

/** A1, B1, A2, B2… y, si uno lleva más series, las que sobran al final. */
export function turnosDePareja(seriesA: number, seriesB: number): Turno[] {
  const turnos: Turno[] = [];
  for (let s = 0; s < Math.max(seriesA, seriesB); s++) {
    if (s < seriesA) turnos.push({ ej: 0, serie: s });
    if (s < seriesB) turnos.push({ ej: 1, serie: s });
  }
  return turnos;
}

/** El turno que toca: el primero sin hacer. `null` = la pareja está terminada. */
export function siguienteTurno(hechasA: readonly boolean[], hechasB: readonly boolean[]): Turno | null {
  return turnosDePareja(hechasA.length, hechasB.length).find(t => !(t.ej === 0 ? hechasA : hechasB)[t.serie]) ?? null;
}

/**
 * Lo que se descansa tras marcar una serie de la pareja: la pausa corta si
 * ahora toca el otro ejercicio; el descanso entero si se repite el mismo (al
 * otro ya no le quedan series) o si la pareja ha terminado. `hechas*` ya
 * llevan marcada la serie recién hecha.
 */
export function descansoTrasTurno(
  lado: 0 | 1, hechasA: readonly boolean[], hechasB: readonly boolean[], descansoA: number, descansoB: number,
): number {
  const propio = lado === 0 ? descansoA : descansoB;
  const toca = siguienteTurno(hechasA, hechasB);
  return toca && toca.ej !== lado ? pausaEntreTurnos(descansoA, descansoB) : propio;
}

/** Segundos que ahorran las parejas ya pautadas de una sesión. */
export function ahorroPautado(ejercicios: readonly (ConClave & { sets: number; restSeconds: number })[]): number {
  return parejasPautadas(ejercicios).reduce((s, [a, b]) => (
    s + Math.min(ejercicios[a].sets, ejercicios[b].sets) * ahorroPorVuelta(ejercicios[a].restSeconds ?? 0, ejercicios[b].restSeconds ?? 0)
  ), 0);
}

/**
 * Pauta las parejas: les pone clave y sube el segundo justo detrás del primero
 * (se hacen en la misma máquina de al lado, no con tres ejercicios en medio).
 * No renumera `order`: eso es cosa de quien guarda.
 */
export function alternar<T extends ConClave>(ejercicios: readonly T[], parejas: readonly { a: number; b: number }[]): T[] {
  const usadas = new Set(ejercicios.map(e => e.alterna).filter(Boolean));
  const companero = new Map<number, number>();
  const clave = new Map<number, string>();
  let n = 1;
  for (const { a, b } of parejas) {
    if (ejercicios[a]?.alterna || ejercicios[b]?.alterna || !ejercicios[a] || !ejercicios[b] || a === b) continue;
    while (usadas.has(`p${n}`)) n++;
    usadas.add(`p${n}`);
    const [primero, segundo] = a < b ? [a, b] : [b, a];
    companero.set(primero, segundo);
    clave.set(primero, `p${n}`); clave.set(segundo, `p${n}`);
  }
  const segundos = new Set(companero.values());
  const salida: T[] = [];
  ejercicios.forEach((e, i) => {
    if (segundos.has(i)) return;
    salida.push(clave.has(i) ? { ...e, alterna: clave.get(i) } : e);
    const b = companero.get(i);
    if (b != null) salida.push({ ...ejercicios[b], alterna: clave.get(b) });
  });
  return salida;
}

/** Quita las parejas de la sesión, o solo la de `clave` (el orden se queda como está). */
export function quitarAlternas<T extends ConClave>(ejercicios: readonly T[], clave?: string): T[] {
  return ejercicios.map(e => {
    if (!e.alterna || (clave != null && e.alterna !== clave)) return e;
    const { alterna: _fuera, ...resto } = e;
    return resto as T;
  });
}
