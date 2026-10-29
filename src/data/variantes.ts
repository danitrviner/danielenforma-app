/* ═══════════════════════════════════════════════════════════════════════════
   Variantes elegidas (29-10-2026)

   Regla de Dani: cada pieza nueva de la app se le enseña en 2-3 versiones y
   se elige al final. Hasta entonces, la app usa la primera de cada una. Este
   fichero es el único sitio que hay que tocar al elegir: cada componente lee
   su variante de aquí por defecto y la admite como prop para la galería
   (`/dev/variantes`).
   ═══════════════════════════════════════════════════════════════════════════ */

export const VARIANTES = {
  /** Panel de retención encima de la bandeja del coach. */
  panelRetencion: 'cifras' as 'cifras' | 'linea' | 'dos',
  /** «Lo último de Dani» en Inicio. */
  loUltimo: 'lista' as 'lista' | 'ultimo' | 'carrusel',
  /** Cuadro de respuesta a la revisión (coach). */
  respuestaCoach: 'tres' as 'tres' | 'uno',
  /** «Dani ha revisado tu semana» (atleta). */
  respuestaAtleta: 'bloques' as 'bloques' | 'corrido',
  /** «Tu primera semana» en Inicio. */
  primeraSemana: 'lista' as 'lista' | 'pasos',
  /** Sala de espera: cómo se enseña la fecha comprometida. */
  salaEspera: 'insignia' as 'insignia' | 'cuenta',
  /** «Lo que viniste a buscar». */
  viniste: 'cita' as 'cita' | 'cifras',
  /** Road map del atleta. */
  roadmap: 'camino' as 'camino' | 'mapa' | 'compacta',
};

export type Variantes = typeof VARIANTES;
