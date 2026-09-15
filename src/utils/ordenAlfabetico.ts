/* Orden alfabético de personas, en español.
 *
 * `localeCompare` con la configuración adecuada resuelve de una vez lo que la
 * auditoría (§3.2) pedía comprobar por separado:
 *
 *  · MAYÚSCULAS: `sensitivity:'base'` hace que «álvaro» y «Álvaro» empaten.
 *  · TILDES: en español la tilde NO cambia el orden — «Álvaro» va entre «Alba»
 *    y «Ana», no al final de la lista. Comparar por código de carácter lo
 *    mandaba detrás de la Z, porque 'Á' es U+00C1.
 *  · NOMBRES COMPUESTOS: `ignorePunctuation` evita que «Ana-María» y
 *    «Ana María» caigan en sitios distintos.
 *  · NÚMEROS: `numeric` ordena «Cliente 2» antes que «Cliente 10».
 *
 * Los VACÍOS van al final: un atleta sin nombre visible arriba del todo es lo
 * primero que ve el coach cada mañana, y no le dice nada.
 */
const comparador = new Intl.Collator('es', {
  sensitivity: 'base',
  ignorePunctuation: true,
  numeric: true,
});

export function compararNombres(a: string | null | undefined, b: string | null | undefined): number {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return comparador.compare(x, y);
}

/** Ordena una lista por el nombre que devuelva `nombreDe`, sin mutar la original. */
export function porNombre<T>(lista: readonly T[], nombreDe: (item: T) => string | null | undefined): T[] {
  return [...lista].sort((a, b) => compararNombres(nombreDe(a), nombreDe(b)));
}
