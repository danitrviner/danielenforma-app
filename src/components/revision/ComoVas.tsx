import React from 'react';
import type { ExercisePerf } from '../../utils/trainingReport';
import type { ProgresoDelObjetivo } from '../../utils/progresoDelObjetivo';
import type { EjerciciosDeLaSemana } from '../../utils/revisionDeLaSemana';
import { fraseDeCambio } from '../../utils/revisionDeLaSemana';
import ObjetivoDelBloque from '../training/ObjetivoDelBloque';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   3 · Cómo vas (18-11-2026)

   El peso (la gráfica y su ritmo frente al de la fase), los ejercicios que
   suben y bajan —esta semana contra la anterior, y en el periodo elegido
   arriba—, el objetivo del bloque si lo hay (la franja que ve él en Rutinas) y
   las medidas y fotos solo la semana en que hay alguna nueva. Lo de las
   medidas y la gráfica de peso lo pinta quien monta esto (`children`): son
   componentes que ya existían.

   En su idioma: «mueves un 4 % más en press», nada de RM estimado.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  /** «Bajas 240 g a la semana; en esta fase buscamos…», si hay fase. */
  fraseDelPeso: string | null;
  /** La gráfica de peso (BodyweightPanel). */
  grafica: React.ReactNode;
  semana: EjerciciosDeLaSemana;
  /** Lo que sube y baja en el periodo elegido arriba, y contra qué. */
  periodo: { suben: ExercisePerf[]; bajan: ExercisePerf[]; etiqueta: string; comparacion: string };
  objetivo: ProgresoDelObjetivo | null;
  /** Medidas y fotos de esta semana; `null` si no hay nada nuevo. */
  medidas?: React.ReactNode;
}

function Lista({ titulo, filas }: { titulo: string; filas: ExercisePerf[] }) {
  if (filas.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{titulo}</p>
      <ul className="m-0 p-0 list-none space-y-1">
        {filas.map(e => {
          const sube = (e.deltaOrmPct ?? 0) > 0;
          return (
            <li key={e.exerciseId} className="flex flex-wrap items-baseline gap-x-2 font-sans text-label">
              <Icon name={sube ? 'trending_up' : 'trending_down'} size="s" className={`shrink-0 self-center ${sube ? 'text-success' : 'text-danger'}`} />
              <span className="text-ink font-bold">{e.name}</span>
              <span className="text-ink-2">{fraseDeCambio(e.deltaOrmPct)}</span>
              {e.isPR && <span className="font-mono text-caption text-accent-ink uppercase">récord</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ComoVas({ fraseDelPeso, grafica, semana, periodo, objetivo, medidas }: Props) {
  const hayEstaSemana = semana.suben.length + semana.bajan.length > 0;
  const hayPeriodo = periodo.suben.length + periodo.bajan.length > 0;
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {fraseDelPeso && (
          <p className="flex items-start gap-1.5 font-sans text-body-s text-ink text-pretty">
            <Icon name="monitor_weight" size="s" className="text-accent-ink shrink-0 mt-0.5" />
            <span>{fraseDelPeso}</span>
          </p>
        )}
        {grafica}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-raised border border-hairline rounded-surface p-4 space-y-3">
          <p className="font-sans font-bold text-label text-ink">
            Esta semana frente a la anterior
            {semana.records > 0 && (
              <span className="font-mono font-normal text-caption text-accent-ink ml-2">
                {semana.records} {semana.records === 1 ? 'récord' : 'récords'}
              </span>
            )}
          </p>
          {hayEstaSemana ? (
            <>
              <Lista titulo="Va a más" filas={semana.suben} />
              <Lista titulo="Va a menos" filas={semana.bajan} />
            </>
          ) : (
            <p className="font-sans text-label text-ink-2">Todo se mantiene: nada se mueve más de un 3 % arriba o abajo.</p>
          )}
        </div>
        <div className="bg-raised border border-hairline rounded-surface p-4 space-y-3">
          <p className="font-sans font-bold text-label text-ink">
            {periodo.etiqueta}
            <span className="font-mono font-normal text-caption text-ink-3 ml-2">{periodo.comparacion}</span>
          </p>
          {hayPeriodo ? (
            <>
              <Lista titulo="Va a más" filas={periodo.suben} />
              <Lista titulo="Va a menos" filas={periodo.bajan} />
            </>
          ) : (
            <p className="font-sans text-label text-ink-2">Todo se mantiene: nada se mueve más de un 3 % arriba o abajo.</p>
          )}
        </div>
      </div>

      {objetivo && <ObjetivoDelBloque progreso={objetivo} />}

      {medidas}
    </div>
  );
}
