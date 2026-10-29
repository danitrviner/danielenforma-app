/* Qué hace falta para deshacer una propuesta aplicada: el `snapshotAntes` que
   guardó al aplicarse, en orden inverso. Sin snapshot no hay deshacer, y se
   dice (las propuestas de antes del 28-10-2026 no lo tienen). */
import type { AiProposal, SnapshotDocumento } from '../types';

export type PlanDeDeshacer =
  | { ok: true; fotos: SnapshotDocumento[]; resumen: string }
  | { ok: false; motivo: string };

export function planDeDeshacer(p: AiProposal): PlanDeDeshacer {
  if (p.status !== 'approved' && p.status !== 'aplicada') {
    return { ok: false, motivo: 'Solo se puede deshacer una propuesta que se haya aplicado.' };
  }
  const fotos = p.snapshotAntes ?? [];
  if (fotos.length === 0) {
    return { ok: false, motivo: 'Esta propuesta no guardó cómo estaba todo antes (es anterior al 28-10-2026): hay que deshacerla a mano.' };
  }
  const borrar = fotos.filter(f => f.datos === null).length;
  const restaurar = fotos.length - borrar;
  const partes = [
    restaurar ? `${restaurar} documento${restaurar === 1 ? '' : 's'} vuelve${restaurar === 1 ? '' : 'n'} a como estaba${restaurar === 1 ? '' : 'n'}` : '',
    borrar ? `${borrar} creado${borrar === 1 ? '' : 's'} se borra${borrar === 1 ? '' : 'n'}` : '',
  ].filter(Boolean);
  return { ok: true, fotos: [...fotos].reverse(), resumen: partes.join(' · ') };
}

/** Las colecciones que toca, para saber qué refrescar en pantalla. */
export function coleccionesDe(fotos: SnapshotDocumento[]): string[] {
  return [...new Set(fotos.map(f => f.coleccion))];
}
