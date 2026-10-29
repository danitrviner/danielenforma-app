import type { GrupoDelPlan, Macros, PlatoDelPlan } from '../types';
import { escalarMacros, macrosDesdeGramos, redondearMacros, restarMacros, sumarMacros, MACROS_CERO } from './macros';

/* ═══════════════════════════════════════════════════════════════════════════
   PLAN DE LA SEMANA — para quien cocina en tandas (Dani, 30-10-2026)

   No es un diario: no se apunta lo que se come cada día ni se compara con lo
   comido. Es una lista de lo que vas a comer ESTA semana —los táperes de la
   tanda, lo de cada día (desayuno, snacks), lo suelto— con cuántas veces lo
   comes, y la app suma las macros contra el objetivo de los siete días. Se da
   por hecho que se cumple: el número que importa es si el plan cuadra.

   El objetivo de la semana es la suma del objetivo de cada día (entreno,
   descanso, ciclado: lo que pautó el coach), así que un plan de táperes
   iguales cuadra aunque los días pidan cosas distintas.
   ═══════════════════════════════════════════════════════════════════════════ */

export const GRUPOS_DEL_PLAN: { id: GrupoDelPlan; titulo: string; ayuda: string; vecesPorDefecto: number }[] = [
  { id: 'tanda', titulo: 'Táperes de la tanda', ayuda: 'Lo que cocinas de golpe. Pon cuántos táperes salen.', vecesPorDefecto: 5 },
  { id: 'cadaDia', titulo: 'Cada día', ayuda: 'Desayunos, snacks, lo que repites a diario.', vecesPorDefecto: 7 },
  { id: 'suelto', titulo: 'Sueltas', ayuda: 'Comidas fuera, caprichos, lo que no repites.', vecesPorDefecto: 1 },
];

export const MAX_VECES = 21;

/** kcal y gramos de `gramos` de un alimento dado por 100 g. */
export function macrosDeAlimento(porCien: { p: number; hc: number; g: number; kcal?: number }, gramos: number): Macros {
  const f = gramos / 100;
  const m = macrosDesdeGramos(porCien.p * f, porCien.hc * f, porCien.g * f);
  return porCien.kcal != null ? { ...m, kcal: porCien.kcal * f } : m;
}

/** Lo que suma un plato en la semana: su ración × las veces. */
export function macrosDelPlato(p: Pick<PlatoDelPlan, 'macros' | 'veces'>): Macros {
  return escalarMacros(p.macros, Math.max(0, p.veces));
}

export function totalDelPlan(platos: readonly PlatoDelPlan[], grupo?: GrupoDelPlan): Macros {
  const lista = grupo ? platos.filter(p => p.grupo === grupo) : platos;
  return lista.length ? sumarMacros(...lista.map(macrosDelPlato)) : { ...MACROS_CERO };
}

/** Objetivo de la semana: la suma de los días que tienen dieta (los libres no suman). */
export function objetivoDeLaSemana(objetivosDiarios: readonly (Macros | null)[]): { objetivo: Macros; dias: number } {
  const conDieta = objetivosDiarios.filter((o): o is Macros => !!o && o.kcal > 0);
  return {
    objetivo: conDieta.length ? sumarMacros(...conDieta) : { ...MACROS_CERO },
    dias: conDieta.length,
  };
}

/** Margen dentro del cual una macro de la semana está «en objetivo»: ±5 %. */
export const MARGEN_SEMANA = 0.05;

export type EstadoMacro = 'falta' | 'ok' | 'sobra';

export function estadoDeMacro(puesto: number, objetivo: number): EstadoMacro {
  if (objetivo <= 0) return 'ok';
  if (puesto > objetivo * (1 + MARGEN_SEMANA)) return 'sobra';
  if (puesto < objetivo * (1 - MARGEN_SEMANA)) return 'falta';
  return 'ok';
}

export interface BalanceDelPlan {
  total: Macros;
  objetivo: Macros;
  /** Objetivo − puesto (positivo = falta, negativo = sobra). */
  diferencia: Macros;
  /** Lo que sale por día de media, para leerlo como un día normal. */
  mediaPorDia: Macros;
  estado: { p: EstadoMacro; hc: EstadoMacro; g: EstadoMacro };
  /** Las tres macros dentro del margen. */
  cuadra: boolean;
}

export function balanceDelPlan(platos: readonly PlatoDelPlan[], objetivo: Macros, dias: number): BalanceDelPlan {
  const total = redondearMacros(totalDelPlan(platos));
  const estado = {
    p: estadoDeMacro(total.p, objetivo.p),
    hc: estadoDeMacro(total.hc, objetivo.hc),
    g: estadoDeMacro(total.g, objetivo.g),
  };
  return {
    total,
    objetivo: redondearMacros(objetivo),
    diferencia: redondearMacros(restarMacros(objetivo, total)),
    mediaPorDia: redondearMacros(dias > 0 ? escalarMacros(total, 1 / dias) : total),
    estado,
    cuadra: platos.length > 0 && estado.p === 'ok' && estado.hc === 'ok' && estado.g === 'ok',
  };
}
