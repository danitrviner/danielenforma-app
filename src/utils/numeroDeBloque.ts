/**
 * El número que le toca al siguiente bloque de un atleta: el más alto que
 * tenga + 1.
 *
 * `mesocycles.length + 1` repetía número en cuanto se borraba un bloque que no
 * fuera el último: con los #1, #2 y #3, borrar el #2 y crear otro daba un
 * segundo #3. Y el número no es decorativo: es lo que ordena el historial y lo
 * que decide cuál es «el bloque anterior» para el sugeridor de volumen
 * (`buildVolumeHistoryFrom`), que con dos #3 coge uno al azar. El asistente ya
 * lo calculaba así desde el 26-10-2026 (B14); desde el 17-11 lo usan también
 * «Nuevo mesociclo» y «Aplicar plantilla» del editor.
 */
export function siguienteNumeroDeBloque(mesocycles: readonly { number?: number }[]): number {
  const numeros = mesocycles.map(m => m.number).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return Math.max(0, ...numeros) + 1;
}
