/* Reparto propio o CDG en el alta: regla determinista, no del modelo (diseño
   §7). Por defecto, reparto propio + plantillas de Dani (es lo que usa en todos
   los mesociclos auditados). CDG cuando Dani lo marque en la plantilla elegida
   (`MesocycleTemplate.cdg`) o cuando la tipificación de la ficha pida control
   fino de la fatiga: freno ≤ 2 («pupas») o tiempo ≥ 4 (tolera volumen y
   quiere exprimirlo). */
import type { MesocycleTemplate, TipificacionCliente } from '../types.js';

export const FRENO_MAX_PARA_CDG = 2;
export const TIEMPO_MIN_PARA_CDG = 4;

export function usaCdg(o: { plantilla?: Pick<MesocycleTemplate, 'cdg'> | null; tipificacion?: TipificacionCliente | null }): { cdg: boolean; motivo: string } {
  if (o.plantilla?.cdg) return { cdg: true, motivo: 'la plantilla elegida está marcada CDG' };
  const t = o.tipificacion;
  if (t?.freno != null && t.freno <= FRENO_MAX_PARA_CDG) return { cdg: true, motivo: `tipificación: freno ${t.freno} (necesita control fino de la fatiga)` };
  if (t?.tiempo != null && t.tiempo >= TIEMPO_MIN_PARA_CDG) return { cdg: true, motivo: `tipificación: tiempo ${t.tiempo} (tolera volumen: se programa por IEM)` };
  return { cdg: false, motivo: 'reparto propio con las plantillas de Dani (por defecto)' };
}
