import type { FoodCategory } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   De la etiqueta del producto al banco de intercambios

   Lo que hace este módulo: le das lo que pone en la etiqueta de un producto
   —kcal y macros por 100 g— y te devuelve las dos cosas que el banco necesita
   y que hasta ahora había que saberse de memoria:

     · cuántos gramos de ese producto son UN intercambio
     · a qué grupo pertenece (HC, PROT, GRASA, MIX_HC o MIX_GRASA)

   La regla es la misma que ya vive en `nutritionConstants.ts`, solo que leída
   al revés: 1 intercambio = 25 g HC = 25 g PROT = 11 g grasa, y los tres salen
   a ~100 kcal (25×4, 25×4, 11×9≈99). Si un intercambio son 100 kcal, entonces:

       gramos por intercambio = 10.000 / (kcal por 100 g)

   Es exactamente la fórmula de la hoja de cálculo de Dani (`=10000/I27`), y
   reproduce el banco actual sin tocar un solo valor: pan 250 kcal → 40 g,
   patata 67 → 150 g, boniato 86 → 120 g, queso batido 0% 45 → 220 g,
   frutos secos 650 → 15 g. Ver `alimentoDesdeMacros.test.ts`.

   El grupo NO se decide por "qué macro tiene más gramos" sino por de dónde
   salen esas 100 kcal, que es lo que de verdad define un intercambio. Con el
   reparto en la mano se busca el grupo del banco que más se le parece.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo que pone la etiqueta, por 100 g (o 100 ml) de producto. */
export interface MacrosPorCien {
  kcal: number;
  hc: number;
  prot: number;
  grasa: number;
}

/** Intercambios que aporta una porción, desglosados por macro. */
export interface DesgloseDeIntercambios {
  HC: number;
  PROT: number;
  GRASA: number;
  /** Suma de los tres. Vale ~1 cuando la porción es de un intercambio. */
  total: number;
}

export type AvisoAlimento =
  /** Las kcal declaradas no cuadran con los macros declarados. */
  | 'kcal-no-cuadra'
  /** El reparto no se parece a ninguno de los cinco grupos del banco. */
  | 'encaje-flojo'
  /** La porción sale tan pequeña o tan grande que probablemente haya un dato mal. */
  | 'porcion-rara'
  /** Sin kcal ni macros utilizables: no hay nada que calcular. */
  | 'sin-datos';

export interface AlimentoCalculado {
  category: FoodCategory;
  /** Gramos de producto que son un intercambio, ya redondeados a cifra de banco. */
  gramosPorIntercambio: number;
  /** Los mismos gramos sin redondear, por si hace falta explicarlo. */
  gramosExactos: number;
  /** Intercambios que aporta la porción redondeada, macro a macro. */
  desglose: DesgloseDeIntercambios;
  /** Reparto del intercambio entre los tres macros (suma 1). */
  reparto: DesgloseDeIntercambios;
  avisos: AvisoAlimento[];
  /** kcal por 100 g realmente usadas (las declaradas, o las de los macros). */
  kcalUsadas: number;
}

const KCAL_POR_GRAMO = { hc: 4, prot: 4, grasa: 9 } as const;

/** kcal de un intercambio. No es un ajuste libre: es 25g×4 = 11g×9 ≈ 100. */
export const KCAL_POR_INTERCAMBIO = 100;

/* Los cinco grupos del banco, escritos como el reparto de calorías que
 * representa UN intercambio de cada uno. MIX_HC es media proteína y medio
 * hidrato; MIX_GRASA, media proteína y media grasa. */
const ARQUETIPOS: { category: FoodCategory; HC: number; PROT: number; GRASA: number }[] = [
  { category: 'HC',        HC: 1,   PROT: 0,   GRASA: 0   },
  { category: 'PROT',      HC: 0,   PROT: 1,   GRASA: 0   },
  { category: 'GRASA',     HC: 0,   PROT: 0,   GRASA: 1   },
  { category: 'MIX_HC',    HC: 0.5, PROT: 0.5, GRASA: 0   },
  { category: 'MIX_GRASA', HC: 0,   PROT: 0.5, GRASA: 0.5 },
];

/* A partir de aquí el reparto ya no se parece lo bastante a ningún grupo y
 * conviene decírselo a quien lo está creando. La distancia se mide en L1 sobre
 * tres proporciones que suman 1, así que va de 0 (clavado) a 2 (opuesto).
 * Calibrado con el banco real: el pan, que es hidrato "sucio" (49 HC pero
 * también 8 de proteína y 3 de grasa), sale a 0,47 y NO debe avisar; la leche
 * entera, que en la hoja de Dani es 0,25 HC + 0,25 PROT + 0,5 GRASA y aquí no
 * tiene grupo propio, sale a 0,62 y SÍ. */
const DISTANCIA_MAXIMA = 0.55;

/** ±10% entre las kcal declaradas y las que suman los macros. Por encima de
 *  eso casi siempre es un dígito mal tecleado, no el redondeo de la etiqueta. */
const TOLERANCIA_KCAL = 0.1;

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Redondea los gramos a una cifra "de banco". Los tramos no son arbitrarios:
 * son los que reproducen los 310 alimentos ya existentes (28,2 → 30 g de
 * arroz, 149 → 150 g de patata, 116 → 120 g de boniato, 222 → 220 g de queso
 * batido). Un "27,4 g" en la lista se leería como una precisión que este
 * sistema no tiene.
 */
export function redondearGramos(g: number): number {
  if (!Number.isFinite(g) || g <= 0) return 0;
  const paso = g < 20 ? 1 : g < 100 ? 5 : g < 300 ? 10 : 25;
  return Math.max(paso, Math.round(g / paso) * paso);
}

/** Intercambios que aportan `gramos` de un producto con estos macros. */
export function desgloseDe(macros: MacrosPorCien, gramos: number): DesgloseDeIntercambios {
  const porMacro = (gPorCien: number, kcalPorGramo: number) =>
    redondear2((Math.max(0, gPorCien) * gramos * kcalPorGramo) / (100 * KCAL_POR_INTERCAMBIO));
  const HC = porMacro(macros.hc, KCAL_POR_GRAMO.hc);
  const PROT = porMacro(macros.prot, KCAL_POR_GRAMO.prot);
  const GRASA = porMacro(macros.grasa, KCAL_POR_GRAMO.grasa);
  return { HC, PROT, GRASA, total: redondear2(HC + PROT + GRASA) };
}

/** kcal por 100 g que suman los macros declarados. */
export function kcalDeLosMacros(macros: MacrosPorCien): number {
  return (
    Math.max(0, macros.hc) * KCAL_POR_GRAMO.hc +
    Math.max(0, macros.prot) * KCAL_POR_GRAMO.prot +
    Math.max(0, macros.grasa) * KCAL_POR_GRAMO.grasa
  );
}

/**
 * La cuenta entera: etiqueta → alimento del banco.
 *
 * Devuelve siempre algo. Cuando los datos no dan para calcular nada (todo a
 * cero) devuelve `sin-datos` y una porción de 0 g, que es lo que la hoja debe
 * enseñar en vez de un NaN o un grupo inventado.
 */
export function calcularAlimento(macros: MacrosPorCien): AlimentoCalculado {
  const kcalMacros = kcalDeLosMacros(macros);
  const kcalDeclaradas = Number.isFinite(macros.kcal) && macros.kcal > 0 ? macros.kcal : 0;

  // Mandan las kcal de la etiqueta cuando las hay: es lo que el fabricante ha
  // medido. Si no vienen, se deducen de los macros y no se avisa de nada.
  const kcalUsadas = kcalDeclaradas || kcalMacros;

  const avisos: AvisoAlimento[] = [];

  if (kcalUsadas <= 0 || kcalMacros <= 0) {
    return {
      category: 'HC',
      gramosPorIntercambio: 0,
      gramosExactos: 0,
      desglose: { HC: 0, PROT: 0, GRASA: 0, total: 0 },
      reparto: { HC: 0, PROT: 0, GRASA: 0, total: 0 },
      avisos: ['sin-datos'],
      kcalUsadas: 0,
    };
  }

  if (kcalDeclaradas > 0 && Math.abs(kcalDeclaradas - kcalMacros) / kcalDeclaradas > TOLERANCIA_KCAL) {
    avisos.push('kcal-no-cuadra');
  }

  const gramosExactos = (100 * KCAL_POR_INTERCAMBIO) / kcalUsadas;
  const gramosPorIntercambio = redondearGramos(gramosExactos);

  // El reparto se calcula SIEMPRE con los macros, nunca con las kcal
  // declaradas: es de donde salen las calorías lo que decide el grupo.
  const bruto = desgloseDe(macros, gramosExactos);
  const suma = bruto.HC + bruto.PROT + bruto.GRASA;
  const reparto: DesgloseDeIntercambios = {
    HC: redondear2(bruto.HC / suma),
    PROT: redondear2(bruto.PROT / suma),
    GRASA: redondear2(bruto.GRASA / suma),
    total: 1,
  };

  let mejor = ARQUETIPOS[0];
  let mejorDistancia = Infinity;
  for (const a of ARQUETIPOS) {
    const d =
      Math.abs(reparto.HC - a.HC) +
      Math.abs(reparto.PROT - a.PROT) +
      Math.abs(reparto.GRASA - a.GRASA);
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = a;
    }
  }
  if (mejorDistancia > DISTANCIA_MAXIMA) avisos.push('encaje-flojo');

  if (gramosPorIntercambio < 3 || gramosPorIntercambio > 800) avisos.push('porcion-rara');

  return {
    category: mejor.category,
    gramosPorIntercambio,
    gramosExactos: redondear2(gramosExactos),
    // El desglose que se enseña es el de la porción REDONDEADA, no el de la
    // exacta: es la que se va a guardar y la que el atleta va a pesar.
    desglose: desgloseDe(macros, gramosPorIntercambio),
    reparto,
    avisos,
    kcalUsadas: Math.round(kcalUsadas),
  };
}

/**
 * El nombre tal y como lo guarda el banco: los gramos delante, pegados al
 * nombre. No es cosmética — `parseBaseGrams` los lee de ahí, y de ahí sale el
 * peso que se enseña en el plan y el que usa el generador de menús. Un
 * alimento sin gramos en el nombre entra en el banco mudo.
 */
export function etiquetaDeBanco(nombre: string, gramos: number, unidad: 'g' | 'ml' = 'g'): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  return `${gramos}${unidad} ${limpio}`;
}

export const TEXTO_DE_AVISO: Record<AvisoAlimento, string> = {
  'kcal-no-cuadra': 'Las calorías no cuadran con los macros. Revisa la etiqueta.',
  'encaje-flojo': 'Este alimento queda entre dos grupos. Se ha puesto en el más parecido.',
  'porcion-rara': 'La porción sale muy fuera de lo normal. Comprueba los datos.',
  'sin-datos': 'Faltan datos para calcular el intercambio.',
};
