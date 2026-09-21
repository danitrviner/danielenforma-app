import { describe, it, expect } from 'vitest';
import {
  calcularAlimento,
  redondearGramos,
  desgloseDe,
  etiquetaDeBanco,
} from './alimentoDesdeMacros';

/* Los valores de referencia salen de dos sitios que tienen que seguir
 * coincidiendo: el banco de 310 alimentos que ya usan los atletas
 * (`nutricion_seed_en_forma.ts`) y la hoja de cálculo de Dani. Si alguien
 * cambia la regla de conversión, estos números se caen. */

describe('calcularAlimento · reproduce el banco actual', () => {
  const casos: {
    nombre: string;
    macros: { kcal: number; hc: number; prot: number; grasa: number };
    gramos: number;
    category: string;
  }[] = [
    // "40g pan (de molde, tostado, con o sin semillas...)"
    { nombre: 'pan', macros: { kcal: 250, hc: 49, prot: 8, grasa: 3 }, gramos: 40, category: 'HC' },
    // "30g arroz, pasta, couscous o quinoa"
    { nombre: 'arroz', macros: { kcal: 355, hc: 78, prot: 7, grasa: 1 }, gramos: 30, category: 'HC' },
    // "150g patata (cruda o cocida)"
    { nombre: 'patata', macros: { kcal: 67, hc: 15, prot: 1.8, grasa: 0.1 }, gramos: 150, category: 'HC' },
    // "120g boniato"
    { nombre: 'boniato', macros: { kcal: 86, hc: 20, prot: 1.6, grasa: 0.1 }, gramos: 120, category: 'HC' },
    // "120g pescado blanco (merluza, bacalao, lubina...)"
    { nombre: 'merluza', macros: { kcal: 86, hc: 0, prot: 17, grasa: 2.4 }, gramos: 120, category: 'PROT' },
    // "15g frutos secos sin freír"
    { nombre: 'nueces', macros: { kcal: 650, hc: 7, prot: 15, grasa: 62 }, gramos: 15, category: 'GRASA' },
    // "100g carne blanca sin piel (pollo, pavo...)" — el banco redondea a 100
    { nombre: 'pechuga de pollo', macros: { kcal: 110, hc: 0, prot: 23, grasa: 2.6 }, gramos: 90, category: 'PROT' },
    // "100g legumbre cocida"
    { nombre: 'lentejas cocidas', macros: { kcal: 116, hc: 20, prot: 9, grasa: 0.4 }, gramos: 85, category: 'MIX_HC' },
    // "1 huevo grande o 2 pequeños"
    { nombre: 'huevo', macros: { kcal: 143, hc: 0.7, prot: 12.6, grasa: 9.5 }, gramos: 70, category: 'MIX_GRASA' },
    // "30g queso (curado, semicurado, cabra, mozzarella...)"
    { nombre: 'queso curado', macros: { kcal: 380, hc: 1.5, prot: 25, grasa: 30 }, gramos: 25, category: 'MIX_GRASA' },
  ];

  for (const c of casos) {
    it(`${c.nombre} → ${c.gramos}g · ${c.category}`, () => {
      const r = calcularAlimento(c.macros);
      expect(r.gramosPorIntercambio).toBe(c.gramos);
      expect(r.category).toBe(c.category);
      // Una porción de un intercambio aporta ~1 intercambio. El margen es el
      // del redondeo a cifra de banco, no el de la fórmula.
      expect(r.desglose.total).toBeGreaterThan(0.8);
      expect(r.desglose.total).toBeLessThan(1.2);
    });
  }
});

describe('calcularAlimento · donde el cálculo y el criterio de Dani no coinciden', () => {
  /* El queso fresco batido 0% está en el banco como PROTEÍNA, y el cálculo lo
   * pone en MIX_HC. Las dos lecturas son defendibles: de sus 45 kcal, 16 son
   * de la lactosa y 28 de la proteína, así que matemáticamente es un mixto de
   * manual. Dani lo tiene como proteína porque 220 g de queso batido se comen
   * como proteína y la lactosa da igual en la práctica.
   *
   * Está escrito aquí a propósito, y no "arreglado": el automático acierta en
   * el resto del banco y este es el precio. Cuando pase, el alimento se crea
   * igual y se puede recolocar a mano desde el banco del coach. */
  it('el queso batido 0% sale MIX_HC, no PROT', () => {
    const r = calcularAlimento({ kcal: 45, hc: 4, prot: 7, grasa: 0.2 });
    expect(r.gramosPorIntercambio).toBe(220);
    expect(r.category).toBe('MIX_HC');
  });
});

describe('calcularAlimento · el ejemplo de la hoja de Dani', () => {
  // "Un producto tiene 358 kcal, 1,8gr de Grasas, 71,2gr de Carbohidratos y
  //  12,4gr de Proteínas. (...) podemos redondear a que por 30gr de producto
  //  tenemos 1 intercambio de hidratos"
  const r = calcularAlimento({ kcal: 358, hc: 71.2, prot: 12.4, grasa: 1.8 });

  it('da los 28g exactos de la hoja', () => {
    expect(Math.round(r.gramosExactos)).toBe(28);
  });

  it('los redondea a 30g, como dice la nota', () => {
    expect(r.gramosPorIntercambio).toBe(30);
  });

  it('lo clasifica como hidrato', () => {
    expect(r.category).toBe('HC');
  });

  it('el desglose a 28g coincide con el de la hoja (0,05 / 0,80 / 0,14)', () => {
    const d = desgloseDe({ kcal: 358, hc: 71.2, prot: 12.4, grasa: 1.8 }, 28);
    expect(d.GRASA).toBeCloseTo(0.05, 2);
    expect(d.HC).toBeCloseTo(0.8, 2);
    expect(d.PROT).toBeCloseTo(0.14, 2);
  });
});

describe('avisos', () => {
  it('avisa cuando las kcal no cuadran con los macros', () => {
    // 50 g de hidrato son 200 kcal, no 90.
    const r = calcularAlimento({ kcal: 90, hc: 50, prot: 0, grasa: 0 });
    expect(r.avisos).toContain('kcal-no-cuadra');
  });

  it('no avisa por el redondeo normal de una etiqueta', () => {
    // 49×4 + 8×4 + 3×9 = 255 declaradas 250: un 2%.
    const r = calcularAlimento({ kcal: 250, hc: 49, prot: 8, grasa: 3 });
    expect(r.avisos).toHaveLength(0);
  });

  it('avisa de encaje flojo con la leche entera (en la hoja es ¼+¼+½)', () => {
    const r = calcularAlimento({ kcal: 63, hc: 4.7, prot: 3.1, grasa: 3.6 });
    expect(r.avisos).toContain('encaje-flojo');
    // Aun así la coloca en el grupo más parecido, no la deja sin grupo.
    expect(r.category).toBe('MIX_GRASA');
  });

  it('el pan NO avisa de encaje flojo aunque lleve algo de proteína y grasa', () => {
    const r = calcularAlimento({ kcal: 250, hc: 49, prot: 8, grasa: 3 });
    expect(r.avisos).not.toContain('encaje-flojo');
  });

  it('devuelve sin-datos en vez de NaN cuando no hay nada que calcular', () => {
    const r = calcularAlimento({ kcal: 0, hc: 0, prot: 0, grasa: 0 });
    expect(r.avisos).toEqual(['sin-datos']);
    expect(r.gramosPorIntercambio).toBe(0);
    expect(Number.isNaN(r.desglose.total)).toBe(false);
  });

  it('ignora macros negativos en vez de restar calorías', () => {
    const r = calcularAlimento({ kcal: 400, hc: 100, prot: -5, grasa: 0 });
    expect(Number.isFinite(r.gramosPorIntercambio)).toBe(true);
    expect(r.desglose.PROT).toBe(0);
  });
});

describe('redondearGramos · tramos que reproducen el banco', () => {
  it.each([
    [11.1, 11],   // aceite
    [15.4, 15],   // frutos secos
    [27.9, 30],   // arroz
    [40, 40],     // pan
    [86.2, 85],
    [116.3, 120], // boniato
    [149.3, 150], // patata
    [222.2, 220], // queso batido
    [400, 400],
    [0, 0],
  ])('%dg → %dg', (entrada, esperado) => {
    expect(redondearGramos(entrada)).toBe(esperado);
  });
});

describe('etiquetaDeBanco', () => {
  it('pone los gramos delante para que parseBaseGrams los encuentre', () => {
    expect(etiquetaDeBanco('  pan  integral ', 40)).toBe('40g pan integral');
  });

  it('acepta ml para los líquidos', () => {
    expect(etiquetaDeBanco('bebida de avena', 200, 'ml')).toBe('200ml bebida de avena');
  });
});
