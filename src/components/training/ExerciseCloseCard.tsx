import React from 'react';
import { CardioAssignment, Exercise, WorkoutExercise } from '../../types';
import { Icon, Button, Chip } from '../ui';
import { epley } from '../../utils/oneRepMax';
import { SetInput } from './setInput';

interface Props {
  we: WorkoutExercise;
  ex: Exercise | undefined;
  exSets: SetInput[];
  /** Mejor 1RM estimado ANTES de esta sesión para este ejercicio — `undefined`
   * si no hay historial previo (un primer registro nunca es récord, mismo
   * criterio que `allTimeBestBefore`/`handleFinish` de siempre). */
  priorBestOrm: number | undefined;
  noteValue: string;
  onNoteChange: (value: string) => void;
  isLast: boolean;
  nextExerciseName: string | undefined;
  onNext: () => void;
  /** Solo si hay una `CardioAssignment` puntual (con `date`) para el mismo
   * día — las recurrentes por `timesPerWeek` no se pueden atribuir a un día
   * exacto, así que se dejan fuera (ver el plan). Es un aviso, no lleva a
   * ningún sitio: la sesión de fuerza termina aquí igualmente. */
  sameDayCardio: CardioAssignment | null;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip.tsx). */
  key?: React.Key;
}

const CHIPS_RAPIDOS = ['Me sobró una rep', 'Molestia leve', 'Buena técnica', 'Mucho peso'];

function rpeDeSerie(s: SetInput): number | null {
  if (s.rir === 'fallo') return 10;
  const n = Number(s.rir);
  return Number.isFinite(n) ? 10 - n : null;
}

/**
 * Cierre de ejercicio (mockup "Serie en curso v2", frame 06) — se muestra en
 * vez de `ExerciseCard` en cuanto todas las series de la página están
 * marcadas. A diferencia de hoy (el récord solo se calculaba al terminar TODA
 * la sesión, en `handleFinish`), aquí se calcula por ejercicio con el mismo
 * criterio (`epley` + mejor histórico ANTES de la fecha) para que el atleta lo
 * vea en el momento, no al final de los 5 ejercicios.
 */
export default function ExerciseCloseCard({
  we, ex, exSets, priorBestOrm, noteValue, onNoteChange, isLast, nextExerciseName,
  onNext, sameDayCardio,
}: Props) {
  const doneSets = exSets.filter(s => s.done);
  const volumen = doneSets.reduce((sum, s) => sum + (parseFloat(s.weight) || 0) * (parseInt(s.repsDone) || 0), 0);

  let bestSet: SetInput | null = null;
  let bestOrm = 0;
  for (const s of doneSets) {
    const orm = epley(s.weight, s.repsDone);
    if (orm > bestOrm) { bestOrm = orm; bestSet = s; }
  }
  const esRecord = bestOrm > 0 && priorBestOrm != null && bestOrm > priorBestOrm;

  const rpes = doneSets.map(rpeDeSerie).filter((n): n is number => n != null);
  const rpeMedio = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  const addChip = (texto: string) => {
    onNoteChange(noteValue.trim() ? `${noteValue.trim()}. ${texto}` : texto);
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-hairline">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/14 text-success flex-shrink-0">
          <Icon name="check" size="s" filled />
        </span>
        <div className="min-w-0">
          <p className="font-sans font-bold text-title-s text-ink truncate">{ex?.name || we.exerciseId} cerrado</p>
          <p className="font-mono text-caption text-ink-2">{doneSets.length} series</p>
        </div>
      </div>

      {esRecord && bestSet && (
        <div className="mx-4 mt-4 rounded-surface border border-accent/40 bg-accent-bg p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-caption font-bold uppercase tracking-wide text-accent">Récord personal</span>
            <span className="font-mono text-caption font-bold text-on-accent bg-accent px-2 py-0.5 rounded-control">Nuevo</span>
          </div>
          <p className="font-mono text-title-l font-bold text-ink">
            {bestSet.weight}<span className="text-label font-sans font-normal text-ink-2"> kg × {bestSet.repsDone}</span>
          </p>
        </div>
      )}

      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <div className="bg-raised rounded-surface p-3">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Volumen</p>
          <p className="font-mono text-title-m font-bold text-ink">{Math.round(volumen).toLocaleString('es-ES')}</p>
        </div>
        <div className="bg-raised rounded-surface p-3">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">RPE medio</p>
          <p className="font-mono text-title-m font-bold text-ink">{rpeMedio != null ? rpeMedio.toFixed(1) : '—'}</p>
        </div>
      </div>

      <div className="mx-4 mt-4 space-y-2.5">
        <label className="font-mono text-caption text-ink-2 uppercase tracking-wide block">Nota para tu coach</label>
        <textarea
          value={noteValue}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Escribe cómo te has sentido…"
          rows={2}
          className="w-full bg-bg border border-hairline rounded-control p-3 text-title-s text-ink placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
        <div className="flex flex-wrap gap-2">
          {CHIPS_RAPIDOS.map(c => <Chip key={c} onClick={() => addChip(c)}>{c}</Chip>)}
        </div>
      </div>

      {isLast && sameDayCardio && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-surface border border-dashed border-accent-line p-3.5">
          <Icon name="favorite" size="m" className="text-accent flex-shrink-0" />
          <div>
            <p className="font-sans text-body-s text-ink">Hoy toca cardio después</p>
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">
              {sameDayCardio.type === 'zona2' ? 'Zona 2' : sameDayCardio.type === 'intervalos' ? 'Intervalos' : 'Cardio libre'}
              {sameDayCardio.targetDurationSec ? ` · ${Math.round(sameDayCardio.targetDurationSec / 60)} min` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="p-4">
        {isLast ? (
          // Sin botón primario propio: sería un segundo "primary" visible a
          // la vez que "Terminar sesión" de la barra fija de abajo, y el DS
          // solo permite uno (ver Button.tsx). Este es el último ejercicio,
          // así que solo hace falta señalar que ya se puede cerrar.
          <p className="flex items-center gap-2 font-sans text-label text-ink-2">
            <Icon name="arrow_downward" size="s" className="text-accent" />
            Último ejercicio — termina la sesión con el botón de abajo.
          </p>
        ) : (
          <Button variant="primary" size="l" icon="arrow_forward" onClick={onNext} fullWidth>
            Siguiente{nextExerciseName ? `: ${nextExerciseName}` : ''}
          </Button>
        )}
      </div>
    </div>
  );
}
