import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MuscleGroup, MuscleGroupConfig, MesocycleTemplate, TemplateStage, TemplateDay, WorkoutExercise, Exercise } from '../types';
import { getTopMuscleGroups } from '../utils/muscleGroupRanking';
import {
  getMesocycleTemplates, createMesocycleTemplate,
  updateMesocycleTemplate, deleteMesocycleTemplate, getExercises,
} from '../dbService';
import Skeleton from './Skeleton';

function mesocycleTemplatesKey(coachId: string) {
  return ['mesocycleTemplates', coachId] as const;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio',
  'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'isquios', 'gluteo', 'gemelo', 'core',
];

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pecho:         'Pecho',
  dorsal:        'Dorsal',
  trapecio:      'Trapecio',
  deltoide_ant:  'Deltoides Ant.',
  deltoide_lat:  'Deltoides Lat.',
  deltoide_post: 'Deltoides Post.',
  biceps:        'Bíceps',
  triceps:       'Tríceps',
  antebrazo:     'Antebrazo',
  cuadriceps:    'Cuádriceps',
  isquios:       'Isquiotibiales',
  gluteo:        'Glúteo',
  gemelo:        'Gemelo',
  core:          'Core',
};

const DEFAULT_GROUPS = (): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(
    MUSCLE_GROUPS.map(g => [g, { series: 0, priority: 'media' as const }])
  ) as Record<MuscleGroup, MuscleGroupConfig>;

// ── Heatmap helpers ────────────────────────────────────────────────────────────

function heatmapBg(series: number): string {
  if (series === 0) return 'var(--color-surface)';
  if (series <= 4)  return `rgb(59 130 246 / ${Math.round(18 + ((series - 1) / 3) * 32)}%)`;
  if (series <= 9)  return `rgb(34 197 94 / ${Math.round(20 + ((series - 5) / 4) * 40)}%)`;
  if (series <= 14) return `rgb(249 115 22 / ${Math.round(28 + ((series - 10) / 4) * 42)}%)`;
  return `rgb(239 68 68 / ${Math.round(48 + Math.min((series - 15) / 5, 1) * 42)}%)`;
}

function heatmapText(series: number): string {
  if (series === 0) return 'var(--color-ink-3)';
  if (series <= 4)  return 'var(--color-info)';
  if (series <= 9)  return 'var(--color-success)';
  if (series <= 14) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stepper({ value, min = 0, max = 25, onChange }: {
  value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-6 h-6 rounded-control bg-raised text-ink-2 hover:bg-raised disabled:opacity-30 text-label font-bold flex items-center justify-center"
      >−</button>
      <span className="w-8 text-center font-mono text-body-s font-bold" style={{ color: heatmapText(value) }}>
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-6 h-6 rounded-control bg-raised text-ink-2 hover:bg-raised disabled:opacity-30 text-label font-bold flex items-center justify-center"
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
          className={`px-2 py-0.5 rounded-control text-label font-mono transition-all ${
            value === o.v ? 'bg-accent text-black font-bold' : 'bg-raised text-ink-2 hover:bg-raised'
          }`}
        >{o.icon}</button>
      ))}
    </div>
  );
}

// ── Exercise row ───────────────────────────────────────────────────────────────

const ExerciseRow: React.FC<{
  ex: WorkoutExercise;
  exName: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (updated: WorkoutExercise) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({
  ex, exName, isFirst, isLast,
  onChange, onDelete, onMoveUp, onMoveDown,
}) => {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-hairline last:border-0 group">
      {/* Name */}
      <span className="font-sans text-caption text-ink-2 flex-1 min-w-0 truncate" title={exName}>{exName}</span>
      {/* Sets */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-caption text-ink-3">sets</span>
        <input
          type="number" min={1} max={20} value={ex.sets}
          onChange={e => onChange({ ...ex, sets: Math.max(1, Number(e.target.value)) })}
          className="w-10 bg-bg border border-hairline rounded-control px-1 py-0.5 text-center font-mono text-label text-white focus:outline-none focus:border-accent/50"
        />
      </div>
      {/* Reps */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-caption text-ink-3">reps</span>
        <input
          type="text" value={ex.reps}
          onChange={e => onChange({ ...ex, reps: e.target.value })}
          className="w-14 bg-bg border border-hairline rounded-control px-1 py-0.5 text-center font-mono text-label text-white focus:outline-none focus:border-accent/50"
          placeholder="8-12"
        />
      </div>
      {/* RIR */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-caption text-ink-3">rir</span>
        <input
          type="number" min={0} max={5} value={ex.rir}
          onChange={e => onChange({ ...ex, rir: Math.min(5, Math.max(0, Number(e.target.value))) })}
          className="w-10 bg-bg border border-hairline rounded-control px-1 py-0.5 text-center font-mono text-label text-white focus:outline-none focus:border-accent/50"
        />
      </div>
      {/* Rest */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-caption text-ink-3">rest</span>
        <input
          type="number" min={0} max={600} step={15} value={ex.restSeconds}
          onChange={e => onChange({ ...ex, restSeconds: Math.max(0, Number(e.target.value)) })}
          className="w-14 bg-bg border border-hairline rounded-control px-1 py-0.5 text-center font-mono text-label text-white focus:outline-none focus:border-accent/50"
        />
      </div>
      {/* Reorder + delete */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onMoveUp} disabled={isFirst} title="Subir"
          className="w-5 h-5 flex items-center justify-center rounded-control text-ink-2 hover:text-white disabled:opacity-20">
          <span className="material-symbols-outlined text-body-s">arrow_upward</span>
        </button>
        <button onClick={onMoveDown} disabled={isLast} title="Bajar"
          className="w-5 h-5 flex items-center justify-center rounded-control text-ink-2 hover:text-white disabled:opacity-20">
          <span className="material-symbols-outlined text-body-s">arrow_downward</span>
        </button>
        <button onClick={onDelete} title="Eliminar ejercicio"
          className="w-5 h-5 flex items-center justify-center rounded-control text-ink-2 hover:text-red-400">
          <span className="material-symbols-outlined text-body-s">close</span>
        </button>
      </div>
    </div>
  );
}

// ── Day block ──────────────────────────────────────────────────────────────────

const DayBlock: React.FC<{
  day: TemplateDay;
  dayIdx: number;
  exercises: Exercise[];
  onChange: (updated: TemplateDay) => void;
  onDelete: () => void;
}> = ({
  day, dayIdx, exercises,
  onChange, onDelete,
}) => {
  const [open, setOpen] = useState(true);
  const [selectedExId, setSelectedExId] = useState('');

  const addExercise = () => {
    if (!selectedExId) return;
    const newEx: WorkoutExercise = {
      exerciseId: selectedExId,
      order: day.exercises.length,
      sets: 3,
      reps: '8-12',
      rir: 2,
      restSeconds: 90,
    };
    onChange({ ...day, exercises: [...day.exercises, newEx] });
    setSelectedExId('');
  };

  const updateEx = (idx: number, updated: WorkoutExercise) => {
    const exs = [...day.exercises];
    exs[idx] = updated;
    onChange({ ...day, exercises: exs });
  };

  const deleteEx = (idx: number) => {
    const exs = day.exercises.filter((_, i) => i !== idx).map((e, i) => ({ ...e, order: i }));
    onChange({ ...day, exercises: exs });
  };

  const moveEx = (idx: number, dir: -1 | 1) => {
    const exs = [...day.exercises];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= exs.length) return;
    [exs[idx], exs[newIdx]] = [exs[newIdx], exs[idx]];
    onChange({ ...day, exercises: exs.map((e, i) => ({ ...e, order: i })) });
  };

  const sortedExs = [...day.exercises].sort((a, b) => a.order - b.order);

  return (
    <div className="border border-hairline rounded-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface cursor-pointer group" onClick={() => setOpen(o => !o)}>
        <span className={`material-symbols-outlined text-body-s text-ink-2 transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <input
          type="text"
          value={day.name}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ ...day, name: e.target.value })}
          className="flex-1 bg-transparent font-mono text-label text-white focus:outline-none"
          placeholder="Nombre del día"
        />
        <span className="font-mono text-caption text-ink-3">{day.exercises.length} ejerc.</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-control text-ink-2 hover:text-red-400 transition-all"
          title="Eliminar día"
        >
          <span className="material-symbols-outlined text-body-s">delete</span>
        </button>
      </div>

      {/* Body */}
      {open && (
        <div className="px-3 py-2 bg-bg space-y-1">
          {/* Exercise list */}
          {sortedExs.length === 0 ? (
            <p className="font-sans text-caption text-ink-3 italic py-1">Sin ejercicios.</p>
          ) : (
            sortedExs.map((ex, idx) => {
              const exObj = exercises.find(e => e.id === ex.exerciseId);
              return (
                <ExerciseRow
                  key={`${ex.exerciseId}_${idx}`}
                  ex={ex}
                  exName={exObj?.name ?? `(${ex.exerciseId.slice(-6)})`}
                  isFirst={idx === 0}
                  isLast={idx === sortedExs.length - 1}
                  onChange={updated => updateEx(idx, updated)}
                  onDelete={() => deleteEx(idx)}
                  onMoveUp={() => moveEx(idx, -1)}
                  onMoveDown={() => moveEx(idx, 1)}
                />
              );
            })
          )}

          {/* Add exercise */}
          <div className="flex gap-2 pt-1">
            <select
              value={selectedExId}
              onChange={e => setSelectedExId(e.target.value)}
              className="flex-1 bg-bg border border-hairline rounded-control px-2 py-1.5 text-white font-sans text-label focus:outline-none focus:border-accent/50"
            >
              <option value="">— Elegir ejercicio —</option>
              {exercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
            <button
              onClick={addExercise}
              disabled={!selectedExId}
              className="px-3 py-1.5 bg-raised border border-hairline text-ink-2 font-sans text-label rounded-control hover:border-accent/40 hover:text-accent disabled:opacity-30 transition-all"
            >
              Añadir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stage accordion ────────────────────────────────────────────────────────────

// StageForm is declared below but TypeScript resolves interfaces globally in a file
interface StageFormProps {
  stage: {
    id: string;
    name: string;
    weeks: number;
    daysPerWeek: number;
    groups: Record<MuscleGroup, MuscleGroupConfig>;
    days: TemplateDay[];
  };
  stageIdx: number;
  exercises: Exercise[];
  isOnly: boolean;
  onChange: (updated: {
    id: string;
    name: string;
    weeks: number;
    daysPerWeek: number;
    groups: Record<MuscleGroup, MuscleGroupConfig>;
    days: TemplateDay[];
  }) => void;
  onDelete: () => void;
}

const StageAccordion: React.FC<StageFormProps> = ({
  stage, stageIdx, exercises, isOnly,
  onChange, onDelete,
}) => {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'volume' | 'training'>('volume');

  const totalSeries = MUSCLE_GROUPS.reduce((s, g) => s + stage.groups[g].series, 0);

  const updateGroup = (g: MuscleGroup, field: keyof MuscleGroupConfig, value: number | string) => {
    onChange({
      ...stage,
      groups: { ...stage.groups, [g]: { ...stage.groups[g], [field]: value } },
    });
  };

  const addDay = () => {
    if (stage.days.length >= stage.daysPerWeek) return;
    const newDay: TemplateDay = {
      id: `day_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: `Día ${stage.days.length + 1}`,
      exercises: [],
    };
    onChange({ ...stage, days: [...stage.days, newDay] });
  };

  const updateDay = (idx: number, updated: TemplateDay) => {
    const days = [...stage.days];
    days[idx] = updated;
    onChange({ ...stage, days });
  };

  const deleteDay = (idx: number) => {
    onChange({ ...stage, days: stage.days.filter((_, i) => i !== idx) });
  };

  return (
    <div className="border border-hairline rounded-surface overflow-hidden">
      {/* Stage header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-surface cursor-pointer" onClick={() => setOpen(o => !o)}>
        <span className={`material-symbols-outlined text-body-s text-ink-2 transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <span className="font-mono text-caption text-ink-3 flex-shrink-0">#{stageIdx + 1}</span>
        <input
          type="text"
          value={stage.name}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ ...stage, name: e.target.value })}
          className="flex-1 bg-transparent font-sans font-bold text-body-s text-white focus:outline-none"
          placeholder="Nombre del mesociclo"
        />
        <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <span className="font-mono text-caption text-ink-3">sem</span>
            <Stepper value={stage.weeks} min={1} max={20} onChange={v => onChange({ ...stage, weeks: v })} />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-caption text-ink-3">días/sem</span>
            <Stepper value={stage.daysPerWeek} min={1} max={7} onChange={v => onChange({ ...stage, daysPerWeek: v })} />
          </div>
          {!isOnly && (
            <button
              onClick={onDelete}
              className="w-6 h-6 flex items-center justify-center rounded-control text-ink-2 hover:text-red-400 transition-colors"
              title="Eliminar mesociclo"
            >
              <span className="material-symbols-outlined text-body-s">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage body */}
      {open && (
        <div className="bg-bg">
          {/* Tabs */}
          <div className="flex border-b border-hairline">
            {(['volume', 'training'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 font-mono text-label uppercase tracking-wider transition-colors ${
                  tab === t ? 'text-accent border-b-2 border-accent' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {t === 'volume' ? 'Volumen' : 'Entrenamiento'}
              </button>
            ))}
          </div>

          {/* Volume table */}
          {tab === 'volume' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-sans text-caption text-ink-2 uppercase tracking-wider">Volumen y prioridad por grupo</span>
                <span className="font-mono text-caption text-accent font-bold">{totalSeries} series/sem</span>
              </div>
              <div className="border border-hairline rounded-surface overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg border-b border-hairline">
                      <th className="px-3 py-2 text-left font-mono text-caption text-ink-2 uppercase tracking-wider">Grupo</th>
                      <th className="px-3 py-2 text-center font-mono text-caption text-ink-2 uppercase tracking-wider">Series</th>
                      <th className="px-3 py-2 text-right font-mono text-caption text-ink-2 uppercase tracking-wider">Prioridad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MUSCLE_GROUPS.map((g) => {
                      const cfg = stage.groups[g];
                      return (
                        <tr
                          key={g}
                          className="border-b border-hairline last:border-0 transition-colors"
                          style={{ backgroundColor: heatmapBg(cfg.series) }}
                        >
                          <td className="px-3 py-3">
                            <span className="font-sans text-label font-medium" style={{ color: cfg.series > 0 ? heatmapText(cfg.series) : 'var(--color-ink-2)' }}>
                              {MUSCLE_LABELS[g]}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-center">
                              <Stepper value={cfg.series} onChange={v => updateGroup(g, 'series', v)} />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end">
                              <PrioritySelector
                                value={cfg.priority}
                                onChange={v => updateGroup(g, 'priority', v)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Training / days */}
          {tab === 'training' && (
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-sans text-caption text-ink-2 uppercase tracking-wider">
                  Días de entrenamiento ({stage.days.length}/{stage.daysPerWeek})
                </span>
                <button
                  onClick={addDay}
                  disabled={stage.days.length >= stage.daysPerWeek}
                  className="flex items-center gap-1 px-2 py-1 bg-raised border border-hairline text-ink-2 font-mono text-caption rounded-control hover:border-accent/40 hover:text-accent disabled:opacity-30 transition-all"
                >
                  <span className="material-symbols-outlined text-body-s">add</span>
                  Añadir día
                </button>
              </div>
              {stage.days.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-hairline rounded-surface">
                  <p className="font-sans text-caption text-ink-3">Sin días predefinidos. El generador usará distribución automática.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stage.days.map((day, idx) => (
                    <DayBlock
                      key={day.id}
                      day={day}
                      dayIdx={idx}
                      exercises={exercises}
                      onChange={updated => updateDay(idx, updated)}
                      onDelete={() => deleteDay(idx)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Form state types ───────────────────────────────────────────────────────────

interface StageForm {
  id: string;
  name: string;
  weeks: number;
  daysPerWeek: number;
  groups: Record<MuscleGroup, MuscleGroupConfig>;
  days: TemplateDay[];
}

interface FormState {
  name: string;
  description: string;
  stages: StageForm[];
}

function emptyStage(n: number): StageForm {
  return {
    id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    name: `Mesociclo ${n}`,
    weeks: 4,
    daysPerWeek: 4,
    groups: DEFAULT_GROUPS(),
    days: [],
  };
}

function emptyForm(): FormState {
  return { name: '', description: '', stages: [emptyStage(1)] };
}

function formFromTemplate(tpl: MesocycleTemplate): FormState {
  return {
    name: tpl.name,
    description: tpl.description ?? '',
    stages: tpl.stages.map(s => ({ ...s, days: s.days ?? [] })),
  };
}

// ── Template editor ────────────────────────────────────────────────────────────

function TemplateEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: FormState;
  saving: boolean;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [nameError, setNameError] = useState('');
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });

  const addStage = () => {
    setForm(f => ({ ...f, stages: [...f.stages, emptyStage(f.stages.length + 1)] }));
  };

  const updateStage = (idx: number, updated: StageForm) => {
    setForm(f => {
      const stages = [...f.stages];
      stages[idx] = updated;
      return { ...f, stages };
    });
  };

  const deleteStage = (idx: number) => {
    setForm(f => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setNameError('El nombre es obligatorio.'); return; }
    setNameError('');
    onSave(form);
  };

  const totalWeeks = form.stages.reduce((s, st) => s + st.weeks, 0);

  return (
    <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
        <h3 className="font-sans font-bold text-white text-title-s flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-title-s">edit_note</span>
          {initial.name ? `Editar "${initial.name}"` : 'Nueva plantilla de mesociclo'}
        </h3>
        <button onClick={onCancel} className="text-ink-2 hover:text-white transition-colors">
          <span className="material-symbols-outlined text-title-s">close</span>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Name + description */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-1.5">Nombre de la plantilla</label>
            <input
              type="text"
              value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameError(''); }}
              placeholder="Ej: Powerbuilding 12 semanas"
              className="w-full bg-bg border border-hairline rounded-control px-3 py-2 text-white text-body-s focus:outline-none focus:border-accent/50 placeholder-ink-3"
            />
            {nameError && <p className="text-red-400 font-sans text-caption mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block font-mono text-caption text-ink-2 uppercase tracking-wider mb-1.5">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Breve descripción de la plantilla"
              className="w-full bg-bg border border-hairline rounded-control px-3 py-2 text-white text-body-s focus:outline-none focus:border-accent/50 placeholder-ink-3"
            />
          </div>
        </div>

        {/* Stages */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">
                Mesociclos ({form.stages.length})
              </span>
              <span className="font-mono text-caption text-ink-3 ml-3">{totalWeeks} semanas en total</span>
            </div>
            <button
              onClick={addStage}
              className="flex items-center gap-1 px-3 py-1.5 bg-raised border border-hairline text-ink-2 font-sans text-caption rounded-control hover:border-accent/40 hover:text-accent transition-all"
            >
              <span className="material-symbols-outlined text-body-s">add</span>
              Añadir mesociclo
            </button>
          </div>
          <div className="space-y-3">
            {form.stages.map((stage, idx) => (
              <StageAccordion
                key={stage.id}
                stage={stage}
                stageIdx={idx}
                exercises={exercises}
                isOnly={form.stages.length === 1}
                onChange={updated => updateStage(idx, updated)}
                onDelete={() => deleteStage(idx)}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 bg-accent text-black font-sans text-label font-bold uppercase tracking-wider rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-3 bg-raised border border-hairline text-ink-2 font-sans text-label font-bold uppercase tracking-wider rounded-control hover:text-white transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

// Merges every stage's muscle group volume config into one, so the template
// card can rank the 3 muscle groups the plantilla emphasizes overall (not just
// within a single stage). Series are summed across stages; priority keeps the
// highest ('alta' beats 'media' beats 'baja') seen for that group in any stage.
const PRIO_RANK: Record<MuscleGroupConfig['priority'], number> = { alta: 0, media: 1, baja: 2 };
function mergeStageGroups(stages: MesocycleTemplate['stages']): Record<MuscleGroup, MuscleGroupConfig> {
  const merged = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const st of stages) {
    for (const [group, cfg] of Object.entries(st.groups) as [MuscleGroup, MuscleGroupConfig][]) {
      const prev = merged[group];
      if (!prev) {
        merged[group] = { ...cfg };
      } else {
        merged[group] = {
          series: prev.series + cfg.series,
          priority: PRIO_RANK[cfg.priority] < PRIO_RANK[prev.priority] ? cfg.priority : prev.priority,
        };
      }
    }
  }
  return merged;
}

function TemplateCard({
  tpl, onEdit, onDelete,
}: {
  tpl: MesocycleTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalWeeks = tpl.stages.reduce((s, st) => s + st.weeks, 0);
  const totalExercises = tpl.stages.reduce((s, st) => s + (st.days ?? []).reduce((ds, d) => ds + d.exercises.length, 0), 0);
  const topGroups = getTopMuscleGroups(mergeStageGroups(tpl.stages), 3);

  return (
    <div className="bg-surface border border-hairline rounded-canvas p-4 hover:border-accent/30 hover:shadow-[0_0_30px_-12px_rgba(251,203,26,0.3)] transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-sans font-bold text-white text-body-s truncate">{tpl.name}</p>
          {tpl.description && (
            <p className="font-sans text-caption text-ink-2 mt-0.5 truncate">{tpl.description}</p>
          )}
          <div className="flex gap-3 mt-1 flex-wrap">
            <span className="font-mono text-caption text-ink-2">{tpl.stages.length} meso{tpl.stages.length !== 1 ? 's' : ''}</span>
            <span className="font-mono text-caption text-accent font-bold">{totalWeeks} semanas</span>
            {totalExercises > 0 && (
              <span className="font-mono text-caption text-data">{totalExercises} ejercicios</span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-control bg-raised border border-hairline text-data hover:border-data/40 transition-all"
            title="Editar plantilla"
          >
            <span className="material-symbols-outlined text-body-s">edit</span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-control bg-raised border border-hairline text-ink-2 hover:text-red-400 hover:border-red-500/30 transition-all"
            title="Eliminar plantilla"
          >
            <span className="material-symbols-outlined text-body-s">delete</span>
          </button>
        </div>
      </div>

      {/* Top 3 grupos musculares prioritarios (calculado desde series+prioridad de todas las etapas) */}
      {topGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {topGroups.map(g => (
            <span
              key={g}
              className="font-sans text-caption px-1.5 py-0.5 rounded-control bg-accent/10 border border-accent/25 text-accent uppercase font-bold"
            >
              {MUSCLE_LABELS[g]}
            </span>
          ))}
        </div>
      )}

      {/* Stage name chips */}
      <div className="flex flex-wrap gap-1">
        {tpl.stages.map(st => (
          <span
            key={st.id}
            className="font-mono text-caption px-2 py-0.5 rounded-full bg-raised border border-hairline text-ink-2"
          >
            {st.name} · {st.weeks}sem
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { coachId: string }

export default function MesocycleTemplateLibrary({ coachId }: Props) {
  const queryClient = useQueryClient();
  const queryKey = mesocycleTemplatesKey(coachId);
  const { data: templatesRaw = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: () => getMesocycleTemplates(coachId),
  });
  const templates = useMemo(
    () => [...templatesRaw].sort((a, b) => a.name.localeCompare(b.name)),
    [templatesRaw]
  );
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [showEditor, setShowEditor]   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (form: FormState) => {
      const data: Omit<MesocycleTemplate, 'id'> = {
        ownerId: coachId,
        name: form.name,
        description: form.description || undefined,
        stages: form.stages.map(s => ({
          id: s.id,
          name: s.name,
          weeks: s.weeks,
          daysPerWeek: s.daysPerWeek,
          groups: s.groups,
          days: s.days.length > 0 ? s.days : undefined,
        })),
      };

      if (editingId === null) {
        const created = await createMesocycleTemplate(data);
        return { type: 'create' as const, created };
      } else {
        await updateMesocycleTemplate(editingId, data);
        return { type: 'update' as const, id: editingId, data };
      }
    },
    onSuccess: result => {
      if (result.type === 'create') {
        queryClient.setQueryData<MesocycleTemplate[]>(queryKey, prev => [...(prev ?? []), result.created]);
      } else {
        queryClient.setQueryData<MesocycleTemplate[]>(queryKey, prev =>
          prev?.map(t => t.id === result.id ? { ...t, ...result.data } : t));
      }
      setShowEditor(false);
      setEditingId(null);
    },
    onError: err => console.error(err),
  });

  const handleSave = (form: FormState) => saveMutation.mutate(form);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMesocycleTemplate(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<MesocycleTemplate[]>(queryKey, prev => prev?.filter(t => t.id !== id));
    },
    onError: err => console.error(err),
    onSettled: () => setConfirmDeleteId(null),
  });

  const handleDelete = (id: string) => deleteMutation.mutate(id);

  const openCreate = () => { setEditingId(null); setShowEditor(true); };
  const openEdit   = (id: string) => { setEditingId(id); setShowEditor(true); };
  const closeEditor = () => { setShowEditor(false); setEditingId(null); };

  const editingTemplate = editingId !== null ? templates.find(t => t.id === editingId) ?? null : null;

  if (showEditor) {
    return (
      <TemplateEditor
        initial={editingTemplate ? formFromTemplate(editingTemplate) : emptyForm()}
        saving={saveMutation.isPending}
        onSave={handleSave}
        onCancel={closeEditor}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-sans font-bold text-title-m text-white">Plantillas de mesociclo</h2>
          <p className="font-sans text-caption text-ink-2 mt-0.5">
            Mesociclos periodizados de múltiples etapas — aplícalos a cualquier cliente.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-body-s">add</span>
          Nueva
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-surface" />
          <Skeleton className="h-20 w-full rounded-surface" />
          <Skeleton className="h-20 w-full rounded-surface" />
        </div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-hairline rounded-surface">
          <span className="material-symbols-outlined text-display text-ink-3 block mb-3">library_books</span>
          <p className="font-sans font-bold text-white text-body-s mb-1">Sin plantillas todavía</p>
          <p className="text-ink-2 text-label font-sans">Crea tu primera plantilla de mesociclo reutilizable.</p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press transition-all"
          >
            Crear plantilla
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tpl => (
            <React.Fragment key={tpl.id}>
              <TemplateCard
                tpl={tpl}
                onEdit={() => openEdit(tpl.id)}
                onDelete={() => setConfirmDeleteId(tpl.id)}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (() => {
        const tpl = templates.find(t => t.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-raised border border-hairline rounded-surface p-6 max-w-sm w-full space-y-4">
              <p className="font-sans font-bold text-white text-body-s">¿Eliminar plantilla?</p>
              <p className="font-sans text-caption text-ink-2">
                Se eliminará «{tpl?.name}» permanentemente. Los mesociclos ya creados a partir de ella no se verán afectados.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="flex-1 py-2 bg-red-500 text-white font-mono text-label font-bold uppercase rounded-control hover:bg-red-600 transition-all"
                >
                  Eliminar
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 bg-raised text-ink-2 font-mono text-label font-bold uppercase rounded-control hover:text-white transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
