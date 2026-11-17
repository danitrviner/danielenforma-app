import type { PalancaDeHipotesis } from '../../types.js';

/* Las cuatro palancas de una hipótesis (17-11-2026): a qué se apuesta en una
   zona. Aquí solo sus nombres y el orden en que se prueban; las cifras de
   cada una las pone `proponerHipotesis.ts`. */

export interface DefDePalanca {
  clave: PalancaDeHipotesis;
  /** Para listas y frases: «responde a volumen». */
  etiqueta: string;
  /** La apuesta, en una frase para el coach. */
  apuesta: string;
  /** ¿Sube el estímulo (IEM) de la zona? Las otras dos lo sostienen o lo bajan. */
  sube: boolean;
}

export const PALANCAS: Record<PalancaDeHipotesis, DefDePalanca> = {
  volumen: { clave: 'volumen', etiqueta: 'volumen', apuesta: 'Más estímulo subiendo series.', sube: true },
  intensidad: { clave: 'intensidad', etiqueta: 'intensidad', apuesta: 'Más estímulo acercándose al fallo.', sube: true },
  ejercicios: { clave: 'ejercicios', etiqueta: 'cambio de ejercicios', apuesta: 'El mismo estímulo con otros ejercicios.', sube: false },
  recuperar: { clave: 'recuperar', etiqueta: 'recuperar', apuesta: 'Menos estímulo para recuperar.', sube: false },
};

/** La palanca por defecto de una zona con estrella. */
export const PALANCA_POR_DEFECTO: PalancaDeHipotesis = 'volumen';

/** El orden en que se prueban cuando la anterior no responde. */
export const ORDEN_DE_PALANCAS: readonly PalancaDeHipotesis[] = ['volumen', 'intensidad', 'ejercicios'];

/**
 * La palanca que toca cuando `actual` no ha respondido: la otra de las dos
 * que suben el estímulo (volumen ↔ intensidad) y, si esa ya había fallado
 * también (`yaFallaron`), cambiar de ejercicios.
 */
export function otraPalanca(actual: PalancaDeHipotesis, yaFallaron: readonly PalancaDeHipotesis[] = []): PalancaDeHipotesis {
  const descartadas = new Set<PalancaDeHipotesis>([actual, ...yaFallaron]);
  return ORDEN_DE_PALANCAS.find(p => !descartadas.has(p)) ?? (actual === 'volumen' ? 'intensidad' : 'volumen');
}
