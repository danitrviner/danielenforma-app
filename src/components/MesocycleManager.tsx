import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MuscleGroup, MuscleGroupConfig, Mesocycle, UserProfile, Workout,
  DayPlan, DayAssignment, WeekDistribution, Exercise, WorkoutExercise, TemplateDay,
  WorkoutLog, WorkoutAssignment,
  MUSCLE_LABELS, MUSCLE_LABELS_SHORT, MUSCLE_ORDER,
} from '../types';
import {
  getMesocycles, createMesocycle, updateMesocycle, deleteMesocycle,
  getAllUserProfiles, getExercises, getWorkouts, updateWorkout,
  createWorkoutStrict, createWorkoutAssignmentStrict,
  deleteWorkoutsByMesocycleIdStrict, deleteWorkoutAssignmentsByMesocycleIdStrict,
  getUserProfileByEmail, migratePrimaryFocusToMuscleGroup,
  getMesocycleTemplates, createTask, getWorkoutLogs, getWorkoutAssignmentsByMesocycleIds,
} from '../dbService';
import ExerciseConfigEditor from './ExerciseConfigEditor';
import RoutinePreview, { PreviewDay, PreviewExercise } from './training/RoutinePreview';
import SeriesBalance from './training/SeriesBalance';
import MesocycleReviewPanel from './MesocycleReviewPanel';
import {
  balanceDeSeries, seriesPorGrupo, seriesPlanificadasDelDia, seriesPlanificadasDelMeso, duracionEstimadaMin,
  frecuenciaSemanal, gruposEnDiasSeguidos, repartoDeSeries, runDistribution,
} from '../utils/programacion';
import ExercisePickerSheet from './ExercisePickerSheet';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import { MesocycleTemplate } from '../types';
import { diasDeCiclo, offsetsDeSesiones, formateaFrecuencia, vueltasDelCiclo } from '../utils/progression';
import { atletasActivos } from '../utils/atletas';
import {
  TRAINING_SPLITS, DAY_TYPE_MUSCLES, getSplitsForDays, recommendSplit,
  cicloDeSplit, sesionesDeSplit, tiposDeEntrenamiento, offsetsDeSplit, frecuenciaSemanalDeSplit,
  type TrainingSplit,
} from '../utils/trainingSplits';
import { zoneLabel, heatmapBg, heatmapText, VOLUME_ZONE_LEGEND, GENERIC_LANDMARK } from '../utils/volumeZones';
import { VOLUME_LANDMARKS_DEFAULT, type VolumeLandmark } from '../data/volumeLandmarks';
import { getVolumeLandmarks } from '../dbService';
import VolumeSuggestionSheet from './VolumeSuggestionSheet';
import { useToast } from '../hooks/useToast';
import { useAthleteProfileSignals } from '../hooks/useAthleteProfileSignals';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import { useConfirm } from '../hooks/useConfirm';
import { Skeleton } from './ui';
import { EmptyState, Dialog, Input, Icon, Tabs, TabItem, Sheet, Pager } from './ui';

// ─── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = MUSCLE_ORDER;


const DEFAULT_GROUPS = (): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(
    MUSCLE_GROUPS.map(g => [g, { series: 0, priority: 'media' as const }])
  ) as Record<MuscleGroup, MuscleGroupConfig>;

// Heatmap/zoneLabel/LEGEND ahora viven en utils/volumeZones.ts, leyendo la
// tabla de landmarks por grupo en vez de umbrales fijos iguales para los 17
// grupos musculares (antes duplicados aquí y en MesocycleTemplateLibrary.tsx).

// ─── Distribution engine ──────────────────────────────────────────────────────

function buildSnapshot(m: Mesocycle) {
  const groupSeries: Partial<Record<MuscleGroup, number>> = {};
  MUSCLE_GROUPS.forEach(g => { if (m.groups[g].series > 0) groupSeries[g] = m.groups[g].series; });
  return {
    daysPerWeek: m.daysPerWeek,
    cycleDays: m.cycleDays,
    splitId: m.splitId,
    // Serializado a texto: es el único campo del snapshot que es un array, y
    // la comparación de abajo es toda por igualdad simple.
    customOffsets: m.customOffsets ? m.customOffsets.join(',') : undefined,
    groupSeries,
  };
}

function isStale(m: Mesocycle, dist: WeekDistribution): boolean {
  const cur  = buildSnapshot(m);
  const snap = dist.snapshot;
  if (cur.daysPerWeek !== snap.daysPerWeek) return true;
  if (cur.cycleDays !== snap.cycleDays) return true;
  if (cur.splitId !== snap.splitId) return true;
  if (cur.customOffsets !== snap.customOffsets) return true;
  const keys = new Set([...Object.keys(cur.groupSeries), ...Object.keys(snap.groupSeries)]) as Set<MuscleGroup>;
  for (const k of keys) {
    if (cur.groupSeries[k] !== snap.groupSeries[k]) return true;
  }
  return false;
}

// ─── Generator types & helpers ────────────────────────────────────────────────

type GeneratorPhase = 'idle' | 'loading' | 'preview' | 'assigning' | 'done' | 'error';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stepper({ value, min = 0, max = 25, onChange, landmark }: {
  value: number; min?: number; max?: number; onChange: (v: number) => void; landmark?: VolumeLandmark;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-11 h-11 sm:w-6 sm:h-6 rounded-control bg-raised text-ink-2 hover:bg-raised disabled:opacity-30 text-body-s sm:text-label font-bold flex items-center justify-center flex-shrink-0"
      >−</button>
      <span className="w-8 text-center font-mono text-body-s font-bold" style={{ color: heatmapText(value, landmark) }}>
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-11 h-11 sm:w-6 sm:h-6 rounded-control bg-raised text-ink-2 hover:bg-raised disabled:opacity-30 text-body-s sm:text-label font-bold flex items-center justify-center flex-shrink-0"
      >+</button>
    </div>
  );
}

function PrioritySelector({ value, onChange }: {
  value: 'alta' | 'media' | 'baja';
  onChange: (v: 'alta' | 'media' | 'baja') => void;
}) {
  const opts = [
    { v: 'alta'  as const, icon: '⭐', label: 'Alta'  },
    { v: 'media' as const, icon: '◑',  label: 'Media' },
    { v: 'baja'  as const, icon: '⚪', label: 'Baja'  },
  ];
  return (
    <div className="flex gap-1">
      {opts.map(o => (
        <button
          key={o.v} onClick={() => onChange(o.v)} title={o.label}
          className={`min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 px-2 rounded-control text-title-s sm:text-label font-mono transition-all flex items-center justify-center ${
            value === o.v ? 'bg-accent text-black font-bold' : 'bg-raised text-ink-2 hover:bg-raised'
          }`}
        >{o.icon}</button>
      ))}
    </div>
  );
}

// Editable — the auto-generated distribution is a starting point, not a final answer;
// the coach can nudge series, remove a group, move one to another day, or add a group
// that the algorithm didn't place, all without recalculating from scratch.
//
// Cada asignación es una "fila-chip": nombre + series editables, con un botón de mover
// que despliega los días destino inline (en vez del <select> nativo de antes) y uno de
// quitar. El total del día se lee grande y en mono, coloreado por zona — igual criterio
// que el heatmap de la tabla de volumen — y un aviso ámbar aparece cuando se pasa de 12.
const DayCard: React.FC<{
  day: DayPlan;
  dayIdx: number;
  daysPerWeek: number;
  /**
   * En qué día del ciclo (0-based) cae cada sesión. Sin esto, una tarjeta se
   * numeraría por su posición en la lista de SESIONES ("Día 3" = la 3ª sesión
   * que existe) en vez de por el día real del calendario — y si el 3 se marcó
   * como descanso, la 3ª sesión cae en realidad el día 4, así que llamarla
   * "Día 3" haría parecer que el descanso no se respetó.
   */
  offsets: number[];
  onSeriesChange: (aIdx: number, series: number) => void;
  onRemove: (aIdx: number) => void;
  onMove: (aIdx: number, targetDayIdx: number) => void;
  onAddGroup: (group: MuscleGroup) => void;
}> = ({ day, dayIdx, daysPerWeek, offsets, onSeriesChange, onRemove, onMove, onAddGroup }) => {
  const [moveOpenIdx, setMoveOpenIdx] = useState<number | null>(null);
  const total   = day.totalSeries;
  const optimal = total >= 9 && total <= 12;
  const over    = total > 12;
  const totalColor = optimal ? 'var(--color-success)' : over ? 'var(--color-warning)' : 'var(--color-ink-2)';
  const placedGroups = new Set(day.assignments.map(a => a.group));
  const otherDays = Array.from({ length: daysPerWeek }, (_, i) => i).filter(i => i !== dayIdx);
  const availableGroups = MUSCLE_GROUPS.filter(g => !placedGroups.has(g));
  const diaCalendario = (sesion: number) => (offsets[sesion] ?? sesion) + 1;

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 flex-1 min-w-[220px] max-w-[300px] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider flex-1 min-w-0 truncate">
Día {diaCalendario(dayIdx)}{day.dayType ? ` · ${day.dayType}` : ''}
        </span>
        <span className="font-mono text-title-m font-bold tabular-nums" style={{ color: totalColor }}>{total}</span>
        <span className="font-mono text-caption text-ink-3">series</span>
      </div>

      <div className="space-y-1.5 min-h-[44px]">
        {day.assignments.length === 0 ? (
          <p className="text-caption text-ink-3 font-mono italic py-2">Descanso</p>
        ) : (
          day.assignments.map((a, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5 bg-inset border border-hairline rounded-control px-2 py-1.5">
                <span className="text-label text-white font-sans font-semibold truncate flex-1 min-w-0">{MUSCLE_LABELS[a.group]}</span>
                <input
                  type="number" min={0} max={25}
                  value={a.series}
                  onChange={e => onSeriesChange(i, parseInt(e.target.value) || 0)}
                  className="w-9 bg-transparent border-none p-0 text-center text-white font-mono text-title-s font-bold focus:outline-none focus:ring-0"
                />
                {otherDays.length > 0 && (
                  <button
                    onClick={() => setMoveOpenIdx(moveOpenIdx === i ? null : i)}
                    title="Mover a otro día"
                    className={`flex-shrink-0 transition-colors ${moveOpenIdx === i ? 'text-accent' : 'text-ink-3 hover:text-accent'}`}
                  >
                    <Icon name="swap_horiz" size="s" />
                  </button>
                )}
                <button onClick={() => onRemove(i)} className="text-ink-3 hover:text-red-400 transition-colors flex-shrink-0">
                  <Icon name="close" size="s" />
                </button>
              </div>
              {moveOpenIdx === i && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 pl-1 animate-fade-up">
                  {otherDays.map(d => (
                    <button
                      key={d}
                      onClick={() => { onMove(i, d); setMoveOpenIdx(null); }}
                      className="px-2.5 py-1 rounded-full font-mono text-caption font-bold text-accent bg-accent/12 border border-accent-line hover:bg-accent/20 transition-colors"
                    >
                      Día {diaCalendario(d)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {over && (
        <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-control px-2.5 py-2">
          <span className="font-mono text-caption font-bold text-orange-400 mt-px">!</span>
          <span className="text-caption font-sans text-orange-300 leading-relaxed">Este día supera las 12 series recomendadas.</span>
        </div>
      )}

      {availableGroups.length > 0 && (
        <div className="relative flex items-center">
          <select
            value=""
            onChange={e => { if (e.target.value) onAddGroup(e.target.value as MuscleGroup); }}
            className="appearance-none w-full bg-bg border border-dashed border-hairline rounded-control pl-2 pr-8 py-2 text-title-s font-sans text-ink-2 focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">+ Añadir grupo…</option>
            {availableGroups.map(g => (
              <option key={g} value={g}>{MUSCLE_LABELS[g]}</option>
            ))}
          </select>
          <span className="ui-icon pointer-events-none absolute right-2 text-ink-3" style={{ fontSize: '16px' }} aria-hidden>expand_more</span>
        </div>
      )}
    </div>
  );
};

// La frecuencia más alta que da un reparto a algún grupo. Es el número con el
// que un entrenador elige entre plantillas: «esta me deja el pecho a 1,5».
//
// Deja fuera los grupos que caben en TODOS los días del reparto (core, lumbares
// y rotadores están en cada tipo de día a propósito, para poder colocarlos donde
// haga falta). Contarlos haría que cualquier plantilla dijera "hasta 3×/sem",
// que es la frecuencia del core, no la del reparto.
function frecuenciaMaximaDeSplit(split: TrainingSplit): number {
  const tipos = tiposDeEntrenamiento(split);
  const especificos = MUSCLE_GROUPS.filter(g =>
    !tipos.every(t => (DAY_TYPE_MUSCLES[t] ?? []).includes(g)));
  return Math.max(0, ...especificos.map(g => frecuenciaSemanalDeSplit(split, g)));
}

// Calendario de una vuelta del microciclo: qué días se entrena y cuáles son de
// descanso. Sin esto la duración del ciclo es un número abstracto — y es
// justo lo que decide la frecuencia real de cada grupo.
//
// Con `onToggleDay` se vuelve editable: pulsar un día lo cambia de sesión a
// descanso o al revés. `personalizado` distingue el estado (naranja) de un
// calendario tocado a mano del automático (oro) — para que se note que ya no
// es lo que el ciclo/reparto elegido calcularía solo.
const CalendarioCiclo: React.FC<{
  cicloDias: number;
  offsets: number[];
  tipos: string[];
  sesiones: number;
  onToggleDay?: (dia: number) => void;
  personalizado?: boolean;
  onRestablecer?: () => void;
}> = ({ cicloDias, offsets, tipos, sesiones, onToggleDay, personalizado = false, onRestablecer }) => {
  const porDia = new Map(offsets.map((off, i) => [off, tipos[i] ?? `Sesión ${i + 1}`]));
  const tono = personalizado ? 'text-orange-400' : 'text-accent';
  const tonoFondo = personalizado ? 'border-orange-500/40 bg-orange-500/10' : 'border-accent-line bg-accent/10';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
          Calendario del ciclo ({cicloDias} días · {offsets.length}/{sesiones} sesiones{personalizado ? ' · a mano' : ''})
        </span>
        {personalizado && onRestablecer && (
          <button
            type="button"
            onClick={onRestablecer}
            className="font-mono text-caption font-bold text-accent hover:text-white transition-colors flex items-center gap-1"
          >
            <Icon name="undo" size="s" />
            Volver al automático
          </button>
        )}
      </div>
      {onToggleDay && (
        <p className="font-sans text-caption text-ink-3 leading-relaxed">
          Pulsa un día para cambiarlo entre sesión y descanso. {offsets.length < sesiones
            ? `Faltan ${sesiones - offsets.length} por colocar.`
            : offsets.length > sesiones ? `Sobran ${offsets.length - sesiones} — quita alguna.` : ''}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: cicloDias }, (_, d) => {
          const tipo = porDia.get(d);
          const Elemento: React.ElementType = onToggleDay ? 'button' : 'div';
          return (
            <Elemento
              key={d}
              type={onToggleDay ? 'button' : undefined}
              onClick={onToggleDay ? () => onToggleDay(d) : undefined}
              title={tipo ? `Día ${d + 1}: ${tipo}${onToggleDay ? ' — pulsa para poner descanso' : ''}` : `Día ${d + 1}: descanso${onToggleDay ? ' — pulsa para poner sesión' : ''}`}
              className={`min-w-[52px] flex-1 max-w-[92px] rounded-control border px-1.5 py-1 text-center transition-colors ${
                tipo ? tonoFondo : 'border-hairline bg-inset'
              } ${onToggleDay ? 'cursor-pointer hover:border-strong' : ''}`}
            >
              <span className={`block font-mono text-caption ${tipo ? tono : 'text-ink-3'}`}>D{d + 1}</span>
              <span className={`block font-sans text-caption truncate ${tipo ? 'text-white' : 'text-ink-3'}`}>
                {tipo ?? '—'}
              </span>
            </Elemento>
          );
        })}
      </div>
    </div>
  );
};

// ─── Progression view ─────────────────────────────────────────────────────────

const PRIORITY_ICON: Record<'alta' | 'media' | 'baja', string> = {
  alta: '⭐', media: '◑', baja: '⚪',
};

function Delta({ delta, showEqual = false }: { delta: number | null; showEqual?: boolean }) {
  if (delta === null) return null;
  if (delta > 0) return <span className="font-mono text-caption text-success ml-1 tabular-nums">▲+{delta}</span>;
  if (delta < 0) return <span className="font-mono text-caption text-danger ml-1 tabular-nums">▼{delta}</span>;
  return showEqual ? <span className="font-mono text-caption text-ink-3 ml-1">=</span> : null;
}

// Shows what "Generar rutinas" (in Distribución) actually produced for this mesocycle —
// the meso's volume/priority config and the exercises it generates are the same thing
// end to end, not two disconnected screens the coach has to reconcile by hand.
function MesoExercisesView({
  groups, loading, weeks, allExercises, onUpdateExercise, onReplaceExercise, onAddExercise, onRemoveExercise,
  onMoveExercise, onGoToDistribution, libraryWorkouts, onUseLibraryWorkout, distribution, mesoGroups, semanasDelCiclo,
  onRenameDay,
}: {
  groups: MesoWorkoutGroup[];
  loading: boolean;
  weeks: number;
  allExercises: Exercise[];
  onUpdateExercise: (group: MesoWorkoutGroup, exIdx: number, patch: Partial<WorkoutExercise>) => void;
  onReplaceExercise: (group: MesoWorkoutGroup, exIdx: number) => void;
  onAddExercise: (group: MesoWorkoutGroup) => void;
  onRemoveExercise: (group: MesoWorkoutGroup, exIdx: number) => void;
  onMoveExercise: (group: MesoWorkoutGroup, exIdx: number, delta: -1 | 1) => void;
  onGoToDistribution: () => void;
  libraryWorkouts: Workout[];
  onUseLibraryWorkout: (group: MesoWorkoutGroup, workout: Workout) => void;
  distribution?: WeekDistribution;
  mesoGroups: Record<MuscleGroup, MuscleGroupConfig>;
  semanasDelCiclo: number;
  onRenameDay: (group: MesoWorkoutGroup, nuevoNombre: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-surface" />
        <Skeleton className="h-16 w-full rounded-surface" />
        <Skeleton className="h-16 w-full rounded-surface" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="border border-dashed border-hairline rounded-surface">
        <EmptyState
          icon="fitness_center"
          title="Aún no se han generado rutinas para este mesociclo."
          actionLabel="Ir a Distribución para generarlas"
          onAction={onGoToDistribution}
        />
      </div>
    );
  }

  return <MesoExercisesTabs {...{ groups, weeks, allExercises, onUpdateExercise, onReplaceExercise, onAddExercise, onRemoveExercise, onMoveExercise, libraryWorkouts, onUseLibraryWorkout, distribution, mesoGroups, semanasDelCiclo, onRenameDay }} />;
}

const PREFIJO_DIA = /^(Día\s*\d+\s*–\s*)(.*)$/i;

// Título del día, editable. Solo se toca lo que va después de «Día N – »
// (ver comentario junto a `handleRenameDay`): ese prefijo es lo que mantiene
// el orden de los días y la comparación contra la distribución semanal.
function DayTitle({ name, editing, value, onStartEdit, onChangeValue, onCommit, onCancel }: {
  name: string;
  editing: boolean;
  value: string;
  onStartEdit: (prefijo: string, sufijoActual: string) => void;
  onChangeValue: (v: string) => void;
  onCommit: (prefijo: string) => void;
  onCancel: () => void;
}) {
  const m = PREFIJO_DIA.exec(name);
  const prefijo = m ? m[1] : '';
  const sufijo = m ? m[2] : name;

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {prefijo && <span className="font-sans text-body-s text-ink-3 flex-shrink-0">{prefijo}</span>}
        <input
          autoFocus
          type="text"
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommit(prefijo);
            if (e.key === 'Escape') onCancel();
          }}
          onBlur={() => onCommit(prefijo)}
          className="min-w-0 flex-1 bg-inset border border-accent/40 rounded-control px-2 py-1 font-sans font-bold text-body-s text-white focus:outline-none"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onStartEdit(prefijo, sufijo)}
      title="Renombrar día"
      className="flex items-center gap-1.5 min-w-0 group text-left"
    >
      <p className="font-sans font-bold text-body-s text-white truncate">{name}</p>
      <Icon name="edit" size="s" className="text-ink-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
    </button>
  );
}

// Un día por pestaña en vez de todos los días apilados en la misma pantalla —
// con 5-6 días el grid antiguo obligaba a hacer scroll constante para comparar
// ejercicios de días distintos. Aquí solo se ve un día a la vez, con su vídeo.
function MesoExercisesTabs({
  groups, weeks, allExercises, onUpdateExercise, onReplaceExercise, onAddExercise, onRemoveExercise,
  onMoveExercise, libraryWorkouts, onUseLibraryWorkout, distribution, mesoGroups, semanasDelCiclo,
  onRenameDay,
}: {
  groups: MesoWorkoutGroup[];
  weeks: number;
  allExercises: Exercise[];
  onUpdateExercise: (group: MesoWorkoutGroup, exIdx: number, patch: Partial<WorkoutExercise>) => void;
  onReplaceExercise: (group: MesoWorkoutGroup, exIdx: number) => void;
  onAddExercise: (group: MesoWorkoutGroup) => void;
  onRemoveExercise: (group: MesoWorkoutGroup, exIdx: number) => void;
  onMoveExercise: (group: MesoWorkoutGroup, exIdx: number, delta: -1 | 1) => void;
  libraryWorkouts: Workout[];
  onUseLibraryWorkout: (group: MesoWorkoutGroup, workout: Workout) => void;
  onRenameDay: (group: MesoWorkoutGroup, nuevoNombre: string) => void;
  distribution?: WeekDistribution;
  mesoGroups: Record<MuscleGroup, MuscleGroupConfig>;
  semanasDelCiclo: number;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [videoModal, setVideoModal] = useState<{ key: string; url: string; name: string } | null>(null);
  const [libraryPickerFor, setLibraryPickerFor] = useState<MesoWorkoutGroup | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const group = groups[Math.min(activeIdx, groups.length - 1)];

  // Saltar al ejercicio que está descuadrando un grupo muscular — click en un
  // chip de `SeriesBalance`. Si el grupo aparece en varios días, empieza a
  // buscar por `preferredDayIdx` (el día que ya se está viendo) y si no está
  // ahí, coge el primer día donde aparezca.
  const exerciseRefs = useRef(new Map<string, HTMLDivElement>());
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const jumpToGroup = useCallback((targetGroup: MuscleGroup, preferredDayIdx?: number) => {
    const orden = preferredDayIdx !== undefined
      ? [preferredDayIdx, ...groups.map((_, i) => i).filter(i => i !== preferredDayIdx)]
      : groups.map((_, i) => i);
    for (const dayIdx of orden) {
      const exIdx = groups[dayIdx].exercises.findIndex(we =>
        (we.muscleGroup ?? allExercises.find(e => e.id === we.exerciseId)?.muscleGroup) === targetGroup);
      if (exIdx === -1) continue;
      const key = `${groups[dayIdx].name}-${exIdx}`;
      const irYResaltar = () => {
        exerciseRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedKey(key);
        window.setTimeout(() => setHighlightedKey(k => k === key ? null : k), 1600);
      };
      if (dayIdx !== activeIdx) {
        setActiveIdx(dayIdx);
        window.setTimeout(irYResaltar, 420); // espera al scroll horizontal del Pager entre días
      } else {
        irYResaltar();
      }
      return;
    }
  }, [groups, allExercises, activeIdx]);

  // Renombrar un día. El generador nombra cada tarjeta «Día N – Meso #X»
  // (línea ~1420) y `groupMesoWorkouts` ordena los días por ese nombre
  // (numeric-aware) — tocar el «Día N –» rompería el orden Y el `dayIndexOf`
  // de más abajo, que lo vuelve a parsear para saber contra qué día de la
  // distribución comparar el balance. Por eso solo se edita lo que va
  // después: el coach puede poner «Empuje», «Pierna dominante rodilla»… sin
  // arriesgarse a desordenar el mesociclo sin querer.
  const [renamingDay, setRenamingDay] = useState<{ name: string; value: string } | null>(null);
  const { showToast: showRenameToast } = useToast();

  function handleRenameDay(group: MesoWorkoutGroup, prefijo: string, sufijoNuevo: string) {
    const sufijo = sufijoNuevo.trim();
    if (!sufijo) return;
    const nuevoNombre = `${prefijo}${sufijo}`;
    if (nuevoNombre === group.name) return;
    if (groups.some(g => g !== group && g.name === nuevoNombre)) {
      showRenameToast('Ya hay un día con ese nombre', 'error');
      return;
    }
    onRenameDay(group, nuevoNombre);
  }

  // Un exerciseId repetido en más de un día puede ser intencional (p. ej. un
  // básico que se entrena dos veces por semana), pero el coach quiere verlo
  // de un vistazo en vez de descubrirlo semanas después revisando día a día.
  const duplicateExerciseIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups) {
      for (const we of g.exercises) {
        counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1);
      }
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [groups]);

  // Balance de la SEMANA: lo pautado en los días contra el volumen del
  // mesociclo. Es la cuenta que se descuadra sin avisar cuando se cambia un
  // ejercicio, se copia una rutina de biblioteca o se toca el volumen después
  // de haber generado — hasta ahora había que sumarlo a mano día por día.
  const balanceSemana = useMemo(() => balanceDeSeries(
    seriesPorGrupo(groups.flatMap(g => g.exercises), allExercises),
    seriesPlanificadasDelMeso(mesoGroups, semanasDelCiclo),
  ), [groups, allExercises, mesoGroups, semanasDelCiclo]);

  const referenciaCiclo = semanasDelCiclo === 1
    ? 'el volumen del mesociclo'
    : `el volumen del ciclo (${semanasDelCiclo.toLocaleString('es-ES')} semanas)`;

  // A qué día de la distribución corresponde cada tarjeta. El nombre que crea
  // el generador es «Día N – Meso #X»; si viene de una plantilla puede ser
  // cualquier cosa, y entonces vale la posición en la lista.
  const dayIndexOf = (name: string, idx: number): number => {
    const m = /d[ií]a\s*(\d+)/i.exec(name);
    return m ? parseInt(m[1], 10) - 1 : idx;
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openVideoModal = (videoKey: string, ex: Exercise | undefined) => {
    if (!ex?.videoUrl) return;
    setVideoModal({ key: videoKey, url: ex.videoUrl, name: ex.name });
  };

  return (
    <div className="space-y-4">
      <p className="font-mono text-caption text-ink-2">
        Cada sesión se repite igual en todas las vueltas del mesociclo — edita aquí y se aplica a todas a la vez.
      </p>

      <div className="bg-surface border border-hairline rounded-surface px-4 py-3">
        <SeriesBalance balance={balanceSemana} referencia={referenciaCiclo} ocultarSiVacio={false} onGroupClick={jumpToGroup} />
      </div>

      {/* Carrusel de días — solo el día activo muestra su contenido debajo */}
      <Tabs
        label="Días del mesociclo"
        value={group?.name ?? ''}
        onChange={id => {
          const i = groups.findIndex(g => g.name === id);
          if (i >= 0) setActiveIdx(i);
        }}
        items={groups.map(g => ({ id: g.name, label: g.name } as TabItem))}
      />

      {/* Swipe entre días (Bloque C1) — misma `activeIdx` que los Tabs de
          arriba, así que saltar directo y deslizar con el dedo nunca se
          desincronizan: los dos mueven el mismo estado. */}
      {groups.length > 0 && (
        <Pager label="Días del mesociclo" value={activeIdx} onChange={setActiveIdx}>
          {groups.map((g, gIdx) => (
            <div key={g.name} className="bg-surface border border-hairline rounded-surface overflow-hidden">
              <div className="px-4 py-3 bg-bg border-b border-hairline space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DayTitle
                    name={g.name}
                    editing={renamingDay?.name === g.name}
                    value={renamingDay?.name === g.name ? renamingDay.value : ''}
                    onStartEdit={(_, sufijoActual) => setRenamingDay({ name: g.name, value: sufijoActual })}
                    onChangeValue={v => setRenamingDay({ name: g.name, value: v })}
                    onCommit={prefijo => { void handleRenameDay(g, prefijo, renamingDay?.value ?? ''); setRenamingDay(null); }}
                    onCancel={() => setRenamingDay(null)}
                  />
                  <span className="font-mono text-caption text-ink-2 tabular-nums">
                    {g.exercises.reduce((s, e) => s + e.sets, 0)} series · {g.exercises.length} ejercicios
                    {duracionEstimadaMin(g.exercises) > 0 && (
                      <span title="Series × (45 s de trabajo + descanso). Sin contar el calentamiento.">
                        {' · ~'}{duracionEstimadaMin(g.exercises)} min
                      </span>
                    )}
                  </span>
                </div>
                <SeriesBalance
                  balance={balanceDeSeries(
                    seriesPorGrupo(g.exercises, allExercises),
                    seriesPlanificadasDelDia(distribution?.days[dayIndexOf(g.name, gIdx)]),
                  )}
                  referencia="la distribución del día"
                  onGroupClick={g => jumpToGroup(g, gIdx)}
                />
              </div>
              <div className="p-3 space-y-2">
                {g.exercises.length === 0 ? (
                  <p className="text-label text-ink-3 font-sans px-1 py-2">Sin ejercicios en este día.</p>
                ) : (
                  g.exercises.map((we, exIdx) => {
                    const ex = allExercises.find(e => e.id === we.exerciseId);
                    const videoKey = `${g.name}-${exIdx}`;
                    const isDuplicate = duplicateExerciseIds.has(we.exerciseId);
                    const jumpKey = `${g.name}-${exIdx}`;
                    return (
                      <div
                        key={`${we.exerciseId}-${exIdx}`}
                        ref={el => { if (el) exerciseRefs.current.set(jumpKey, el); else exerciseRefs.current.delete(jumpKey); }}
                        className={`bg-raised rounded-surface overflow-hidden transition-shadow ${isDuplicate ? 'border border-red-500/50' : ''} ${highlightedKey === jumpKey ? 'ring-2 ring-accent' : ''}`}
                      >
                        <div className="p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            {/* Reordenar — el orden en que se hacen los ejercicios
                                es una decisión de programación (básicos primero,
                                aislamiento después), y hasta ahora la única forma
                                de cambiarlo era borrar y volver a añadir. */}
                            <div className="flex flex-col flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => onMoveExercise(g, exIdx, -1)}
                                disabled={exIdx === 0}
                                aria-label="Subir ejercicio"
                                className="text-ink-3 hover:text-accent disabled:opacity-20 disabled:hover:text-ink-3 transition-colors"
                              ><Icon name="keyboard_arrow_up" size="s" /></button>
                              <button
                                type="button"
                                onClick={() => onMoveExercise(g, exIdx, 1)}
                                disabled={exIdx === g.exercises.length - 1}
                                aria-label="Bajar ejercicio"
                                className="text-ink-3 hover:text-accent disabled:opacity-20 disabled:hover:text-ink-3 transition-colors"
                              ><Icon name="keyboard_arrow_down" size="s" /></button>
                            </div>
                            <span className="font-mono text-caption text-ink-3 tabular-nums w-4 flex-shrink-0 pt-1">{exIdx + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-label font-sans font-bold truncate ${isDuplicate ? 'text-red-400' : 'text-white'} ${ex?.videoUrl ? 'cursor-pointer select-none' : ''}`}
                                title={ex?.videoUrl ? 'Mantén pulsado o clic derecho para ver el vídeo' : undefined}
                                onContextMenu={e => { if (ex?.videoUrl) { e.preventDefault(); openVideoModal(videoKey, ex); } }}
                                onPointerDown={() => {
                                  if (!ex?.videoUrl) return;
                                  clearLongPress();
                                  longPressTimer.current = window.setTimeout(() => openVideoModal(videoKey, ex), 500);
                                }}
                                onPointerUp={clearLongPress}
                                onPointerLeave={clearLongPress}
                                onPointerCancel={clearLongPress}
                              >
                                {ex?.name || we.exerciseId}
                                {we.muscleGroup && <span className="text-caption font-sans text-ink-2 ml-2">{MUSCLE_LABELS[we.muscleGroup]}</span>}
                              </p>
                              {isDuplicate && (
                                <span className="inline-flex items-center gap-1 mt-1 font-mono text-caption font-bold text-red-400">
                                  <Icon name="warning" size="s" />
                                  También programado otro día
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {ex?.videoUrl && (
                                <button
                                  onClick={() => openVideoModal(videoKey, ex)}
                                  title="Ver vídeo"
                                  className="flex items-center gap-1 px-2 py-1 rounded-control text-ink-3 hover:text-accent transition-colors"
                                >
                                  <Icon name="videocam" size="s" />
                                  <span className="font-mono text-caption">Vídeo</span>
                                </button>
                              )}
                              <button
                                onClick={() => onReplaceExercise(g, exIdx)}
                                title="Cambiar ejercicio"
                                className="text-ink-3 hover:text-accent transition-colors"
                              >
                                <Icon name="swap_horiz" size="s" />
                              </button>
                              <button
                                onClick={() => onRemoveExercise(g, exIdx)}
                                title="Quitar ejercicio"
                                className="text-ink-3 hover:text-red-400 transition-colors"
                              >
                                <Icon name="close" size="s" />
                              </button>
                            </div>
                          </div>
                          <ExerciseConfigEditor we={we} onChange={patch => onUpdateExercise(g, exIdx, patch)} mesoWeeks={weeks} />
                        </div>
                      </div>
                    );
                  })
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => onAddExercise(g)}
                    className="flex-1 flex items-center justify-center gap-2 bg-bg border border-dashed border-hairline rounded-control px-3 py-2 text-title-s font-sans text-ink-2 hover:text-accent hover:border-accent/40 transition-all"
                  >
                    <Icon name="add" size="s" />
                    Añadir ejercicio
                  </button>
                  {libraryWorkouts.length > 0 && (
                    <button
                      onClick={() => setLibraryPickerFor(g)}
                      title="Copiar los ejercicios de una rutina de la biblioteca a este día"
                      className="flex items-center justify-center gap-2 bg-bg border border-dashed border-hairline rounded-control px-3 py-2 text-title-s font-sans text-ink-2 hover:text-accent hover:border-accent/40 transition-all"
                    >
                      <Icon name="library_books" size="s" />
                      Usar de biblioteca
                    </button>
                  )}
                </div>
                <p className="font-mono text-caption text-ink-3">
                  Se aplica a todas las semanas de este mesociclo — las sesiones ya completadas no se tocan.
                </p>
              </div>
            </div>
          ))}
        </Pager>
      )}

      <Sheet
        open={videoModal !== null}
        onClose={() => setVideoModal(null)}
        title={videoModal?.name ?? 'Vídeo del ejercicio'}
      >
        {videoModal && <ExerciseVideoPlayer videoUrl={videoModal.url} />}
      </Sheet>

      {/* Bloque G — elegir una rutina de la biblioteca (WorkoutsScreen) para
          copiar sus ejercicios al día activo. Se copian, no se referencian. */}
      <Sheet
        open={libraryPickerFor !== null}
        onClose={() => setLibraryPickerFor(null)}
        title="Usar rutina de la biblioteca"
      >
        <div className="space-y-2">
          {libraryWorkouts.length === 0 ? (
            <p className="font-sans text-caption text-ink-3">Sin rutinas en la biblioteca todavía — créalas en Biblioteca → Ejercicios → Rutinas.</p>
          ) : (
            libraryWorkouts.map(w => (
              <button
                key={w.id}
                onClick={() => { if (libraryPickerFor) { onUseLibraryWorkout(libraryPickerFor, w); setLibraryPickerFor(null); } }}
                className="w-full flex items-center justify-between gap-3 p-3 bg-raised border border-hairline rounded-surface hover:border-accent/40 transition-all text-left"
              >
                <span className="font-sans font-bold text-body-s text-white">{w.name}</span>
                <span className="font-mono text-caption text-ink-2">{w.exercises.length} ejerc.</span>
              </button>
            ))
          )}
        </div>
      </Sheet>
    </div>
  );
}

// Volume/priority config and cross-mesocycle progression used to be two separate tabs —
// merged here so setting this mesocycle's series/priority per group happens with last
// mesocycle's numbers right there for reference, instead of tabbing back and forth.
function ProgressionView({ editing, mesocycles, onUpdateGroup, onApplySuggestion, landmarks, athleteLevel, athleteEmail, coachId }: {
  editing: Mesocycle;
  mesocycles: Mesocycle[];
  onUpdateGroup: (group: MuscleGroup, field: keyof MuscleGroupConfig, value: number | string) => void;
  onApplySuggestion: (groups: Record<MuscleGroup, MuscleGroupConfig>, mode: 'replace' | 'fillZeros') => void;
  landmarks: Record<MuscleGroup, VolumeLandmark>;
  athleteLevel?: 'principiante' | 'intermedio' | 'avanzado';
  athleteEmail: string;
  coachId: string;
}) {
  const history = [...mesocycles].filter(m => m.id !== editing.id).sort((a, b) => a.number - b.number);
  const columns = [...history, editing]; // current mesocycle always last, editable
  const totals = columns.map(m => MUSCLE_GROUPS.reduce((s, g) => s + m.groups[g].series, 0));
  const currentTotal = MUSCLE_GROUPS.reduce((acc, g) => acc + editing.groups[g].series, 0);
  const [showSuggest, setShowSuggest] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {VOLUME_ZONE_LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-2 px-3 py-1 rounded-surface border border-hairline" style={{ backgroundColor: l.bg }}>
              <span className="font-sans text-caption font-bold" style={{ color: l.text }}>{l.label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowSuggest(true)}
          className="flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/40 text-accent font-sans text-label font-bold uppercase tracking-wider rounded-control hover:bg-accent/20 active:scale-95 transition-all"
        >
          <Icon name="auto_awesome" size="s" />
          Sugerir volumen
        </button>
      </div>
      <p className="font-mono text-caption text-ink-3 -mt-2">Cada barra usa el rango de su propio grupo — pecho y antebrazo no se miden igual.</p>

      <div className="flex flex-wrap gap-3 text-caption font-mono">
        <span className="text-success">▲ Sube</span>
        <span className="text-danger">▼ Baja</span>
        <span className="text-ink-3">= Sin cambio</span>
        <span className="text-ink-2 ml-2">⭐ Alta · ◑ Media · ⚪ Baja prioridad</span>
      </div>

      {showSuggest && (
        <VolumeSuggestionSheet
          editing={editing}
          mesocycles={mesocycles}
          landmarks={landmarks}
          athleteLevel={athleteLevel}
          athleteEmail={athleteEmail}
          coachId={coachId}
          onClose={() => setShowSuggest(false)}
          onApply={(groups, mode) => { onApplySuggestion(groups, mode); setShowSuggest(false); }}
        />
      )}

      {/* Por debajo de sm la tabla es legítimamente ancha pero inusable: una
          tarjeta por grupo muscular en su lugar, con el meso actual editable
          y el historial como texto compacto. Mismos datos, otra presentación. */}
      <div className="sm:hidden space-y-2">
        {MUSCLE_GROUPS.map(group => {
          const cfg = editing.groups[group];
          const landmark = landmarks[group];
          const histText = history
            .map(m => `Meso #${m.number}: ${m.groups[group].series}`)
            .join(' · ');
          const lastHistorical = history.length > 0 ? history[history.length - 1].groups[group] : null;
          const delta = lastHistorical !== null ? cfg.series - lastHistorical.series : null;
          // Barra de zona MEV/Productivo/MAV/MRV — el rango 0-ZONE_MAX y las
          // marcas MAV/MRV son los de la tabla de landmarks DE ESTE GRUPO, no
          // un umbral fijo igual para los 17 (ver utils/volumeZones.ts).
          const ZONE_MAX = Math.max(1, landmark.mrv);
          const fillPct = Math.min(100, (cfg.series / ZONE_MAX) * 100);
          const mavPct  = (landmark.mavMin / ZONE_MAX) * 100;
          const mrvPct  = (landmark.mavMax / ZONE_MAX) * 100;
          return (
            <div key={group} className="bg-surface border border-hairline rounded-surface p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-sans text-label text-white font-bold">{MUSCLE_LABELS[group]}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-caption uppercase tracking-wider" style={{ color: heatmapText(cfg.series, landmark) }}>
                    {zoneLabel(cfg.series, landmark)}
                  </span>
                  {delta !== null && <Delta delta={delta} showEqual />}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Stepper value={cfg.series} onChange={v => onUpdateGroup(group, 'series', v)} landmark={landmark} />
                <PrioritySelector value={cfg.priority} onChange={v => onUpdateGroup(group, 'priority', v)} />
              </div>
              <div className="relative h-1 rounded-full bg-track">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-(--duration-bar)"
                  style={{ width: `${fillPct}%`, backgroundColor: heatmapText(cfg.series, landmark) }}
                />
                <div className="absolute -top-0.5 -bottom-0.5 w-px bg-white/28" style={{ left: `${mavPct}%` }} title="MAV" />
                <div className="absolute -top-0.5 -bottom-0.5 w-px bg-danger/70" style={{ left: `${mrvPct}%` }} title="MRV" />
              </div>
              {histText && (
                <p className="font-mono text-caption text-ink-3">{histText}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse text-body-s" style={{ minWidth: `${130 + columns.length * 140}px` }}>
          <thead>
            <tr className="bg-bg">
              <th className="sticky left-0 z-[var(--z-sticky)] bg-bg text-left px-4 py-3 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-r border-hairline w-[130px]">
                Grupo muscular
              </th>
              {columns.map(m => {
                const isCurrent = m.id === editing.id;
                return (
                  <th key={m.id} className={`px-3 py-3 border-b border-r border-hairline last:border-r-0 text-center align-bottom ${isCurrent ? 'bg-accent/5' : ''}`}>
                    <span className="font-sans text-caption text-accent uppercase tracking-wider block">
                      {isCurrent ? `Meso #${m.number} (actual)` : `Meso #${m.number}`}
                    </span>
                    <span className="font-mono text-caption text-ink-2 block ">{m.startDate}</span>
                    <span className="font-mono text-caption text-ink-3 block">{m.daysPerWeek} ses. · {m.weeks} sem</span>
                    {m.objective && (
                      <span className="block mt-1 text-caption text-ink-2 font-sans font-medium max-w-[120px] mx-auto leading-tight"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >{m.objective}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {MUSCLE_GROUPS.map((group, rowIdx) => {
              const landmark = landmarks[group];
              return (
              <tr key={group} className={rowIdx % 2 === 0 ? 'bg-bg' : 'bg-bg'}>
                <td className={`sticky left-0 z-[var(--z-sticky)] px-4 py-3 border-r border-hairline font-sans text-label text-ink-2 whitespace-nowrap ${rowIdx % 2 === 0 ? 'bg-bg' : 'bg-bg'}`}>
                  {MUSCLE_LABELS[group]}
                </td>
                {columns.map((m, mIdx) => {
                  const isCurrent = m.id === editing.id;
                  const cfg  = m.groups[group];
                  const prev = mIdx > 0 ? columns[mIdx - 1].groups[group] : null;
                  const delta = prev !== null ? cfg.series - prev.series : null;
                  const zeroToZero = prev !== null && prev.series === 0 && cfg.series === 0;

                  if (isCurrent) {
                    const ZONE_MAX = Math.max(1, landmark.mrv);
                    const fillPct = Math.min(100, (cfg.series / ZONE_MAX) * 100);
                    return (
                      <td key={m.id} className="px-3 py-2 border-r border-hairline last:border-r-0 bg-accent/5"
                        style={{ backgroundColor: cfg.series > 0 ? heatmapBg(cfg.series, landmark) : undefined }}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Stepper value={cfg.series} onChange={v => onUpdateGroup(group, 'series', v)} landmark={landmark} />
                          <PrioritySelector value={cfg.priority} onChange={v => onUpdateGroup(group, 'priority', v)} />
                          {!zeroToZero && <Delta delta={delta} showEqual />}
                          <div className="relative h-1 w-full rounded-full bg-track">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-(--duration-bar)"
                              style={{ width: `${fillPct}%`, backgroundColor: heatmapText(cfg.series, landmark) }}
                            />
                            <div className="absolute -top-0.5 -bottom-0.5 w-px bg-white/28" style={{ left: `${(landmark.mavMin / ZONE_MAX) * 100}%` }} title="MAV" />
                            <div className="absolute -top-0.5 -bottom-0.5 w-px bg-danger/70" style={{ left: `${(landmark.mavMax / ZONE_MAX) * 100}%` }} title="MRV" />
                          </div>
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={m.id} className="px-3 py-3 border-r border-hairline last:border-r-0 text-center"
                      style={{ backgroundColor: cfg.series > 0 ? heatmapBg(cfg.series, landmark) : undefined }}
                    >
                      {cfg.series === 0 ? (
                        <span className="font-mono text-caption text-ink-3">—</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <span className="font-mono text-label font-bold tabular-nums" style={{ color: heatmapText(cfg.series, landmark) }}>
                            {cfg.series}
                          </span>
                          <span className="text-caption">{PRIORITY_ICON[cfg.priority]}</span>
                          {!zeroToZero && <Delta delta={delta} showEqual />}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={columns.length + 1} className="h-px bg-raised p-0" /></tr>
            <tr className="bg-bg">
              <td className="sticky left-0 z-[var(--z-sticky)] bg-bg px-4 py-3 border-r border-t border-hairline font-mono text-caption text-ink-2 uppercase tracking-wider whitespace-nowrap">Total series</td>
              {columns.map((m, mIdx) => {
                const total = totals[mIdx];
                const delta = mIdx > 0 ? total - totals[mIdx - 1] : null;
                const isCurrent = m.id === editing.id;
                return (
                  <td key={m.id} className={`px-3 py-3 border-r border-t border-hairline last:border-r-0 text-center ${isCurrent ? 'bg-accent/5' : ''}`}>
                    <div className="flex items-center justify-center">
                      <span className="font-mono text-body-s font-bold text-white tabular-nums">{total}</span>
                      <Delta delta={delta} showEqual />
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr className="bg-bg">
              <td className="sticky left-0 z-[var(--z-sticky)] bg-bg px-4 py-3 border-r border-t border-hairline font-mono text-caption text-ink-2 uppercase tracking-wider whitespace-nowrap">Sesiones / ciclo</td>
              {columns.map((m, mIdx) => {
                const delta = mIdx > 0 ? m.daysPerWeek - columns[mIdx - 1].daysPerWeek : null;
                return (
                  <td key={m.id} className="px-3 py-3 border-r border-t border-hairline last:border-r-0 text-center">
                    <div className="flex items-center justify-center">
                      <span className="font-mono text-label font-bold text-ink-2">{m.daysPerWeek} ses.</span>
                      <Delta delta={delta} />
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr className="bg-bg">
              <td className="sticky left-0 z-[var(--z-sticky)] bg-bg px-4 py-3 border-r border-t border-hairline font-mono text-caption text-ink-2 uppercase tracking-wider whitespace-nowrap">Semanas</td>
              {columns.map((m, mIdx) => {
                const delta = mIdx > 0 ? m.weeks - columns[mIdx - 1].weeks : null;
                return (
                  <td key={m.id} className="px-3 py-3 border-r border-t border-hairline last:border-r-0 text-center">
                    <div className="flex items-center justify-center">
                      <span className="font-mono text-label font-bold text-ink-2">{m.weeks} sem</span>
                      <Delta delta={delta} />
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="bg-surface border border-hairline rounded-surface px-5 py-4 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-caption text-ink-2 uppercase tracking-[.1em]">Series semanales totales</span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-semibold text-hero text-ink tabular-nums">{currentTotal}</span>
            {history.length > 0 && (
              <Delta delta={currentTotal - totals[totals.length - 2]} showEqual />
            )}
          </div>
        </div>
      </div>

      <p className="font-mono text-caption text-ink-3">
        {history.length > 0 ? `${columns.length} mesociclos · ` : ''}La columna «actual» es editable — el resto es historial de solo lectura.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type SaveState  = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type EditorTab  = 'distribution' | 'exercises' | 'progression' | 'cierre';

// One row per distinct day pattern (name) generated for this mesocycle — every week
// repeats the same exercises per day (see handleAssign), so grouping by name collapses
// e.g. an 8-week × 4-day meso from 32 near-identical Workout docs down to 4 real cards.
interface MesoWorkoutGroup {
  name: string;
  workoutIds: string[];
  exercises: WorkoutExercise[];
}

function groupMesoWorkouts(workouts: Workout[], mesocycleId: string): MesoWorkoutGroup[] {
  const byName = new Map<string, MesoWorkoutGroup>();
  for (const w of workouts) {
    if (w.mesocycleId !== mesocycleId) continue;
    let group = byName.get(w.name);
    if (!group) {
      group = { name: w.name, workoutIds: [], exercises: w.exercises };
      byName.set(w.name, group);
    }
    group.workoutIds.push(w.id);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

interface MesocycleManagerProps {
  coachId: string;
  athleteEmail?: string;      // when set: skip the athlete selector
  athleteEquipment?: string[]; // from onboarding; used to rank exercises in generator
  athleteLevel?: 'principiante' | 'intermedio' | 'avanzado'; // from onboarding; punto de partida del sugeridor de volumen
  athleteName?: string;       // solo para el borrador de texto del cierre de mesociclo
  // Logs y asignaciones del atleta, si quien monta esta pantalla YA los tiene
  // cargados (ClientHub los pasa por props a todo el panel). Se aceptan para no
  // repetir dos lecturas de Firestore que ya están en memoria; si no vienen, la
  // pestaña «Cierre» las pide por su cuenta al abrirse, nunca antes.
  athleteLogs?: WorkoutLog[];
  athleteAssignments?: WorkoutAssignment[];
}

export default function MesocycleManager({
  coachId, athleteEmail, athleteEquipment = [], athleteLevel, athleteName,
  athleteLogs, athleteAssignments,
}: MesocycleManagerProps) {
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [selectedEmail, setSelectedEmail] = useState(athleteEmail ?? '');
  const [creating, setCreating]           = useState(false);

  const [editing, setEditing]             = useState<Mesocycle | null>(null);
  const [editorTab, setEditorTab]         = useState<EditorTab>('progression');
  const [saveState, setSaveState]         = useState<SaveState>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Template picker state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates]                   = useState<MesocycleTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates]     = useState(false);
  const [applyingTemplate, setApplyingTemplate]     = useState(false);

  // T11.a: un único picker para las dos pantallas que cambian un ejercicio —
  // la vista previa del generador y "Ejercicios programados" (mesociclo ya
  // asignado). `exIdx: null` significa "añadir", un número significa
  // "cambiar ese índice".
  const [exercisePicker, setExercisePicker] = useState<
    | { context: 'preview'; dayIdx: number; exIdx: number | null; group?: MuscleGroup }
    | { context: 'programado'; group: MesoWorkoutGroup; exIdx: number | null; muscleGroup?: MuscleGroup }
    | null
  >(null);

  // Generator state
  const [genPhase, setGenPhase]           = useState<GeneratorPhase>('idle');
  const [previewDays, setPreviewDays]     = useState<PreviewDay[]>([]);
  const [athleteUid, setAthleteUid]       = useState<string | null>(null);
  const [assignProgress, setAssignProgress] = useState({ done: 0, total: 0 });
  const [genError, setGenError]           = useState('');

  // Only load the full athlete list in standalone mode (no athleteEmail prop)
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
    enabled: !athleteEmail,
  });
  const athletes = useMemo(() => atletasActivos(allProfiles), [allProfiles]);

  const mesocyclesQueryKey = ['mesocycles', selectedEmail] as const;
  const { data: mesocyclesRaw, isPending: mesoQueryPending } = useQuery({
    queryKey: mesocyclesQueryKey,
    queryFn: () => getMesocycles(selectedEmail),
    enabled: !!selectedEmail,
  });
  const mesocycles = useMemo(
    () => [...(mesocyclesRaw ?? [])].sort((a, b) => a.number - b.number),
    [mesocyclesRaw]
  );
  const loadingMeso = !!selectedEmail && mesoQueryPending;

  // Tabla de landmarks de volumen (MV/MEV/MAV/MRV por grupo) — misma queryKey
  // que en AiChatPanel.tsx para compartir caché: si Dani la edita en el panel
  // del asistente, esta vista se entera sin recargar.
  const { data: volumeLandmarks = VOLUME_LANDMARKS_DEFAULT } = useQuery({
    queryKey: ['coachVolumeLandmarks'],
    queryFn: getVolumeLandmarks,
  });

  // Exercise names for "Ejercicios programados" are needed as soon as that tab is opened,
  // independent of the generator flow (which only loads them once it actually runs).
  const { data: allExercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });

  // Workouts actually generated for the mesocycle currently being edited — the "Ejercicios
  // programados" tab reads from here so the meso block and the exercise config it produced
  // aren't two disconnected screens. Shared ['workouts'] cache key with the rest of the app
  // (e.g. HomeScreen) — filtered client-side by mesocycleId, same as the original fetch.
  const { data: allWorkouts = [], isPending: loadingMesoWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const mesoWorkouts = useMemo(
    () => editing?.id ? allWorkouts.filter(w => w.mesocycleId === editing.id) : [],
    [allWorkouts, editing?.id]
  );

  // Datos del CIERRE. Solo se piden si esta pantalla no los recibió por props y
  // el coach abre la pestaña — el cierre es lo último que se mira de un bloque,
  // no hay motivo para pagar dos queries cada vez que se entra a programar.
  // Mismas queryKeys que ClientHub/MesocycleDashboard: si ya están en caché,
  // esto no lee nada de Firestore.
  const necesitaLogs = editorTab === 'cierre' && !athleteLogs && !!selectedEmail;
  const { data: logsQuery = [], isPending: logsPending } = useQuery({
    queryKey: ['workoutLogs', selectedEmail],
    queryFn: () => getWorkoutLogs(selectedEmail),
    enabled: necesitaLogs,
  });
  const mesoIds = useMemo(() => mesocycles.map(m => m.id), [mesocycles]);
  const necesitaAsignaciones = editorTab === 'cierre' && !athleteAssignments && mesoIds.length > 0;
  const { data: asignacionesQuery = [], isPending: asignacionesPending } = useQuery({
    queryKey: ['workoutAssignmentsByMesocycleIds', mesoIds],
    queryFn: () => getWorkoutAssignmentsByMesocycleIds(mesoIds),
    enabled: necesitaAsignaciones,
  });
  const cierreLogs = athleteLogs ?? logsQuery;
  const cierreAsignaciones = athleteAssignments ?? asignacionesQuery;
  const cierreCargando = (necesitaLogs && logsPending) || (necesitaAsignaciones && asignacionesPending);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync when parent changes the bound email
  useEffect(() => {
    if (athleteEmail) setSelectedEmail(athleteEmail);
  }, [athleteEmail]);

  // Selecting a different athlete resets the editor — the mesocycle list itself now
  // comes from the ['mesocycles', selectedEmail] query above.
  useEffect(() => {
    setEditing(null);
    setGenPhase('idle');
  }, [selectedEmail]);

  const scheduleAutoSave = useCallback((updated: Mesocycle) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('pending');
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        const { id, ...rest } = updated;
        await updateMesocycle(id, rest);
        queryClient.setQueryData<Mesocycle[]>(['mesocycles', selectedEmail], prev =>
          prev?.map(m => m.id === id ? updated : m));
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
      }
    }, 800);
  }, [queryClient, selectedEmail]);

  const updateField = <K extends keyof Omit<Mesocycle, 'id' | 'groups' | 'distribution'>>(
    field: K, value: Mesocycle[K]
  ) => {
    if (!editing) return;
    const updated = { ...editing, [field]: value };
    setEditing(updated);
    scheduleAutoSave(updated);
  };

  const updateGroup = (group: MuscleGroup, field: keyof MuscleGroupConfig, value: number | string) => {
    if (!editing) return;
    const updated: Mesocycle = {
      ...editing,
      groups: { ...editing.groups, [group]: { ...editing.groups[group], [field]: value } },
    };
    setEditing(updated);
    scheduleAutoSave(updated);
  };

  // Aplica de golpe el resultado de "Sugerir volumen" (VolumeSuggestionSheet).
  // 'replace' pisa los 17 grupos; 'fillZeros' respeta lo que Dani ya hubiera
  // tocado a mano y solo rellena los que siguen a 0 — dos intenciones
  // distintas, no una casualidad de implementación.
  const applyVolumeSuggestion = (suggested: Record<MuscleGroup, MuscleGroupConfig>, mode: 'replace' | 'fillZeros') => {
    if (!editing) return;
    const nextGroups = mode === 'replace'
      ? suggested
      : Object.fromEntries(MUSCLE_GROUPS.map(g =>
          [g, editing.groups[g].series === 0 ? suggested[g] : editing.groups[g]]
        )) as Record<MuscleGroup, MuscleGroupConfig>;
    const updated: Mesocycle = { ...editing, groups: nextGroups };
    setEditing(updated);
    scheduleAutoSave(updated);
  };

  const handleGenerateDistribution = () => {
    if (!editing) return;
    const split = editing.splitId ? TRAINING_SPLITS.find(s => s.id === editing.splitId) : undefined;
    const result = runDistribution(
      editing.groups,
      editing.daysPerWeek,
      split ? tiposDeEntrenamiento(split) : undefined,
      { cicloDias, offsets: offsetsCiclo },
    );
    const distribution: WeekDistribution = {
      ...result,
      snapshot: buildSnapshot(editing),
      generatedAt: new Date().toISOString(),
    };
    const updated = { ...editing, distribution };
    setEditing(updated);
    scheduleAutoSave(updated);
    setGenPhase('idle');
  };

  // ── Distribution edit helpers ───────────────────────────────────────────────
  // The auto-generated distribution is a starting point, not a final answer — the coach
  // can hand-tweak it afterwards (series, remove/move/add a group) without losing the
  // edit the next time the algorithm runs, since these mutate `editing.distribution`
  // directly rather than regenerating it.
  function updateDistribution(mutate: (days: DayPlan[]) => DayPlan[]) {
    if (!editing?.distribution) return;
    const days = mutate(editing.distribution.days).map(d => ({
      ...d, totalSeries: d.assignments.reduce((s, a) => s + a.series, 0),
    }));
    const distribution: WeekDistribution = { ...editing.distribution, days };
    const updated = { ...editing, distribution };
    setEditing(updated);
    scheduleAutoSave(updated);
  }

  function updateAssignmentSeries(dayIdx: number, aIdx: number, series: number) {
    updateDistribution(days => days.map((d, i) =>
      i !== dayIdx ? d : { ...d, assignments: d.assignments.map((a, j) => j !== aIdx ? a : { ...a, series }) }
    ));
  }

  function removeAssignment(dayIdx: number, aIdx: number) {
    updateDistribution(days => days.map((d, i) =>
      i !== dayIdx ? d : { ...d, assignments: d.assignments.filter((_, j) => j !== aIdx) }
    ));
  }

  function moveAssignment(dayIdx: number, aIdx: number, targetDayIdx: number) {
    if (targetDayIdx === dayIdx) return;
    updateDistribution(days => {
      const moving = days[dayIdx]?.assignments[aIdx];
      if (!moving) return days;
      return days.map((d, i) => {
        if (i === dayIdx) return { ...d, assignments: d.assignments.filter((_, j) => j !== aIdx) };
        if (i === targetDayIdx) {
          const existing = d.assignments.find(a => a.group === moving.group);
          const assignments = existing
            ? d.assignments.map(a => a.group === moving.group ? { ...a, series: a.series + moving.series } : a)
            : [...d.assignments, moving];
          return { ...d, assignments };
        }
        return d;
      });
    });
  }

  function addGroupToDay(dayIdx: number, group: MuscleGroup) {
    updateDistribution(days => days.map((d, i) => {
      if (i !== dayIdx || d.assignments.some(a => a.group === group)) return d;
      return { ...d, assignments: [...d.assignments, { group, series: 3 }] };
    }));
  }

  // ── Generator ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const hasDays = (editing?.days?.length ?? 0) > 0;
    if (!hasDays && !editing?.distribution) return;
    setGenPhase('loading');
    setGenError('');

    try {
      // 1. Resolve athlete UID
      const profile = await getUserProfileByEmail(editing!.athleteId);
      if (!profile) {
        setGenError(`No se encontró perfil para ${editing!.athleteId}. El atleta debe haber iniciado sesión al menos una vez.`);
        setGenPhase('error');
        return;
      }
      setAthleteUid(profile.userId);

      // 2. Load exercises + run migration
      await migratePrimaryFocusToMuscleGroup();
      // `ensureQueryData` en vez de `getExercises()` a pelo: el catálogo son
      // ~1.700 documentos y esta pantalla YA lo tiene cargado en la caché de
      // react-query (misma queryKey). Releerlo en cada "Generar rutinas" era
      // una lectura completa de la colección por cada pulsación.
      const exercises = await queryClient.ensureQueryData({ queryKey: ['exercises'], queryFn: getExercises });

      // If mesocycle has predefined days from template, use them as base
      if (hasDays) {
        const days: PreviewDay[] = (editing!.days ?? []).map((td, dayIdx) => {
          const dayExs: PreviewExercise[] = [...td.exercises]
            .sort((a, b) => a.order - b.order)
            .map(we => {
              const ex = exercises.find(e => e.id === we.exerciseId);
              return {
                exerciseId: we.exerciseId,
                name: ex?.name ?? `(${we.exerciseId.slice(-6)})`,
                muscleGroup: (ex?.muscleGroup ?? 'core') as MuscleGroup,
                sets: we.sets,
                reps: we.reps,
                rir: we.rir,
                restSeconds: we.restSeconds,
                order: we.order,
              };
            });
          return { dayIndex: dayIdx, exercises: dayExs, warnings: [] };
        });
        setPreviewDays(days);
        setGenPhase('preview');
        return;
      }

      // Equipment availability helper
      const athEquip = athleteEquipment.map(e => e.toLowerCase());
      function exIsCompatible(ex: Exercise): boolean {
        const eq = ex.equipment ?? [];
        if (eq.length === 0) return true; // untagged = always available
        if (athEquip.length === 0) return true; // no athlete equipment info = don't filter
        return eq.some(e => athEquip.includes(e.toLowerCase()));
      }

      // Index by muscleGroup — compatible exercises first, then incompatible
      const byGroup: Partial<Record<MuscleGroup, Exercise[]>> = {};
      for (const g of MUSCLE_GROUPS) {
        const all = exercises.filter(e => e.muscleGroup === g);
        const compatible   = all.filter(e =>  exIsCompatible(e));
        const incompatible = all.filter(e => !exIsCompatible(e));
        byGroup[g] = [...compatible, ...incompatible];
      }

      // 3. Build preview — one PreviewDay per distribution day
      const days: PreviewDay[] = editing!.distribution!.days.map((day, dayIdx) => {
        const dayExs: PreviewExercise[] = [];
        const warnings: string[] = [];
        let order = 0;

        for (const { group, series } of day.assignments) {
          const available = byGroup[group] ?? [];
          if (available.length === 0) {
            warnings.push(MUSCLE_LABELS[group]);
            continue;
          }
          const compatibleCount = available.filter(e => exIsCompatible(e)).length;
          // Tope de series por ejercicio (ver utils/programacion): 9 series de
          // pecho salen como 3+3+3, no como un único ejercicio de 9 ni como 5+4.
          const chunks  = repartoDeSeries(series, available.length);
          for (let i = 0; i < chunks.length; i++) {
            const ex = available[i % available.length];
            const mismatch = !exIsCompatible(ex);
            if (mismatch && compatibleCount === 0 && i === 0) {
              warnings.push(`${MUSCLE_LABELS[group]} (sin material compatible)`);
            }
            dayExs.push({
              exerciseId: ex.id,
              name: ex.name,
              muscleGroup: group,
              sets: chunks[i],
              reps: '8-12',
              rir: 2,
              restSeconds: 90,
              order: order++,
              equipmentMismatch: mismatch,
            });
          }
        }

        return { dayIndex: dayIdx, exercises: dayExs, warnings };
      });

      setPreviewDays(days);
      setGenPhase('preview');
    } catch (err) {
      console.error(err);
      setGenError('Error al generar la vista previa.');
      setGenPhase('error');
    }
  };

  const handleAssign = async () => {
    if (!editing || !athleteUid) return;
    // Las semanas del mesociclo son semanas de calendario; lo que se repite es
    // el MICROCICLO. Con uno de 14 días, 8 semanas son 4 vueltas, no 8.
    const vueltas = vueltasDelCiclo(editing.weeks, diasDeCiclo(editing.daysPerWeek, editing.cycleDays));
    const total = vueltas * editing.daysPerWeek;
    setGenPhase('assigning');
    setAssignProgress({ done: 0, total });
    setGenError('');

    try {
      // Dedup: remove previous workouts/assignments for this mesocycle from Firestore first
      await deleteWorkoutsByMesocycleIdStrict(editing.id);
      await deleteWorkoutAssignmentsByMesocycleIdStrict(editing.id);

      // One Workout doc per distinct training day — reused across every week instead of
      // duplicated. A 10-week × 4-day/week mesocycle used to create 40 near-identical
      // Workout docs (one per calendar date); it now creates 4, and every week's
      // WorkoutAssignment points back to the same doc. Editing a day's exercises later
      // (in "Ejercicios programados") edits that single doc, so it applies to every week
      // at once — there's nothing to keep in sync across duplicates anymore.
      const dayWorkoutIds: string[] = [];
      for (let dayIdx = 0; dayIdx < editing.daysPerWeek; dayIdx++) {
        const pd = previewDays[dayIdx] ?? { dayIndex: dayIdx, exercises: [], warnings: [] };
        const exercises: WorkoutExercise[] = pd.exercises.map(({ name: _name, equipmentMismatch: _mismatch, ...we }) => we);

        // createWorkoutStrict throws on Firestore failure — no silent local fallback
        const workout = await createWorkoutStrict({
          ownerId:     coachId,
          name:        `Día ${dayIdx + 1} – Meso #${editing.number}`,
          mesocycleId: editing.id,
          exercises,
        });
        dayWorkoutIds.push(workout.id);
      }

      // Calendario del microciclo: cuánto dura la vuelta y en qué día de la
      // vuelta cae cada sesión. Con un reparto rotativo los descansos van DENTRO
      // del ciclo (Push, Pull, Descanso, Legs, Descanso), así que las sesiones
      // no son los primeros N días — y si se siguiera sumando de 7 en 7, la
      // segunda vuelta de un ciclo de 9 pisaría las fechas de la primera.
      const splitAsignado = editing.splitId ? TRAINING_SPLITS.find(sp => sp.id === editing.splitId) : undefined;
      const cicloDias = diasDeCiclo(editing.daysPerWeek, editing.cycleDays);
      // Un patrón tocado a mano en el calendario manda sobre el cálculo
      // automático — mismo criterio que `offsetsCiclo` más abajo en el
      // componente, para que lo que se ve en el calendario sea exactamente lo
      // que se asigna al atleta.
      const offsets = editing.customOffsets && editing.customOffsets.length === editing.daysPerWeek
        ? [...editing.customOffsets].sort((a, b) => a - b)
        : offsetsDeSesiones({
            sesiones: editing.daysPerWeek,
            cicloDias,
            offsetsDelSplit: splitAsignado ? offsetsDeSplit(splitAsignado) : undefined,
            repartirEnElCiclo: editing.cycleDays !== undefined,
          });
      let done = 0;
      for (let week = 1; week <= vueltas; week++) {
        for (let dayIdx = 0; dayIdx < editing.daysPerWeek; dayIdx++) {
          const date = addDays(editing.startDate, (week - 1) * cicloDias + (offsets[dayIdx] ?? dayIdx));

          // athleteId is the resolved UID (not email) so athlete security rules match
          await createWorkoutAssignmentStrict({
            workoutId:   dayWorkoutIds[dayIdx],
            athleteId:   athleteUid,
            mesocycleId: editing.id,
            date,
            status:      'pending',
          });

          done++;
          setAssignProgress({ done, total });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['workouts'] });
      setGenPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[handleAssign]', err);
      setGenError(`Error Firestore: ${msg}`);
      setGenPhase('error');
    }
  };

  // ── Preview edit helpers ───────────────────────────────────────────────────

  function updatePExPatch(dayIdx: number, exIdx: number, patch: Partial<WorkoutExercise>) {
    setPreviewDays(prev => prev.map((d, di) =>
      di !== dayIdx ? d : {
        ...d,
        exercises: d.exercises.map((e, ei) => ei !== exIdx ? e : { ...e, ...patch }),
      }
    ));
  }

  function removePEx(dayIdx: number, exIdx: number) {
    setPreviewDays(prev => prev.map((d, di) =>
      di !== dayIdx ? d : {
        ...d,
        exercises: d.exercises.filter((_, ei) => ei !== exIdx)
          .map((e, i) => ({ ...e, order: i })),
      }
    ));
  }

  // Reordenar dentro del día — el `order` se reescribe a partir de la posición
  // real en el array, que es lo que después se guarda en el Workout.
  function movePEx(dayIdx: number, exIdx: number, delta: -1 | 1) {
    setPreviewDays(prev => prev.map((d, di) => {
      if (di !== dayIdx) return d;
      const destino = exIdx + delta;
      if (destino < 0 || destino >= d.exercises.length) return d;
      const exercises = [...d.exercises];
      [exercises[exIdx], exercises[destino]] = [exercises[destino], exercises[exIdx]];
      return { ...d, exercises: exercises.map((e, i) => ({ ...e, order: i })) };
    }));
  }

  function addPEx(dayIdx: number, exerciseId: string) {
    const ex = allExercises.find(e => e.id === exerciseId);
    if (!ex) return;
    setPreviewDays(prev => prev.map((d, di) => {
      if (di !== dayIdx) return d;
      const newEx: PreviewExercise = {
        exerciseId,
        name: ex.name,
        muscleGroup: ex.muscleGroup ?? 'core',
        sets: 3,
        reps: '8-12',
        rir: 2,
        restSeconds: 90,
        order: d.exercises.length,
      };
      return { ...d, exercises: [...d.exercises, newEx] };
    }));
  }

  // T11.a: sustituye exerciseId/name/muscleGroup manteniendo series, reps,
  // RIR, descanso, notas y técnica — cambiar el ejercicio no debería
  // obligar a reconfigurar todo lo demás desde cero.
  function replacePEx(dayIdx: number, exIdx: number, ex: Exercise) {
    setPreviewDays(prev => prev.map((d, di) => di !== dayIdx ? d : {
      ...d,
      exercises: d.exercises.map((e, ei) => ei !== exIdx ? e : {
        ...e,
        exerciseId: ex.id,
        name: ex.name,
        muscleGroup: ex.muscleGroup ?? e.muscleGroup,
        equipmentMismatch: undefined,
      }),
    }));
  }

  // ── "Ejercicios programados" edit helpers ──────────────────────────────────
  // Since handleAssign now creates one Workout doc per day (reused across every week),
  // a group normally wraps a single workoutId — but old mesocycles generated before this
  // change may still have one duplicate per week under the same name, so this still
  // writes through to every id in the group to keep both generations of data correct.
  async function updateMesoWorkoutExercise(
    group: MesoWorkoutGroup, exIdx: number, patch: Partial<WorkoutExercise>,
  ) {
    const updatedExercises = group.exercises.map((e, i) => i === exIdx ? { ...e, ...patch } : e);
    queryClient.setQueryData<Workout[]>(['workouts'], prev => prev?.map(w =>
      group.workoutIds.includes(w.id) ? { ...w, exercises: updatedExercises } : w
    ));
    await Promise.all(group.workoutIds.map(id => updateWorkout(id, { exercises: updatedExercises })));
  }

  // T11.a: escribe el Workout del día — se aplica a las semanas restantes de
  // una vez (un solo Workout reutilizado por semana, ver comentario de
  // handleAssign). Las sesiones YA REGISTRADAS no se tocan: WorkoutLog guarda
  // su propia copia de lo que se hizo, no una referencia al Workout.
  async function writeMesoWorkoutExercises(group: MesoWorkoutGroup, updatedExercises: WorkoutExercise[]) {
    queryClient.setQueryData<Workout[]>(['workouts'], prev => prev?.map(w =>
      group.workoutIds.includes(w.id) ? { ...w, exercises: updatedExercises } : w
    ));
    await Promise.all(group.workoutIds.map(id => updateWorkout(id, { exercises: updatedExercises })));
  }

  // La validación (nombre vacío, duplicado con otro día) vive en `MesoExercisesTabs`
  // —es la única que tiene la lista de `groups` hermanos a mano—; aquí solo se
  // escribe, igual que `writeMesoWorkoutExercises`.
  async function handleRenameDay(group: MesoWorkoutGroup, nuevoNombre: string) {
    queryClient.setQueryData<Workout[]>(['workouts'], prev => prev?.map(w =>
      group.workoutIds.includes(w.id) ? { ...w, name: nuevoNombre } : w
    ));
    await Promise.all(group.workoutIds.map(id => updateWorkout(id, { name: nuevoNombre })));
  }

  function handleReplaceMesoExercise(group: MesoWorkoutGroup, exIdx: number) {
    setExercisePicker({ context: 'programado', group, exIdx, muscleGroup: group.exercises[exIdx]?.muscleGroup });
  }

  function handleAddMesoExercise(group: MesoWorkoutGroup) {
    setExercisePicker({ context: 'programado', group, exIdx: null });
  }

  // Bloque G — librería de workouts reutilizables (WorkoutsScreen, pestaña
  // "Rutinas" de Ejercicios): un Workout sin `mesocycleId` es de biblioteca,
  // no de un atleta concreto. "Usar" copia sus ejercicios al día — no los
  // referencia — para no acoplar el día del atleta a que alguien no edite la
  // plantilla de biblioteca por error; mismo criterio que aplicar una
  // plantilla de mesociclo (handleApplyTemplate) o un ejercicio nuevo.
  async function handleUseLibraryWorkout(group: MesoWorkoutGroup, libraryWorkout: Workout) {
    if (!await confirm(`¿Copiar los ${libraryWorkout.exercises.length} ejercicios de "${libraryWorkout.name}" a este día? Se añaden a los que ya tenga.`)) return;
    const copied = libraryWorkout.exercises.map((e, i) => ({ ...e, order: group.exercises.length + i }));
    void writeMesoWorkoutExercises(group, [...group.exercises, ...copied]);
  }

  // Reordenar dentro del día ya asignado. Reescribe `order` a partir de la
  // posición real: es el campo por el que se ordena la sesión del atleta.
  function handleMoveMesoExercise(group: MesoWorkoutGroup, exIdx: number, delta: -1 | 1) {
    const destino = exIdx + delta;
    if (destino < 0 || destino >= group.exercises.length) return;
    const exercises = [...group.exercises];
    [exercises[exIdx], exercises[destino]] = [exercises[destino], exercises[exIdx]];
    void writeMesoWorkoutExercises(group, exercises.map((e, i) => ({ ...e, order: i })));
  }

  async function handleRemoveMesoExercise(group: MesoWorkoutGroup, exIdx: number) {
    if (!await confirm('¿Quitar este ejercicio? Se aplica a todas las semanas de este mesociclo — las sesiones ya completadas no se tocan.')) return;
    void writeMesoWorkoutExercises(group, group.exercises.filter((_, i) => i !== exIdx));
  }

  // Selección final del picker, compartida por los dos contextos (vista
  // previa del generador y "Ejercicios programados").
  async function handlePickExercise(ex: Exercise) {
    if (!exercisePicker) return;
    if (exercisePicker.context === 'preview') {
      const { dayIdx, exIdx } = exercisePicker;
      if (exIdx === null) addPEx(dayIdx, ex.id);
      else replacePEx(dayIdx, exIdx, ex);
      setExercisePicker(null);
      return;
    }
    const { group, exIdx } = exercisePicker;
    if (exIdx === null) {
      const newEx: WorkoutExercise = {
        exerciseId: ex.id, order: group.exercises.length, sets: 3, reps: '8-12', rir: 2, restSeconds: 90,
        muscleGroup: ex.muscleGroup,
      };
      void writeMesoWorkoutExercises(group, [...group.exercises, newEx]);
    } else {
      // Aviso honesto antes de escribir: aplica a todas las semanas, y por
      // ahora es un texto fijo — el número real de sesiones ya registradas
      // con el ejercicio anterior necesitaría leer WorkoutLog, que esta
      // pantalla no carga hoy; mejor decir la verdad general que inventar
      // una cifra.
      if (!await confirm('Este cambio se aplica a TODAS las semanas de este mesociclo. Las sesiones ya completadas no se tocan (guardan su propia copia). ¿Continuar?')) {
        setExercisePicker(null);
        return;
      }
      const updated = group.exercises.map((e, i) => i !== exIdx ? e : { ...e, exerciseId: ex.id, muscleGroup: ex.muscleGroup ?? e.muscleGroup });
      void writeMesoWorkoutExercises(group, updated);
    }
    setExercisePicker(null);
  }

  // ── Template picker ─────────────────────────────────────────────────────────

  const handleOpenTemplatePicker = async () => {
    setShowTemplatePicker(true);
    if (templates.length === 0) {
      setLoadingTemplates(true);
      getMesocycleTemplates(coachId)
        .then(list => setTemplates(list.sort((a, b) => a.name.localeCompare(b.name))))
        .catch(console.error)
        .finally(() => setLoadingTemplates(false));
    }
  };

  const handleApplyTemplate = async (tpl: MesocycleTemplate) => {
    if (!selectedEmail || applyingTemplate) return;
    setApplyingTemplate(true);
    try {
      const programId = `prog_${Date.now()}`;
      const startNumber = mesocycles.length + 1;
      const created: Mesocycle[] = [];
      let startDate = new Date().toISOString().split('T')[0];

      const reviewTasks: Promise<unknown>[] = [];
      for (let i = 0; i < tpl.stages.length; i++) {
        const stage = tpl.stages[i];
        const stageStartDate = startDate;
        const meso = await createMesocycle({
          athleteId:    selectedEmail,
          number:       startNumber + i,
          weeks:        stage.weeks,
          startDate:    stageStartDate,
          objective:    stage.name,
          daysPerWeek:  stage.daysPerWeek,
          groups:       { ...stage.groups },
          days:         stage.days && stage.days.length > 0
                          ? stage.days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e })) }))
                          : undefined,
          programId,
          programOrder: i,
          ...(stage.deloadWeek !== undefined ? { deloadWeek: stage.deloadWeek } : {}),
        });
        created.push(meso);

        // Cadencia de revisiones de la etapa (Bloque H, Pantalla 4) — se crean
        // ya con la plantilla aplicada, el carril "Revisiones" del calendario
        // las pinta solas en cuanto existen como TaskItem.
        if (stage.reviewCadenceWeeks && stage.reviewCadenceWeeks > 0) {
          const reviewCount = Math.max(1, Math.floor(stage.weeks / stage.reviewCadenceWeeks));
          const reviewType = stage.reviewType ?? 'revision';
          const reviewTitle = reviewType === 'revision' ? 'Revisión' : reviewType === 'cuestionario' ? 'Cuestionario' : 'Fotos de check-in';
          for (let r = 1; r <= reviewCount; r++) {
            const d = new Date(stageStartDate + 'T00:00:00');
            d.setDate(d.getDate() + r * stage.reviewCadenceWeeks * 7);
            reviewTasks.push(createTask({
              athleteId: selectedEmail, type: reviewType,
              title: `${reviewTitle} — ${stage.name}`,
              dueDate: d.toISOString().split('T')[0],
              status: 'pending', createdBy: 'coach', createdAt: new Date().toISOString(),
            }));
          }
        }

        // Advance start date
        const d = new Date(startDate + 'T00:00:00');
        d.setDate(d.getDate() + stage.weeks * 7);
        startDate = d.toISOString().split('T')[0];
      }
      await Promise.all(reviewTasks);

      queryClient.setQueryData<Mesocycle[]>(mesocyclesQueryKey, prev => [...(prev ?? []), ...created]);
      setEditing(created[0]);
      setEditorTab('progression');
      setConfirmDelete(false);
      setGenPhase('idle');
      setShowTemplatePicker(false);
    } catch (err) {
      console.error(err);
      showToast('No se pudo aplicar la plantilla de mesociclos.');
    } finally {
      setApplyingTemplate(false);
    }
  };

  // ── Misc ────────────────────────────────────────────────────────────────────

  const handleNew = async () => {
    if (!selectedEmail || creating) return;
    setCreating(true);
    try {
      const created = await createMesocycle({
        athleteId:   selectedEmail,
        number:      mesocycles.length + 1,
        weeks:       4,
        startDate:   new Date().toISOString().split('T')[0],
        objective:   '',
        daysPerWeek: 4,
        groups:      DEFAULT_GROUPS(),
      });
      queryClient.setQueryData<Mesocycle[]>(mesocyclesQueryKey, prev => [...(prev ?? []), created]);
      setEditing(created);
      setEditorTab('progression');
      setConfirmDelete(false);
      setGenPhase('idle');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      await deleteMesocycle(editing.id);
      queryClient.setQueryData<Mesocycle[]>(mesocyclesQueryKey, prev => prev?.filter(m => m.id !== editing.id));
      setEditing(null);
      setConfirmDelete(false);
    } catch (err) {
      console.error(err);
      showToast('No se pudo eliminar el mesociclo.');
    }
  };

  const saveLabel = {
    idle: '', pending: '…', saving: 'Guardando…', saved: '✓ Guardado', error: '⚠ Error',
  }[saveState];

  // Calendario del microciclo del mesociclo que se está editando: cuánto dura
  // la vuelta, en qué día cae cada sesión y de qué tipo es cada una.
  //
  // `customOffsets` (elegido a mano por el coach en el calendario) manda sobre
  // cualquier otro cálculo cuando su longitud cuadra con las sesiones — es la
  // única condición: si el coach cambia el nº de sesiones o la duración del
  // ciclo después de haber tocado el calendario, el patrón a mano deja de
  // encajar y se cae al automático en vez de dejar el mesociclo sin calendario.
  const splitActual = editing?.splitId ? TRAINING_SPLITS.find(sp => sp.id === editing.splitId) : undefined;
  const cicloDias = editing ? diasDeCiclo(editing.daysPerWeek, editing.cycleDays) : 7;

  // Dos versiones del patrón a mano, y no es redundante:
  //  - `customCrudo` es lo que hay tecleado AHORA MISMO, tenga o no el número
  //    correcto de días — es lo que el calendario tiene que enseñar mientras
  //    el coach todavía está quitando y poniendo días, o el toggle parecería
  //    no hacer nada (volvería al automático en cada clic intermedio).
  //  - `customValido` es ese mismo patrón, pero solo cuando su longitud ya
  //    cuadra con las sesiones configuradas — el único que es seguro usar
  //    para generar rutinas, calcular frecuencias o guardar fechas reales.
  const customCrudo = editing?.customOffsets ? [...editing.customOffsets].sort((a, b) => a - b) : null;
  const customValido = customCrudo && customCrudo.length === editing?.daysPerWeek ? customCrudo : null;

  const offsetsAutomaticos = editing
    ? offsetsDeSesiones({
        sesiones: editing.daysPerWeek,
        cicloDias,
        offsetsDelSplit: splitActual ? offsetsDeSplit(splitActual) : undefined,
        repartirEnElCiclo: editing.cycleDays !== undefined,
      })
    : [];
  // Para generar/calcular: el patrón a mano solo cuenta si ya está completo.
  const offsetsCiclo = customValido ?? offsetsAutomaticos;
  // Para el calendario que se ve y se toca: el patrón a mano tal cual esté,
  // completo o no.
  const offsetsCalendario = customCrudo ?? offsetsAutomaticos;
  const tiposCiclo = customCrudo
    ? Array.from({ length: editing?.daysPerWeek ?? 0 }, (_, i) => `Sesión ${i + 1}`)
    : splitActual
      ? tiposDeEntrenamiento(splitActual)
      : Array.from({ length: editing?.daysPerWeek ?? 0 }, (_, i) => `Día ${i + 1}`);

  // Toca un día del calendario: lo añade o lo quita del patrón a mano. Elegir
  // un descanso o una sesión concretos es, a propósito, independiente de todo
  // lo demás (reparto, prioridad...) — solo dice CUÁNDO cae cada sesión, no
  // qué grupos entrena. Tocar el calendario deja de usar el reparto elegido
  // (splitId), porque un patrón elegido a mano ya no es ninguno de la lista.
  const toggleDiaCiclo = (dia: number) => {
    if (!editing) return;
    const actual = editing.customOffsets ?? offsetsAutomaticos;
    const yaEsta = actual.includes(dia);
    const siguiente = yaEsta ? actual.filter(d => d !== dia) : [...actual, dia].sort((a, b) => a - b);
    const updated: Mesocycle = { ...editing, customOffsets: siguiente, splitId: undefined };
    setEditing(updated);
    scheduleAutoSave(updated);
  };

  const restablecerCalendario = () => {
    if (!editing) return;
    const { customOffsets: _fuera, ...resto } = editing;
    setEditing(resto as Mesocycle);
    scheduleAutoSave(resto as Mesocycle);
  };

  const selectedAthlete = athletes.find(a => a.email === selectedEmail);

  // Solo para el e1RM alométrico de la pestaña «Cierre» — sexo (anamnesis) y
  // peso corporal, que esta pantalla no tenía en scope hasta ahora.
  const { sexo: sexoAtleta } = useAthleteProfileSignals(selectedEmail || undefined, coachId);
  const { logs: pesoLogsAtleta } = useAthleteWeight(selectedEmail || undefined);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ConfirmDialog />
      {/* Title + selector only in standalone mode */}
      {!athleteEmail && (
        <>
          <div>
            <h1 className="font-sans font-extrabold text-display tracking-tight text-white">Macrociclo</h1>
            <p className="text-ink-2 text-body-s mt-1">Diseña los mesociclos y genera rutinas reales para el atleta.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-ink-2">person_search</span>
            <select
              value={selectedEmail}
              onChange={e => { setSelectedEmail(e.target.value); setEditing(null); setGenPhase('idle'); }}
              className="bg-raised border border-hairline text-white font-sans text-title-s rounded-control px-3 py-2 focus:outline-none focus:border-accent min-w-[220px]"
            >
              <option value="">— Selecciona un atleta —</option>
              {athletes.map(a => (
                <option key={a.email} value={a.email}>{a.displayName} ({a.email})</option>
              ))}
            </select>
            {selectedAthlete && (
              <img src={selectedAthlete.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-hairline object-cover" />
            )}
          </div>
          {!selectedEmail && (
            <div className="text-center py-10 border border-dashed border-hairline rounded-surface">
              <span className="material-symbols-outlined text-display text-ink-3 block mb-3">calendar_view_month</span>
              <p className="text-ink-2 text-body-s">Selecciona un atleta para ver o crear sus mesociclos.</p>
            </div>
          )}
        </>
      )}

      {selectedEmail && (
        <>
        <div className="flex flex-col xl:flex-row gap-6">

          {/* ── Left: list ── */}
          <div className="xl:w-64 flex-shrink-0 space-y-3">
            <button
              onClick={handleNew} disabled={creating}
              className="w-full flex items-center justify-center gap-2 py-3 bg-accent text-black font-sans text-label font-bold uppercase tracking-wider rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-body-s">add</span>
              {creating ? 'Creando…' : 'Nuevo mesociclo'}
            </button>
            <button
              onClick={handleOpenTemplatePicker}
              className="w-full flex items-center justify-center gap-2 py-2 border border-hairline text-ink-2 font-sans text-caption font-bold uppercase tracking-wider rounded-control hover:border-accent/40 hover:text-accent transition-all"
            >
              <span className="material-symbols-outlined text-body-s">library_books</span>
              Usar plantilla
            </button>

            {loadingMeso && (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-surface" />
                <Skeleton className="h-12 w-full rounded-surface" />
              </div>
            )}
            {!loadingMeso && mesocycles.length === 0 && (
              <p className="text-center text-ink-2 font-sans text-label py-6">Sin mesociclos todavía.</p>
            )}

            {mesocycles.map(m => (
              <button
                key={m.id}
                onClick={() => { setEditing(m); setEditorTab('progression'); setConfirmDelete(false); setGenPhase('idle'); }}
                className={`w-full text-left p-3 rounded-control border transition-all ${
                  editing?.id === m.id
                    ? 'border-accent/60 bg-accent/5'
                    : 'border-hairline bg-surface hover:border-hairline'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Meso #{m.number}</span>
                  <span className="font-mono text-caption text-ink-2">{m.weeks} sem · {m.daysPerWeek} ses.</span>
                </div>
                <p className="text-white text-label font-sans font-bold truncate">{m.objective || '(sin objetivo)'}</p>
                <p className="text-ink-2 text-caption font-mono ">{m.startDate}</p>
                <div className="flex items-center gap-2 mt-1">
                  {m.distribution && (
                    <span className="inline-flex items-center text-caption font-mono text-success">
                      <span className="material-symbols-outlined text-caption">grid_view</span>Distribución
                    </span>
                  )}
                  {/* Qué bloques están cerrados y cuál está en marcha. Se
                      deduce de las fechas, sin leer nada, y es lo que le dice
                      al coach que la pestaña «Cierre» ya tiene algo que contar. */}
                  {addDays(m.startDate, m.weeks * 7 - 1) < new Date().toISOString().split('T')[0] && (
                    <span className="inline-flex items-center gap-0.5 text-caption font-mono text-ink-3">
                      <span className="material-symbols-outlined text-caption">check_circle</span>Terminado
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* ── Right: editor ── */}
          {editing ? (
            <div className="flex-1 min-w-0 space-y-4">

              {/* Mesocycle header */}
              <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-sans font-bold text-white text-title-s">Mesociclo #{editing.number}</h2>
                  <span className={`font-sans text-label uppercase tracking-wider transition-colors ${
                    saveState === 'saved'  ? 'text-success' :
                    saveState === 'error'  ? 'text-red-400' :
                    saveState === 'saving' ? 'text-accent animate-pulse' : 'text-ink-2'
                  }`}>{saveLabel}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Nº Meso</label>
                    <input type="number" min={1}
                      value={editing.number}
                      onChange={e => updateField('number', parseInt(e.target.value) || 1)}
                      className="w-full bg-raised border border-hairline rounded-control px-3 py-2 text-title-s text-white font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Semanas</label>
                    <input type="number" min={1} max={16}
                      value={editing.weeks}
                      onChange={e => updateField('weeks', parseInt(e.target.value) || 1)}
                      className="w-full bg-raised border border-hairline rounded-control px-3 py-2 text-title-s text-white font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <Input
                    label="Fecha inicio"
                    type="date"
                    value={editing.startDate}
                    onChange={v => updateField('startDate', v)}
                  />
                  <div className="col-span-2 md:col-span-4">
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Sesiones por ciclo</label>
                    <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-1">
                      {[2,3,4,5,6,7,8,9,10].map(d => (
                        <button key={d} onClick={() => {
                            if (!editing) return;
                            const split = editing.splitId ? TRAINING_SPLITS.find(s => s.id === editing.splitId) : undefined;
                            const clearsSplit = split && sesionesDeSplit(split) !== d;
                            const updated = {
                              ...editing,
                              daysPerWeek: d,
                              ...(clearsSplit ? { splitId: undefined, cycleDays: undefined } : {}),
                              // Un ciclo no puede tener menos días que sesiones.
                              ...(editing.cycleDays !== undefined && editing.cycleDays < d ? { cycleDays: d } : {}),
                            };
                            setEditing(updated);
                            scheduleAutoSave(updated);
                          }}
                          className={`w-11 h-11 flex-shrink-0 rounded-control font-mono text-label font-bold transition-all ${
                            editing.daysPerWeek === d ? 'bg-accent text-black' : 'bg-raised text-ink-2 hover:bg-raised'
                          }`}
                        >{d}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Duración del microciclo. Es lo que permite frecuencias que no
                    caben en una semana: entrenar un grupo cada 5 días son 1,4
                    veces por semana, y la frecuencia de 1,5 son tres sesiones
                    cada 14 días. Sin tocarlo, el ciclo es la semana de siempre
                    y nada cambia respecto a los mesociclos ya creados. */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Duración del split</span>
                    <span className="font-mono text-caption text-ink-3">
                      {editing.cycleDays === undefined
                        ? 'Semanal (7 días)'
                        : cicloDias % 7 === 0
                          ? `${cicloDias} días · ${cicloDias / 7} semanas alternas`
                          : `${cicloDias} días · rotativo`}
                    </span>
                  </div>
                  <div className="flex gap-1 items-center overflow-x-auto hide-scrollbar pb-1">
                    <button
                      onClick={() => updateField('cycleDays', undefined)}
                      className={`px-3 h-11 flex-shrink-0 rounded-control font-mono text-label font-bold transition-all ${
                        editing.cycleDays === undefined ? 'bg-accent text-black' : 'bg-raised text-ink-2 hover:text-white'
                      }`}
                    >Semanal</button>
                    {[3, 4, 5, 6, 8, 9, 10, 12, 14].filter(d => d >= editing.daysPerWeek).map(d => (
                      <button
                        key={d}
                        onClick={() => updateField('cycleDays', d)}
                        className={`w-11 h-11 flex-shrink-0 rounded-control font-mono text-label font-bold transition-all ${
                          editing.cycleDays === d ? 'bg-accent text-black' : 'bg-raised text-ink-2 hover:text-white'
                        }`}
                      >{d}</button>
                    ))}
                  </div>
                  {/* La duda razonable: arriba se pide «Semanas» y aquí «cada
                      cuánto se repite el patrón». No son lo mismo — las semanas
                      son cuánto dura el bloque, esto es cada cuánto vuelve a
                      empezar el patrón dentro de él. Se dice con los números
                      puestos para que no haya que deducirlo. */}
                  {editing.cycleDays !== undefined && (
                    <p className="font-mono text-caption text-accent">
                      {editing.weeks} semanas de bloque ÷ ciclo de {cicloDias} días ={' '}
                      {vueltasDelCiclo(editing.weeks, cicloDias)} vueltas ·{' '}
                      {vueltasDelCiclo(editing.weeks, cicloDias) * editing.daysPerWeek} sesiones en total
                    </p>
                  )}
                  {editing.cycleDays !== undefined && (
                    <p className="font-sans text-caption text-ink-3 leading-relaxed">
                      {cicloDias % 7 === 0
                        ? `Ciclo de ${cicloDias / 7} semanas: los días de entrenamiento siguen siendo los mismos de cada semana, lo que cambia es qué toca cada día. Es lo que permite entrenar un grupo 2 veces una semana y 3 la siguiente — frecuencia 2,5.`
                        : `Ciclo rotativo de ${cicloDias} días: los días de entrenamiento se mueven por el calendario (no se entrena «los lunes», se entrena «el día 1 del ciclo»). Da frecuencias como 1,4 o 1,75 por grupo.`}
                      {' '}El volumen sigue configurándose por SEMANA; la vuelta entera moverá {cicloDias / 7 === 1 ? 'ese mismo' : `${(cicloDias / 7).toLocaleString('es-ES')}×`} volumen.
                    </p>
                  )}
                </div>

                <Input
                  label="Objetivo"
                  value={editing.objective}
                  onChange={v => updateField('objective', v)}
                  placeholder="Ej. Hipertrofia tren superior, puesta en forma general…"
                />

                {/* Semana de descarga (Bloque H) — marca qué semana del meso es de
                    descarga, dato que hoy no existe en ningún sitio de la app.
                    Se usa para el marcador ▼ del carril Entrenamiento y para el
                    aviso de conflicto "revisión en semana de descarga". */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => updateField('deloadWeek', editing.deloadWeek !== undefined ? undefined : editing.weeks)}
                    className={`relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors ${editing.deloadWeek !== undefined ? 'bg-accent' : 'bg-inset'}`}
                    style={{ padding: 3 }}
                    aria-pressed={editing.deloadWeek !== undefined}
                  >
                    <span className="block w-4 h-4 rounded-full bg-white transition-transform duration-200" style={{ transform: editing.deloadWeek !== undefined ? 'translateX(18px)' : 'translateX(0)' }} />
                  </button>
                  <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Incluye semana de descarga</span>
                  {editing.deloadWeek !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-sans text-caption text-ink-3">en la semana</span>
                      <input
                        type="number" min={1} max={editing.weeks}
                        value={editing.deloadWeek}
                        onChange={e => updateField('deloadWeek', Math.min(editing.weeks, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-14 bg-raised border border-hairline rounded-control px-2 py-1 text-center text-caption text-white font-mono focus:outline-none focus:border-accent"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Tab bar — subrayado oro (ui/Tabs), igual que el resto de la app.
                  Antes era una píldora rellena local, la única pantalla que no
                  usaba la primitiva compartida; el mockup de Fase 3 confirma el
                  subrayado como fuente de verdad para esta zona también. */}
              <Tabs
                label="Pestañas del editor de mesociclo"
                value={editorTab}
                onChange={id => { setEditorTab(id as EditorTab); if (id !== 'distribution') setGenPhase('idle'); }}
                items={[
                  { id: 'progression',  label: 'Volumen',      icon: 'trending_up' },
                  { id: 'distribution', label: 'Distribución', icon: 'grid_view' },
                  { id: 'exercises',    label: 'Ejercicios',   icon: 'fitness_center' },
                  { id: 'cierre',       label: 'Cierre',       icon: 'monitoring' },
                ] as TabItem[]}
              />

              {/* ── Progresión y volumen ── */}
              {editorTab === 'progression' && (
                <ProgressionView
                  editing={editing}
                  mesocycles={mesocycles}
                  onUpdateGroup={updateGroup}
                  onApplySuggestion={applyVolumeSuggestion}
                  landmarks={volumeLandmarks}
                  athleteLevel={athleteLevel}
                  athleteEmail={selectedEmail}
                  coachId={coachId}
                />
              )}

              {/* ── Distribución ── */}
              {editorTab === 'distribution' && (
                <div className="space-y-4">

                  {/* === Normal view (idle / loading) === */}
                  {(genPhase === 'idle' || genPhase === 'loading') && (
                    <>
                      {/* Notice: predefined days from template */}
                      {(editing.days?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 bg-data/5 border border-data/20 rounded-surface p-3 mb-2">
                          <span className="material-symbols-outlined text-data text-body-s flex-shrink-0">fitness_center</span>
                          <p className="font-mono text-caption text-data">
                            Entrenamiento prediseñado: {editing.days!.length} días · {editing.days!.reduce((s, d) => s + d.exercises.length, 0)} ejercicios. El generador los usará en vez de auto-sugerir.
                          </p>
                        </div>
                      )}

                      {/* Reparto de días — plantillas Torso/Pierna/Push/Pull filtradas por daysPerWeek */}
                      <div className="space-y-2">
                        <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
                          Reparto ({editing.daysPerWeek} sesiones por ciclo)
                        </span>
                        {getSplitsForDays(editing.daysPerWeek).length === 0 ? (
                          <p className="font-sans text-caption text-ink-3">Sin plantillas de reparto para {editing.daysPerWeek} sesiones — la distribución repartirá los grupos libremente.</p>
                        ) : (() => {
                          const recommended = recommendSplit(editing.groups, editing.daysPerWeek);
                          return (
                            <div className="flex flex-wrap gap-2">
                              {getSplitsForDays(editing.daysPerWeek).map(split => {
                                const isRecommended = recommended?.id === split.id;
                                return (
                                  <button
                                    key={split.id}
                                    onClick={() => {
                                      // Elegir un reparto fija su calendario: un
                                      // rotativo de 5 días trae su ciclo puesto,
                                      // uno semanal vuelve a los 7 de siempre.
                                      const quitando = editing.splitId === split.id;
                                      const updated: Mesocycle = {
                                        ...editing,
                                        splitId: quitando ? undefined : split.id,
                                        cycleDays: quitando ? undefined : cicloDeSplit(split),
                                        // Un reparto de la lista trae su propio calendario —
                                        // pisa cualquier patrón que el coach hubiera tocado a mano.
                                        customOffsets: undefined,
                                      };
                                      setEditing(updated);
                                      scheduleAutoSave(updated);
                                    }}
                                    className={`px-3 py-2 rounded-control border font-sans text-label text-left transition-all flex items-center gap-2 ${
                                      editing.splitId === split.id
                                        ? 'bg-accent/10 border-accent text-accent'
                                        : 'bg-raised border-hairline text-ink-2 hover:border-accent/40 hover:text-white'
                                    }`}
                                  >
                                    <span className="flex flex-col items-start gap-0.5">
                                      <span>{split.label}</span>
                                      <span className="font-mono text-caption opacity-70">
                                        {cicloDeSplit(split)} d · hasta {formateaFrecuencia(frecuenciaMaximaDeSplit(split))}×/sem por grupo
                                      </span>
                                    </span>
                                    {isRecommended && (
                                      <span
                                        title="Recomendado según tu volumen/prioridad configurados"
                                        className={`font-mono text-caption px-1.5 py-0.5 rounded-full border ${
                                          editing.splitId === split.id
                                            ? 'border-accent text-accent'
                                            : 'border-data/40 text-data'
                                        }`}
                                      >
                                        ★ Recomendado
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* El calendario hace concreto el número de «duración del
                          ciclo»: sin verlo, «14 días» no dice si se entrena de
                          lunes a viernes las dos semanas o diez días seguidos. */}
                      <CalendarioCiclo
                        cicloDias={cicloDias}
                        offsets={offsetsCalendario}
                        tipos={tiposCiclo}
                        sesiones={editing.daysPerWeek}
                        personalizado={!!customCrudo}
                        onToggleDay={toggleDiaCiclo}
                        onRestablecer={customCrudo ? restablecerCalendario : undefined}
                      />

                      {/* Distribution controls */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleGenerateDistribution}
                          disabled={!!customCrudo && !customValido}
                          className="flex items-center gap-2 px-4 py-3 bg-accent text-black font-sans text-label font-bold uppercase tracking-wider rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <span className="material-symbols-outlined text-body-s">shuffle</span>
                          Distribución Automática
                        </button>
                        {customCrudo && !customValido && (
                          <span className="font-sans text-label text-orange-300">
                            Termina el calendario a mano ({customCrudo.length}/{editing.daysPerWeek}) antes de repartir.
                          </span>
                        )}
                        {editing.distribution && isStale(editing, editing.distribution) && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-surface">
                            <span className="material-symbols-outlined text-body-s text-orange-400">warning</span>
                            <span className="font-sans text-label text-orange-300">
                              El volumen o los días cambiaron — recalcula para actualizar
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Overload alert */}
                      {editing.distribution?.overloadAlert && (
                        <div className="flex items-start gap-3 px-4 py-3 bg-orange-500/10 border border-orange-500/30 rounded-surface">
                          <span className="material-symbols-outlined text-orange-400 ">warning</span>
                          <div>
                            <p className="font-mono text-label font-bold text-orange-300 uppercase ">Sobrevolumen</p>
                            <p className="font-mono text-label text-orange-300/80">
                              El volumen del ciclo supera el límite de {editing.daysPerWeek} sesiones × 12 series.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Weekly grid */}
                      {editing.distribution ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-3 text-caption font-mono">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-control inline-block bg-[rgba(34,197,94,.4)]"></span><span className="text-ink-2">9–12 series</span></span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-control inline-block bg-[rgba(249,115,22,.4)]"></span><span className="text-ink-2">&gt;12 series</span></span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-control inline-block bg-raised"></span><span className="text-ink-2">&lt;9 series</span></span>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {editing.distribution.days.map((day, i) => (
                              <DayCard
                                key={i}
                                day={day}
                                dayIdx={i}
                                daysPerWeek={editing.daysPerWeek}
                                offsets={offsetsCiclo}
                                onSeriesChange={(aIdx, series) => updateAssignmentSeries(i, aIdx, series)}
                                onRemove={aIdx => removeAssignment(i, aIdx)}
                                onMove={(aIdx, targetDayIdx) => moveAssignment(i, aIdx, targetDayIdx)}
                                onAddGroup={group => addGroupToDay(i, group)}
                              />
                            ))}
                          </div>

                          {/* Frecuencia semanal — la otra variable del reparto, junto
                              al volumen: cuántas veces por semana se toca cada grupo.
                              El repartidor ya la decide por dentro (sessionCount) pero
                              no la decía en ninguna parte. */}
                          {(() => {
                            const frecuencia = frecuenciaSemanal(editing.distribution!.days, cicloDias);
                            const choques = gruposEnDiasSeguidos(editing.distribution!.days, { offsets: offsetsCiclo, cicloDias });
                            if (frecuencia.length === 0) return null;
                            return (
                              <div className="bg-surface border border-hairline rounded-surface px-4 py-3 space-y-2">
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                  <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Frecuencia por grupo</span>
                                  <span className="font-mono text-caption text-ink-3">veces por semana, contando el ciclo entero</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {frecuencia.map(f => (
                                    <span
                                      key={f.group}
                                      title={`${f.veces} ${f.veces === 1 ? 'sesión' : 'sesiones'} por ciclo (día${f.dias.length > 1 ? 's' : ''} ${f.dias.map(d => (offsetsCiclo[d] ?? d) + 1).join(', ')}) · ${formateaFrecuencia(f.porSemana)} por semana`}
                                      className="inline-flex items-center gap-1 rounded-chip border border-hairline bg-raised px-2 py-0.5 font-mono text-caption text-ink-2"
                                    >
                                      {MUSCLE_LABELS_SHORT[f.group]}
                                      <strong className="text-ink tabular-nums">{formateaFrecuencia(f.porSemana)}</strong>
                                      <span className="text-ink-3">/sem</span>
                                    </span>
                                  ))}
                                </div>
                                {choques.length > 0 && (
                                  <div className="flex items-start gap-2">
                                    <Icon name="warning" size="s" className="text-orange-400 flex-shrink-0 mt-px" />
                                    <p className="font-sans text-caption text-orange-300 leading-relaxed">
                                      En días seguidos: {choques.map(c => `${MUSCLE_LABELS[c.group]} (día ${c.dias[0] + 1} y día ${c.dias[1] + 1}${c.entreVueltas ? ', entre vuelta y vuelta' : ''})`).join(', ')}.
                                      Son fechas consecutivas para el atleta — revisa si le da tiempo a recuperar.
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <div className="bg-surface border border-hairline rounded-surface px-4 py-3 flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <span className="font-mono text-caption text-ink-2 uppercase block">Series totales</span>
                                <span className="font-mono font-bold text-title-m text-white">
                                  {editing.distribution.days.reduce((s, d) => s + d.totalSeries, 0)}
                                </span>
                              </div>
                              <div>
                                <span className="font-mono text-caption text-ink-2 uppercase block">Sesiones activas</span>
                                <span className="font-mono font-bold text-title-m text-white">
                                  {editing.distribution.days.filter(d => d.assignments.length > 0).length}/{editing.daysPerWeek}
                                </span>
                              </div>
                            </div>
                            <span className="font-mono text-caption text-ink-3">
                              Generado {new Date(editing.distribution.generatedAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-10 border border-dashed border-hairline rounded-surface">
                          <span className="material-symbols-outlined text-display text-ink-3 block mb-2">grid_view</span>
                          <p className="text-ink-2 text-body-s">Pulsa «Distribución Automática» para repartir las series.</p>
                        </div>
                      )}

                      {/* ── Generar rutinas ── */}
                      {((editing.days?.length ?? 0) > 0 || (editing.distribution && !isStale(editing, editing.distribution))) && (
                        <div className="border-t border-hairline pt-4 mt-2 space-y-3">
                          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Rutinas del mesociclo</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={handleGenerate}
                              disabled={genPhase === 'loading'}
                              className="flex items-center gap-2 px-4 py-3 bg-raised border border-accent/40 text-accent font-sans text-label font-bold uppercase tracking-wider rounded-control hover:bg-accent/10 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {genPhase === 'loading' ? (
                                <><span className="material-symbols-outlined text-body-s animate-spin">refresh</span>Analizando…</>
                              ) : (
                                <><span className="material-symbols-outlined text-body-s">auto_fix_high</span>Generar rutinas</>
                              )}
                            </button>
                            <span className="font-mono text-caption text-ink-3">
                              Creará {vueltasDelCiclo(editing.weeks, cicloDias)} vueltas × {editing.daysPerWeek} sesiones ={' '}
                              {vueltasDelCiclo(editing.weeks, cicloDias) * editing.daysPerWeek} sesiones
                            </span>
                          </div>
                        </div>
                      )}

                      {editing.distribution && isStale(editing, editing.distribution) && (
                        <p className="font-sans text-caption text-ink-3 pt-2">Recalcula la distribución antes de generar rutinas.</p>
                      )}
                    </>
                  )}

                  {/* === Preview (editable) === */}
                  {genPhase === 'preview' && (
                    <RoutinePreview
                      days={previewDays}
                      distribution={editing.distribution}
                      mesoGroups={editing.groups}
                      mesoNumber={editing.number}
                      weeks={editing.weeks}
                      daysPerWeek={editing.daysPerWeek}
                      semanasDelCiclo={cicloDias / 7}
                      vueltas={vueltasDelCiclo(editing.weeks, cicloDias)}
                      offsets={offsetsCiclo}
                      catalogo={allExercises}
                      onSets={(dayIdx, exIdx, sets) => updatePExPatch(dayIdx, exIdx, { sets })}
                      onMove={movePEx}
                      onRemove={removePEx}
                      onReplace={(dayIdx, exIdx) => setExercisePicker({
                        context: 'preview', dayIdx, exIdx,
                        group: previewDays[dayIdx]?.exercises[exIdx]?.muscleGroup,
                      })}
                      onAdd={dayIdx => setExercisePicker({ context: 'preview', dayIdx, exIdx: null })}
                      onBack={() => { setGenPhase('idle'); setPreviewDays([]); }}
                      onAssign={handleAssign}
                    />
                  )}

                  {/* === Assigning progress === */}
                  {genPhase === 'assigning' && (
                    <div className="text-center py-10 space-y-4">
                      <span className="material-symbols-outlined text-display text-accent animate-spin block">refresh</span>
                      <p className="font-sans font-bold text-white text-body-s">Creando sesiones en Firestore…</p>
                      <div className="max-w-xs mx-auto">
                        <div className="bg-raised rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-accent h-2 rounded-full transition-all duration-300"
                            style={{ width: `${assignProgress.total ? (assignProgress.done / assignProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="font-mono text-caption text-ink-2 mt-2 text-center">
                          {assignProgress.done} / {assignProgress.total} sesiones
                        </p>
                      </div>
                    </div>
                  )}

                  {/* === Done === */}
                  {genPhase === 'done' && (
                    <div className="text-center py-10 space-y-4">
                      <span className="material-symbols-outlined text-display text-success block">check_circle</span>
                      <div>
                        <p className="font-sans font-bold text-white text-body-s">¡Rutinas asignadas!</p>
                        <p className="font-mono text-caption text-ink-2 mt-1">
                          {vueltasDelCiclo(editing.weeks, cicloDias) * editing.daysPerWeek} sesiones creadas a partir del {editing.startDate}
                        </p>
                      </div>
                      <button
                        onClick={() => setGenPhase('idle')}
                        className="px-4 py-2 font-sans text-label text-ink-2 border border-hairline rounded-control hover:text-white hover:border-hairline transition-all"
                      >
                        Volver a la distribución
                      </button>
                    </div>
                  )}

                  {/* === Error === */}
                  {genPhase === 'error' && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-surface">
                        <span className="material-symbols-outlined text-red-400 ">error</span>
                        <p className="font-sans text-label text-red-300">{genError}</p>
                      </div>
                      <button
                        onClick={() => setGenPhase('idle')}
                        className="font-mono text-label text-ink-2 hover:text-white transition-colors"
                      >← Volver</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Ejercicios programados ── */}
              {editorTab === 'exercises' && (
                <MesoExercisesView
                  groups={groupMesoWorkouts(mesoWorkouts, editing.id)}
                  loading={loadingMesoWorkouts}
                  weeks={editing.weeks}
                  allExercises={allExercises}
                  onUpdateExercise={updateMesoWorkoutExercise}
                  onReplaceExercise={handleReplaceMesoExercise}
                  onAddExercise={handleAddMesoExercise}
                  onRemoveExercise={handleRemoveMesoExercise}
                  onMoveExercise={handleMoveMesoExercise}
                  distribution={editing.distribution}
                  mesoGroups={editing.groups}
                  semanasDelCiclo={cicloDias / 7}
                  onGoToDistribution={() => setEditorTab('distribution')}
                  libraryWorkouts={allWorkouts.filter(w => !w.mesocycleId)}
                  onUseLibraryWorkout={handleUseLibraryWorkout}
                  onRenameDay={handleRenameDay}
                />
              )}

              {/* ── Cierre del mesociclo (solo coach) ── */}
              {editorTab === 'cierre' && (
                <MesocycleReviewPanel
                  meso={editing}
                  mesocycles={mesocycles}
                  logs={cierreLogs}
                  assignments={cierreAsignaciones}
                  exercises={allExercises}
                  athleteName={athleteName ?? selectedAthlete?.displayName}
                  cargando={cierreCargando}
                  sexo={sexoAtleta}
                  pesoLogs={pesoLogsAtleta}
                />
              )}

              {/* Delete zone */}
              <div className="flex justify-end pt-2">
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    className="font-mono text-label text-ink-2 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-body-s">delete</span>
                    Eliminar mesociclo
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-sans text-label text-red-400">¿Eliminar este mesociclo?</span>
                    <button onClick={handleDelete}
                      className="px-3 py-2 bg-red-500/20 border border-red-500/40 text-red-400 font-sans text-label rounded-control hover:bg-red-500/30 transition-all"
                    >Confirmar</button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 bg-raised text-ink-2 font-mono text-label rounded-control hover:bg-raised transition-all"
                    >Cancelar</button>
                  </div>
                )}
              </div>

            </div>
          ) : (
            selectedEmail && !loadingMeso && (
              <div className="flex-1 flex items-center justify-center text-center py-10 border border-dashed border-hairline rounded-surface">
                <div>
                  <span className="material-symbols-outlined text-display text-ink-3 block mb-3">edit_note</span>
                  <p className="text-ink-2 text-body-s">Selecciona un mesociclo o crea uno nuevo.</p>
                </div>
              </div>
            )
          )}
        </div>
        </>
      )}

      {/* ── Template picker modal ── */}
      {showTemplatePicker && (
        <Dialog
          open
          onClose={() => setShowTemplatePicker(false)}
          title="Usar plantilla"
          size="l"
        >
            {/* Body */}
            <div className="space-y-3">
              <p className="font-mono text-caption text-ink-2">
                Se clonarán todos los mesociclos del programa para {selectedEmail}.
              </p>
              {loadingTemplates ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full rounded-surface" />
                  <Skeleton className="h-16 w-full rounded-surface" />
                  <Skeleton className="h-16 w-full rounded-surface" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10">
                  <span className="material-symbols-outlined text-display text-ink-3 block mb-2">library_books</span>
                  <p className="font-sans text-label text-ink-2">
                    Sin plantillas. Crea una en Ejercicios → Plantillas.
                  </p>
                </div>
              ) : templates.map(tpl => {
                const totalWeeks = tpl.stages.reduce((s, st) => s + st.weeks, 0);
                return (
                  <button key={tpl.id} onClick={() => handleApplyTemplate(tpl)} disabled={applyingTemplate}
                    className="w-full text-left p-4 bg-surface border border-hairline rounded-control hover:border-accent/40 hover:bg-accent-bg transition-all disabled:opacity-50 group">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-sans font-bold text-white text-body-s group-hover:text-accent transition-colors">{tpl.name}</p>
                        {tpl.description && <p className="font-sans text-caption text-ink-2 ">{tpl.description}</p>}
                      </div>
                      <span className="font-mono text-caption text-accent font-bold flex-shrink-0 bg-accent/10 px-2 rounded-control">Usar →</span>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <span className="font-mono text-caption text-ink-2">{tpl.stages.length} meso{tpl.stages.length !== 1 ? 's' : ''}</span>
                      <span className="font-mono text-caption text-data">{totalWeeks} sem en total</span>
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {tpl.stages.map((st) => (
                        <span key={st.id} className="font-mono text-caption bg-raised border border-hairline px-2 rounded-control text-ink-2">
                          {st.name} · {st.weeks}sem
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
        </Dialog>
      )}

      {exercisePicker && (
        <ExercisePickerSheet
          open
          onClose={() => setExercisePicker(null)}
          exercises={allExercises}
          athleteEquipment={athleteEquipment}
          initialGroup={exercisePicker.context === 'preview' ? exercisePicker.group : exercisePicker.muscleGroup}
          onSelect={handlePickExercise}
          title={exercisePicker.exIdx === null ? 'Añadir ejercicio' : 'Cambiar ejercicio'}
        />
      )}
    </div>
  );
}
