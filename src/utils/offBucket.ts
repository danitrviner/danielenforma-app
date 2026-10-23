/** Trozo (0-999) donde vive un código en `public/off/p/`. FNV-1a de 32 bits con mezclado final.
 *  Idéntico a `scripts/_lib/offBucket.mjs` (hay un test que lo comprueba): si
 *  divergen, el escáner no encuentra nada. */
export const NUM_TROZOS = 1000;
export function trozoDeCodigo(codigo: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < codigo.length; i++) {
    h ^= codigo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Mezclado final (murmur3): sin él, los códigos de barras —casi iguales entre
  // sí— se amontonaban en pocos trozos.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) % NUM_TROZOS;
}
