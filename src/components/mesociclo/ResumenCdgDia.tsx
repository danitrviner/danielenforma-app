import React, { useMemo } from 'react';
import type { Exercise, WorkoutExercise } from '../../types';
import { useMotorCdg } from '../../hooks/useMotorCdg';
import { resumenSesion } from '../../utils/cdg';
import Icon from '../ui/Icon';

/** «IF 31,8» en la cabecera de un día, con un aviso si algo no cuenta. Nada si no hay catálogo CDG (atleta, o aún sin subir). */
export default function ResumenCdgDia ({ ejercicios, allExercises }: { ejercicios: WorkoutExercise[]; allExercises: Exercise[] }) {
  const { motor } = useMotorCdg();
  const r = useMemo(() => {
    if (!motor) return null;
    const porId = new Map(allExercises.map(e => [e.id, e.cdgNombre]));
    return resumenSesion(motor, ejercicios, id => porId.get(id));
  }, [motor, ejercicios, allExercises]);
  if (!r) return null;
  const problemas = r.rir5.length + r.sinVinculo.length + r.fueraDeCatalogo.length;
  return (
    <span className="font-mono text-caption text-ink-2 tabular-nums" title="Índice de fatiga (IF) de CDG de este día">
      {' · IF '}<b className="text-ink">{(Math.round(r.IF * 10) / 10).toLocaleString('es-ES')}</b>
      {problemas > 0 && (
        <span className="text-warning" title={`${r.rir5.length} con RIR 5, ${r.sinVinculo.length} sin vínculo CDG: no cuentan en el índice`}>
          {' '}<Icon name="warning" size="s" style={{ fontSize: '12px' }} />
        </span>
      )}
    </span>
  );
}
