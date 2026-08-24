import React, { useMemo } from 'react';
import {
  Exercise, MuscleGroup, MuscleGroupConfig, WeekDistribution, WorkoutExercise,
  MUSCLE_LABELS_SHORT,
} from '../../types';
import {
  seriesPorGrupo, seriesPlanificadasDelDia, seriesPlanificadasDelMeso, balanceDeSeries,
} from '../../utils/programacion';
import SeriesBalance from './SeriesBalance';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Vista previa de «Generar rutinas».

   A propósito NO trae el editor de prescripción completo (reps, RIR, descanso,
   técnica, calentamiento, progresión, vídeo). En este paso el coach decide una
   sola cosa —QUÉ ejercicios cubren las series que la distribución repartió, en
   qué orden y con cuántas series cada uno— y el editor entero convertía esa
   decisión en un muro de controles por ejercicio. El ajuste fino vive en la
   pestaña «Ejercicios», ya con el mesociclo asignado.

   Lo que sí añade, porque era justo lo que faltaba: el balance por grupo. Sin
   él, quitar un ejercicio dejaba el día por debajo del volumen planificado sin
   que nada lo dijera.
   ═══════════════════════════════════════════════════════════════════════════ */

// Extiende WorkoutExercise (no es una forma paralela) para que la previa pueda
// arrastrar los mismos campos que el editor de rutinas. `name`/`muscleGroup`/
// `equipmentMismatch` son extras de presentación, que se quitan al asignar.
export interface PreviewExercise extends WorkoutExercise {
  name: string;
  muscleGroup: MuscleGroup;
  equipmentMismatch?: boolean;
}

export interface PreviewDay {
  dayIndex: number;
  exercises: PreviewExercise[];
  warnings: string[];
}

interface Props {
  days: PreviewDay[];
  distribution?: WeekDistribution;
  mesoGroups: Record<MuscleGroup, MuscleGroupConfig>;
  mesoNumber: number;
  weeks: number;
  daysPerWeek: number;
  /** Semanas que dura una vuelta del microciclo (1 = semanal). */
  semanasDelCiclo: number;
  /** Veces que se repite el microciclo dentro del mesociclo. */
  vueltas: number;
  /** En qué día del ciclo (0-based) cae cada sesión — para titular «Día N» por
      el día real de calendario, no por la posición en la lista de sesiones. */
  offsets: number[];
  catalogo: Exercise[];
  onSets: (dayIdx: number, exIdx: number, sets: number) => void;
  onMove: (dayIdx: number, exIdx: number, delta: -1 | 1) => void;
  onRemove: (dayIdx: number, exIdx: number) => void;
  onReplace: (dayIdx: number, exIdx: number) => void;
  onAdd: (dayIdx: number) => void;
  onBack: () => void;
  onAssign: () => void;
}

function SetsStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-inset rounded-control px-1 py-0.5 flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Quitar una serie"
        className="w-8 h-8 sm:w-6 sm:h-6 rounded-control text-ink-2 hover:bg-white/5 disabled:opacity-30 font-mono text-body-s sm:text-label font-bold flex items-center justify-center transition-colors"
      >−</button>
      <span className="w-9 text-center font-mono text-title-s font-bold text-ink tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={value >= 20}
        aria-label="Añadir una serie"
        className="w-8 h-8 sm:w-6 sm:h-6 rounded-control bg-accent/14 text-accent hover:bg-accent/22 disabled:opacity-30 font-mono text-body-s sm:text-label font-bold flex items-center justify-center transition-colors"
      >+</button>
    </div>
  );
}

export default function RoutinePreview({
  days, distribution, mesoGroups, mesoNumber, weeks, daysPerWeek, semanasDelCiclo, vueltas, offsets, catalogo,
  onSets, onMove, onRemove, onReplace, onAdd, onBack, onAssign,
}: Props) {
  // Balance de la SEMANA: lo pautado en todos los días contra el volumen del
  // mesociclo (pestaña «Volumen»), que es el número que el coach decidió antes
  // de repartir nada.
  const balanceSemana = useMemo(() => balanceDeSeries(
    seriesPorGrupo(days.flatMap(d => d.exercises), catalogo),
    seriesPlanificadasDelMeso(mesoGroups, semanasDelCiclo),
  ), [days, catalogo, mesoGroups, semanasDelCiclo]);

  const referenciaCiclo = semanasDelCiclo === 1
    ? 'el volumen del mesociclo'
    : `el volumen del ciclo (${semanasDelCiclo.toLocaleString('es-ES')} semanas)`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-sans font-bold text-white text-body-s">Vista previa de rutinas</p>
          <p className="font-mono text-caption text-ink-2">
            Meso #{mesoNumber} · {weeks} semanas · {vueltas} vueltas × {daysPerWeek} sesiones =&nbsp;
            <span className="text-accent">{vueltas * daysPerWeek} sesiones</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-3 py-2 font-mono text-label text-ink-2 hover:text-white border border-hairline rounded-control transition-all flex items-center gap-1"
          >
            <Icon name="arrow_back" size="s" />
            Volver
          </button>
          <button
            onClick={onAssign}
            className="px-4 py-2 bg-accent text-black font-sans text-label font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all flex items-center gap-2"
          >
            <Icon name="assignment_turned_in" size="s" />
            Asignar al atleta
          </button>
        </div>
      </div>

      {/* Balance semanal — la cuenta que decide si esta rutina es la que se
          configuró en «Volumen» o se ha quedado corta por el camino. */}
      <div className="bg-surface border border-hairline rounded-surface px-4 py-3">
        <SeriesBalance balance={balanceSemana} referencia={referenciaCiclo} ocultarSiVacio={false} />
      </div>

      <div className="flex flex-wrap gap-3">
        {days.map((pd, dayIdx) => {
          const dayPlan  = distribution?.days[dayIdx];
          const balance  = balanceDeSeries(
            seriesPorGrupo(pd.exercises, catalogo),
            seriesPlanificadasDelDia(dayPlan),
          );
          const totalSeries = pd.exercises.reduce((s, e) => s + e.sets, 0);

          return (
            <div key={dayIdx} className="bg-surface border border-hairline rounded-surface p-4 flex-1 min-w-[300px] max-w-[420px] space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-hairline">
                <span className="font-mono text-label font-bold text-accent uppercase truncate">
                  Día {(offsets[dayIdx] ?? dayIdx) + 1}{dayPlan?.dayType ? ` · ${dayPlan.dayType}` : ''}
                </span>
                <span className="font-mono text-caption text-ink-2 flex-shrink-0 tabular-nums">
                  {totalSeries} series · {pd.exercises.length} ejerc.
                </span>
              </div>

              <SeriesBalance balance={balance} referencia="la distribución del día" />

              {pd.warnings.length > 0 && (
                <div className="space-y-0.5">
                  {pd.warnings.map((w, wi) => (
                    <p key={wi} className="text-caption font-mono text-orange-400 flex items-center gap-1">
                      <Icon name="warning" size="s" />
                      Sin ejercicios para {w}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                {pd.exercises.length === 0 && (
                  <p className="font-sans text-caption text-ink-3 py-2">Sin ejercicios en este día.</p>
                )}
                {pd.exercises.map((pe, exIdx) => (
                  <div key={`${pe.exerciseId}-${exIdx}`} className="bg-raised rounded-surface px-2.5 py-2 flex items-center gap-2">
                    {/* Reordenar — el orden de los ejercicios ES una decisión de
                        programación (básicos primero), no un detalle estético. */}
                    <div className="flex flex-col flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onMove(dayIdx, exIdx, -1)}
                        disabled={exIdx === 0}
                        aria-label="Subir ejercicio"
                        className="text-ink-3 hover:text-accent disabled:opacity-20 disabled:hover:text-ink-3 transition-colors"
                      ><Icon name="keyboard_arrow_up" size="s" /></button>
                      <button
                        type="button"
                        onClick={() => onMove(dayIdx, exIdx, 1)}
                        disabled={exIdx === pd.exercises.length - 1}
                        aria-label="Bajar ejercicio"
                        className="text-ink-3 hover:text-accent disabled:opacity-20 disabled:hover:text-ink-3 transition-colors"
                      ><Icon name="keyboard_arrow_down" size="s" /></button>
                    </div>

                    <span className="font-mono text-caption text-ink-3 tabular-nums w-4 flex-shrink-0">{exIdx + 1}</span>

                    <div className="min-w-0 flex-1">
                      <p className="text-label font-sans font-bold text-white truncate">{pe.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-caption text-ink-2">{MUSCLE_LABELS_SHORT[pe.muscleGroup]}</span>
                        {pe.equipmentMismatch && (
                          <span
                            title="Material no disponible según el onboarding"
                            className="inline-flex items-center gap-0.5 font-mono text-caption text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 rounded-control"
                          >
                            <Icon name="warning" size="s" style={{ fontSize: '11px' }} />
                            sin material
                          </span>
                        )}
                      </div>
                    </div>

                    <SetsStepper value={pe.sets} onChange={v => onSets(dayIdx, exIdx, v)} />

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => onReplace(dayIdx, exIdx)}
                        title="Cambiar ejercicio"
                        aria-label="Cambiar ejercicio"
                        className="text-ink-3 hover:text-accent transition-colors"
                      ><Icon name="swap_horiz" size="s" /></button>
                      <button
                        onClick={() => onRemove(dayIdx, exIdx)}
                        title="Quitar ejercicio"
                        aria-label="Quitar ejercicio"
                        className="text-ink-3 hover:text-red-400 transition-colors"
                      ><Icon name="close" size="s" /></button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onAdd(dayIdx)}
                className="w-full flex items-center justify-center gap-2 bg-bg border border-dashed border-hairline rounded-control px-3 py-2 text-title-s font-sans text-ink-2 hover:text-accent hover:border-accent/40 transition-all"
              >
                <Icon name="add" size="s" />
                Añadir ejercicio
              </button>
            </div>
          );
        })}
      </div>

      <p className="font-sans text-caption text-ink-3">
        Aquí solo se eligen ejercicios, orden y series. Reps, RIR, descanso, técnica, calentamiento,
        progresión y vídeo se ajustan en la pestaña «Ejercicios» una vez asignado.
      </p>
    </div>
  );
}
