import React from 'react';
import { ExercisePerf } from '../../utils/trainingReport';
import { Delta, Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque 3 — Lo que sube y lo que baja.

   Las dos listas que Dani lee en voz alta. Los filtros que deciden quién entra
   están en `mejoresYPeores` (utils/revisionCoach.ts) y son deliberadamente
   estrictos: un ejercicio que se estrena no «sube un 100 %», dos series sueltas
   no son una tendencia y un ±1 % de Epley es ruido de redondeo. Un dato flojo
   leído en un vídeo cuesta la credibilidad de todo lo demás.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  suben: ExercisePerf[];
  bajan: ExercisePerf[];
  comparacion: string;
}

function Columna({ titulo, icono, tono, filas, vacio }: {
  titulo: string; icono: string; tono: string; filas: ExercisePerf[]; vacio: string;
}) {
  return (
    <div className="flex-1 min-w-[260px] bg-raised border border-hairline rounded-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-hairline flex items-center gap-2">
        <Icon name={icono} size="s" style={{ color: tono }} />
        <span className="font-mono text-caption uppercase tracking-[.1em]" style={{ color: tono }}>{titulo}</span>
      </div>
      {filas.length === 0 ? (
        <p className="px-4 py-3 font-sans text-caption text-ink-3">{vacio}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {filas.map(e => (
            <li key={e.exerciseId} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
              <span className="font-sans text-label text-ink truncate">{e.name}</span>
              <span className="flex items-baseline gap-2 font-mono text-caption tabular-nums shrink-0">
                <span className="text-ink-2">
                  {e.prevBestOrm != null ? `${e.prevBestOrm} → ` : ''}{e.bestOrm} kg
                </span>
                <Delta pct={e.deltaOrmPct} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BloqueMejoresEjercicios({ suben, bajan, comparacion }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <Columna
          titulo="Va a más" icono="trending_up" tono="var(--color-success)" filas={suben}
          vacio="Nada sube por encima del 2 % en esta ventana."
        />
        <Columna
          titulo="Va a menos" icono="trending_down" tono="var(--color-danger)" filas={bajan}
          vacio="Nada baja por encima del 2 %. Buena señal."
        />
      </div>
      <p className="font-mono text-caption text-ink-3">
        1RM estimado por Epley, {comparacion}. Solo entran ejercicios con historial previo y al menos
        3 series en la ventana: un ejercicio que se estrena no tiene con qué compararse.
      </p>
    </div>
  );
}
