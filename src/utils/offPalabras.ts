import { normalizarTexto } from './busqueda';

/* ═══════════════════════════════════════════════════════════════════════════
   Buscador por nombre sobre TODA la copia de Open Food Facts

   `indice.json` solo lleva los 30.000 más escaneados. El resto se busca en el
   trozo de las tres (o cuatro) primeras letras de una palabra de lo escrito:
   `scripts/_lib/offPalabras.mjs` los escribe en `/off/n/`. Este fichero es su
   gemelo (hay un test que lo comprueba): si divergen, se piden trozos que no son.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PALABRAS_VACIAS = new Set(['con', 'sin', 'para', 'por', 'los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'que', 'the', 'and', 'with', 'avec', 'sans', 'pour', 'des', 'les', 'aux']);

/** Igual que en el script: las 8 primeras palabras del nombre y las 2 de la marca. */
export function palabrasDeProducto(nombre: string, marca?: string): string[] {
  const trocear = (t: string, max: number) => normalizarTexto(t).split(/[^a-z0-9]+/).filter(Boolean).slice(0, max);
  const todas = [...trocear(nombre, 8), ...trocear(marca ?? '', 2)];
  return Array.from(new Set(todas.filter(p => p.length >= 3 && !PALABRAS_VACIAS.has(p) && !/^\d+$/.test(p))));
}

/** Variantes que se escriben de otra forma: se buscan por la raíz común. */
const MISMA_PALABRA: Record<string, string> = { yogurt: 'yogur', yoghurt: 'yogur', yogourt: 'yogur', iogurt: 'yogur', yogures: 'yogur', yogurts: 'yogur' };

/**
 * Lo escrito, en palabras con las que comparar. El plural se quita («galletas»
 * → «galleta», «macarrones» → «macarron»): la raíz está dentro de las dos
 * formas, así que buscar por ella encuentra el singular y el plural.
 */
export function palabrasDeConsulta(termino: string): string[] {
  return normalizarTexto(termino).split(' ').filter(Boolean).map(p => {
    if (MISMA_PALABRA[p]) return MISMA_PALABRA[p];
    if (p.length > 5 && /[nrldz]es$/.test(p)) return p.slice(0, -2);
    if (p.length > 4 && p.endsWith('s') && !p.endsWith('ss')) return p.slice(0, -1);
    return p;
  });
}

export interface PrefijosOff { partidos: Set<string>; prefijos: Set<string> }

/**
 * El trozo que hay que bajar para esta búsqueda, o null si todavía no hay uno
 * que sirva (menos de 3 letras, o una palabra muy común con solo 3 letras
 * escritas: su trozo de 3 está partido y hace falta la cuarta). Se elige la
 * palabra más larga: es la que deja el trozo más pequeño.
 */
export function prefijoParaBuscar(termino: string, m: PrefijosOff): string | null {
  const palabras = palabrasDeConsulta(termino)
    .map(p => p.replace(/[^a-z0-9]/g, ''))
    .filter(p => p.length >= 3 && !PALABRAS_VACIAS.has(p) && !/^\d+$/.test(p))
    .sort((a, b) => b.length - a.length);
  for (const p of palabras) {
    const tres = p.slice(0, 3);
    if (m.partidos.has(tres)) {
      if (p.length >= 4 && m.prefijos.has(p.slice(0, 4))) return p.slice(0, 4);
      continue;
    }
    if (m.prefijos.has(tres)) return tres;
  }
  return null;
}
