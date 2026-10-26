import type { Macros } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Calorías y macros (10-2026)

   La unidad de toda la nutrición: kcal y gramos de proteína (p), hidratos (hc)
   y grasa (g). Las kcal de un objetivo salen de sus gramos (4/4/9); las de un
   alimento o producto se guardan tal cual vienen (una etiqueta no siempre
   cuadra al gramo con 4/4/9 y no se corrige).

   Los datos viejos en intercambios se traducen en utils/macrosLegado.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { Macros };

export const KCAL_POR_GRAMO = { p: 4, hc: 4, g: 9 } as const;

export const MACROS_CERO: Macros = Object.freeze({ kcal: 0, p: 0, hc: 0, g: 0 }) as Macros;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** kcal de unos gramos de proteína, hidratos y grasa. */
export function kcalDeGramos(m: { p: number; hc: number; g: number }): number {
  return Math.round(m.p * KCAL_POR_GRAMO.p + m.hc * KCAL_POR_GRAMO.hc + m.g * KCAL_POR_GRAMO.g);
}

/** Un objetivo a partir de sus gramos: las kcal se calculan. */
export function macrosDesdeGramos(p: number, hc: number, g: number): Macros {
  return { kcal: kcalDeGramos({ p, hc, g }), p, hc, g };
}

export function sumarMacros(...lista: Macros[]): Macros {
  return lista.reduce<Macros>(
    (acc, m) => ({ kcal: acc.kcal + m.kcal, p: acc.p + m.p, hc: acc.hc + m.hc, g: acc.g + m.g }),
    { ...MACROS_CERO },
  );
}

export function restarMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal - b.kcal, p: a.p - b.p, hc: a.hc - b.hc, g: a.g - b.g };
}

export function escalarMacros(m: Macros, factor: number): Macros {
  return { kcal: m.kcal * factor, p: m.p * factor, hc: m.hc * factor, g: m.g * factor };
}

/** Para enseñar y guardar: kcal enteras, gramos con un decimal. */
export function redondearMacros(m: Macros): Macros {
  return { kcal: Math.round(m.kcal), p: r1(m.p), hc: r1(m.hc), g: r1(m.g) };
}

/** Lo que queda sin bajar de cero (para buscar recetas que caben). */
export function sinNegativos(m: Macros): Macros {
  return { kcal: Math.max(0, m.kcal), p: Math.max(0, m.p), hc: Math.max(0, m.hc), g: Math.max(0, m.g) };
}

export function sonMacrosVacios(m: Macros | null | undefined): boolean {
  return !m || (m.kcal <= 0 && m.p <= 0 && m.hc <= 0 && m.g <= 0);
}
