/* ═══════════════════════════════════════════════════════════════════════════
   Por qué no hizo un ejercicio.

   Cuando la sesión se corta, el registro solo dice cuántos ejercicios hizo.
   El coach ve «4 de 6» y no tiene forma de saber si el atleta se cansó, si le
   molestaba el hombro o si la máquina estaba ocupada — que son tres
   decisiones distintas la semana siguiente.

   Se guarda como la nota del ejercicio (`WorkoutEntryLog.note`), que ya
   existía: no hace falta campo nuevo ni migración, y el coach ya la lee donde
   lee las demás notas.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Los motivos de verdad, por lo que pasa en un gimnasio. `otro` deja escribir. */
export const MOTIVOS_SALTAR = [
  { clave: 'ocupada', etiqueta: 'Máquina ocupada' },
  { clave: 'molestia', etiqueta: 'Me molestaba' },
  { clave: 'tiempo', etiqueta: 'Sin tiempo' },
  { clave: 'cansado', etiqueta: 'No me quedaba' },
] as const;

export type ClaveMotivo = typeof MOTIVOS_SALTAR[number]['clave'];

/** Marca que se usa para reconocer una nota puesta por este botón. */
export const PREFIJO_SALTADO = 'No lo hice:';

export function textoDeMotivo(clave: ClaveMotivo): string {
  const m = MOTIVOS_SALTAR.find(x => x.clave === clave);
  return `${PREFIJO_SALTADO} ${(m?.etiqueta ?? 'sin motivo').toLowerCase()}`;
}

/** ¿Esta nota la escribió el botón de saltar? Sirve para pintarla distinta. */
export function esNotaDeSaltado(nota: string | undefined): boolean {
  return (nota ?? '').trimStart().startsWith(PREFIJO_SALTADO);
}

/** Lo que el atleta escribió a mano, sin la línea del motivo. */
export function sinMotivo(notaActual: string): string {
  return notaActual
    .split('\n')
    .filter(l => !esNotaDeSaltado(l))
    .join('\n')
    .trim();
}

/** El motivo marcado ahora mismo en la nota, si hay alguno. */
export function motivoDeLaNota(nota: string): ClaveMotivo | null {
  for (const m of MOTIVOS_SALTAR) if (nota.includes(textoDeMotivo(m.clave))) return m.clave;
  return null;
}

/**
 * Pone el motivo delante de lo que el atleta ya hubiera escrito, sin pisarlo.
 * Tocar el mismo motivo otra vez lo quita: si acaba haciendo el ejercicio, la
 * nota no puede quedarse diciendo que no lo hizo.
 */
export function conMotivo(notaActual: string, clave: ClaveMotivo): string {
  const resto = sinMotivo(notaActual);
  if (motivoDeLaNota(notaActual) === clave) return resto;
  const motivo = textoDeMotivo(clave);
  return resto ? `${motivo}\n${resto}` : motivo;
}
