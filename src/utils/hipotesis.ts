import type { WorkoutLog } from '../types.js';
import { rmDeSerie } from './oneRepMax.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { sesionesDelEjercicio } from './comparabilidad.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Cambios con hipótesis (S5, 11-11-2026)

   Un cambio sin expectativa no se puede evaluar: a las tres semanas nadie
   recuerda para qué se subió el descanso ni si sirvió. Aquí cada cambio lleva
   lo que el coach espera y cuándo lo va a mirar; llegado el día, la app enseña
   el antes y el después del ejercicio en el que se fijó.

   Esto es solo la parte pura. Dónde se guarda y cómo se ve está por decidir
   (versiones en `/dev/hipotesis`).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Hipotesis {
  id: string;
  /** El cambio del historial al que acompaña (`CambioAtleta.id`), si lo hay. */
  cambioId?: string;
  /** Qué espera el coach, en sus palabras. */
  espero: string;
  /** Ejercicio en el que se va a mirar el antes y el después. */
  exerciseId?: string;
  /** Día del cambio y día de la revisión (AAAA-MM-DD). */
  desde: string;
  revisarEl: string;
  cierre?: { resultado: 'funciono' | 'no_funciono'; at: string };
}

export type EstadoDeHipotesis = 'en_observacion' | 'toca_revisar' | 'cerrada';

export function estadoDeHipotesis(h: Pick<Hipotesis, 'revisarEl' | 'cierre'>, hoy: string): EstadoDeHipotesis {
  if (h.cierre) return 'cerrada';
  return hoy >= h.revisarEl ? 'toca_revisar' : 'en_observacion';
}

/** Sesiones a cada lado del cambio que entran en la media. */
const SESIONES_POR_LADO = 3;

export interface AntesYDespues {
  /** 1RM estimado medio de las últimas sesiones antes del cambio. `null` sin datos. */
  antes: number | null;
  /** Lo mismo desde el cambio. */
  despues: number | null;
  sesionesDespues: number;
  cambioPct: number | null;
}

/** El antes y el después de un ejercicio alrededor de una fecha. */
export function antesYDespues(logs: readonly WorkoutLog[], exerciseId: string, desde: string): AntesYDespues {
  const marca = (s: ReturnType<typeof sesionesDelEjercicio>[number]) => Math.max(0, ...seriesPrincipales(s.entry.sets).map(rmDeSerie));
  const media = (xs: number[]) => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10);
  const sesiones = sesionesDelEjercicio(logs, exerciseId);
  const previas = sesiones.filter(s => s.date < desde).slice(-SESIONES_POR_LADO).map(marca);
  const posteriores = sesiones.filter(s => s.date >= desde).map(marca);
  const antes = media(previas);
  const despues = media(posteriores.slice(-SESIONES_POR_LADO));
  return {
    antes, despues, sesionesDespues: posteriores.length,
    cambioPct: antes && despues ? Math.round(((despues - antes) / antes) * 1000) / 10 : null,
  };
}

export interface EjercicioParaMirar { id: string; nombre: string }

const num = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** «Press banca · 1RM est. 103,9 → 108,3 kg (+4,2 %) en 3 sesiones». */
export function textoDeResultado(h: Hipotesis, logs: readonly WorkoutLog[], nombre: string | undefined): string {
  if (!h.exerciseId) return 'No elegiste ejercicio en el que mirarlo: valóralo con lo que ves arriba.';
  const r = antesYDespues(logs, h.exerciseId, h.desde);
  const quien = nombre ?? 'El ejercicio';
  if (r.antes == null || r.despues == null) return `${quien} · aún no hay sesiones a los dos lados del cambio.`;
  const pct = r.cambioPct ?? 0;
  return `${quien} · 1RM est. ${num(r.antes)} → ${num(r.despues)} kg (${pct > 0 ? '+' : ''}${num(pct)} %) en ${r.sesionesDespues} ${r.sesionesDespues === 1 ? 'sesión' : 'sesiones'}`;
}

/** El ejercicio que el cambio nombra, si nombra alguno. */
export function ejercicioDelCambio(cambio: { titulo: string; lineas: string[] }, ejercicios: readonly EjercicioParaMirar[]): string {
  const texto = [cambio.titulo, ...cambio.lineas].join(' ').toLowerCase();
  return [...ejercicios].sort((a, b) => b.nombre.length - a.nombre.length).find(e => texto.includes(e.nombre.toLowerCase()))?.id ?? '';
}
