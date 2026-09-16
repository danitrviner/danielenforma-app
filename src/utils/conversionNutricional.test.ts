import { describe, it, expect } from 'vitest';
import {
  parseBaseGrams, pesoDeItem, etiquetaDePeso,
  intercambiosDeGramosDeAlimento, intercambiosDeGramosDeMacro, gramosDeIntercambios,
} from './conversionNutricional';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';
import type { DietItem } from '../types';

/* Lo que estos tests fijan (auditoría §7-§9, reproducido el 15-09-2026 —
 * ver docs/gramos-e-intercambios.md):
 *
 * Los gramos del plan diario no se guardaban en ninguna parte. Se tiraban al
 * convertir la receta en intercambios y luego se intentaban reconstruir
 * multiplicando los intercambios del PLATO ENTERO por los gramos que el banco
 * del atleta asigna a UN ingrediente. Resultado medido con recetas reales:
 * 60 g de pan salían como 40, 50 o 70 g según la receta, y 125 g de arroz
 * cocido como 37,5 g (el banco habla de arroz crudo).
 *
 * La regla que fija esto: manda el gramaje de la receta. */

const item = (over: Partial<DietItem> = {}): DietItem => ({
  category: 'HC', foodLabel: '40g pan (de molde, tostado)', quantity: 1, ...over,
});

describe('las dos tablas de gramos, que no son la misma', () => {
  /* EL test de esta fase. Hay dos cosas distintas que se llaman «gramos»:
   *   · gramos de ALIMENTO  — 40 g de pan son un intercambio
   *   · gramos de MACRO     — 25 g de hidrato son un intercambio
   * Confundirlas es lo que rompía las cantidades. Estas dos funciones TIENEN
   * que dar resultados distintos para la misma cifra; si algún día alguien las
   * «unifica» porque parecen duplicadas, este test se lo impide. */
  it('60 g de pan no son los mismos intercambios que 60 g de hidrato', () => {
    const comoAlimento = intercambiosDeGramosDeAlimento(60, 40);   // 60 g de pan ÷ 40 g/int
    const comoMacro = intercambiosDeGramosDeMacro(60, 'HC');       // 60 g de hidrato ÷ 25 g/int
    expect(comoAlimento).toBe(1.5);
    expect(comoMacro).toBe(2.4);
    expect(comoAlimento).not.toBe(comoMacro);
  });

  it('la tabla de macros sigue siendo la única fuente para macros', () => {
    expect(intercambiosDeGramosDeMacro(GRAMS_PER_EXCHANGE.HC, 'HC')).toBe(1);
    expect(intercambiosDeGramosDeMacro(GRAMS_PER_EXCHANGE.GRASA, 'GRASA')).toBe(1);
  });

  it('gramos de alimento e intercambios son reversibles', () => {
    expect(gramosDeIntercambios(intercambiosDeGramosDeAlimento(60, 40), 40)).toBe(60);
  });

  it('un alimento sin gramos conocidos no inventa intercambios', () => {
    expect(intercambiosDeGramosDeAlimento(60, null)).toBeNull();
    expect(intercambiosDeGramosDeAlimento(60, 0)).toBeNull();
  });
});

describe('pesoDeItem', () => {
  it('cuando el ítem trae su propio gramaje, ese manda sobre el banco', () => {
    // El pan de ESTA receta pesa 60 g el intercambio, aunque el banco diga 40.
    const peso = pesoDeItem(item({ baseGrams: 60, quantity: 1 }));
    expect(peso.gramos).toBe(60);
    expect(peso.fuente).toBe('item');
  });

  it('escala con la cantidad', () => {
    expect(pesoDeItem(item({ baseGrams: 60, quantity: 1.5 })).gramos).toBe(90);
  });

  it('sin gramaje propio cae al banco, exactamente como hacía antes', () => {
    // Retrocompatibilidad: los millones de ítems ya guardados no tienen
    // baseGrams y tienen que seguir viéndose igual que hasta hoy.
    const peso = pesoDeItem(item({ quantity: 1.5 }));
    expect(peso.gramos).toBe(60);            // 40 g del label × 1,5
    expect(peso.fuente).toBe('banco');
  });

  it('un ítem que es una receta entera no tiene peso propio', () => {
    // La fila «HC» de un arroz con atún NO pesa los 125 g del arroz: el plato
    // pesa 400. Inventarle un gramaje es el bug con otro disfraz.
    const peso = pesoDeItem(item({ foodLabel: 'Arroz integral con atún', originRecipeId: 'r1', quantity: 1.25 }));
    expect(peso.gramos).toBeNull();
    expect(peso.fuente).toBe('receta');
  });

  it('un alimento cuyo nombre no lleva gramos no tiene peso', () => {
    const peso = pesoDeItem(item({ foodLabel: 'un puñado de nueces' }));
    expect(peso.gramos).toBeNull();
    expect(peso.fuente).toBe('sin-datos');
  });
});

describe('etiquetaDePeso', () => {
  it('pinta los gramos del ítem', () => {
    expect(etiquetaDePeso(item({ baseGrams: 60, quantity: 1 }))).toBe('60g');
  });

  it('pasa a kilos cuando procede', () => {
    expect(etiquetaDePeso(item({ baseGrams: 1200, quantity: 1 }))).toBe('1.2kg');
  });

  it('NO inventa un «×2» cuando no sabe el peso', () => {
    // Lo que se veía antes en las recetas importadas. Un «×2» junto a un plato
    // no le dice nada al atleta: o hay gramos, o no se pone nada y se abre la
    // ficha, que sí los tiene bien.
    expect(etiquetaDePeso(item({ foodLabel: 'Arroz con atún', originRecipeId: 'r1', quantity: 2 }))).toBe('');
  });

  it('redondea a un decimal, como siempre', () => {
    expect(etiquetaDePeso(item({ baseGrams: 40, quantity: 1.333 }))).toBe('53.3g');
  });
});

describe('parseBaseGrams (se mantiene igual: es el fallback de todo lo ya guardado)', () => {
  it('lee los gramos del nombre del banco', () => {
    expect(parseBaseGrams('40g pan (de molde, tostado)')).toBe(40);
    expect(parseBaseGrams('30g arroz, pasta, couscous o quinoa')).toBe(30);
  });

  it('convierte kilos y litros', () => {
    expect(parseBaseGrams('1kg patata')).toBe(1000);
    expect(parseBaseGrams('0,5l leche')).toBe(500);
  });

  it('devuelve null si el nombre no trae peso', () => {
    expect(parseBaseGrams('un puñado de nueces')).toBeNull();
  });
});
