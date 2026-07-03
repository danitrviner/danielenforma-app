import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MuscleGroup, MuscleGroupConfig, Mesocycle, UserProfile,
  DayPlan, DayAssignment, WeekDistribution, Exercise, WorkoutExercise, TemplateDay,
  MUSCLE_LABELS,
} from '../types';
import {
  getMesocycles, createMesocycle, updateMesocycle, deleteMesocycle,
  getAllUserProfiles, getExercises,
  createWorkoutStrict, createWorkoutAssignmentStrict,
  deleteWorkoutsByMesocycleIdStrict, deleteWorkoutAssignmentsByMesocycleIdStrict,
  getUserProfileByEmail, migratePrimaryFocusToMuscleGroup,
  getMesocycleTemplates,
} from '../dbService';
import MesocycleDashboard from './MesocycleDashboard';
import { MesocycleTemplate } from '../types';
import { rankMuscleGroups } from '../utils/muscleGroupRanking';

// ─── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio',
  'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo',
  'cuadriceps', 'isquios', 'gluteo', 'gemelo', 'core',
];


const DEFAULT_GROUPS = (): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(
    MUSCLE_GROUPS.map(g => [g, { series: 0, priority: 'media' as const }])
  ) as Record<MuscleGroup, MuscleGroupConfig>;

// ─── Heatmap helpers ──────────────────────────────────────────────────────────

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

const LEGEND = [
  { label: 'Sin volumen', range: '0',          bg: '#1a1a1a',               text: '#555'     },
  { label: 'MEV',         range: '1–4 series', bg: 'rgb(59 130 246 / 35%)', text: '#93c5fd'  },
  { label: 'Productivo',  range: '5–9 series', bg: 'rgb(34 197 94 / 45%)',  text: '#86efac'  },
  { label: 'MAV',         range: '10–14',      bg: 'rgb(249 115 22 / 55%)', text: '#fdba74'  },
  { label: 'MRV',         range: '15+',        bg: 'rgb(239 68 68 / 65%)',  text: '#fca5a5'  },
];

// ─── Distribution engine ──────────────────────────────────────────────────────

const ANTAGONIST_PAIRS: [MuscleGroup, MuscleGroup][] = [
  ['pecho',      'dorsal'],
  ['biceps',     'triceps'],
  ['cuadriceps', 'isquios'],
];

function getAntagonist(g: MuscleGroup): MuscleGroup | null {
  for (const [a, b] of ANTAGONIST_PAIRS) {
    if (g === a) return b;
    if (g === b) return a;
  }
  return null;
}

function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [total];
  const base = Math.floor(total / n);
  const rem  = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function sessionCount(series: number, maxDays: number): number {
  const maxNonConsec = Math.ceil(maxDays / 2);
  if (series <= 5)  return 1;
  if (series <= 14) return Math.min(2, maxNonConsec);
  return Math.min(3, maxNonConsec, maxDays);
}

function runDistribution(
  groups: Record<MuscleGroup, MuscleGroupConfig>,
  daysPerWeek: number,
): { days: DayPlan[]; overloadAlert: boolean } {
  const days: DayPlan[] = Array.from({ length: daysPerWeek }, () => ({
    assignments: [], totalSeries: 0,
  }));

  const totalAll = MUSCLE_GROUPS.reduce((s, g) => s + groups[g].series, 0);
  const overloadAlert = totalAll > daysPerWeek * 12;

  const active = rankMuscleGroups(groups);

  const placedOn: Partial<Record<MuscleGroup, number[]>> = {};

  for (const group of active) {
    const total    = groups[group].series;
    const sessions = sessionCount(total, daysPerWeek);
    const chunks   = splitEvenly(total, sessions);
    const myDays: number[] = [];
    placedOn[group] = myDays;

    const antag     = getAntagonist(group);
    const antagDays = (antag && placedOn[antag]) ? placedOn[antag]! : [];

    for (const chunk of chunks) {
      let bestDay = -1, bestScore = Infinity;

      for (let d = 0; d < daysPerWeek; d++) {
        if (myDays.some(pd => Math.abs(d - pd) < 2)) continue;
        let score = days[d].totalSeries;
        if (groups[group].priority === 'alta') score += d * 0.3;
        if (antagDays.includes(d)) score += 50;
        if (score < bestScore) { bestScore = score; bestDay = d; }
      }

      if (bestDay === -1) {
        for (let d = 0; d < daysPerWeek; d++) {
          let score = days[d].totalSeries;
          if (antagDays.includes(d)) score += 50;
          if (score < bestScore) { bestScore = score; bestDay = d; }
        }
      }

      if (bestDay === -1) bestDay = 0;
      days[bestDay].assignments.push({ group, series: chunk });
      days[bestDay].totalSeries += chunk;
      myDays.push(bestDay);
    }
  }

  return { days, overloadAlert };
}

function buildSnapshot(m: Mesocycle) {
  const groupSeries: Partial<Record<MuscleGroup, number>> = {};
  MUSCLE_GROUPS.forEach(g => { if (m.groups[g].series > 0) groupSeries[g] = m.groups[g].series; });
  return { daysPerWeek: m.daysPerWeek, groupSeries };
}

function isStale(m: Mesocycle, dist: WeekDistribution): boolean {
  const cur  = buildSnapshot(m);
  const snap = dist.snapshot;
  if (cur.daysPerWeek !== snap.daysPerWeek) return true;
  const keys = new Set([...Object.keys(cur.groupSeries), ...Object.keys(snap.groupSeries)]) as Set<MuscleGroup>;
  for (const k of keys) {
    if (cur.groupSeries[k] !== snap.groupSeries[k]) return true;
  }
  return false;
}

// ─── Generator types & helpers ────────────────────────────────────────────────

interface PreviewExercise {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  sets: number;
  reps: string;
  rir: number;
  restSeconds: number;
  order: number;
  equipmentMismatch?: boolean; // exercise needs equipment athlete doesn't have
}

interface PreviewDay {
  dayIndex: number;
  exercises: PreviewExercise[];
  warnings: string[];
}

type GeneratorPhase = 'idle' | 'loading' | 'preview' | 'assigning' | 'done' | 'error';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stepper({ value, min = 0, max = 25, onChange }: {
  value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-11 h-11 sm:w-6 sm:h-6 rounded bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a] disabled:opacity-30 text-sm sm:text-xs font-bold flex items-center justify-center flex-shrink-0"
      >−</button>
      <span className="w-8 text-center font-mono text-sm font-bold" style={{ color: heatmapText(value) }}>
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-11 h-11 sm:w-6 sm:h-6 rounded bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a] disabled:opacity-30 text-sm sm:text-xs font-bold flex items-center justify-center flex-shrink-0"
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
          className={`min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 px-2 py-0.5 rounded text-base sm:text-xs font-mono transition-all flex items-center justify-center ${
            value === o.v ? 'bg-[#fbcb1a] text-black font-bold' : 'bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a]'
          }`}
        >{o.icon}</button>
      ))}
    </div>
  );
}

const DayCard: React.FC<{ day: DayPlan; dayNumber: number }> = ({ day, dayNumber }) => {
  const total   = day.totalSeries;
  const optimal = total >= 9 && total <= 12;
  const over    = total > 12;
  const totalColor = optimal ? '#86efac' : over ? '#fdba74' : '#c6c9ab';
  const totalBg    = optimal ? 'rgba(34,197,94,.12)' : over ? 'rgba(249,115,22,.12)' : 'transparent';

  return (
    <div className="bg-[#181816] border border-white/7 rounded-xl p-4 flex-1 min-w-[140px] max-w-[200px]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/7">
        <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Día {dayNumber}</span>
        {over && <span className="material-symbols-outlined text-sm text-orange-400" title=">12 series">warning</span>}
      </div>
      <div className="space-y-1.5 min-h-[60px]">
        {day.assignments.length === 0 ? (
          <p className="text-[10px] text-[#555] font-mono italic">Descanso</p>
        ) : (
          day.assignments.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs text-white truncate">{MUSCLE_LABELS[a.group]}</span>
              <span className="font-mono text-xs font-bold text-[#c6c9ab] flex-shrink-0">{a.series}</span>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between rounded"
        style={{ backgroundColor: totalBg }}
      >
        <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Total</span>
        <span className="font-mono text-sm font-black" style={{ color: totalColor }}>{total}</span>
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
  if (delta > 0) return <span className="font-mono text-[10px] text-[#86efac] ml-1 tabular-nums">▲+{delta}</span>;
  if (delta < 0) return <span className="font-mono text-[10px] text-[#fca5a5] ml-1 tabular-nums">▼{delta}</span>;
  return showEqual ? <span className="font-mono text-[10px] text-[#555] ml-1">=</span> : null;
}

function ProgressionView({ mesocycles }: { mesocycles: Mesocycle[] }) {
  const sorted = [...mesocycles].sort((a, b) => a.number - b.number);

  if (sorted.length < 2) {
    return (
      <div className="text-center py-20 border border-dashed border-white/7 rounded-2xl">
        <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">trending_up</span>
        <p className="text-[#c6c9ab] text-sm font-sans">Crea un segundo mesociclo para comparar la progresión.</p>
        <p className="text-[#555] text-xs font-mono mt-1">Necesitas al menos 2 mesociclos.</p>
      </div>
    );
  }

  const totals = sorted.map(m => MUSCLE_GROUPS.reduce((s, g) => s + m.groups[g].series, 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-[10px] font-mono">
        <span className="text-[#86efac]">▲ Sube</span>
        <span className="text-[#fca5a5]">▼ Baja</span>
        <span className="text-[#555]">= Sin cambio</span>
        <span className="text-[#c6c9ab] ml-2">⭐ Alta · ◑ Media · ⚪ Baja prioridad</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/7">
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${130 + sorted.length * 120}px` }}>
          <thead>
            <tr className="bg-[#0e0e0e]">
              <th className="sticky left-0 z-10 bg-[#0e0e0e] text-left px-4 py-3 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider border-b border-r border-white/7 w-[130px]">
                Grupo muscular
              </th>
              {sorted.map(m => (
                <th key={m.id} className="px-3 py-3 border-b border-r border-white/7 last:border-r-0 text-center align-bottom">
                  <span className="font-mono text-[10px] text-[#fbcb1a] uppercase tracking-wider block">Meso #{m.number}</span>
                  <span className="font-mono text-[9px] text-[#c6c9ab] block mt-0.5">{m.startDate}</span>
                  <span className="font-mono text-[9px] text-[#555] block">{m.daysPerWeek}d · {m.weeks} sem</span>
                  {m.objective && (
                    <span className="block mt-1 text-[9px] text-[#c6c9ab] font-sans font-medium max-w-[100px] mx-auto leading-tight"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >{m.objective}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MUSCLE_GROUPS.map((group, rowIdx) => (
              <tr key={group} className={rowIdx % 2 === 0 ? 'bg-[#111]' : 'bg-[#0e0e0e]'}>
                <td className={`sticky left-0 z-10 px-4 py-2.5 border-r border-white/7 font-sans text-xs text-[#c6c9ab] whitespace-nowrap ${rowIdx % 2 === 0 ? 'bg-[#111]' : 'bg-[#0e0e0e]'}`}>
                  {MUSCLE_LABELS[group]}
                </td>
                {sorted.map((m, mIdx) => {
                  const cfg  = m.groups[group];
                  const prev = mIdx > 0 ? sorted[mIdx - 1].groups[group] : null;
                  const delta = prev !== null ? cfg.series - prev.series : null;
                  const zeroToZero = prev !== null && prev.series === 0 && cfg.series === 0;
                  return (
                    <td key={m.id} className="px-3 py-2.5 border-r border-white/7 last:border-r-0 text-center"
                      style={{ backgroundColor: cfg.series > 0 ? heatmapBg(cfg.series) : undefined }}
                    >
                      {cfg.series === 0 ? (
                        <span className="font-mono text-[10px] text-[#333]">—</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <span className="font-mono text-xs font-bold tabular-nums" style={{ color: heatmapText(cfg.series) }}>
                            {cfg.series}
                          </span>
                          <span className="text-[10px]">{PRIORITY_ICON[cfg.priority]}</span>
                          {!zeroToZero && <Delta delta={delta} showEqual />}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={sorted.length + 1} className="h-px bg-[#2a2a2a] p-0" /></tr>
            <tr className="bg-[#0e0e0e]">
              <td className="sticky left-0 z-10 bg-[#0e0e0e] px-4 py-2.5 border-r border-t border-white/7 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider whitespace-nowrap">Total series</td>
              {sorted.map((m, mIdx) => {
                const total = totals[mIdx];
                const delta = mIdx > 0 ? total - totals[mIdx - 1] : null;
                return (
                  <td key={m.id} className="px-3 py-2.5 border-r border-t border-white/7 last:border-r-0 text-center">
                    <div className="flex items-center justify-center">
                      <span className="font-mono text-sm font-black text-white tabular-nums">{total}</span>
                      <Delta delta={delta} showEqual />
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr className="bg-[#111]">
              <td className="sticky left-0 z-10 bg-[#111] px-4 py-2.5 border-r border-t border-white/7 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider whitespace-nowrap">Días / semana</td>
              {sorted.map((m, mIdx) => {
                const delta = mIdx > 0 ? m.daysPerWeek - sorted[mIdx - 1].daysPerWeek : null;
                return (
                  <td key={m.id} className="px-3 py-2.5 border-r border-t border-white/7 last:border-r-0 text-center">
                    <div className="flex items-center justify-center">
                      <span className="font-mono text-xs font-bold text-[#c6c9ab]">{m.daysPerWeek}d</span>
                      <Delta delta={delta} />
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr className="bg-[#0e0e0e]">
              <td className="sticky left-0 z-10 bg-[#0e0e0e] px-4 py-2.5 border-r border-t border-white/7 font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider whitespace-nowrap">Semanas</td>
              {sorted.map((m, mIdx) => {
                const delta = mIdx > 0 ? m.weeks - sorted[mIdx - 1].weeks : null;
                return (
                  <td key={m.id} className="px-3 py-2.5 border-r border-t border-white/7 last:border-r-0 text-center">
                    <div className="flex items-center justify-center">
                      <span className="font-mono text-xs font-bold text-[#c6c9ab]">{m.weeks} sem</span>
                      <Delta delta={delta} />
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="font-mono text-[9px] text-[#555]">{sorted.length} mesociclos · Ordenados por número de mesociclo</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type SaveState  = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type EditorTab  = 'volume' | 'distribution' | 'progression';

interface MesocycleManagerProps {
  coachId: string;
  athleteEmail?: string;      // when set: skip the athlete selector
  athleteEquipment?: string[]; // from onboarding; used to rank exercises in generator
}

export default function MesocycleManager({ coachId, athleteEmail, athleteEquipment = [] }: MesocycleManagerProps) {
  const [athletes, setAthletes]           = useState<UserProfile[]>([]);
  const [selectedEmail, setSelectedEmail] = useState(athleteEmail ?? '');
  const [mesocycles, setMesocycles]       = useState<Mesocycle[]>([]);
  const [loadingMeso, setLoadingMeso]     = useState(false);
  const [creating, setCreating]           = useState(false);

  const [mesoView, setMesoView]           = useState<'list' | 'dashboard'>('list');
  const [editing, setEditing]             = useState<Mesocycle | null>(null);
  const [editorTab, setEditorTab]         = useState<EditorTab>('volume');
  const [saveState, setSaveState]         = useState<SaveState>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Template picker state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates]                   = useState<MesocycleTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates]     = useState(false);
  const [applyingTemplate, setApplyingTemplate]     = useState(false);

  // Generator state
  const [genPhase, setGenPhase]           = useState<GeneratorPhase>('idle');
  const [previewDays, setPreviewDays]     = useState<PreviewDay[]>([]);
  const [allExercises, setAllExercises]   = useState<Exercise[]>([]);
  const [athleteUid, setAthleteUid]       = useState<string | null>(null);
  const [assignProgress, setAssignProgress] = useState({ done: 0, total: 0 });
  const [genError, setGenError]           = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only load the full athlete list in standalone mode (no athleteEmail prop)
  useEffect(() => { if (!athleteEmail) getAllUserProfiles().then(setAthletes); }, [athleteEmail]);

  // Keep in sync when parent changes the bound email
  useEffect(() => {
    if (athleteEmail) setSelectedEmail(athleteEmail);
  }, [athleteEmail]);

  useEffect(() => {
    if (!selectedEmail) { setMesocycles([]); return; }
    setLoadingMeso(true);
    setEditing(null);
    setGenPhase('idle');
    setMesoView('list');
    getMesocycles(selectedEmail)
      .then(list => setMesocycles([...list].sort((a, b) => a.number - b.number)))
      .finally(() => setLoadingMeso(false));
  }, [selectedEmail]);

  const scheduleAutoSave = useCallback((updated: Mesocycle) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('pending');
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        const { id, ...rest } = updated;
        await updateMesocycle(id, rest);
        setMesocycles(prev => prev.map(m => m.id === id ? updated : m));
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
      }
    }, 800);
  }, []);

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

  const handleGenerateDistribution = () => {
    if (!editing) return;
    const result = runDistribution(editing.groups, editing.daysPerWeek);
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
      const exercises = await getExercises();
      setAllExercises(exercises);

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
          const numEx   = Math.max(1, Math.round(series / 4));
          const chunks  = splitEvenly(series, Math.min(numEx, available.length * 2));
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
    const total = editing.weeks * editing.daysPerWeek;
    setGenPhase('assigning');
    setAssignProgress({ done: 0, total });
    setGenError('');

    try {
      // Dedup: remove previous workouts/assignments for this mesocycle from Firestore first
      await deleteWorkoutsByMesocycleIdStrict(editing.id);
      await deleteWorkoutAssignmentsByMesocycleIdStrict(editing.id);

      let done = 0;
      for (let week = 1; week <= editing.weeks; week++) {
        for (let dayIdx = 0; dayIdx < editing.daysPerWeek; dayIdx++) {
          const pd   = previewDays[dayIdx] ?? { exercises: [], warnings: [] };
          const date = addDays(editing.startDate, (week - 1) * 7 + dayIdx);

          const exercises: WorkoutExercise[] = pd.exercises.map(pe => ({
            exerciseId:  pe.exerciseId,
            order:       pe.order,
            sets:        pe.sets,
            reps:        pe.reps,
            rir:         pe.rir,
            restSeconds: pe.restSeconds,
            muscleGroup: pe.muscleGroup,
          }));

          // createWorkoutStrict throws on Firestore failure — no silent local fallback
          const workout = await createWorkoutStrict({
            ownerId:     coachId,
            name:        `Día ${dayIdx + 1} – Meso #${editing.number}`,
            mesocycleId: editing.id,
            exercises,
          });

          // athleteId is the resolved UID (not email) so athlete security rules match
          await createWorkoutAssignmentStrict({
            workoutId:   workout.id,
            athleteId:   athleteUid,
            mesocycleId: editing.id,
            date,
            status:      'pending',
          });

          done++;
          setAssignProgress({ done, total });
        }
      }

      setGenPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[handleAssign]', err);
      setGenError(`Error Firestore: ${msg}`);
      setGenPhase('error');
    }
  };

  // ── Preview edit helpers ───────────────────────────────────────────────────

  function updatePEx(dayIdx: number, exIdx: number, field: keyof PreviewExercise, value: unknown) {
    setPreviewDays(prev => prev.map((d, di) =>
      di !== dayIdx ? d : {
        ...d,
        exercises: d.exercises.map((e, ei) =>
          ei !== exIdx ? e : { ...e, [field]: value }
        ),
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

      for (let i = 0; i < tpl.stages.length; i++) {
        const stage = tpl.stages[i];
        const meso = await createMesocycle({
          athleteId:    selectedEmail,
          number:       startNumber + i,
          weeks:        stage.weeks,
          startDate,
          objective:    stage.name,
          daysPerWeek:  stage.daysPerWeek,
          groups:       { ...stage.groups },
          days:         stage.days && stage.days.length > 0
                          ? stage.days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e })) }))
                          : undefined,
          programId,
          programOrder: i,
        });
        created.push(meso);
        // Advance start date
        const d = new Date(startDate + 'T00:00:00');
        d.setDate(d.getDate() + stage.weeks * 7);
        startDate = d.toISOString().split('T')[0];
      }

      setMesocycles(prev => [...prev, ...created]);
      setEditing(created[0]);
      setEditorTab('volume');
      setConfirmDelete(false);
      setGenPhase('idle');
      setShowTemplatePicker(false);
    } catch (err) {
      console.error(err);
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
      setMesocycles(prev => [...prev, created]);
      setEditing(created);
      setEditorTab('volume');
      setConfirmDelete(false);
      setGenPhase('idle');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    await deleteMesocycle(editing.id);
    setMesocycles(prev => prev.filter(m => m.id !== editing.id));
    setEditing(null);
    setConfirmDelete(false);
  };

  const saveLabel = {
    idle: '', pending: '…', saving: 'Guardando…', saved: '✓ Guardado', error: '⚠ Error',
  }[saveState];

  const selectedAthlete = athletes.find(a => a.email === selectedEmail);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Title + selector only in standalone mode */}
      {!athleteEmail && (
        <>
          <div>
            <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Macrociclo</h1>
            <p className="text-[#c6c9ab] text-sm mt-1">Diseña los mesociclos y genera rutinas reales para el atleta.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#c6c9ab]">person_search</span>
            <select
              value={selectedEmail}
              onChange={e => { setSelectedEmail(e.target.value); setEditing(null); setGenPhase('idle'); }}
              className="bg-[#1c1b1b] border border-white/7 text-white font-mono text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#fbcb1a] min-w-[220px]"
            >
              <option value="">— Selecciona un atleta —</option>
              {athletes.map(a => (
                <option key={a.email} value={a.email}>{a.displayName} ({a.email})</option>
              ))}
            </select>
            {selectedAthlete && (
              <img src={selectedAthlete.avatarUrl} alt="" className="w-8 h-8 rounded-full border border-white/7 object-cover" />
            )}
          </div>
          {!selectedEmail && (
            <div className="text-center py-24 border border-dashed border-white/7 rounded-2xl">
              <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">calendar_view_month</span>
              <p className="text-[#c6c9ab] text-sm">Selecciona un atleta para ver o crear sus mesociclos.</p>
            </div>
          )}
        </>
      )}

      {selectedEmail && (
        <>
        {/* View toggle */}
        <div className="flex bg-[#181816] border border-white/7 p-1 rounded-xl gap-1 w-full sm:w-fit">
          {([
            { id: 'list',      label: 'Mesociclos', icon: 'calendar_view_month' },
            { id: 'dashboard', label: 'Dashboard',  icon: 'dashboard' },
          ] as { id: 'list' | 'dashboard'; label: string; icon: string }[]).map(v => (
            <button
              key={v.id}
              onClick={() => setMesoView(v.id)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wide transition-all ${
                mesoView === v.id ? 'bg-[#fbcb1a] text-black' : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        {mesoView === 'dashboard' ? (
          <MesocycleDashboard mesocycles={mesocycles} athleteEmail={selectedEmail} />
        ) : (
        <div className="flex flex-col xl:flex-row gap-6">

          {/* ── Left: list ── */}
          <div className="xl:w-64 flex-shrink-0 space-y-3">
            <button
              onClick={handleNew} disabled={creating}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#fbcb1a] text-black font-mono text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {creating ? 'Creando…' : 'Nuevo mesociclo'}
            </button>
            <button
              onClick={handleOpenTemplatePicker}
              className="w-full flex items-center justify-center gap-2 py-2 border border-white/7 text-[#c6c9ab] font-mono text-[10px] font-bold uppercase tracking-wider rounded-xl hover:border-[#fbcb1a]/40 hover:text-[#fbcb1a] transition-all"
            >
              <span className="material-symbols-outlined text-sm">library_books</span>
              Usar plantilla
            </button>

            {loadingMeso && <p className="text-center text-[#c6c9ab] font-mono text-xs animate-pulse py-6">Cargando…</p>}
            {!loadingMeso && mesocycles.length === 0 && (
              <p className="text-center text-[#c6c9ab] font-mono text-xs py-6">Sin mesociclos todavía.</p>
            )}

            {mesocycles.map(m => (
              <button
                key={m.id}
                onClick={() => { setEditing(m); setEditorTab('volume'); setConfirmDelete(false); setGenPhase('idle'); }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  editing?.id === m.id
                    ? 'border-[#fbcb1a]/60 bg-[#fbcb1a]/5'
                    : 'border-white/7 bg-[#181816] hover:border-[#3a3a3a]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Meso #{m.number}</span>
                  <span className="font-mono text-[10px] text-[#c6c9ab]">{m.weeks}sem · {m.daysPerWeek}d/sem</span>
                </div>
                <p className="text-white text-xs font-sans font-semibold truncate">{m.objective || '(sin objetivo)'}</p>
                <p className="text-[#c6c9ab] text-[10px] font-mono mt-0.5">{m.startDate}</p>
                <div className="flex items-center gap-2 mt-1">
                  {m.distribution && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-[#86efac]">
                      <span className="material-symbols-outlined text-[10px]">grid_view</span>Distribución
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
              <div className="bg-[#181816] border border-white/7 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-sans font-bold text-white text-base">Mesociclo #{editing.number}</h2>
                  <span className={`font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    saveState === 'saved'  ? 'text-[#86efac]' :
                    saveState === 'error'  ? 'text-red-400' :
                    saveState === 'saving' ? 'text-[#fbcb1a] animate-pulse' : 'text-[#c6c9ab]'
                  }`}>{saveLabel}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Nº Meso</label>
                    <input type="number" min={1}
                      value={editing.number}
                      onChange={e => updateField('number', parseInt(e.target.value) || 1)}
                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#fbcb1a]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Semanas</label>
                    <input type="number" min={1} max={16}
                      value={editing.weeks}
                      onChange={e => updateField('weeks', parseInt(e.target.value) || 1)}
                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#fbcb1a]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Fecha inicio</label>
                    <input type="date"
                      value={editing.startDate}
                      onChange={e => updateField('startDate', e.target.value)}
                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2.5 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#fbcb1a]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Días/semana</label>
                    <div className="flex gap-1 flex-wrap">
                      {[2,3,4,5,6].map(d => (
                        <button key={d} onClick={() => updateField('daysPerWeek', d)}
                          className={`w-11 h-11 rounded font-mono text-xs font-bold transition-all ${
                            editing.daysPerWeek === d ? 'bg-[#fbcb1a] text-black' : 'bg-[#2a2a2a] text-[#c6c9ab] hover:bg-[#3a3a3a]'
                          }`}
                        >{d}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Objetivo</label>
                  <input type="text"
                    placeholder="Ej. Hipertrofia tren superior, puesta en forma general…"
                    value={editing.objective}
                    onChange={e => updateField('objective', e.target.value)}
                    className="w-full bg-[#1c1b1b] border border-white/7 rounded px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#fbcb1a]"
                  />
                </div>
              </div>

              {/* Tab bar */}
              <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
                <div className="flex bg-[#181816] border border-white/7 p-1 rounded-xl gap-1 min-w-max">
                  {([
                    { id: 'volume',       label: 'Volumen y Prioridad', icon: 'bar_chart'   },
                    { id: 'distribution', label: 'Distribución',        icon: 'grid_view'   },
                    { id: 'progression',  label: 'Progresión',          icon: 'trending_up' },
                  ] as { id: EditorTab; label: string; icon: string }[]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setEditorTab(tab.id); if (tab.id !== 'distribution') setGenPhase('idle'); }}
                      className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
                        editorTab === tab.id ? 'bg-[#fbcb1a] text-black' : 'text-[#c6c9ab] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Volumen y Prioridad ── */}
              {editorTab === 'volume' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {LEGEND.map(l => (
                      <div key={l.label}
                        className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-white/5"
                        style={{ backgroundColor: l.bg }}
                      >
                        <span className="font-mono text-[10px] font-bold" style={{ color: l.text }}>{l.label}</span>
                        <span className="font-mono text-[9px] opacity-70" style={{ color: l.text }}>{l.range}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/7 overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-[#0e0e0e] border-b border-white/7">
                      <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Grupo muscular</span>
                      <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-center w-24">Series/sem</span>
                      <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider text-center w-28">Prioridad</span>
                    </div>
                    {MUSCLE_GROUPS.map((group, idx) => {
                      const cfg = editing.groups[group];
                      return (
                        <div key={group}
                          className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_auto] sm:gap-3 sm:items-center px-4 py-3 transition-colors"
                          style={{
                            backgroundColor: heatmapBg(cfg.series),
                            borderBottom: idx < MUSCLE_GROUPS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}
                        >
                          <span className="font-sans text-sm font-semibold" style={{ color: cfg.series === 0 ? '#555' : '#fff' }}>
                            {MUSCLE_LABELS[group]}
                          </span>
                          <div className="flex items-center justify-between gap-3 sm:contents">
                            <div className="flex sm:w-24 sm:justify-center">
                              <Stepper value={cfg.series} onChange={v => updateGroup(group, 'series', v)} />
                            </div>
                            <div className="flex sm:w-28 sm:justify-center">
                              <PrioritySelector value={cfg.priority} onChange={v => updateGroup(group, 'priority', v)} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-[#181816] border border-white/7 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-wider">Total series semanales</span>
                    <span className="font-mono font-black text-xl text-white">
                      {MUSCLE_GROUPS.reduce((acc, g) => acc + editing.groups[g].series, 0)}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Distribución ── */}
              {editorTab === 'distribution' && (
                <div className="space-y-4">

                  {/* === Normal view (idle / loading) === */}
                  {(genPhase === 'idle' || genPhase === 'loading') && (
                    <>
                      {/* Notice: predefined days from template */}
                      {(editing.days?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 bg-[#00eefc]/5 border border-[#00eefc]/20 rounded-xl p-3 mb-2">
                          <span className="material-symbols-outlined text-[#00eefc] text-sm flex-shrink-0">fitness_center</span>
                          <p className="font-mono text-[10px] text-[#00eefc]">
                            Entrenamiento prediseñado: {editing.days!.length} días · {editing.days!.reduce((s, d) => s + d.exercises.length, 0)} ejercicios. El generador los usará en vez de auto-sugerir.
                          </p>
                        </div>
                      )}

                      {/* Distribution controls */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleGenerateDistribution}
                          className="flex items-center gap-2 px-4 py-2.5 bg-[#fbcb1a] text-black font-mono text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">shuffle</span>
                          Distribución Automática
                        </button>
                        {editing.distribution && isStale(editing, editing.distribution) && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                            <span className="material-symbols-outlined text-sm text-orange-400">warning</span>
                            <span className="font-mono text-xs text-orange-300">
                              El volumen o los días cambiaron — recalcula para actualizar
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Overload alert */}
                      {editing.distribution?.overloadAlert && (
                        <div className="flex items-start gap-3 px-4 py-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                          <span className="material-symbols-outlined text-orange-400 mt-0.5">warning</span>
                          <div>
                            <p className="font-mono text-xs font-bold text-orange-300 uppercase mb-0.5">Sobrevolumen</p>
                            <p className="font-mono text-xs text-orange-300/80">
                              El volumen total supera el límite de {editing.daysPerWeek} días × 12 series.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Weekly grid */}
                      {editing.distribution ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-3 text-[10px] font-mono">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[rgba(34,197,94,.4)]"></span><span className="text-[#c6c9ab]">9–12 series</span></span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[rgba(249,115,22,.4)]"></span><span className="text-[#c6c9ab]">&gt;12 series</span></span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#2a2a2a]"></span><span className="text-[#c6c9ab]">&lt;9 series</span></span>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {editing.distribution.days.map((day, i) => (
                              <DayCard key={i} day={day} dayNumber={i + 1} />
                            ))}
                          </div>

                          <div className="bg-[#181816] border border-white/7 rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block">Series totales</span>
                                <span className="font-mono font-black text-lg text-white">
                                  {editing.distribution.days.reduce((s, d) => s + d.totalSeries, 0)}
                                </span>
                              </div>
                              <div>
                                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase block">Sesiones activas</span>
                                <span className="font-mono font-black text-lg text-white">
                                  {editing.distribution.days.filter(d => d.assignments.length > 0).length}/{editing.daysPerWeek}
                                </span>
                              </div>
                            </div>
                            <span className="font-mono text-[9px] text-[#555]">
                              Generado {new Date(editing.distribution.generatedAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 border border-dashed border-white/7 rounded-2xl">
                          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">grid_view</span>
                          <p className="text-[#c6c9ab] text-sm">Pulsa «Distribución Automática» para repartir las series.</p>
                        </div>
                      )}

                      {/* ── Generar rutinas ── */}
                      {((editing.days?.length ?? 0) > 0 || (editing.distribution && !isStale(editing, editing.distribution))) && (
                        <div className="border-t border-white/7 pt-4 mt-2 space-y-3">
                          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Rutinas del mesociclo</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={handleGenerate}
                              disabled={genPhase === 'loading'}
                              className="flex items-center gap-2 px-4 py-2.5 bg-[#1c1b1b] border border-[#fbcb1a]/40 text-[#fbcb1a] font-mono text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#fbcb1a]/10 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {genPhase === 'loading' ? (
                                <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Analizando…</>
                              ) : (
                                <><span className="material-symbols-outlined text-sm">auto_fix_high</span>Generar rutinas</>
                              )}
                            </button>
                            <span className="font-mono text-[10px] text-[#555]">
                              Creará {editing.weeks} × {editing.daysPerWeek} = {editing.weeks * editing.daysPerWeek} sesiones
                            </span>
                          </div>
                        </div>
                      )}

                      {editing.distribution && isStale(editing, editing.distribution) && (
                        <p className="font-mono text-[10px] text-[#555] pt-2">Recalcula la distribución antes de generar rutinas.</p>
                      )}
                    </>
                  )}

                  {/* === Preview (editable) === */}
                  {genPhase === 'preview' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="font-sans font-bold text-white text-sm">Vista previa de rutinas</p>
                          <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                            Meso #{editing.number} · {editing.weeks} semanas × {editing.daysPerWeek} días =&nbsp;
                            <span className="text-[#fbcb1a]">{editing.weeks * editing.daysPerWeek} sesiones</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setGenPhase('idle'); setPreviewDays([]); }}
                            className="px-3 py-2 font-mono text-xs text-[#c6c9ab] hover:text-white border border-white/7 rounded-lg transition-all flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Volver
                          </button>
                          <button
                            onClick={handleAssign}
                            className="px-4 py-2 bg-[#fbcb1a] text-black font-mono text-xs font-bold uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all flex items-center gap-2"
                          >
                            <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                            Asignar al atleta
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {previewDays.map((pd, dayIdx) => (
                          <div key={dayIdx} className="bg-[#181816] border border-white/7 rounded-xl p-4 flex-1 min-w-[260px]">
                            {/* Day header */}
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/7">
                              <span className="font-mono text-xs font-bold text-[#fbcb1a] uppercase">Día {dayIdx + 1}</span>
                              <span className="font-mono text-[10px] text-[#c6c9ab]">
                                {pd.exercises.reduce((s, e) => s + e.sets, 0)} series
                              </span>
                            </div>

                            {/* Warnings */}
                            {pd.warnings.length > 0 && (
                              <div className="mb-2 space-y-0.5">
                                {pd.warnings.map((w, wi) => (
                                  <p key={wi} className="text-[10px] font-mono text-orange-400 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[10px]">warning</span>
                                    Sin ejercicios para {w}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Exercise rows */}
                            <div className="space-y-2">
                              {pd.exercises.map((pe, peIdx) => (
                                <div key={peIdx} className="bg-[#1e1e1b] rounded-lg p-2.5 space-y-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-sans font-semibold text-white truncate">{pe.name}</p>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-[9px] font-mono text-[#c6c9ab]">{MUSCLE_LABELS[pe.muscleGroup]}</p>
                                        {pe.equipmentMismatch && (
                                          <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded" title="Material no disponible según onboarding">
                                            <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>warning</span>
                                            sin material
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => removePEx(dayIdx, peIdx)}
                                      className="text-[#555] hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
                                    >
                                      <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    <div>
                                      <label className="block font-mono text-[9px] text-[#555] mb-0.5">Series</label>
                                      <input
                                        type="number" min={1} max={20}
                                        value={pe.sets}
                                        onChange={e => updatePEx(dayIdx, peIdx, 'sets', parseInt(e.target.value) || 1)}
                                        className="w-full bg-[#181816] border border-white/7 rounded px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-[#fbcb1a]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block font-mono text-[9px] text-[#555] mb-0.5">Reps</label>
                                      <input
                                        type="text"
                                        value={pe.reps}
                                        onChange={e => updatePEx(dayIdx, peIdx, 'reps', e.target.value)}
                                        className="w-full bg-[#181816] border border-white/7 rounded px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-[#fbcb1a]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block font-mono text-[9px] text-[#555] mb-0.5">RIR</label>
                                      <input
                                        type="number" min={0} max={5}
                                        value={pe.rir}
                                        onChange={e => updatePEx(dayIdx, peIdx, 'rir', parseInt(e.target.value) ?? 0)}
                                        className="w-full bg-[#181816] border border-white/7 rounded px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-[#fbcb1a]"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Add exercise */}
                            <div className="mt-2">
                              <select
                                value=""
                                onChange={e => { if (e.target.value) addPEx(dayIdx, e.target.value); }}
                                className="w-full bg-[#1e1e1b] border border-dashed border-[#3a3a3a] rounded-lg px-3 py-2 text-xs font-mono text-[#c6c9ab] focus:outline-none focus:border-[#fbcb1a] cursor-pointer"
                              >
                                <option value="">+ Añadir ejercicio…</option>
                                {allExercises.map(ex => (
                                  <option key={ex.id} value={ex.id}>
                                    {ex.name}{ex.muscleGroup ? ` (${MUSCLE_LABELS[ex.muscleGroup]})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="font-mono text-[10px] text-[#555]">
                        Los cambios en sets/reps/RIR se aplican igual en todas las semanas.
                        Después de asignar, edita semanas concretas en la vista de entrenamientos del atleta.
                      </p>
                    </div>
                  )}

                  {/* === Assigning progress === */}
                  {genPhase === 'assigning' && (
                    <div className="text-center py-16 space-y-4">
                      <span className="material-symbols-outlined text-4xl text-[#fbcb1a] animate-spin block">refresh</span>
                      <p className="font-sans font-bold text-white text-sm">Creando sesiones en Firestore…</p>
                      <div className="max-w-xs mx-auto">
                        <div className="bg-[#2a2a2a] rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-[#fbcb1a] h-2 rounded-full transition-all duration-300"
                            style={{ width: `${assignProgress.total ? (assignProgress.done / assignProgress.total) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="font-mono text-[10px] text-[#c6c9ab] mt-2 text-center">
                          {assignProgress.done} / {assignProgress.total} sesiones
                        </p>
                      </div>
                    </div>
                  )}

                  {/* === Done === */}
                  {genPhase === 'done' && (
                    <div className="text-center py-16 space-y-4">
                      <span className="material-symbols-outlined text-5xl text-[#86efac] block">check_circle</span>
                      <div>
                        <p className="font-sans font-bold text-white text-sm">¡Rutinas asignadas!</p>
                        <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">
                          {editing.weeks * editing.daysPerWeek} sesiones creadas a partir del {editing.startDate}
                        </p>
                      </div>
                      <button
                        onClick={() => setGenPhase('idle')}
                        className="px-4 py-2 font-mono text-xs text-[#c6c9ab] border border-white/7 rounded-lg hover:text-white hover:border-[#3a3a3a] transition-all"
                      >
                        Volver a la distribución
                      </button>
                    </div>
                  )}

                  {/* === Error === */}
                  {genPhase === 'error' && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <span className="material-symbols-outlined text-red-400 mt-0.5">error</span>
                        <p className="font-mono text-xs text-red-300">{genError}</p>
                      </div>
                      <button
                        onClick={() => setGenPhase('idle')}
                        className="font-mono text-xs text-[#c6c9ab] hover:text-white transition-colors"
                      >← Volver</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Progresión ── */}
              {editorTab === 'progression' && <ProgressionView mesocycles={mesocycles} />}

              {/* Delete zone */}
              <div className="flex justify-end pt-2">
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    className="font-mono text-xs text-[#c6c9ab] hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Eliminar mesociclo
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-red-400">¿Eliminar este mesociclo?</span>
                    <button onClick={handleDelete}
                      className="px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-400 font-mono text-xs rounded-lg hover:bg-red-500/30 transition-all"
                    >Confirmar</button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 bg-[#2a2a2a] text-[#c6c9ab] font-mono text-xs rounded-lg hover:bg-[#3a3a3a] transition-all"
                    >Cancelar</button>
                  </div>
                )}
              </div>

            </div>
          ) : (
            selectedEmail && !loadingMeso && (
              <div className="flex-1 flex items-center justify-center text-center py-20 border border-dashed border-white/7 rounded-2xl">
                <div>
                  <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">edit_note</span>
                  <p className="text-[#c6c9ab] text-sm">Selecciona un mesociclo o crea uno nuevo.</p>
                </div>
              </div>
            )
          )}
        </div>
        )}
        </>
      )}

      {/* ── Template picker modal ── */}
      {showTemplatePicker && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-white/7 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/7 flex-shrink-0">
              <div>
                <h3 className="font-sans font-bold text-white text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-base">library_books</span>
                  Usar plantilla
                </h3>
                <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                  Se clonarán todos los mesociclos del programa para {selectedEmail}.
                </p>
              </div>
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="text-[#c6c9ab] hover:text-white transition-colors ml-4"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {loadingTemplates ? (
                <p className="text-center py-10 font-mono text-sm text-[#c6c9ab] animate-pulse">Cargando plantillas…</p>
              ) : templates.length === 0 ? (
                <div className="text-center py-10">
                  <span className="material-symbols-outlined text-3xl text-[#2a2a2a] block mb-2">library_books</span>
                  <p className="font-mono text-xs text-[#c6c9ab]">
                    Sin plantillas. Crea una en Ejercicios → Plantillas.
                  </p>
                </div>
              ) : templates.map(tpl => {
                const totalWeeks = tpl.stages.reduce((s, st) => s + st.weeks, 0);
                return (
                  <button key={tpl.id} onClick={() => handleApplyTemplate(tpl)} disabled={applyingTemplate}
                    className="w-full text-left p-4 bg-[#181816] border border-white/7 rounded-xl hover:border-[#fbcb1a]/40 hover:bg-[#1a1c12] transition-all disabled:opacity-50 group">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-sans font-bold text-white text-sm group-hover:text-[#fbcb1a] transition-colors">{tpl.name}</p>
                        {tpl.description && <p className="font-mono text-[9px] text-[#c6c9ab] mt-0.5">{tpl.description}</p>}
                      </div>
                      <span className="font-mono text-[10px] text-[#fbcb1a] font-bold flex-shrink-0 bg-[#fbcb1a]/10 px-2 py-0.5 rounded">Usar →</span>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <span className="font-mono text-[10px] text-[#c6c9ab]">{tpl.stages.length} meso{tpl.stages.length !== 1 ? 's' : ''}</span>
                      <span className="font-mono text-[10px] text-[#00eefc]">{totalWeeks} sem en total</span>
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {tpl.stages.map((st) => (
                        <span key={st.id} className="font-mono text-[9px] bg-[#1e1e1b] border border-white/7 px-2 py-0.5 rounded text-[#c6c9ab]">
                          {st.name} · {st.weeks}sem
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
