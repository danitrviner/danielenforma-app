// ID estable de una máquina del catálogo.
//
// A diferencia de los IDs de `Exercise` (autogenerados por addDoc de Firestore,
// irreproducibles entre entornos), el de una máquina se deriva de sus datos: el
// mismo importador ejecutado dos veces produce exactamente los mismos IDs, y una
// reimportación actualiza en vez de duplicar. Es lo que hace posible la futura
// relación máquina→ejercicio y cualquier migración.
//
// Compartido a propósito entre la app (el admin crea máquinas a mano) y el
// importador de scripts/machines/ — una sola definición, nunca dos que deriven.

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function maquinaId(marca: string, familia: string, nombreOriginal: string): string {
  return [slugify(marca), slugify(familia), slugify(nombreOriginal)]
    .filter(Boolean)
    .join('-');
}
