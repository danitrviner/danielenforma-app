import type { IngredienteVinculado, Palanca, Recipe } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Ajuste de una receta base al objetivo de una comida (N-06)

   Determinista y sin dependencias. Solo se mueven los ingredientes «palanca»
   (y nunca los `fijo`), siempre dentro de su [min, max]:

     1. Proteína → hidratos → grasa: cada palanca cubre lo que le falta (o le
        sobra) a su macro, repartido entre las palancas de ese macro según sus
        gramos. Tres pasadas, porque subir el arroz también sube algo de
        proteína y la siguiente pasada lo corrige.
     2. Redondeo práctico: de 5 en 5 g; de 1 en 1 g los alimentos que son casi
        todo grasa (aceite, mantequilla).
     3. Encaja si cada macro queda a ≤ 10 % o ≤ 5 g del objetivo (lo que sea
        más generoso). Si no, «no encaja» y quien llama busca otra receta.

   Cada cambio lleva su motivo, para poder decirle al atleta qué se ha tocado.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ObjetivoEnGramos { p: number; hc: number; g: number }

export interface CambioDeIngrediente {
  n: number;
  nombre: string;
  antes: number;
  despues: number;
  motivo: string;
}

export interface ResultadoAjuste {
  /** Gramos finales de cada ingrediente, por su posición `n`. */
  gramos: Array<{ n: number; gramos: number }>;
  cambios: CambioDeIngrediente[];
  total: { kcal: number; p: number; hc: number; g: number };
  /** Lo que queda lejos del objetivo, en gramos (positivo = se pasa). */
  desvio: ObjetivoEnGramos;
  encaja: boolean;
}

export const TOLERANCIA_PCT = 0.10;
export const TOLERANCIA_GRAMOS = 5;
const PASADAS = 3;

const CLAVE: Record<Palanca, 'p' | 'hc' | 'g'> = { proteina: 'p', hc: 'hc', grasa: 'g' };
const MOTIVO: Record<Palanca, [string, string]> = {
  proteina: ['faltaba proteína', 'sobraba proteína'],
  hc: ['faltaban hidratos', 'sobraban hidratos'],
  grasa: ['faltaba grasa', 'sobraba grasa'],
};
const ORDEN: Palanca[] = ['proteina', 'hc', 'grasa'];

const r1 = (n: number) => Math.round(n * 10) / 10;
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** ¿Se puede ajustar? Hace falta un vínculo con al menos una palanca y los valores por 100 g de cada alimento. */
export function sePuedeAjustar(ings: IngredienteVinculado[] | undefined): ings is IngredienteVinculado[] {
  return !!ings && ings.some(i => i.palanca && !i.fijo)
    && ings.every(i => i.alimentoId === null || !!i.porCien);
}

function totales(ings: IngredienteVinculado[], gramos: Map<number, number>) {
  let kcal = 0, p = 0, hc = 0, g = 0;
  for (const i of ings) {
    if (!i.porCien) continue;
    const f = (gramos.get(i.n) ?? i.gramos) / 100;
    kcal += i.porCien.kcal * f; p += i.porCien.p * f; hc += i.porCien.hc * f; g += i.porCien.g * f;
  }
  return { kcal, p, hc, g };
}

/** Paso de redondeo del ingrediente: 1 g si es casi todo grasa, 5 g el resto. */
function paso(i: IngredienteVinculado): number {
  return i.porCien && i.porCien.g >= 80 ? 1 : 5;
}

export function toleranciaDe(objetivo: number): number {
  return Math.max(TOLERANCIA_GRAMOS, objetivo * TOLERANCIA_PCT);
}

/**
 * Ajusta los gramos de las palancas para acercar la receta al objetivo.
 * `nombres[n]` es el nombre del ingrediente n en la receta (para los motivos).
 */
export function ajustarReceta(ings: IngredienteVinculado[], objetivo: ObjetivoEnGramos, nombres: string[] = []): ResultadoAjuste {
  const gramos = new Map(ings.map(i => [i.n, i.gramos]));
  const movibles = ings.filter(i => i.palanca && !i.fijo && i.porCien);

  for (let pasada = 0; pasada < PASADAS; pasada++) {
    for (const macro of ORDEN) {
      const clave = CLAVE[macro];
      const delMacro = movibles.filter(i => i.palanca === macro && i.porCien![clave] > 0);
      if (delMacro.length === 0) continue;
      const falta = objetivo[clave] - totales(ings, gramos)[clave];
      const pesoTotal = delMacro.reduce((s, i) => s + (gramos.get(i.n) ?? 0), 0);
      for (const i of delMacro) {
        const parte = pesoTotal > 0 ? (gramos.get(i.n) ?? 0) / pesoTotal : 1 / delMacro.length;
        const deltaGramos = (falta * parte) / (i.porCien![clave] / 100);
        gramos.set(i.n, limitar((gramos.get(i.n) ?? i.gramos) + deltaGramos, i.min, i.max));
      }
    }
  }

  // Redondeo práctico, sin salirse del rango (min y max mandan sobre el redondeo).
  for (const i of movibles) {
    // Lo que el ajuste no ha movido se queda con sus gramos de la receta,
    // aunque no sean redondos: no se toca un ingrediente sin motivo.
    if (Math.abs((gramos.get(i.n) ?? i.gramos) - i.gramos) < 0.5) { gramos.set(i.n, i.gramos); continue; }
    const p = paso(i);
    gramos.set(i.n, limitar(Math.round((gramos.get(i.n) ?? i.gramos) / p) * p, i.min, i.max));
  }

  const t = totales(ings, gramos);
  const desvio = { p: r1(t.p - objetivo.p), hc: r1(t.hc - objetivo.hc), g: r1(t.g - objetivo.g) };
  const encaja = (['p', 'hc', 'g'] as const).every(k => Math.abs(t[k] - objetivo[k]) <= toleranciaDe(objetivo[k]));

  const cambios: CambioDeIngrediente[] = [];
  for (const i of movibles) {
    const despues = gramos.get(i.n)!;
    if (despues === i.gramos) continue;
    const sube = despues > i.gramos;
    cambios.push({
      n: i.n,
      nombre: nombres[i.n] ?? `Ingrediente ${i.n + 1}`,
      antes: i.gramos,
      despues,
      motivo: MOTIVO[i.palanca!][sube ? 0 : 1],
    });
  }

  return {
    gramos: ings.map(i => ({ n: i.n, gramos: gramos.get(i.n)! })),
    cambios,
    total: { kcal: Math.round(t.kcal), p: r1(t.p), hc: r1(t.hc), g: r1(t.g) },
    desvio,
    encaja,
  };
}

/** Frase corta para el atleta: «Arroz 90 → 120 g (faltaban hidratos)». */
export function fraseDeCambio(c: CambioDeIngrediente): string {
  return `${c.nombre} ${c.antes} → ${c.despues} g (${c.motivo})`;
}

/**
 * La receta con los gramos ajustados: cantidades de `ingredientsText` por
 * posición, macros, kcal y peso recalculados. Lo que no es de una receta
 * vinculada se devuelve tal cual.
 */
export function recetaAjustada(recipe: Recipe, gramosPorN: Array<{ n: number; gramos: number }>): Recipe {
  const ings = recipe.vinculo?.ingredientes;
  if (!ings || gramosPorN.length === 0) return recipe;
  const gramos = new Map(gramosPorN.map(x => [x.n, x.gramos]));
  const t = totales(ings, gramos);
  return {
    ...recipe,
    ingredientsText: recipe.ingredientsText?.map((ing, n) => (gramos.has(n) ? { ...ing, quantity: gramos.get(n)! } : ing)),
    macros: { carb: Math.round(t.hc), prot: Math.round(t.p), fat: Math.round(t.g) },
    kcal: Math.round(t.kcal),
    weight: Math.round(ings.reduce((s, i) => s + (gramos.get(i.n) ?? i.gramos), 0)),
  };
}
