import type { Exercise } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Atributos de ejercicio y cuándo se pueden filtrar por ellos (E-03)

   Un filtro sobre un atributo que casi ningún ejercicio tiene rellenado
   esconde en silencio casi todo el catálogo. Por eso un filtro solo se ofrece
   cuando el atributo está en al menos el 90 % de los ejercicios.
   ═══════════════════════════════════════════════════════════════════════════ */

export const UMBRAL_COBERTURA = 0.9;

/** Material que entiende el catálogo. Mismo conjunto que scripts/_lib/atributosEjercicio.mjs. */
export const MATERIALES = [
  'peso corporal', 'mancuernas', 'barra', 'máquina', 'multipower', 'polea', 'kettlebell', 'banco', 'gomas',
] as const;

export type AtributoFiltrable = 'equipment' | 'lateralidad' | 'goma' | 'guiado';

const tieneDato: Record<AtributoFiltrable, (e: Exercise) => boolean> = {
  equipment: e => (e.equipment?.length ?? 0) > 0,
  lateralidad: e => e.lateralidad === 'uni' || e.lateralidad === 'bi',
  goma: e => typeof e.goma === 'boolean',
  guiado: e => typeof e.guiado === 'boolean',
};

/** Qué atributos tienen datos suficientes para ofrecer un filtro. Sin ejercicios, ninguno. */
export function atributosFiltrables(ejercicios: Exercise[]): Record<AtributoFiltrable, boolean> {
  const validos = ejercicios.filter(e => !e.descartado);
  const resultado = { equipment: false, lateralidad: false, goma: false, guiado: false };
  if (validos.length === 0) return resultado;
  for (const k of Object.keys(resultado) as AtributoFiltrable[]) {
    resultado[k] = validos.filter(tieneDato[k]).length / validos.length >= UMBRAL_COBERTURA;
  }
  return resultado;
}
