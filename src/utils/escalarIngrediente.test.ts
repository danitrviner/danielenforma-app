import { describe, it, expect } from 'vitest';
import { ingredientesEscalables, textoDeRacionExtra, ETIQUETAS_ESCALABLES } from './escalarIngrediente';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import { MealItem } from '../types';
import { parseBaseGrams } from './exchangeHelpers';

const BANCO = (SYSTEM_FOODS as unknown as MealItem[]).map((f, i) => ({ ...f, id: `f${i}` }));
const ing = (...nombres: string[]) => nombres.map(name => ({ name }));

describe('la tabla se ata al banco, no a lo que yo creía', () => {
  // Escribí esta tabla a mano la primera vez y tenía tres errores de nutrición:
  // legumbres como HC (son MIX_HC), huevo y tofu como PROT (son MIX_GRASA).
  // Este test es lo que impide que vuelva a pasar, y también avisa si alguien
  // renombra un alimento del banco y deja la tabla apuntando al vacío.
  it('todas las etiquetas de la tabla existen en el banco', () => {
    const etiquetas = new Set(BANCO.map(f => f.label));
    for (const e of ETIQUETAS_ESCALABLES) expect(etiquetas).toContain(e);
  });

  it('todas traen gramos: sin ellos no se puede decir cuánto añadir', () => {
    for (const e of ETIQUETAS_ESCALABLES) {
      const f = BANCO.find(x => x.label === e)!;
      expect(parseBaseGrams(f.label)).toBeGreaterThan(0);
    }
  });

  it('la categoría y los gramos salen del banco, no de la tabla', () => {
    const [arroz] = ingredientesEscalables(ing('Arroz'), BANCO);
    const delBanco = BANCO.find(f => f.label === '30g arroz, pasta, couscous o quinoa')!;
    expect(arroz.category).toBe(delBanco.category);
    expect(arroz.gramosPorIntercambio).toBe(parseBaseGrams(delBanco.label));
  });

  it('las legumbres son MIX_HC, no hidrato puro', () => {
    const [garbanzos] = ingredientesEscalables(ing('Garbanzos cocidos'), BANCO);
    expect(garbanzos.category).toBe('MIX_HC');
  });

  it('el tofu es MIX_GRASA, no proteína pura', () => {
    const [tofu] = ingredientesEscalables(ing('Tofu firme'), BANCO);
    expect(tofu.category).toBe('MIX_GRASA');
  });
});

describe('qué se puede subir de ración', () => {
  it('reconoce los ingredientes base de una receta real', () => {
    const out = ingredientesEscalables(ing('Arroz', 'Pechuga de pollo', 'Aceite de oliva'), BANCO);
    expect(out.map(o => o.nombre).sort()).toEqual(['aceite', 'arroz', 'pollo']);
  });

  it('ignora verduras y condimentos: en intercambios son libres', () => {
    const out = ingredientesEscalables(ing('Sal de mesa', 'Calabacín', 'Pimienta negra', 'Cebolla', 'Perejil'), BANCO);
    expect(out).toEqual([]);
  });

  it('no repite el mismo alimento del banco dos veces', () => {
    // Arroz y pasta comparten entrada; sugerir las dos sería sumar dos veces.
    const out = ingredientesEscalables(ing('Arroz basmati', 'Pasta en seco'), BANCO);
    expect(out).toHaveLength(1);
  });

  it('descarta lo que el banco no sabe pesar', () => {
    // "1 huevo grande o 2 pequeños" no tiene gramos: no hay forma de decir
    // "añade 0,75 huevos" sin inventarse un peso, así que no se ofrece.
    expect(ingredientesEscalables(ing('Huevo crudo'), BANCO)).toEqual([]);
  });

  it('no ofrece nada si el banco del atleta es de otro modo de dieta', () => {
    expect(ingredientesEscalables(ing('Arroz'), BANCO, 'VEGANO').every(o => o.gramosPorIntercambio > 0)).toBe(true);
  });

  it('sin ingredientes no se rompe', () => {
    expect(ingredientesEscalables(undefined, BANCO)).toEqual([]);
    expect(ingredientesEscalables([], BANCO)).toEqual([]);
  });
});

describe('textoDeRacionExtra', () => {
  it('dice los gramos, que es lo accionable', () => {
    const [arroz] = ingredientesEscalables(ing('Arroz'), BANCO);
    expect(textoDeRacionExtra(arroz, 2)).toBe('+60g de arroz');
    expect(textoDeRacionExtra(arroz, 0.5)).toBe('+15g de arroz');
  });
});

describe('falsos positivos de nombre', () => {
  // Encontrados midiendo contra el recetario real: `nuez` y `almendra` sueltos
  // convertían una ESPECIA y una BEBIDA VEGETAL en "añade 15g de frutos secos".
  it('la nuez moscada es una especia, no un fruto seco (35 recetas)', () => {
    expect(ingredientesEscalables([{ name: 'Nuez moscada' }], BANCO)).toEqual([]);
  });

  it('la bebida de almendra o avellanas no se sube a cucharadas (119 recetas)', () => {
    expect(ingredientesEscalables([{ name: 'Bebida de almendra' }], BANCO)).toEqual([]);
    expect(ingredientesEscalables([{ name: 'Bebida de avellanas' }], BANCO)).toEqual([]);
    expect(ingredientesEscalables([{ name: 'Leche de almendras' }], BANCO)).toEqual([]);
  });

  it('los frutos secos de verdad se siguen ofreciendo', () => {
    for (const n of ['Nueces', 'Almendras crudas', 'Anacardos', 'Pistachos', 'Nuez']) {
      expect(ingredientesEscalables([{ name: n }], BANCO)[0]?.nombre).toBe('frutos secos');
    }
  });
});
