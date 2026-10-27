import { describe, it, expect } from 'vitest';
import { palabrasDeProducto, palabrasDeConsulta, prefijoParaBuscar, PALABRAS_VACIAS } from './offPalabras';
import { normalizarTexto } from './busqueda';

describe('palabrasDeProducto', () => {
  it('coincide con el script para cualquier nombre', async () => {
    const mjs = await import('../../scripts/_lib/offPalabras.mjs');
    const casos: Array<[string, string]> = [
      ['Yogur Proteínas con fresa 0%', 'Hacendado'],
      ['Leche semidesnatada sin lactosa', 'Pascual, Calidad'],
      ['Pâté de canard aux cèpes', ''],
      ['Galletas ñam-ñam 500g', 'Gullón'],
    ];
    for (const [n, b] of casos) expect(palabrasDeProducto(n, b)).toEqual(mjs.palabrasDeProducto(n, b));
    expect(Array.from(PALABRAS_VACIAS).sort()).toEqual(Array.from(mjs.PALABRAS_VACIAS).sort());
    for (const s of ['Sándwich  de\nJamón', 'Ñoquis']) expect(normalizarTexto(s)).toBe(mjs.normalizar(s));
  });
  it('quita palabras vacías, cifras y lo de menos de 3 letras', () => {
    expect(palabrasDeProducto('Pan de molde con 0% de azúcar 500', 'Bimbo')).toEqual(['pan', 'molde', 'azucar', 'bimbo']);
  });
});

describe('palabrasDeConsulta', () => {
  it('busca por la raíz del plural y une las formas de yogur', () => {
    expect(palabrasDeConsulta('Galletas')).toEqual(['galleta']);
    expect(palabrasDeConsulta('macarrones')).toEqual(['macarron']);
    expect(palabrasDeConsulta('yogurt griego')).toEqual(['yogur', 'griego']);
    expect(palabrasDeConsulta('arroz')).toEqual(['arroz']);
  });
});

describe('prefijoParaBuscar', () => {
  const m = { partidos: new Set(['cho']), prefijos: new Set(['yog', 'gri', 'choc', 'leg']) };
  it('elige el trozo de la palabra más larga', () => {
    expect(prefijoParaBuscar('yogur griego', m)).toBe('gri');
  });
  it('un trozo partido necesita la cuarta letra', () => {
    expect(prefijoParaBuscar('cho', m)).toBeNull();
    expect(prefijoParaBuscar('chocolate', m)).toBe('choc');
  });
  it('sin trozo que exista, o con menos de 3 letras, no pide nada', () => {
    expect(prefijoParaBuscar('xyz', m)).toBeNull();
    expect(prefijoParaBuscar('yo', m)).toBeNull();
  });
});
