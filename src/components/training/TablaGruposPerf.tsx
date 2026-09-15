import React from 'react';
import { Delta } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   TablaGruposPerf — series, tonelaje y 1RM medio por grupo, con su variación.

   Vivía dentro de MesocycleReviewPanel, pero ya se escribió deliberadamente
   agnóstica al tipo: le da igual que `group` sea un MuscleGroup o un
   MovementPattern, porque MuscleGroupPerf (trainingReport.ts) y PatternPerf
   (movementPatterns.ts) tienen la misma forma. Extraerla es lo que permite
   que la pestaña de Revisión del coach la reutilice sin duplicar la tabla ni
   acoplarse a ninguno de los dos tipos.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Forma común a `MuscleGroupPerf` y `PatternPerf`. */
export interface GroupPerfLike {
  group: string;
  label: string;
  tonnage: number;
  tonnageDeltaPct: number | null;
  sets: number;
  meanOrm: number | null;
  ormDeltaPct: number | null;
}

interface Props {
  grupos: GroupPerfLike[];
  /** Etiqueta de la ventana con la que se compara: «4 semanas antes», «Macrociclo 3»… */
  comparacion: string;
  /** Texto del estado vacío — cambia según se agrupe por grupo muscular o por patrón. */
  vacio?: string;
  /**
   * Nota al pie. Por defecto explica que estas series son las EFECTIVAS
   * PONDERADAS (principal 1, secundario 0,5), que no son las mismas que las
   * de la tabla de volumen: esa cuenta solo el principal, que es la unidad
   * con la que se programó el mesociclo. Quien monte la tabla en un contexto
   * donde esa aclaración no aplique, que pase `null`.
   */
  nota?: string | null;
}

const NOTA_SERIES_PONDERADAS =
  'Las series de esta tabla son efectivas ponderadas: el grupo principal del ejercicio cuenta 1 y cada ' +
  'secundario 0,5. La tabla de «Volumen» cuenta solo el principal, que es la unidad con la que se programó.';

export default function TablaGruposPerf({
  grupos,
  comparacion,
  vacio = 'Sin series registradas por grupo muscular.',
  nota = NOTA_SERIES_PONDERADAS,
}: Props) {
  if (grupos.length === 0) {
    return <p className="font-sans text-caption text-ink-3">{vacio}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: '520px' }}>
          <thead>
            <tr className="bg-bg">
              <th className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Series</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Tonelaje</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">vs {comparacion}</th>
              <th className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">1RM medio</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <tr key={g.group} className="border-b border-hairline last:border-b-0">
                <td className="px-3 py-2.5 font-sans text-label text-ink whitespace-nowrap">{g.label}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">{g.sets}</td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink tabular-nums">
                  {g.tonnage.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg
                </td>
                <td className="px-3 py-2.5 text-right"><Delta pct={g.tonnageDeltaPct} /></td>
                <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">
                  {g.meanOrm != null ? `${g.meanOrm} kg` : '—'} <Delta pct={g.ormDeltaPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota && <p className="font-mono text-caption text-ink-3">{nota}</p>}
    </div>
  );
}
