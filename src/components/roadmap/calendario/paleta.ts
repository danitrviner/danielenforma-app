// Constantes visuales compartidas por los 3 niveles del calendario y el
// sheet — un solo sitio para que un color/icono de estado o categoría no
// pueda desincronizarse entre pantallas (regla dura del handoff: "colores de
// estado y de fase idénticos en los tres niveles").
import { EstadoDia } from '../../../utils/roadmapCalendar';

export interface EstiloEstado {
  color: string;
  fondo: string;
  icono: string;
  label: string;
}

// hecho/parcial/saltado/descanso — colores de estado, iguales en Año/Mes/Día.
export const ESTADO_STYLE: Record<Exclude<EstadoDia, 'plan' | 'sin-datos'>, EstiloEstado> = {
  done: { color: 'var(--color-success)', fondo: 'rgba(62,207,142,0.18)', icono: 'check', label: 'Entreno hecho' },
  partial: { color: 'var(--color-warning)', fondo: 'rgba(253,186,116,0.15)', icono: 'remove', label: 'Parcial' },
  skipped: { color: 'var(--color-danger)', fondo: 'rgba(255,90,78,0.14)', icono: 'close', label: 'Saltado' },
  rest: { color: 'var(--color-ink-3)', fondo: 'transparent', icono: 'bedtime', label: 'Descanso planificado' },
};
// Futuro ('plan') y sin dato ('sin-datos') no tienen relleno — contorno
// punteado (futuro) o un guion (sin dato), nunca un color de estado inventado.
export const ESTADO_PLAN: EstiloEstado = { color: 'var(--color-ink-4)', fondo: 'transparent', icono: 'schedule', label: 'Planificado' };
export const ESTADO_SIN_DATOS: EstiloEstado = { color: 'var(--color-ink-5)', fondo: 'transparent', icono: 'remove', label: 'Sin datos' };

export function estiloDeEstado(estado: EstadoDia): EstiloEstado {
  if (estado === 'plan') return ESTADO_PLAN;
  if (estado === 'sin-datos') return ESTADO_SIN_DATOS;
  return ESTADO_STYLE[estado];
}

// Puntos de categoría (fila de puntitos del resumen) — mismo color en Mes y
// en la leyenda de la columna lateral.
export const COLOR_CAT_ENTRENO = 'var(--color-phase-fuerza)';
export const COLOR_CAT_NUTRICION = 'var(--color-success)';
export const COLOR_CAT_CARDIO = 'var(--color-cat-cardio)';
export const COLOR_CAT_PESO = 'var(--color-ink-2)';

// El oro es solo acción/selección (regla del handoff) — un único token para
// que ningún componente lo repita a mano.
export const COLOR_ACCION = 'var(--color-accent)';

/**
 * Compone un color de fase/estado con transparencia — el equivalente de
 * `color + '1f'` del prototipo (que cuela un byte de alfa detrás de un hex
 * literal). Aquí los colores son `var(--color-fase-*)`, no hex crudo:
 * concatenar texto después de `var(...)` no compone nada — el navegador
 * descarta la declaración entera y la superficie sale transparente. Mismo
 * patrón `color-mix()` que ya usan BodyweightPanel.tsx/SeriesBalance.tsx.
 */
export function mezcla(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`;
}
