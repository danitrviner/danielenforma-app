/* ═══════════════════════════════════════════════════════════════════════════
   Códigos de barras de producto (D-04)

   El lector puede devolver un UPC-A de 12 dígitos donde Open Food Facts guarda
   el EAN-13 con un cero delante, y quien escribe a mano mete espacios o
   guiones. Aquí se limpia, se valida el dígito de control (un código mal leído
   casi nunca lo cumple) y se listan las formas con las que probar la búsqueda.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Solo los dígitos de lo que se haya escrito o leído. */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Dígito de control GS1 (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function esCodigoValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || ![8, 12, 13, 14].includes(codigo.length)) return false;
  const digitos = codigo.split('').map(Number);
  const control = digitos.pop() as number;
  // De derecha a izquierda, empezando por el que va junto al de control: pesos 3, 1, 3, 1…
  const suma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control;
}

/** El alimento con ese código entre una lista (los propios del atleta), probando las mismas variantes. */
export function encontrarPorCodigo<T extends { codigo?: string }>(alimentos: T[], codigo: string): T | undefined {
  const formas = variantesDeCodigo(codigo);
  return alimentos.find(a => a.codigo && formas.includes(soloDigitos(a.codigo)));
}

/** Formas con las que probar en la copia de Open Food Facts, sin repetir. */
export function variantesDeCodigo(codigo: string): string[] {
  const limpio = soloDigitos(codigo);
  const formas = [limpio];
  if (limpio.length < 13) formas.push(limpio.padStart(13, '0'));
  if (limpio.length === 14 && limpio.startsWith('0')) formas.push(limpio.slice(1));
  return Array.from(new Set(formas));
}
