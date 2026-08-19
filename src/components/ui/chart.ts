/* ═══════════════════════════════════════════════════════════════════════════
   Especificación común de las gráficas — F10

   No es una primitiva: Recharts se compone declarando sus propios hijos
   (`<XAxis>`, `<Tooltip>`…), y envolverlo en un componente propio obligaría a
   reimplementar su API entera. Lo que se comparte aquí son las **decisiones
   visuales**, no la estructura: altura, rejilla, ejes, ticks, tooltip,
   márgenes y colores de serie.

   Antes de F10 los 7 paneles tenían 6 alturas, 3 tratamientos de rejilla, 2
   tamaños de tick, 6 márgenes distintos y 4 formas de estilar el tooltip —
   ninguna de ellas mal, pero todas distintas, que es lo que hace que un
   producto parezca descuidado aunque cada pantalla por separado esté bien.

   Los 5 tokens de serie se declararon en F1 (`--color-chart-1..5`) sin ningún
   consumidor, esperando exactamente esta fase.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Alturas. Tres pasos, no seis.
 *
 * `s` para las gráficas que acompañan a otra cosa dentro de una tarjeta, `m`
 * para las que son el contenido principal de un bloque, `l` para las que se
 * leen como una pantalla en sí (proyección de peso, correlaciones).
 *
 * `cardio/HrChart` se queda fuera a propósito: usa `height="100%"` porque
 * rellena el alto que le dé su contenedor durante la sesión en directo, y eso
 * es una decisión de layout, no de escala.
 */
export const ALTURA_GRAFICA = { s: 180, m: 220, l: 280 } as const;

export type AlturaGrafica = keyof typeof ALTURA_GRAFICA;

/**
 * Margen único.
 *
 * Los seis márgenes anteriores diferían sobre todo en `left`, con valores
 * negativos (`-20`, `-28`) que compensaban a mano el ancho por defecto del eje
 * Y de Recharts (60 px). Fijar `width={ANCHO_EJE_Y}` en el `<YAxis>` hace lo
 * mismo sin números mágicos y deja el margen igual en todos los paneles.
 */
export const MARGEN_GRAFICA = { top: 8, right: 16, bottom: 0, left: 0 } as const;

/** Ancho reservado al eje Y. Sustituye a los `left` negativos del margen. */
export const ANCHO_EJE_Y = 34;

/**
 * Rejilla: horizontal, nunca vertical.
 *
 * Cinco de los siete paneles ya lo hacían. Las líneas verticales duplican la
 * información del eje X y ensucian una gráfica de series temporales, que es lo
 * que son todas las de esta app.
 */
export const REJILLA_GRAFICA = {
  strokeDasharray: '3 3',
  stroke: 'var(--color-raised)',
  vertical: false,
} as const;

/**
 * Ticks de los ejes.
 *
 * **11 px, que es el suelo tipográfico del DS.** Estaban a 9 y 10 px: F4 llevó
 * a cero los textos por debajo de 11 en toda la app, pero no vio estos porque
 * son objetos JS, no clases de Tailwind — ni el inventario, ni `tsc`, ni el
 * build los detectan. Es el mismo tipo de punto ciego que la clase de Google
 * que fijaba los iconos a 24 px, encontrado en F7.
 *
 * Monoespaciada a propósito: son cifras en columna, que es justo lo que el DS
 * reserva a la mono.
 */
export const TICK_GRAFICA = {
  fill: 'var(--color-ink-2)',
  fontSize: 11,
  fontFamily: 'monospace',
} as const;

/** Ejes sin línea ni marcas: la rejilla ya da la referencia. */
export const EJE_GRAFICA = { axisLine: false, tickLine: false } as const;

/**
 * Tooltip. Se extiende sobre `<Tooltip {...TOOLTIP_GRAFICA} />`.
 *
 * Parte del que ya tenía `MesocycleDashboard`, que era el más trabajado de los
 * cuatro, corrigiéndole dos cosas: el blanco literal del color de texto pasa a
 * token (era uno de los 25 hex que quedan en componentes) y el radio de 8 px
 * pasa a `--radius-control`, que es la escala que fijó F3.
 */
export const TOOLTIP_GRAFICA = {
  contentStyle: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-hairline)',
    borderRadius: 'var(--radius-control)',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: 'var(--color-ink)',
  },
  labelStyle: {
    color: 'var(--color-ink-2)',
    marginBottom: '4px',
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  itemStyle: { fontFamily: 'monospace', fontSize: '11px' },
} as const;

/** Estilo de la leyenda, para los paneles que la muestran. */
export const LEYENDA_GRAFICA = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: 'var(--color-ink-2)',
  paddingTop: 8,
} as const;

/**
 * Colores de serie, en orden.
 *
 * Los 5 tokens que F1 declaró para esto. Antes cada panel llevaba su propia
 * lista: la de `CorrelationPanel` tenía 8 entradas con tres repetidas, así que
 * dos series distintas podían salir del mismo color en la misma gráfica.
 */
export const SERIES_GRAFICA = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
] as const;

/** Color de la serie `i`, ciclando si hay más series que tokens. */
export function colorSerie(i: number): string {
  return SERIES_GRAFICA[i % SERIES_GRAFICA.length];
}
