/** Lo que una columna ordenable devuelve para comparar. */
export type ValorOrdenable = string | number | null | undefined;
export type Direccion = 'asc' | 'desc';

const falta = (v: ValorOrdenable): boolean => v === null || v === undefined || v === '';

/**
 * Ordena una copia de `filas` por lo que devuelva `valor`.
 *
 * Dos reglas que no son cosméticas:
 *
 * 1. Las filas SIN dato caen siempre al final, suba o baje el orden. Tratar
 *    `undefined` como el valor más bajo pondría los pagos sin fecha de cobro
 *    los primeros al ordenar ascendente, como si fueran los más antiguos.
 * 2. Los números se restan y el resto se compara con `localeCompare` en
 *    español. Comparar céntimos como texto deja 1000 antes que 900.
 *
 * Las fechas se pasan en ISO 'YYYY-MM-DD', que ordena bien como texto.
 */
export function ordenarFilas<T>(
  filas: T[],
  valor: (fila: T) => ValorOrdenable,
  dir: Direccion,
): T[] {
  const signo = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (falta(va) || falta(vb)) return falta(va) && falta(vb) ? 0 : falta(va) ? 1 : -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo;
    return String(va).localeCompare(String(vb), 'es') * signo;
  });
}
