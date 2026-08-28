/** Días entre dos fechas YYYY-HH-DD, siempre en local (nunca `toISOString`,
 *  que en UTC+1 desplaza un día — ver `hoyIsoLocal` en trainingWeek.ts). */
function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

/**
 * Recta de mínimos cuadrados sobre los pesos del rango. Se usa en vez de
 * "primero contra último" porque el peso diario oscila con el agua y el
 * glucógeno: con dos registros de un mes cualquiera puedes concluir que sube
 * cuando la tendencia real baja. Devuelve `null` con menos de 3 registros —
 * ahí no hay tendencia que calcular, y decir una es inventarla.
 */
export function tendenciaDePeso(logs: { date: string; weight: number }[]): { kgPorSemana: number; desde: number; hasta: number } | null {
  if (logs.length < 3) return null;
  const base = logs[0].date;
  const xs = logs.map(l => diasEntre(base, l.date));
  const ys = logs.map(l => l.weight);
  const n = xs.length;
  const mediaX = xs.reduce((a, b) => a + b, 0) / n;
  const mediaY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mediaX) * (ys[i] - mediaY); den += (xs[i] - mediaX) ** 2; }
  if (den === 0) return null;
  const pendiente = num / den; // kg por día
  const ordenada = mediaY - pendiente * mediaX;
  return {
    kgPorSemana: pendiente * 7,
    desde: ordenada + pendiente * xs[0],
    hasta: ordenada + pendiente * xs[n - 1],
  };
}
