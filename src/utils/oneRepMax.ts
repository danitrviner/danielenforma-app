// RM estimado (1RM) — fórmula de la plantilla CDG «Índice de hipertrofia»,
// redondeado a 1 decimal. Fuente única: LoadHistoryPanel, CorrelationPanel, el
// motor de informes, el calentamiento, los retos… para que la cifra «1RM est.»
// sea idéntica en toda la app y coincida con la hoja.
//
// Sustituye a Epley "a secas" (decisión de Dani, 16-10-2026): ahora cuenta el RIR.
//   reps hasta el fallo = reps + RIR
//   · con 10-15 reps hechas → solo Epley (kg × (1 + 0,033 × reps hasta el fallo))
//   · con cualquier otro número → media de Epley, Mayhew y Wathen
// Las fórmulas viven en cdg/seguimiento.ts (validadas contra la hoja); aquí solo
// se adapta la entrada de la app.
import { calcularRM, type CdgSerieRealizada } from './cdg/seguimiento.js';

export type RirEntrada = number | string | null | undefined;

/** RIR a usar en el cálculo: «al fallo» cuenta como RIR 0 (igual que la hoja). Un RIR
 *  vacío o ilegible también cuenta 0: es la lectura prudente (la que da el RM más bajo). */
export function rirEfectivo(rir: RirEntrada, alFallo?: boolean): number {
  if (alFallo || rir === 'fallo') return 0;
  const n = Number(rir);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function rmCdg(weight: number | string, reps: number | string, rir?: RirEntrada, alFallo?: boolean): number {
  const w = Number(weight);
  const r = Number(reps);
  if (!r || !w) return 0;
  const serie: CdgSerieRealizada = {
    exerciseName: '',
    repetitions: { min: r, max: r, raw: String(r) },
    weight: w,
    // La hoja trabaja en RPE (10 − RIR). No pasa por su tabla RIR→RPE a propósito:
    // esa tabla no tiene RIR 5, y una serie con RIR 5 se quedaría sin RM.
    rpe: 10 - rirEfectivo(rir, alFallo),
    intensification: ''
  };
  return Math.round(calcularRM([serie]) * 10) / 10;
}

/** RM de una serie registrada (peso, reps hechas, RIR, ¿al fallo?). */
export function rmDeSerie(s: { weight: number | string; repsDone: number | string; rir?: RirEntrada; alFallo?: boolean }): number {
  return rmCdg(s.weight, s.repsDone, s.rir, s.alFallo);
}
