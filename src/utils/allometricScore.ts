import { BodyweightLog } from '../types';
import { Sexo } from './athleteProfileSignals';

// e1RM alométrico = e1RM / Peso^b — corrige el sesgo de la ley
// cuadrado-cubo: la fuerza escala con el área transversal (L²), el peso
// corporal con el volumen (L³), así que dividir sin más (1RM/Peso) penaliza
// injustamente a los clientes más pesados. b=0.55 hombres / 0.50 mujeres.
export function coefAlometrico(sexo: Sexo): number {
  return sexo === 'hombre' ? 0.55 : 0.50;
}

export function e1rmAlometrico(e1rmKg: number, pesoCorporalKg: number, sexo: Sexo): number | null {
  if (e1rmKg <= 0 || pesoCorporalKg <= 0) return null;
  return Math.round((e1rmKg / Math.pow(pesoCorporalKg, coefAlometrico(sexo))) * 1000) / 1000;
}

/**
 * Peso corporal vigente en una fecha — el último log con date <= fecha,
 * nunca uno posterior (sería mirar al futuro). El e1RM se registra por
 * sesión pero el peso no siempre se pesa cada semana, así que esto es una
 * aproximación documentada: puede ser el peso de semanas atrás si el atleta
 * no ha vuelto a pesarse.
 */
export function pesoCorporalEn(fecha: string, pesoLogs: BodyweightLog[]): number | null {
  const anteriores = pesoLogs.filter(l => l.date <= fecha).sort((a, b) => b.date.localeCompare(a.date));
  return anteriores.length > 0 ? anteriores[0].weight : null;
}
