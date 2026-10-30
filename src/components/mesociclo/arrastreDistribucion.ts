import type React from 'react';
import type { ChoqueDiasSeguidos } from '../../utils/programacion';
import type { MuscleGroup } from '../../types';

/* Lo que comparten las dos vistas de la Distribución (por días y semana):
   el arrastre de un grupo entre días y las dos estimaciones de la cabecera. */

/** Tipo propio del arrastre: así una tarjeta sabe que lo que llega es un grupo
 *  de la distribución y no, por ejemplo, un texto arrastrado desde otra web. */
export const TIPO_ARRASTRE_GRUPO = 'application/x-enforma-grupo';

export interface GrupoArrastrado { dia: number; idx: number }

export function empezarArrastre(e: React.DragEvent, g: GrupoArrastrado, imagen?: HTMLElement | null) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(TIPO_ARRASTRE_GRUPO, JSON.stringify(g));
  if (imagen) e.dataTransfer.setDragImage(imagen, 12, imagen.offsetHeight / 2);
}

/** Mientras se arrastra solo se pueden leer los TIPOS, no el contenido. */
export const traeGrupo = (e: React.DragEvent) => e.dataTransfer.types.includes(TIPO_ARRASTRE_GRUPO);

export function leerArrastre(e: React.DragEvent): GrupoArrastrado | null {
  try {
    const g = JSON.parse(e.dataTransfer.getData(TIPO_ARRASTRE_GRUPO));
    return Number.isInteger(g?.dia) && Number.isInteger(g?.idx) ? g : null;
  } catch { return null; }
}

/** Minutos por serie contando el descanso: una orientación para la cabecera del
 *  día, no el tiempo del motor CDG (ese sale con los ejercicios elegidos). */
export const MINUTOS_POR_SERIE = 2.5;
export const minutosEstimados = (series: number) => Math.round((series * MINUTOS_POR_SERIE) / 5) * 5;

/** Para cada sesión, los grupos que caen en días seguidos y el OTRO día (1-based). */
export function choquesPorSesion(choques: ChoqueDiasSeguidos[], offsets: number[], sesiones: number): Map<MuscleGroup, number>[] {
  return Array.from({ length: sesiones }, (_, s) => {
    const dia = offsets[s] ?? s;
    const m = new Map<MuscleGroup, number>();
    for (const c of choques) {
      if (c.dias[0] === dia) m.set(c.group, c.dias[1] + 1);
      else if (c.dias[1] === dia) m.set(c.group, c.dias[0] + 1);
    }
    return m;
  });
}
