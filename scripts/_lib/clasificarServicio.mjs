/** Copia de `clasificarNombre` de `src/features/crm/lib/catalogoServicios.ts`.
 *  Hay un test que comprueba que las dos dan lo mismo: si se toca una, la otra. */
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const TIPOS_DE_SERVICIO = ['trimestral', 'semestral', 'anual', 'otro'];

export function clasificarNombre(nombre) {
  const n = sinTildes(nombre);
  const encontrados = new Set();
  if (/\btrimest\w*|\b3\s*(meses|mes|m)\b|\b90\s*dias\b/.test(n)) encontrados.add('trimestral');
  if (/\bsemest\w*|\b6\s*(meses|mes|m)\b|\b180\s*dias\b|\b26\s*semanas\b/.test(n)) encontrados.add('semestral');
  if (/\banual\w*|\b1\s*ano\b|\bun\s*ano\b|\b12\s*(meses|mes|m)\b|\b365\s*dias\b|\b52\s*semanas\b/.test(n)) encontrados.add('anual');
  if (encontrados.size === 1) return { tipo: [...encontrados][0], confianza: 'segura' };
  return { tipo: 'otro', confianza: 'dudosa' };
}

export { sinTildes };
