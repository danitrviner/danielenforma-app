import React, { useState, useEffect } from 'react';
import { Diet, NutritionPhase, NutritionProgram } from '../types';
import {
  getNutritionProgram,
  saveNutritionProgram,
  deleteNutritionProgram,
  computeActivePhase,
  computePhaseStartDate,
} from '../dbService';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  athleteEmail: string;
  diets: Diet[];
}

type NutritionPhaseForm = NutritionPhase;

interface FormState {
  startDate: string;
  phases: NutritionPhaseForm[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PHASE_COLORS = ['#fbcb1a', '#00eefc', '#ff8c69', '#a78bfa'];

function phaseTextColor(bgColor: string): string {
  // #fbcb1a and #00eefc are light, others are darker
  if (bgColor === '#fbcb1a') return '#000';
  if (bgColor === '#00eefc') return '#000';
  return '#fff';
}

function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] transition-colors font-bold text-sm"
      >−</button>
      <span className="w-7 text-center font-mono text-sm text-white">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] transition-colors font-bold text-sm"
      >+</button>
    </div>
  );
}

interface TimelineProps {
  program: NutritionProgram;
  diets: Diet[];
  today: string;
}

function ProgramTimeline({ program, diets, today }: TimelineProps) {
  const totalWeeks = program.phases.reduce((s, p) => s + p.weeks, 0);
  if (totalWeeks === 0) return null;

  const activePhase = computeActivePhase(program, today);

  return (
    <div className="space-y-2">
      {/* Mobile: vertical stack */}
      <div className="flex flex-col gap-1.5 sm:hidden">
        {[...program.phases].sort((a, b) => {
          if (activePhase?.id === a.id) return -1;
          if (activePhase?.id === b.id) return 1;
          return 0;
        }).map((phase, idx) => {
          const origIdx = program.phases.indexOf(phase);
          const bg = PHASE_COLORS[origIdx % PHASE_COLORS.length];
          const fg = phaseTextColor(bg);
          const isActive = activePhase?.id === phase.id;
          const diet = diets.find(d => d.id === phase.dietId);
          const startDate = computePhaseStartDate(program, origIdx);
          const endDate = addWeeks(startDate, phase.weeks);
          return (
            <div
              key={phase.id}
              style={{ backgroundColor: bg, color: fg, outline: isActive ? '2px solid white' : 'none', outlineOffset: '-2px' }}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg relative"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold font-sans truncate">{phase.name}</p>
                {diet && <p className="text-[9px] font-mono opacity-75 truncate">{diet.name}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] font-mono opacity-75">{fmtDate(startDate)}–{fmtDate(endDate)}</span>
                <span className="text-[9px] font-mono font-bold">{phase.weeks}s</span>
                {isActive && (
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>HOY</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal proportional blocks */}
      <div className="hidden sm:block space-y-2">
        <div className="flex rounded-lg overflow-hidden" style={{ minHeight: '48px' }}>
          {program.phases.map((phase, idx) => {
            const widthPct = (phase.weeks / totalWeeks) * 100;
            const bg = PHASE_COLORS[idx % PHASE_COLORS.length];
            const fg = phaseTextColor(bg);
            const isActive = activePhase?.id === phase.id;
            const diet = diets.find(d => d.id === phase.dietId);
            return (
              <div
                key={phase.id}
                title={`${phase.name}${diet ? ` — ${diet.name}` : ''}`}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: bg,
                  color: fg,
                  outline: isActive ? `2px solid white` : 'none',
                  outlineOffset: '-2px',
                }}
                className="flex flex-col items-center justify-center px-1 py-1.5 transition-all relative"
              >
                {isActive && (
                  <span
                    className="absolute top-0.5 right-0.5 text-[8px] font-mono font-bold px-1 rounded"
                    style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: fg }}
                  >HOY</span>
                )}
                <span className="text-[10px] font-bold font-sans truncate w-full text-center leading-tight">
                  {phase.name}
                </span>
                <span className="text-[9px] font-mono opacity-75 truncate w-full text-center">
                  {phase.weeks}s
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex">
          {program.phases.map((phase, idx) => {
            const widthPct = (phase.weeks / totalWeeks) * 100;
            const startDate = computePhaseStartDate(program, idx);
            const endDate = addWeeks(startDate, phase.weeks);
            return (
              <div key={phase.id} style={{ width: `${widthPct}%` }} className="flex flex-col items-center">
                <span className="text-[8px] font-mono text-[#c6c9ab] truncate">
                  {fmtDate(startDate)}–{fmtDate(endDate)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NutritionPeriodizationPanel({ athleteEmail, diets }: Props) {
  const [program, setProgram] = useState<NutritionProgram | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNutritionProgram(athleteEmail)
      .then(prog => { if (!cancelled) { setProgram(prog); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [athleteEmail]);

  const handleCreate = () => {
    setForm({ startDate: today, phases: [] });
  };

  const handleEdit = () => {
    if (!program) return;
    setForm({ startDate: program.startDate, phases: program.phases.map(p => ({ ...p })) });
  };

  const handleCancel = () => setForm(null);

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar la periodización? Esta acción no se puede deshacer.')) return;
    setSaving(true);
    try {
      await deleteNutritionProgram(athleteEmail);
      setProgram(null);
      setForm(null);
    } catch (err) {
      console.error('deleteNutritionProgram failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const newProgram: NutritionProgram = {
        athleteId: athleteEmail,
        startDate: form.startDate,
        phases: form.phases,
        lastSeenPhaseId: program?.lastSeenPhaseId,
      };
      await saveNutritionProgram(newProgram);
      setProgram(newProgram);
      setForm(null);
    } catch (err) {
      console.error('saveNutritionProgram failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const addPhase = () => {
    if (!form) return;
    const n = form.phases.length + 1;
    const newPhase: NutritionPhaseForm = {
      id: `phase_${Date.now()}`,
      name: `Fase ${n}`,
      weeks: 4,
      dietId: diets[0]?.id ?? '',
    };
    setForm(prev => prev ? { ...prev, phases: [...prev.phases, newPhase] } : prev);
  };

  const removePhase = (idx: number) => {
    if (!form) return;
    setForm(prev => prev ? { ...prev, phases: prev.phases.filter((_, i) => i !== idx) } : prev);
  };

  const movePhase = (idx: number, dir: -1 | 1) => {
    if (!form) return;
    const phases = [...form.phases];
    const target = idx + dir;
    if (target < 0 || target >= phases.length) return;
    [phases[idx], phases[target]] = [phases[target], phases[idx]];
    setForm(prev => prev ? { ...prev, phases } : prev);
  };

  const updatePhase = (idx: number, updates: Partial<NutritionPhaseForm>) => {
    if (!form) return;
    setForm(prev => {
      if (!prev) return prev;
      const phases = prev.phases.map((p, i) => i === idx ? { ...p, ...updates } : p);
      return { ...prev, phases };
    });
  };

  if (loading) {
    return (
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
        <p className="text-[#c6c9ab] text-xs font-mono animate-pulse">Cargando periodización...</p>
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────

  if (form === null) {
    const activePhase = program ? computeActivePhase(program, today) : null;
    const totalWeeks = program?.phases.reduce((s, p) => s + p.weeks, 0) ?? 0;

    return (
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#a78bfa] text-sm">timeline</span>
            Periodización nutricional
          </h3>
          {program ? (
            <button
              onClick={handleEdit}
              className="text-[10px] font-mono font-bold text-[#fbcb1a] hover:text-white transition-colors uppercase tracking-wider"
            >Editar</button>
          ) : null}
        </div>

        {program === null ? (
          <div className="border border-dashed border-white/7 rounded-xl py-8 flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-[#2a2a2a]">timeline</span>
            <p className="text-[#c6c9ab] text-xs font-mono text-center">Sin periodización nutricional.</p>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1c1b1b] border border-[#3a3a3a] hover:border-[#fbcb1a]/40 text-white text-xs font-mono font-bold rounded-xl transition-all"
            >
              <span className="material-symbols-outlined text-sm text-[#fbcb1a]">add</span>
              Crear periodización
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <div className="bg-[#1c1b1b] rounded-lg px-3 py-1.5">
                <span className="block text-[9px] font-mono text-[#c6c9ab] uppercase tracking-widest">Inicio</span>
                <span className="text-xs font-mono text-white">{fmtDate(program.startDate)}/{program.startDate.split('-')[0]}</span>
              </div>
              <div className="bg-[#1c1b1b] rounded-lg px-3 py-1.5">
                <span className="block text-[9px] font-mono text-[#c6c9ab] uppercase tracking-widest">Fases</span>
                <span className="text-xs font-mono text-white">{program.phases.length}</span>
              </div>
              <div className="bg-[#1c1b1b] rounded-lg px-3 py-1.5">
                <span className="block text-[9px] font-mono text-[#c6c9ab] uppercase tracking-widest">Semanas</span>
                <span className="text-xs font-mono text-white">{totalWeeks}</span>
              </div>
              {activePhase && (
                <div className="bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded-lg px-3 py-1.5">
                  <span className="block text-[9px] font-mono text-[#a78bfa] uppercase tracking-widest">Fase actual</span>
                  <span className="text-xs font-mono text-white">{activePhase.name}</span>
                </div>
              )}
            </div>
            {program.phases.length > 0 && (
              <ProgramTimeline program={program} diets={diets} today={today} />
            )}
          </>
        )}
      </div>
    );
  }

  // ── Edit / create mode ─────────────────────────────────────────────────────

  const previewProgram: NutritionProgram = {
    athleteId: athleteEmail,
    startDate: form.startDate,
    phases: form.phases,
  };

  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#a78bfa] text-sm">timeline</span>
          Periodización nutricional
        </h3>
        <div className="flex items-center gap-2">
          {program !== null && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-[10px] font-mono font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider disabled:opacity-50"
            >Eliminar</button>
          )}
          <button
            onClick={handleCancel}
            disabled={saving}
            className="text-[10px] font-mono font-bold text-[#c6c9ab] hover:text-white transition-colors uppercase tracking-wider disabled:opacity-50"
          >Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#fbcb1a] text-black text-[10px] font-sans font-bold rounded-lg hover:bg-[#cde600] transition-colors disabled:opacity-50 uppercase tracking-wider"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Start date */}
      <div className="space-y-1.5">
        <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">
          Fecha de inicio
        </label>
        <input
          type="date"
          value={form.startDate}
          onChange={e => setForm(prev => prev ? { ...prev, startDate: e.target.value } : prev)}
          className="bg-[#1c1b1b] border border-white/7 text-white text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-[#a78bfa]/50 hover:border-[#3a3a3a] transition-colors"
        />
      </div>

      {/* Phases list */}
      <div className="space-y-3">
        {form.phases.length === 0 && (
          <p className="text-[#c6c9ab] text-xs font-mono text-center py-4 border border-dashed border-white/7 rounded-xl">
            Sin fases. Añade una para comenzar.
          </p>
        )}
        {form.phases.map((phase, idx) => {
          const phaseColor = PHASE_COLORS[idx % PHASE_COLORS.length];
          return (
            <div
              key={phase.id}
              className="bg-[#1c1b1b] border border-white/7 rounded-xl p-4 space-y-3"
              style={{ borderLeftColor: phaseColor, borderLeftWidth: '3px' }}
            >
              {/* Phase header */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => movePhase(idx, -1)}
                    disabled={idx === 0}
                    className="w-5 h-5 flex items-center justify-center text-[#c6c9ab] hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_upward</span>
                  </button>
                  <button
                    onClick={() => movePhase(idx, 1)}
                    disabled={idx === form.phases.length - 1}
                    className="w-5 h-5 flex items-center justify-center text-[#c6c9ab] hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={phase.name}
                  onChange={e => updatePhase(idx, { name: e.target.value })}
                  placeholder="Nombre de la fase"
                  className="flex-1 bg-[#252525] border border-[#3a3a3a] text-white text-sm font-sans rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#a78bfa]/50 transition-colors"
                />
                <button
                  onClick={() => removePhase(idx)}
                  className="text-[#c6c9ab] hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>

              {/* Phase details */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#c6c9ab] uppercase tracking-wider">Semanas:</span>
                  <Stepper value={phase.weeks} min={1} max={24} onChange={v => updatePhase(idx, { weeks: v })} />
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] font-mono text-[#c6c9ab] uppercase tracking-wider flex-shrink-0">Dieta:</span>
                  <select
                    value={phase.dietId}
                    onChange={e => updatePhase(idx, { dietId: e.target.value })}
                    className="flex-1 min-w-0 bg-[#252525] border border-[#3a3a3a] text-white text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#a78bfa]/50 transition-colors"
                  >
                    <option value="">Sin dieta</option>
                    {diets.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#c6c9ab] uppercase tracking-wider flex-shrink-0">Peso objetivo:</span>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="300"
                  value={phase.targetWeight ?? ''}
                  onChange={e => updatePhase(idx, { targetWeight: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="—"
                  className="w-20 bg-[#252525] border border-[#3a3a3a] text-white text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#a78bfa]/50 transition-colors"
                />
                <span className="text-[10px] font-mono text-[#c6c9ab]">kg</span>
              </div>
            </div>
          );
        })}

        <button
          onClick={addPhase}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-[#3a3a3a] hover:border-[#a78bfa]/40 text-[#c6c9ab] hover:text-white text-xs font-mono rounded-xl transition-all"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Añadir fase
        </button>
      </div>

      {/* Timeline preview */}
      {form.phases.length > 0 && (
        <div className="space-y-2">
          <span className="block text-[10px] font-mono text-[#c6c9ab] uppercase tracking-wider">Vista previa</span>
          <ProgramTimeline program={previewProgram} diets={diets} today={today} />
        </div>
      )}
    </div>
  );
}
