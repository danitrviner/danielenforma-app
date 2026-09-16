/* ═══════════════════════════════════════════════════════════════════════════
   Ventana por defecto del historial del atleta

   Los registros diarios —peso, pasos, cumplimiento de dieta— son un documento
   por atleta y día, y las consultas los traían TODOS desde el alta. Medido en
   el emulador con dos años de historial: 2.184 documentos en cada sesión, solo
   entre esas tres colecciones, y creciendo unos 3 al día para siempre.

   La ventana corta eso de raíz: 171 documentos a los seis meses, y los mismos
   171 a los dos años. Deja de crecer.

   Es un PARÁMETRO OPCIONAL, no un valor por defecto escondido en la capa de
   datos: sin él las funciones se comportan igual que siempre. Así las pantallas
   que de verdad necesitan el historial completo —análisis del coach, reportes,
   correlaciones— siguen pidiéndolo sin cambiar nada, y la ventana se aplica
   solo donde se paga cara: las pantallas que el atleta abre a diario.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MESES_HISTORIAL_POR_DEFECTO = 3;

/** Fecha `YYYY-MM-DD` de hace N meses. */
export function desdeHaceMeses(meses = MESES_HISTORIAL_POR_DEFECTO, hoy = new Date()): string {
  const d = new Date(hoy);
  d.setMonth(d.getMonth() - meses);
  // En local, no en UTC: `toISOString()` a las 00:30 en España devuelve la
  // víspera, y una ventana que empieza un día antes de lo que dice su nombre
  // es un fallo silencioso — no falla, solo trae un día de más cada noche.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── Ventanas con nombre ────────────────────────────────────────────────────
   Un número suelto en cada pantalla se desincroniza: dos consultas de la misma
   colección con ventanas distintas son dos entradas de caché y dos lecturas,
   no una. Estas funciones son la forma de que varias pantallas compartan
   EXACTAMENTE la misma clave. */

/** Cardio del atleta: 12 meses. Lo más largo que mira cualquier consumidor es
 *  la carga de entrenamiento (42 días) y la lista con filtros; un año cubre de
 *  sobra las dos y deja de crecer para siempre. */
export function ventanaCardio(hoy = new Date()): string {
  return desdeHaceMeses(12, hoy);
}

/** Pasos en las pantallas que el atleta abre a diario: 12 meses. Lo más largo
 *  que mira cualquier consumidor es la proyección de peso sobre el programa de
 *  nutrición en curso; la media de pasos son 28 días. Un año cubre los dos.
 *
 *  Ojo: los ENTRENOS no se pueden acotar igual. La escalera de niveles y las
 *  fases del plan usan `bestSet` sobre el historial completo —el mejor
 *  levantamiento de siempre—, así que recortarlo haría que un atleta dejara de
 *  cumplir un criterio que ya cumplía. */
export function ventanaPasos(hoy = new Date()): string {
  return desdeHaceMeses(12, hoy);
}

/** Línea base de HRV: 3 meses. Aquí la ventana no es solo coste, es criterio:
 *  una línea base calculada sobre dos años de lecturas no se mueve nunca, así
 *  que una mejora real de la variabilidad no llega a notarse en la puntuación
 *  de preparación. La línea base de HRV es rodante por definición. */
export function ventanaHrv(hoy = new Date()): string {
  return desdeHaceMeses(3, hoy);
}
