import React, { useState, useEffect } from 'react';
import { MuscleGroup, MuscleGroupConfig, MesocycleTemplate, TemplateStage, TemplateDay, WorkoutExercise, Exercise } from '../types';
import { getTopMuscleGroups } from '../utils/muscleGroupRanking';
import {
  getMesocycleTemplates, createMesocycleTemplate,
  updateMesocycleTemplate, deleteMesocycleTemplate, getExercises,
} from '../dbService';

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
  if (series === 0) return '#1a1a1a';
  if (series <= 4)  return `rgb(59 130 246 / ${Math.round(18 + ((series - 1) / 3) * 32)}%)`;
  if (series <= 9)  return `rgb(34 197 94 / ${Math.round(20 + ((series - 5) / 4) * 40)}%)`;
  if (series <= 14) return `rgb(249 115 22 / ${Math.round(28 + ((series - 10) / 4) * 42)}%)`;
  return `rgb(239 68 68 / ${Math.round(48 + Math.min((series - 15) / 5, 1) * 42)}%)`;
}

function heatmapText(series: number): string {
  if (series === 0) return '#555';
  if (series <= 4)  return '#93c5fd';
  if (series <= 9)  return '#86efac';
  if (series <= 14) return '#fdba74';
  return '#fca5a5';
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
        className="w-6 h-6 rounded bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a] disabled:opacity-30 text-xs font-bold flex items-center justify-center"
      >−</button>
      <span className="w-8 text-center font-mono text-sm font-bold" style={{ color: heatmapText(value) }}>
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-6 h-6 rounded bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a] disabled:opacity-30 text-xs font-bold flex items-center justify-center"
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
          className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
            value === o.v ? 'bg-[#fbcb1a] text-black font-bold' : 'bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a]'
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
    <div className="flex items-center gap-2 py-1.5 border-b border-white/40 last:border-0 group">
      {/* Name */}
      <span className="font-mono text-[10px] text-[#c6c9ab] flex-1 min-w-0 truncate" title={exName}>{exName}</span>
      {/* Sets */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-[9px] text-[#555]">sets</span>
        <input
          type="number" min={1} max={20} value={ex.sets}
          onChange={e => onChange({ ...ex, sets: Math.max(1, Number(e.target.value)) })}
          className="w-10 bg-[#0e0e0e] border border-white/7 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-[#fbcb1a]/50"
        />
      </div>
      {/* Reps */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-[9px] text-[#555]">reps</span>
        <input
          type="text" value={ex.reps}
          onChange={e => onChange({ ...ex, reps: e.target.value })}
          className="w-14 bg-[#0e0e0e] border border-white/7 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-[#fbcb1a]/50"
          placeholder="8-12"
        />
      </div>
      {/* RIR */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-[9px] text-[#555]">rir</span>
        <input
          type="number" min={0} max={5} value={ex.rir}
          onChange={e => onChange({ ...ex, rir: Math.min(5, Math.max(0, Number(e.target.value))) })}
          className="w-10 bg-[#0e0e0e] border border-white/7 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-[#fbcb1a]/50"
        />
      </div>
      {/* Rest */}
      <div className="flex items-center gap-0.5">
        <span className="font-mono text-[9px] text-[#555]">rest</span>
        <input
          type="number" min={0} max={600} step={15} value={ex.restSeconds}
          onChange={e => onChange({ ...ex, restSeconds: Math.max(0, Number(e.target.value)) })}
          className="w-14 bg-[#0e0e0e] border border-white/7 rounded px-1 py-0.5 text-center font-mono text-xs text-white focus:outline-none focus:border-[#fbcb1a]/50"
        />
      </div>
      {/* Reorder + delete */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onMoveUp} disabled={isFirst} title="Subir"
          className="w-5 h-5 flex items-center justify-center rounded text-[#c6c9ab] hover:text-white disabled:opacity-20">
          <span className="material-symbols-outlined text-sm">arrow_upward</span>
        </button>
        <button onClick={onMoveDown} disabled={isLast} title="Bajar"
          className="w-5 h-5 flex items-center justify-center rounded text-[#c6c9ab] hover:text-white disabled:opacity-20">
          <span className="material-symbols-outlined text-sm">arrow_downward</span>
        </button>
        <button onClick={onDelete} title="Eliminar ejercicio"
          className="w-5 h-5 flex items-center justify-center rounded text-[#c6c9ab] hover:text-red-400">
          <span className="material-symbols-outlined text-sm">close</span>
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
    <div className="border border-white/7 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#181816] cursor-pointer group" onClick={() => setOpen(o => !o)}>
        <span className={`material-symbols-outlined text-sm text-[#c6c9ab] transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <input
          type="text"
          value={day.name}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ ...day, name: e.target.value })}
          className="flex-1 bg-transparent font-mono text-xs text-white focus:outline-none"
          placeholder="Nombre del día"
        />
        <span className="font-mono text-[9px] text-[#555]">{day.exercises.length} ejerc.</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#c6c9ab] hover:text-red-400 transition-all"
          title="Eliminar día"
        >
          <span className="material-symbols-outlined text-sm">delete</span>
        </button>
      </div>

      {/* Body */}
      {open && (
        <div className="px-3 py-2 bg-[#111] space-y-1">
          {/* Exercise list */}
          {sortedExs.length === 0 ? (
            <p className="font-mono text-[9px] text-[#555] italic py-1">Sin ejercicios.</p>
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
              className="flex-1 bg-[#0e0e0e] border border-white/7 rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-[#fbcb1a]/50"
            >
              <option value="">— Elegir ejercicio —</option>
              {exercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
            <button
              onClick={addExercise}
              disabled={!selectedExId}
              className="px-3 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] font-mono text-xs rounded-lg hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] disabled:opacity-30 transition-all"
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
    <div className="border border-white/7 rounded-xl overflow-hidden">
      {/* Stage header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#181816] cursor-pointer" onClick={() => setOpen(o => !o)}>
        <span className={`material-symbols-outlined text-sm text-[#c6c9ab] transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        <span className="font-mono text-[9px] text-[#555] flex-shrink-0">#{stageIdx + 1}</span>
        <input
          type="text"
          value={stage.name}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ ...stage, name: e.target.value })}
          className="flex-1 bg-transparent font-sans font-bold text-sm text-white focus:outline-none"
          placeholder="Nombre del mesociclo"
        />
        <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] text-[#555]">sem</span>
            <Stepper value={stage.weeks} min={1} max={20} onChange={v => onChange({ ...stage, weeks: v })} />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] text-[#555]">días/sem</span>
            <Stepper value={stage.daysPerWeek} min={1} max={7} onChange={v => onChange({ ...stage, daysPerWeek: v })} />
          </div>
          {!isOnly && (
            <button
              onClick={onDelete}
              className="w-6 h-6 flex items-center justify-center rounded text-[#c6c9ab] hover:text-red-400 transition-colors"
              title="Eliminar mesociclo"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage body */}
      {open && (
        <div className="bg-[#111]">
          {/* Tabs */}
          <div className="flex border-b border-white/7">
            {(['volume', 'training'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  tab === t ? 'text-[#fbcb1a] border-b-2 border-[#fbcb1a]' : 'text-[#555] hover:text-[#c6c9ab]'
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
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Volumen y prioridad por grupo</span>
                <span className="font-mono text-[10px] text-[#fbcb1a] font-bold">{totalSeries} series/sem</span>
              </div>
              <div className="border border-white/7 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#111] border-b border-white/7">
                      <th className="px-3 py-2 text-left font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Grupo</th>
                      <th className="px-3 py-2 text-center font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Series</th>
                      <th className="px-3 py-2 text-right font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Prioridad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MUSCLE_GROUPS.map((g) => {
                      const cfg = stage.groups[g];
                      return (
                        <tr
                          key={g}
                          className="border-b border-white/30 last:border-0 transition-colors"
                          style={{ backgroundColor: heatmapBg(cfg.series) }}
                        >
                          <td className="px-3 py-2.5">
                            <span className="font-sans text-xs font-medium" style={{ color: cfg.series > 0 ? heatmapText(cfg.series) : '#c6c9ab' }}>
                              {MUSCLE_LABELS[g]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-center">
                              <Stepper value={cfg.series} onChange={v => updateGroup(g, 'series', v)} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
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
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">
                  Días de entrenamiento ({stage.days.length}/{stage.daysPerWeek})
                </span>
                <button
                  onClick={addDay}
                  disabled={stage.days.length >= stage.daysPerWeek}
                  className="flex items-center gap-1 px-2 py-1 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] font-mono text-[10px] rounded-lg hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] disabled:opacity-30 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Añadir día
                </button>
              </div>
              {stage.days.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-white/7 rounded-xl">
                  <p className="font-mono text-[10px] text-[#555]">Sin días predefinidos. El generador usará distribución automática.</p>
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
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    getExercises().then(setExercises).catch(console.error);
  }, []);

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
    <div className="bg-[#181816] border border-white/7 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/7">
        <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a] text-base">edit_note</span>
          {initial.name ? `Editar "${initial.name}"` : 'Nueva plantilla de mesociclo'}
        </h3>
        <button onClick={onCancel} className="text-[#c6c9ab] hover:text-white transition-colors">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Name + description */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Nombre de la plantilla</label>
            <input
              type="text"
              value={form.name}
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameError(''); }}
              placeholder="Ej: Powerbuilding 12 semanas"
              className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#fbcb1a]/50 placeholder-[#555]"
            />
            {nameError && <p className="text-red-400 font-mono text-[10px] mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Breve descripción de la plantilla"
              className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#fbcb1a]/50 placeholder-[#555]"
            />
          </div>
        </div>

        {/* Stages */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">
                Mesociclos ({form.stages.length})
              </span>
              <span className="font-mono text-[10px] text-[#555] ml-3">{totalWeeks} semanas en total</span>
            </div>
            <button
              onClick={addStage}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] font-mono text-[10px] rounded-xl hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
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
            className="flex-1 py-2.5 bg-[#fbcb1a] text-black font-mono text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] font-mono text-xs font-bold uppercase tracking-wider rounded-xl hover:text-white transition-all"
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
    <div className="bg-[#181816] border border-white/7 rounded-xl p-4 hover:border-[#3a3a3a] transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-sans font-bold text-white text-sm truncate">{tpl.name}</p>
          {tpl.description && (
            <p className="font-mono text-[9px] text-[#c6c9ab] mt-0.5 truncate">{tpl.description}</p>
          )}
          <div className="flex gap-3 mt-1 flex-wrap">
            <span className="font-mono text-[10px] text-[#c6c9ab]">{tpl.stages.length} meso{tpl.stages.length !== 1 ? 's' : ''}</span>
            <span className="font-mono text-[10px] text-[#fbcb1a] font-bold">{totalWeeks} semanas</span>
            {totalExercises > 0 && (
              <span className="font-mono text-[10px] text-[#00eefc]">{totalExercises} ejercicios</span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg bg-[#1c1b1b] border border-white/7 text-[#00eefc] hover:border-[#00eefc]/40 transition-all"
            title="Editar plantilla"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-red-400 hover:border-red-500/30 transition-all"
            title="Eliminar plantilla"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>

      {/* Top 3 grupos musculares prioritarios (calculado desde series+prioridad de todas las etapas) */}
      {topGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {topGroups.map(g => (
            <span
              key={g}
              className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#fbcb1a]/10 border border-[#fbcb1a]/25 text-[#fbcb1a] uppercase font-bold"
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
            className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#1e1e1b] border border-white/7 text-[#c6c9ab]"
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
  const [templates, setTemplates]     = useState<MesocycleTemplate[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [showEditor, setShowEditor]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    getMesocycleTemplates(coachId)
      .then(list => setTemplates(list.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [coachId]);

  const handleSave = async (form: FormState) => {
    setSaving(true);
    try {
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
        setTemplates(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        await updateMesocycleTemplate(editingId, data);
        setTemplates(prev =>
          prev.map(t => t.id === editingId ? { ...t, ...data } : t)
              .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      setShowEditor(false);
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMesocycleTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const openCreate = () => { setEditingId(null); setShowEditor(true); };
  const openEdit   = (id: string) => { setEditingId(id); setShowEditor(true); };
  const closeEditor = () => { setShowEditor(false); setEditingId(null); };

  const editingTemplate = editingId !== null ? templates.find(t => t.id === editingId) ?? null : null;

  if (showEditor) {
    return (
      <TemplateEditor
        initial={editingTemplate ? formFromTemplate(editingTemplate) : emptyForm()}
        saving={saving}
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
          <h2 className="font-sans font-bold text-lg text-white">Plantillas de mesociclo</h2>
          <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
            Mesociclos periodizados de múltiples etapas — aplícalos a cualquier cliente.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#fbcb1a] text-black font-mono text-[10px] font-bold uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Nueva
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando plantillas…</div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-white/7 rounded-2xl">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">library_books</span>
          <p className="font-sans font-bold text-white text-sm mb-1">Sin plantillas todavía</p>
          <p className="text-[#c6c9ab] text-xs font-mono">Crea tu primera plantilla de mesociclo reutilizable.</p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 bg-[#fbcb1a] text-black font-mono text-[10px] font-bold uppercase rounded-xl hover:bg-[#d4a800] transition-all"
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
            <div className="bg-[#1c1b1b] border border-white/7 rounded-2xl p-6 max-w-sm w-full space-y-4">
              <p className="font-sans font-bold text-white text-sm">¿Eliminar plantilla?</p>
              <p className="font-mono text-[11px] text-[#c6c9ab]">
                Se eliminará «{tpl?.name}» permanentemente. Los mesociclos ya creados a partir de ella no se verán afectados.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="flex-1 py-2 bg-red-500 text-white font-mono text-xs font-bold uppercase rounded-xl hover:bg-red-600 transition-all"
                >
                  Eliminar
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 bg-[#2a2a2a] text-[#c6c9ab] font-mono text-xs font-bold uppercase rounded-xl hover:text-white transition-all"
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
