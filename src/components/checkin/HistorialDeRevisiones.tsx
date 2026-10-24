import React from 'react';
import { Badge } from '../ui';
import type { EstadoHistorial, RevisionDelHistorial } from '../../utils/revisionSemanal';

/* Perfil › Revisión como CONSULTA (K-04, lámina 09): qué semanas se enviaron y
   en qué estado están. Sale de `historialDeRevisiones`, el mismo motor que la
   revisión de esta semana. */

const ESTADO: Record<EstadoHistorial, { texto: string; tono: 'success' | 'info' | 'warning' }> = {
  leida: { texto: 'Leída', tono: 'success' },
  enviada: { texto: 'Enviada', tono: 'info' },
  incompleta: { texto: 'Incompleta', tono: 'warning' },
};

const semanaDel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export default function HistorialDeRevisiones({ revisiones }: { revisiones: RevisionDelHistorial[] }) {
  if (revisiones.length === 0) return null;
  return (
    <section aria-labelledby="historial-revisiones" className="space-y-3">
      <h2 id="historial-revisiones" className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
        Historial de revisiones
      </h2>
      <ul className="divide-y divide-hairline rounded-field border border-hairline bg-surface">
        {revisiones.slice(0, 8).map(r => (
          <li key={r.ciclo} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-sans font-semibold text-body-s text-ink">Semana del {semanaDel(r.ciclo)}</p>
              <p className="font-sans text-caption text-ink-2">
                {r.cuestionarios} cuestionario{r.cuestionarios === 1 ? '' : 's'}
              </p>
            </div>
            <Badge tone={ESTADO[r.estado].tono}>{ESTADO[r.estado].texto}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
