import { WorkoutExercise, WeeklyProgressionRule, CambiosDeSemana, WorkoutSetGroup } from '../types';
import { resolveExerciseForWeek, resolverEjercicioDelMeso } from './progression';
import { TECHNIQUE_LABEL } from './workoutTechniques';

/* Programar un mesociclo semana a semana (barra de semanas de Mesociclo ›
   Ejercicios). Los cambios viven en el propio ejercicio, como reglas de
   `weeklyProgression` con `cambios`, así que la sesión del atleta, el
   calendario y los informes los leen con la misma `resolveExerciseForWeek` de
   siempre. Aquí solo está lo que decide QUÉ se escribe y cómo se cuenta. */

const CAMPOS: (keyof CambiosDeSemana)[] = [
  'exerciseId', 'muscleGroup', 'sets', 'reps', 'rir', 'restSeconds', 'setGroups',
  'technique', 'notes', 'warmupMode', 'manualWarmupSets', 'recordVideoSet',
];

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const esDeLaBarra = (r: WeeklyProgressionRule, semana: number, solo: boolean) =>
  !!r.cambios && r.atWeek === semana && !!r.soloEstaSemana === solo;

/** El ejercicio en `semana` SIN la regla de la barra que se está editando:
 *  es contra lo que se compara para saber qué ha cambiado de verdad. */
function resueltoSin(we: WorkoutExercise, semana: number, solo: boolean): WorkoutExercise {
  const otras = (we.weeklyProgression ?? []).filter(r => !esDeLaBarra(r, semana, solo));
  return resolveExerciseForWeek({ ...we, weeklyProgression: otras }, semana);
}

/**
 * Nuevas reglas del ejercicio tras editarlo en la semana `semana`.
 * `editado` es el ejercicio tal y como queda en esa semana después del
 * cambio. Solo se guarda lo que difiere de lo que ya tocaba esa semana; si al
 * final no queda nada distinto, la regla desaparece.
 */
export function programarCambio(
  we: WorkoutExercise, semana: number, solo: boolean, editado: WorkoutExercise,
): WeeklyProgressionRule[] | undefined {
  const base = resueltoSin(we, semana, solo);
  const cambios: CambiosDeSemana = {};
  const c = cambios as Record<string, unknown>;
  for (const k of CAMPOS) {
    const nuevo = (editado as unknown as Record<string, unknown>)[k];
    if (igual(nuevo, (base as unknown as Record<string, unknown>)[k])) continue;
    c[k] = nuevo === undefined ? null : nuevo;
  }
  // Con bloques, series/reps/RIR son el agregado de los bloques: guardarlos
  // aparte solo duplicaría el dato.
  if (Array.isArray(c.setGroups) || (editado.setGroups?.length ?? 0) > 0) {
    delete c.sets; delete c.reps; delete c.rir;
  }
  const resto = (we.weeklyProgression ?? []).filter(r => !esDeLaBarra(r, semana, solo));
  const reglas = Object.keys(cambios).length > 0
    ? [...resto, { atWeek: semana, cambios, ...(solo ? { soloEstaSemana: true } : {}) }]
    : resto;
  reglas.sort((a, b) => a.atWeek - b.atWeek);
  return reglas.length > 0 ? reglas : undefined;
}

/** Quita lo programado desde la barra en `semana` (los escalones clásicos
 *  del chip «Progresión» no se tocan). */
export function quitarCambiosDeSemana(we: WorkoutExercise, semana: number): WeeklyProgressionRule[] | undefined {
  const reglas = (we.weeklyProgression ?? []).filter(r => !(r.cambios && r.atWeek === semana));
  return reglas.length > 0 ? reglas : undefined;
}

export function tieneCambiosEn(we: WorkoutExercise, semana: number): boolean {
  return (we.weeklyProgression ?? []).some(r => r.cambios && r.atWeek === semana);
}

/** Semanas en las que empieza algún cambio de la barra, de un ejercicio. */
export function semanasConCambios(we: WorkoutExercise): number[] {
  return [...new Set((we.weeklyProgression ?? []).filter(r => r.cambios).map(r => r.atWeek))];
}

/** Desde qué semana viene cada campo que difiere de la base, para marcarlo. */
export function origenDeCambios(we: WorkoutExercise, semana: number): Partial<Record<keyof CambiosDeSemana, string>> {
  const out: Partial<Record<keyof CambiosDeSemana, string>> = {};
  const reglas = (we.weeklyProgression ?? [])
    .filter(r => r.cambios && r.atWeek <= semana && (!r.soloEstaSemana || r.atWeek === semana))
    .sort((a, b) => a.atWeek - b.atWeek || Number(!!a.soloEstaSemana) - Number(!!b.soloEstaSemana));
  for (const r of reglas) {
    for (const k of Object.keys(r.cambios!) as (keyof CambiosDeSemana)[]) {
      out[k] = r.soloEstaSemana ? `solo S${r.atWeek}` : `S${r.atWeek}`;
    }
  }
  return out;
}

// ── Contar ──────────────────────────────────────────────────────────────────

export function seriesDe(we: WorkoutExercise): number {
  return we.setGroups && we.setGroups.length > 0 ? we.setGroups.reduce((s, g) => s + Math.max(1, g.sets || 1), 0) : we.sets;
}

// ── Describir ───────────────────────────────────────────────────────────────

const fmtDescanso = (s: number) => s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function describirBloques(gs: WorkoutSetGroup[]): string {
  return gs.map(g => `${g.label ? g.label + ' ' : ''}${g.sets}×${g.reps}`).join(' + ');
}

/**
 * Qué cambia de `antes` a `despues`, en frases cortas para personas
 * ("3 → 4 series", "pasa a Top set 1×6-8 + Back-off 3×12-15"). Lo usan las
 * novedades del atleta, «Comparar semanas» y la lista de lo programado.
 */
export function diferencias(
  antes: WorkoutExercise, despues: WorkoutExercise, nombreDe: (id: string) => string,
): string[] {
  const out: string[] = [];
  if (antes.exerciseId !== despues.exerciseId) out.push(`cambia a ${nombreDe(despues.exerciseId)}`);
  const bA = antes.setGroups?.length ? antes.setGroups : null;
  const bD = despues.setGroups?.length ? despues.setGroups : null;
  if (bA || bD) {
    if (!igual(bA, bD)) out.push(bD ? `${describirBloques(bD)}` : `vuelve a ${despues.sets}×${despues.reps}`);
  } else {
    if (antes.sets !== despues.sets) out.push(`${antes.sets} → ${despues.sets} series`);
    if (antes.reps !== despues.reps) out.push(`reps ${antes.reps} → ${despues.reps}`);
    if (antes.rir !== despues.rir) out.push(`RIR ${antes.rir} → ${despues.rir}`);
  }
  if (antes.restSeconds !== despues.restSeconds) out.push(`descanso ${fmtDescanso(antes.restSeconds)} → ${fmtDescanso(despues.restSeconds)}`);
  if (antes.technique !== despues.technique) {
    out.push(despues.technique ? `técnica: ${TECHNIQUE_LABEL[despues.technique]}` : 'sin técnica especial');
  }
  if ((antes.notes ?? '') !== (despues.notes ?? '') && despues.notes?.trim()) out.push(`nota: «${despues.notes.trim()}»`);
  return out;
}

export interface EjercicioDelDia { we: WorkoutExercise; dia: string }

export interface Novedad { dia: string; ejercicio: string; cambios: string[] }

/** Lo que cambia de la semana `a` a la `b` en todos los ejercicios, sin
 *  contar la descarga (esa se avisa aparte, una vez, no ejercicio a ejercicio). */
export function compararSemanas(
  ejercicios: EjercicioDelDia[], a: number, b: number, nombreDe: (id: string) => string,
): Novedad[] {
  const out: Novedad[] = [];
  for (const { we, dia } of ejercicios) {
    const antes = resolveExerciseForWeek(we, a);
    const despues = resolveExerciseForWeek(we, b);
    const cambios = diferencias(antes, despues, nombreDe);
    if (cambios.length > 0) out.push({ dia, ejercicio: nombreDe(antes.exerciseId), cambios });
  }
  return out;
}

export interface NovedadesDeSemana {
  descarga: boolean;
  /** true si la semana anterior era de descarga y esta no. */
  vuelveElVolumen: boolean;
  cambios: Novedad[];
}

/** Novedades para el atleta al empezar la semana de ciclo `semana`. */
export function novedadesDeSemana(
  ejercicios: EjercicioDelDia[], meso: { semanasDescarga?: number[] }, semana: number, nombreDe: (id: string) => string,
): NovedadesDeSemana {
  const descargas = meso.semanasDescarga ?? [];
  return {
    descarga: descargas.includes(semana),
    vuelveElVolumen: semana > 1 && descargas.includes(semana - 1) && !descargas.includes(semana),
    cambios: semana > 1 ? compararSemanas(ejercicios, semana - 1, semana, nombreDe) : [],
  };
}

export function hayNovedades(n: NovedadesDeSemana): boolean {
  return n.descarga || n.vuelveElVolumen || n.cambios.length > 0;
}

/** Series totales de la semana (lo que se hace de verdad, descarga incluida). */
export function seriesDeLaSemana(ejercicios: EjercicioDelDia[], meso: { semanasDescarga?: number[] }, semana: number): number {
  return ejercicios.reduce((s, { we }) => s + seriesDe(semana === 0 ? we : resolverEjercicioDelMeso(we, meso, semana)), 0);
}
