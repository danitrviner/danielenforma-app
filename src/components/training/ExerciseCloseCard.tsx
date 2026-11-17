import React from 'react';
import { lecturaDeCalibracion, textoDeComprobacion, type Comprobacion } from '../../utils/calibracionRir';
import { CardioAssignment, Exercise, WorkoutExercise } from '../../types';
import { Icon, Button, Chip } from '../ui';
import { rmDeSerie } from '../../utils/oneRepMax';
import { MOTIVOS_DE_PARADA, type MotivoDeParada } from '../../utils/queTeParo';
import { SetInput } from './setInput';
import Confeti from './Confeti';
import type { Logro, TipoDeLogro } from '../../utils/logrosDelEjercicio';

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
  /** D2: qué paró la última serie. Ausente `onQueParo` = aquí no se pregunta. */
  queParo?: string;
  onQueParo?: (motivo: MotivoDeParada | undefined) => void;
  isLast: boolean;
  nextExerciseName: string | undefined;
  onNext: () => void;
  /** Reabre este ejercicio como tarjeta editable (vuelve a `ExerciseCard`)
   * sin desmarcar ninguna serie — para corregir un peso/reps al volver a un
   * ejercicio ya cerrado, dentro de la misma sesión. */
  onReopen: () => void;
  /** Solo si hay una `CardioAssignment` puntual (con `date`) para el mismo
   * día — las recurrentes por `timesPerWeek` no se pueden atribuir a un día
   * exacto, así que se dejan fuera (ver el plan). Es un aviso, no lleva a
   * ningún sitio: la sesión de fuerza termina aquí igualmente. */
  sameDayCardio: CardioAssignment | null;
  /** Lo conseguido al cerrarlo en esta sesión (ver utils/logrosDelEjercicio). */
  logros?: Logro[];
  /** Recién cerrado: suena la animación una vez. */
  festejar?: boolean;
  /** Primera tarjeta de una pareja de series alternas: el «Siguiente» va en la segunda. */
  sinSiguiente?: boolean;
  /** F4: una serie al máximo ha comprobado el RIR que venía apuntando. */
  comprobacion?: Comprobacion | null;
  /** D5: molestia de 1 a 10. Solo se pregunta si lo que le paró fue una molestia. */
  molestia?: number;
  onMolestia?: (valor: number | undefined) => void;
  /** F3: una frase que pone en contexto el resultado cuando no hay nada que celebrar. */
  mensaje?: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip.tsx). */
  key?: React.Key;
}

const ICONO_DE_LOGRO: Record<TipoDeLogro, string> = {
  record: 'military_tech',
  tonelaje: 'fitness_center',
  progreso: 'trending_up',
};

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
 * criterio (`rmDeSerie` + mejor histórico ANTES de la fecha) para que el atleta lo
 * vea en el momento, no al final de los 5 ejercicios.
 */
export default function ExerciseCloseCard({
  we, ex, exSets, priorBestOrm, noteValue, onNoteChange, queParo, onQueParo, isLast, nextExerciseName,
  onNext, onReopen, sameDayCardio, logros, festejar, sinSiguiente, comprobacion, molestia, onMolestia, mensaje,
}: Props) {
  const idNota = React.useId();
  const doneSets = exSets.filter(s => s.done);
  const volumen = doneSets.reduce((sum, s) => sum + (parseFloat(s.weight) || 0) * (parseInt(s.repsDone) || 0), 0);

  let bestSet: SetInput | null = null;
  let bestOrm = 0;
  for (const s of doneSets) {
    const orm = rmDeSerie(s);
    if (orm > bestOrm) { bestOrm = orm; bestSet = s; }
  }
  const esRecord = bestOrm > 0 && priorBestOrm != null && bestOrm > priorBestOrm;

  const rpes = doneSets.map(rpeDeSerie).filter((n): n is number => n != null);
  const rpeMedio = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  const addChip = (texto: string) => {
    onNoteChange(noteValue.trim() ? `${noteValue.trim()}. ${texto}` : texto);
  };

  return (
    <div className="relative bg-surface border border-hairline rounded-surface overflow-hidden">
      {festejar && <Confeti />}
      <div className="flex items-center gap-3 p-4 border-b border-hairline">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/14 text-success flex-shrink-0">
          <Icon name="check" size="s" filled />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans font-bold text-title-s text-ink truncate">{ex?.name || we.exerciseId} cerrado</p>
          <p className="font-mono text-caption text-ink-2">{doneSets.length} series</p>
        </div>
        <button
          type="button"
          onClick={onReopen}
          className="font-mono text-caption font-bold text-ink-2 uppercase tracking-wide flex items-center gap-1 shrink-0 hover:text-accent-ink"
        >
          <Icon name="edit" size="s" />
          Editar
        </button>
      </div>

      {logros && logros.length > 0 ? (
        <div className="mx-4 mt-4 rounded-surface border border-accent/40 bg-accent-bg p-4 space-y-3 animate-seal-pop">
          {logros.map((l, i) => (
            <div key={l.tipo} className="flex items-start gap-3">
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-accent text-on-accent' : 'bg-hairline text-accent-ink'}`}>
                <Icon name={ICONO_DE_LOGRO[l.tipo]} size="s" filled />
              </span>
              <div className="min-w-0">
                <p className={`font-sans font-bold text-ink ${i === 0 ? 'text-title-s' : 'text-body-s'}`}>{l.titulo}</p>
                <p className="font-sans text-label text-ink-2">{l.detalle}</p>
              </div>
            </div>
          ))}
        </div>
      ) : esRecord && bestSet && (
        <div className="mx-4 mt-4 rounded-surface border border-accent/40 bg-accent-bg p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-caption font-bold uppercase tracking-wide text-accent-ink">Récord personal</span>
            <span className="font-mono text-caption font-bold text-on-accent bg-accent px-2 py-0.5 rounded-control">Nuevo</span>
          </div>
          <p className="font-mono text-title-l font-bold text-ink">
            {bestSet.weight}<span className="text-label font-sans font-normal text-ink-2"> kg × {bestSet.repsDone}</span>
          </p>
        </div>
      )}

      {/* F3: sin récord ni logro, una frase para que un día igual no se lea como un fracaso. */}
      {mensaje && !(logros && logros.length > 0) && !(esRecord && bestSet) && (
        <p className="mx-4 mt-4 font-sans text-label text-ink-2">{mensaje}</p>
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

      {/* F4: el RIR, comprobado. Solo sale cuando una serie al máximo permite
          compararlo con lo que apuntó; el resto de días no hay nada que decir. */}
      {comprobacion && (
        <div className={`mx-4 mt-4 rounded-surface border p-3.5 ${lecturaDeCalibracion(comprobacion.desfase) === 'calibrado' ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
          <p className="font-mono text-caption font-bold uppercase tracking-wide text-ink-2">Tu RIR, comprobado</p>
          <p className="mt-1 font-sans text-label text-ink">{textoDeComprobacion(comprobacion)}</p>
        </div>
      )}

      {/* D2: lo que limitó la serie decide si el ejercicio vale para ese
          músculo. Un toque, y volver a tocar lo quita. */}
      {onQueParo && (
        <div className="mx-4 mt-4">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wide mb-2">¿Qué te ha parado en la última serie?</p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_DE_PARADA.map(m => {
              const puesto = queParo === m.clave;
              return (
                <button
                  key={m.clave}
                  type="button"
                  onClick={() => onQueParo(puesto ? undefined : m.clave)}
                  aria-pressed={puesto}
                  className={`rounded-control border px-2.5 py-1.5 font-sans text-label transition-colors ${
                    puesto ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2 hover:text-ink'
                  }`}
                >
                  {m.etiqueta}
                </button>
              );
            })}
          </div>
          {/* D5: cuánto molesta, para distinguir «lo noto» de «no puedo seguir». */}
          {queParo === 'molestia' && onMolestia && (
            <div className="mt-3">
              <p className="font-mono text-caption text-ink-2 uppercase tracking-wide mb-2">¿Cuánto te molesta, de 1 a 10?</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onMolestia(molestia === v ? undefined : v)}
                    aria-pressed={molestia === v}
                    aria-label={`Molestia ${v} de 10`}
                    className={`h-9 w-9 rounded-control border font-mono text-label transition-colors ${
                      molestia === v ? (v >= 6 ? 'border-danger text-danger' : 'border-accent-line text-accent-ink') : 'border-hairline text-ink-2 hover:text-ink'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mx-4 mt-4 space-y-2.5">
        <label htmlFor={idNota} className="font-mono text-caption text-ink-2 uppercase tracking-wide block">Nota para tu coach</label>
        <textarea
          id={idNota}
          value={noteValue}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Escribe cómo te has sentido…"
          rows={2}
          className="w-full bg-bg border border-control-line rounded-control p-3 text-title-s text-ink placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
        <div className="flex flex-wrap gap-2">
          {CHIPS_RAPIDOS.map(c => <Chip key={c} onClick={() => addChip(c)}>{c}</Chip>)}
        </div>
      </div>

      {isLast && sameDayCardio && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-surface border border-dashed border-accent-line p-3.5">
          <Icon name="favorite" size="m" className="text-accent-ink flex-shrink-0" />
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
        {sinSiguiente ? null : isLast ? (
          // Sin botón primario propio: sería un segundo "primary" visible a
          // la vez que "Terminar sesión" de la barra fija de abajo, y el DS
          // solo permite uno (ver Button.tsx). Este es el último ejercicio,
          // así que solo hace falta señalar que ya se puede cerrar.
          <p className="flex items-center gap-2 font-sans text-label text-ink-2">
            <Icon name="arrow_downward" size="s" className="text-accent-ink" />
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
