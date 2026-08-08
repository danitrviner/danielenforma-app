import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Diet, NutritionPhase, NutritionProgram, OnboardingData } from '../types';
import {
  getNutritionProgram,
  saveNutritionProgram,
  deleteNutritionProgram,
  updateDiet,
  computeActivePhase,
  computePhaseStartDate,
} from '../dbService';
import { estimateMaintenanceKcal } from '../utils/energyCalc';
import { roundQuarter } from '../utils/exchangeHelpers';
import {
  resolvePhaseTargetKcal,
  suggestPhaseTargetKcal,
  computePhaseEnergyBalance,
} from '../utils/nutritionPeriodization';
import NutritionPerformanceDashboard from './NutritionPerformanceDashboard';
import { useToast } from '../hooks/useToast';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Skeleton } from './ui';
import { Icon, Button, EmptyState, Input } from './ui';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  athleteEmail: string;
  athleteName?: string;
  targetWeightKg?: number;
  diets: Diet[];
  onboarding: OnboardingData | null;
  currentWeightKg?: number;
  stepGoal: number;
  kcalPerStep: number;
  onDietsChanged?: () => void;
}

type NutritionPhaseForm = NutritionPhase;

interface FormState {
  startDate: string;
  phases: NutritionPhaseForm[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PHASE_COLORS = ['var(--color-accent)', 'var(--color-data)', 'var(--color-warning)', 'var(--color-chart-3)'];

function phaseTextColor(bgColor: string): string {
  // accent y data son claros, el resto son oscuros
  if (bgColor === 'var(--color-accent)') return '#000';
  if (bgColor === 'var(--color-data)') return '#000';
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


function fmtKcal(n: number | null): string {
  return n == null ? '—' : `${Math.round(n).toLocaleString('es-ES')} kcal`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-6 h-6 flex items-center justify-center rounded-control bg-raised text-white hover:bg-raised transition-colors font-bold text-body-s"
      >−</button>
      <span className="w-7 text-center font-mono text-body-s text-white">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-6 h-6 flex items-center justify-center rounded-control bg-raised text-white hover:bg-raised transition-colors font-bold text-body-s"
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
      <div className="flex flex-col gap-2 sm:hidden">
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
              className="flex items-center justify-between px-3 py-3 rounded-surface relative"
            >
              <div className="flex-1 min-w-0">
                <p className="text-label font-bold font-sans truncate">{phase.name}</p>
                {diet && <p className="text-caption font-sans opacity-75 truncate">{diet.name}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-caption font-mono opacity-75">{fmtDate(startDate)}–{fmtDate(endDate)}</span>
                <span className="text-caption font-mono font-bold">{phase.weeks}s</span>
                {isActive && (
                  <span className="text-caption font-mono font-bold px-2 rounded-control" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>HOY</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal proportional blocks */}
      <div className="hidden sm:block space-y-2">
        <div className="flex rounded-surface overflow-hidden" style={{ minHeight: '48px' }}>
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
                className="flex flex-col items-center justify-center px-1 py-2 transition-all relative"
              >
                {isActive && (
                  <span
                    className="absolute top-0.5 right-0.5 text-caption font-mono font-bold px-1 rounded-control"
                    style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: fg }}
                  >HOY</span>
                )}
                <span className="text-caption font-bold font-sans truncate w-full text-center leading-tight">
                  {phase.name}
                </span>
                <span className="text-caption font-mono opacity-75 truncate w-full text-center">
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
                <span className="text-caption font-mono text-ink-2 truncate">
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

export default function NutritionPeriodizationPanel({
  athleteEmail, athleteName, targetWeightKg, diets, onboarding, currentWeightKg, stepGoal, kcalPerStep, onDietsChanged,
}: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const programQueryKey = ['nutritionProgram', athleteEmail] as const;
  const { data: program = null, isPending: loading } = useQuery({
    queryKey: programQueryKey,
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [adjustingDietFor, setAdjustingDietFor] = useState<string | null>(null);
  // Bumped after any save/delete/diet-adjust so <NutritionPerformanceDashboard>
  // (below) remounts and refetches — it owns its own copy of program/diets and
  // has no other way to learn this panel just changed them.
  const [refreshKey, setRefreshKey] = useState(0);

  const today = new Date().toISOString().split('T')[0];
  const maintenanceKcal = onboarding ? estimateMaintenanceKcal(onboarding, currentWeightKg ?? onboarding.weightKg) : null;
  const stepsKcal = Math.round(stepGoal * kcalPerStep);

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
      queryClient.setQueryData(programQueryKey, null);
      setForm(null);
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('deleteNutritionProgram failed:', err);
      showToast(mensajeDeErrorFirestore(err, 'eliminar la periodización'));
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
      queryClient.setQueryData(programQueryKey, newProgram);
      setForm(null);
      // NutritionPerformanceDashboard fetches program/diets on its own mount-only
      // effect (see its `[athleteEmail]` dep) — it has no way to know this save
      // happened, so it'd keep showing stale data until an unrelated remount.
      // Bumping the key forces React to remount it and refetch fresh.
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('saveNutritionProgram failed:', err);
      showToast(mensajeDeErrorFirestore(err, 'guardar la periodización'));
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

  // Fills the phase's kcal objective from its target weight, using the athlete's
  // estimated maintenance + pautado steps to back out the deficit/surplus needed.
  const handleSuggestKcal = (idx: number) => {
    if (!form || maintenanceKcal == null || currentWeightKg == null) return;
    const phase = form.phases[idx];
    if (phase.targetWeight == null) return;
    const suggested = suggestPhaseTargetKcal({
      currentWeightKg,
      targetWeightKg: phase.targetWeight,
      weeks: phase.weeks,
      maintenanceKcal,
      stepsKcal,
    });
    updatePhase(idx, { targetKcal: suggested });
  };

  // Rewrites the linked diet's exchange budget so its kcal match the phase's
  // objective, scaling HC/PROT/GRASA proportionally — the athlete then sees the
  // adjusted diet automatically, without the coach rebuilding it meal by meal.
  const handleAdjustDietToPhase = async (idx: number) => {
    if (!form) return;
    const phase = form.phases[idx];
    const diet = diets.find(d => d.id === phase.dietId);
    if (!diet) return;
    const { kcal: targetKcal } = resolvePhaseTargetKcal(phase, diet);
    const currentKcal = resolvePhaseTargetKcal({ ...phase, targetKcal: undefined }, diet).kcal;
    if (targetKcal == null || currentKcal == null || currentKcal <= 0) return;
    const scale = targetKcal / currentKcal;
    setAdjustingDietFor(phase.id);
    try {
      const scaledBudget = {
        HC: roundQuarter((diet.budget?.HC ?? 0) * scale),
        PROT: roundQuarter((diet.budget?.PROT ?? 0) * scale),
        GRASA: roundQuarter((diet.budget?.GRASA ?? 0) * scale),
      };
      await updateDiet(diet.id, { budget: { ...diet.budget, ...scaledBudget } });
      onDietsChanged?.();
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('handleAdjustDietToPhase failed:', err);
      showToast(mensajeDeErrorFirestore(err, 'ajustar la dieta a la fase'));
    } finally {
      setAdjustingDietFor(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-5">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────

  // No standalone "view mode" here anymore — periodización and su rendimiento
  // son una sola cosa. NutritionPerformanceDashboard owns the entire read view
  // (hero de fase activa, gráfico, stats) and calls back into `handleEdit` for
  // its "Editar" button, so there's a single source of truth instead of a
  // read-only preview here duplicating what the dashboard already shows.
  if (form === null) {
    if (program === null) {
      return (
        <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
              <Icon name="timeline" size="s" className="text-chart-3" />
              Periodización nutricional
            </h3>
          </div>
          <div className="border border-dashed border-hairline rounded-surface">
            <EmptyState icon="timeline" title="Sin periodización nutricional." actionLabel="Crear periodización" onAction={handleCreate} />
          </div>
        </div>
      );
    }

    return (
      <NutritionPerformanceDashboard
        refreshToken={refreshKey}
        athleteEmail={athleteEmail}
        athleteName={athleteName}
        targetWeightKg={targetWeightKg}
        onEdit={handleEdit}
      />
    );
  }

  // ── Edit / create mode ─────────────────────────────────────────────────────

  const previewProgram: NutritionProgram = {
    athleteId: athleteEmail,
    startDate: form.startDate,
    phases: form.phases,
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
          <Icon name="timeline" size="s" className="text-chart-3" />
          Periodización nutricional
        </h3>
        <div className="flex items-center gap-2">
          {program !== null && (
            <Button variant="ghost" size="s" onClick={handleDelete} disabled={saving} className="text-red-400 hover:text-red-300">Eliminar</Button>
          )}
          <Button variant="ghost" size="s" onClick={handleCancel} disabled={saving}>Cancelar</Button>
          <Button size="s" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </div>
      </div>

      {/* Start date */}
      <div className="space-y-2">
        <Input
          label="Fecha de inicio"
          type="date"
          value={form.startDate}
          onChange={v => setForm(prev => prev ? { ...prev, startDate: v } : prev)}
        />
      </div>

      {/* Phases list */}
      <div className="space-y-3">
        {form.phases.length === 0 && (
          <p className="text-ink-2 text-label font-sans text-center py-4 border border-dashed border-hairline rounded-surface">
            Sin fases. Añade una para comenzar.
          </p>
        )}
        {form.phases.map((phase, idx) => {
          const phaseColor = PHASE_COLORS[idx % PHASE_COLORS.length];
          const linkedDiet = diets.find(d => d.id === phase.dietId);
          const resolved = resolvePhaseTargetKcal(phase, linkedDiet);
          const balance = computePhaseEnergyBalance({
            targetKcal: resolved.kcal, maintenanceKcal, stepGoal, kcalPerStep,
          });
          const canSuggest = phase.targetWeight != null && maintenanceKcal != null && currentWeightKg != null;
          const canAdjustDiet = !!linkedDiet && phase.targetKcal != null && ((linkedDiet.budget?.HC ?? 0) + (linkedDiet.budget?.PROT ?? 0) + (linkedDiet.budget?.GRASA ?? 0)) > 0;
          return (
            <div
              key={phase.id}
              className="bg-raised border border-hairline rounded-surface p-4 space-y-3"
              style={{ borderLeftColor: phaseColor, borderLeftWidth: '3px' }}
            >
              {/* Phase header */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col ">
                  <button
                    onClick={() => movePhase(idx, -1)}
                    disabled={idx === 0}
                    className="w-5 h-5 flex items-center justify-center text-ink-2 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <Icon name="arrow_upward" size="s" />
                  </button>
                  <button
                    onClick={() => movePhase(idx, 1)}
                    disabled={idx === form.phases.length - 1}
                    className="w-5 h-5 flex items-center justify-center text-ink-2 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <Icon name="arrow_downward" size="s" />
                  </button>
                </div>
                <input
                  type="text"
                  value={phase.name}
                  onChange={e => updatePhase(idx, { name: e.target.value })}
                  placeholder="Nombre de la fase"
                  className="flex-1 bg-raised border border-hairline text-white text-title-s font-sans rounded-control px-3 py-2 focus:outline-none focus:border-chart-3/50 transition-colors"
                />
                <button
                  onClick={() => removePhase(idx)}
                  className="text-ink-2 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Icon name="delete" size="s" />
                </button>
              </div>

              {/* Phase details */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-mono text-ink-2 uppercase tracking-wider">Semanas:</span>
                  <Stepper value={phase.weeks} min={1} max={24} onChange={v => updatePhase(idx, { weeks: v })} />
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-caption font-mono text-ink-2 uppercase tracking-wider flex-shrink-0">Dieta:</span>
                  <select
                    value={phase.dietId}
                    onChange={e => updatePhase(idx, { dietId: e.target.value })}
                    className="flex-1 min-w-0 bg-raised border border-hairline text-white text-title-s font-mono rounded-control px-2 py-2 focus:outline-none focus:border-chart-3/50 transition-colors"
                  >
                    <option value="">Sin dieta</option>
                    {diets.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-caption font-sans text-ink-2 uppercase tracking-wider flex-shrink-0">Peso objetivo:</span>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="300"
                  value={phase.targetWeight ?? ''}
                  onChange={e => updatePhase(idx, { targetWeight: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="—"
                  className="w-20 bg-raised border border-hairline text-white text-title-s font-mono rounded-control px-2 py-2 focus:outline-none focus:border-chart-3/50 transition-colors"
                />
                <span className="text-caption font-mono text-ink-2">kg</span>
              </div>

              {/* Energy objective */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption font-sans text-ink-2 uppercase tracking-wider flex-shrink-0">Objetivo energético:</span>
                <input
                  type="number"
                  step="25"
                  min="0"
                  value={phase.targetKcal ?? ''}
                  onChange={e => updatePhase(idx, { targetKcal: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder={resolved.source === 'diet' && resolved.kcal != null ? String(resolved.kcal) : '—'}
                  className="w-24 bg-raised border border-hairline text-white text-title-s font-mono rounded-control px-2 py-2 focus:outline-none focus:border-chart-3/50 transition-colors"
                />
                <span className="text-caption font-mono text-ink-2">
                  kcal {resolved.kcal != null && `(≈ ${Math.round(resolved.kcal / 100)} int.)`}
                  {phase.targetKcal == null && resolved.source === 'diet' && ' · desde la dieta'}
                </span>
                {canSuggest && (
                  <button
                    onClick={() => handleSuggestKcal(idx)}
                    title="Calcula el objetivo a partir del peso deseado"
                    className="text-caption font-mono font-bold text-chart-3 hover:text-white transition-colors uppercase tracking-wider px-2 py-1 rounded-control border border-chart-3/30 hover:border-chart-3/60"
                  >Sugerir</button>
                )}
                {canAdjustDiet && (
                  <button
                    onClick={() => handleAdjustDietToPhase(idx)}
                    disabled={adjustingDietFor === phase.id}
                    title="Escala los intercambios de la dieta vinculada a este objetivo"
                    className="text-caption font-mono font-bold text-accent hover:text-white transition-colors uppercase tracking-wider px-2 py-1 rounded-control border border-accent/30 hover:border-accent/60 disabled:opacity-40"
                  >{adjustingDietFor === phase.id ? 'Ajustando…' : 'Ajustar dieta al tramo'}</button>
                )}
              </div>

              {/* Resolved energy balance */}
              {resolved.kcal != null && maintenanceKcal != null && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption font-mono text-ink-2 bg-surface rounded-surface px-3 py-2">
                  <span>Mantenimiento: <b className="text-white">{fmtKcal(maintenanceKcal)}</b></span>
                  <span>+ Pasos: <b className="text-white">{fmtKcal(stepsKcal)}</b></span>
                  <span>Gasto total: <b className="text-white">{fmtKcal(balance.totalExpenditure)}</b></span>
                  {balance.dailyDeficit != null && (
                    <span>
                      {balance.dailyDeficit >= 0 ? 'Déficit' : 'Superávit'}: <b className={balance.dailyDeficit >= 0 ? 'text-warning' : 'text-data'}>{fmtKcal(Math.abs(balance.dailyDeficit))}/día</b>
                    </span>
                  )}
                  {balance.weeklyDeltaKg != null && (
                    <span>Δ esperado: <b className="text-white">{balance.weeklyDeltaKg >= 0 ? '+' : ''}{balance.weeklyDeltaKg} kg/sem</b></span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={addPhase}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-hairline hover:border-chart-3/40 text-ink-2 hover:text-white text-label font-sans rounded-control transition-all"
        >
          <Icon name="add" size="s" />
          Añadir fase
        </button>
      </div>

      {/* Timeline preview */}
      {form.phases.length > 0 && (
        <div className="space-y-2">
          <span className="block text-caption font-mono text-ink-2 uppercase tracking-wider">Vista previa</span>
          <ProgramTimeline program={previewProgram} diets={diets} today={today} />
        </div>
      )}
    </div>
  );
}
