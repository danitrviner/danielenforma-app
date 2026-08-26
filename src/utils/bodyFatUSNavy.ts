import { Sexo } from './athleteProfileSignals';

// % de grasa corporal método US Navy / DoD — solo cinta métrica (cuello,
// cintura, cadera en mujeres, altura), sin calibre/plicómetro. Decisión de
// Dani: sustituye a CAMA (que exige pliegue tricipital) como variable de
// masa muscular libre de grasa, porque el error inter-evaluador de un
// calibre casero es demasiado alto para que un cliente se automida en casa
// con fiabilidad.
export function pctGrasaUSNavy(params: {
  sexo: Sexo; cuelloCm: number; cinturaCm: number; caderaCm?: number; alturaCm: number;
}): number | null {
  const { sexo, cuelloCm, cinturaCm, caderaCm, alturaCm } = params;
  if (cuelloCm <= 0 || cinturaCm <= 0 || alturaCm <= 0) return null;

  if (sexo === 'hombre') {
    const diff = cinturaCm - cuelloCm;
    if (diff <= 0) return null; // fuera de dominio del log10, dato de entrada inconsistente
    const denom = 1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(alturaCm);
    return Math.round((495 / denom - 450) * 10) / 10;
  }

  if (caderaCm == null || caderaCm <= 0) return null; // obligatorio en mujeres
  const suma = cinturaCm + caderaCm - cuelloCm;
  if (suma <= 0) return null;
  const denom = 1.29579 - 0.35004 * Math.log10(suma) + 0.221 * Math.log10(alturaCm);
  return Math.round((495 / denom - 450) * 10) / 10;
}

export function masaMagraEstimadaKg(pesoKg: number, pctGrasa: number): number | null {
  if (pesoKg <= 0 || pctGrasa < 0 || pctGrasa >= 100) return null;
  return Math.round(pesoKg * (1 - pctGrasa / 100) * 10) / 10;
}

/**
 * IRC (Índice de Recomposición Corporal) = Masa Magra Estimada / WHtR.
 * Sube cuando el cliente pierde grasa visceral (WHtR baja) y gana o
 * mantiene masa magra — sin el ruido de la báscula ni el sesgo del
 * plicómetro. Es un índice propio de Dani, sin referencia clínica externa
 * (kg / ratio adimensional) — no buscarle una tabla de normalidad.
 */
export function computeIRC(masaMagraKg: number, whtr: number): number | null {
  if (masaMagraKg <= 0 || whtr <= 0) return null;
  return Math.round((masaMagraKg / whtr) * 10) / 10;
}
