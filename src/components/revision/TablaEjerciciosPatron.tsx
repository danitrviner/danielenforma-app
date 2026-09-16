import React from 'react';
import { ExercisePerf } from '../../utils/trainingReport';
import { MONTHS_ES } from '../../utils/trainingWeek';
import { Delta, Badge, Sparkline } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Los ejercicios que hay dentro de un patrón, cuando el coach lo despliega.

   Es el nivel de detalle que falta hoy: `MesocycleReviewPanel` enseña el
   agregado por patrón y `LoadHistoryPanel` enseña UN ejercicio a la vez con su
   curva, pero entre los dos no había forma de decir «las tracciones suben un
   8 %, y suben por el remo, no por el jalón».

   La columna de tendencia es del historial ENTERO, no de la ventana. El
   porcentaje de al lado compara dos ventanas y no sabe distinguir «lleva medio
   año subiendo» de «rebotó después de tres meses cayendo», que es justo la
   diferencia entre felicitar y preocuparse. Y la fecha de la última sesión
   contesta a la pregunta que siempre viene después: «¿esto está bajando, o es
   que hace tres semanas que no lo toca?».
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  ejercicios: ExercisePerf[];
  comparacion: string;
  vacio?: string;
  /** Curva EWMA del 1RM de cada ejercicio, de `revision.curvaPorEjercicio`. */
  curvas?: Record<string, number[]>;
  /** Última fecha con serie registrada, de `revision.ultimaSesionPorEjercicio`. */
  ultimaSesion?: Record<string, string>;
}

function fechaCorta(iso: string | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MONTHS_ES[parseInt(m, 10) - 1]}`;
}

export default function TablaEjerciciosPatron({
  ejercicios, comparacion, vacio = 'Sin ejercicios registrados en este patrón.',
  curvas, ultimaSesion,
}: Props) {
  if (ejercicios.length === 0) {
    return <p className="font-sans text-caption text-ink-3 px-1 py-2">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-surface border border-hairline">
      <table className="w-full border-collapse" style={{ minWidth: '640px' }}>
        <thead>
          <tr className="bg-bg">
            <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Ejercicio</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Series</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">1RM est.</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">vs {comparacion}</th>
            <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Tendencia</th>
            <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Últ. sesión</th>
          </tr>
        </thead>
        <tbody>
          {ejercicios.map(e => (
            <tr key={e.exerciseId} className="border-b border-hairline last:border-b-0">
              <td className="px-3 py-2.5 font-sans text-label text-ink">
                <span className="inline-flex items-center gap-2">
                  {e.name}
                  {e.isPR && <Badge tone="success">Récord</Badge>}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{e.sets}</td>
              <td className="px-3 py-2.5 text-right font-mono text-label text-ink tabular-nums">
                {e.bestOrm > 0 ? `${e.bestOrm} kg` : '—'}
              </td>
              <td className="px-3 py-2.5 text-right"><Delta pct={e.deltaOrmPct} /></td>
              <td className="px-3 py-2.5">
                {/* Con un punto no hay tendencia que dibujar: una barra sola
                    parece una caída a cero. */}
                {(curvas?.[e.exerciseId]?.length ?? 0) > 1
                  ? <Sparkline values={curvas![e.exerciseId]} label={`Evolución del 1RM de ${e.name}`} />
                  : <span className="font-mono text-caption text-ink-3">—</span>}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-caption text-ink-3 tabular-nums whitespace-nowrap">
                {fechaCorta(ultimaSesion?.[e.exerciseId])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
