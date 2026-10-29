import { lunesDe } from './cardioProgression.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que se lee de la gráfica de peso sin tener que adivinarlo (28-10-2026)

   Dani: «veo una línea que baja, pero no sé cuánto ha bajado ni cuál es la
   media de cambio esos 7 días, 14 días, ese mes». Maqueta C + datos de la B:
   cambio del periodo, ritmo por semana, media, mínimo y máximo, el peso con el
   que empezó y una barra por semana (o por mes en rangos largos) con lo que
   cambió la media de 7 días.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PuntoPeso { date: string; value: number; avg?: number }

export interface ResumenPeso {
  cambio: number;
  dias: number;
  /** kg por semana entre el primer y el último registro del rango; null con menos de 7 días. */
  ritmoSemana: number | null;
  media: number;
  min: number;
  max: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86_400_000);
}

export function resumenPeso(puntos: readonly PuntoPeso[]): ResumenPeso | null {
  if (puntos.length < 2) return null;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const valores = puntos.map(p => p.value);
  const dias = diasEntre(primero.date, ultimo.date);
  const cambio = r1(ultimo.value - primero.value);
  return {
    cambio,
    dias,
    ritmoSemana: dias >= 7 ? r2((ultimo.value - primero.value) / dias * 7) : null,
    media: r1(valores.reduce((t, v) => t + v, 0) / valores.length),
    min: Math.min(...valores),
    max: Math.max(...valores),
  };
}

export interface CambioDeTramo { etiqueta: string; cambio: number }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Cambio de la media de 7 días en cada semana (lunes a domingo) o en cada mes:
 * lo que marcaba al cerrar el tramo menos lo que marcaba al cerrar el anterior
 * (el primero, contra su propio comienzo). Sin media, se usa el peso del día.
 */
export function cambiosPorTramo(puntos: readonly PuntoPeso[], unidad: 'semana' | 'mes', maximo = 12): CambioDeTramo[] {
  const grupos = new Map<string, PuntoPeso[]>();
  for (const p of puntos) {
    const clave = unidad === 'semana' ? lunesDe(p.date) : p.date.slice(0, 7);
    grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
  }
  const claves = [...grupos.keys()].sort();
  const valor = (p: PuntoPeso) => p.avg ?? p.value;
  const out: CambioDeTramo[] = [];
  claves.forEach((clave, i) => {
    const g = grupos.get(clave)!;
    const fin = valor(g[g.length - 1]);
    const anterior = i > 0 ? grupos.get(claves[i - 1])! : null;
    const inicio = anterior ? valor(anterior[anterior.length - 1]) : valor(g[0]);
    if (!anterior && g.length < 2) return;
    const etiqueta = unidad === 'semana'
      ? `${Number(clave.slice(8, 10))} ${MESES[Number(clave.slice(5, 7)) - 1]}`
      : MESES[Number(clave.slice(5, 7)) - 1];
    out.push({ etiqueta, cambio: r1(fin - inicio) });
  });
  return out.slice(-maximo);
}
