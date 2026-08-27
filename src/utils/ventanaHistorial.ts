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
  return d.toISOString().slice(0, 10);
}
