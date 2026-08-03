import React, { useState } from 'react';
import { Roadmap, PlanPhase, PhaseMetricTarget, PhaseMetricKind, WeightDirection, NutritionProgram } from '../../types';
import { PhaseData, computePhaseProgress } from '../../utils/planPhase';
import { createNotificationDeduped, saveNutritionProgram } from '../../dbService';
import { buildPhasesFromPreset } from '../../data/phasePresets';
import { buildNutritionProgramDraft } from '../../utils/planNutritionBridge';
import IconPicker from './IconPicker';

const PHASE_COLORS = ['var(--color-accent)', 'var(--color-data)', 'var(--color-warning)', 'var(--color-chart-3)'];
const PHASE_ICONS = ['route', 'local_fire_department', 'balance', 'fitness_center', 'star', 'flag', 'bolt', 'favorite'];

const WEIGHT_DIRECTION_LABEL: Record<WeightDirection, string> = {
  deficit: 'Déficit (perder peso)',
  superavit: 'Superávit (ganar peso)',
  mantenimiento: 'Mantenimiento',
};

const METRIC_KIND_LABEL: Record<PhaseMetricKind, string> = {
  peso: 'Llegar a un peso (kg)',
  peso_perdido: 'Perder X kg desde el inicio',
  sentadilla_xbw: 'Sentadilla x veces peso corporal',
  pasos_media: 'Media diaria de pasos',
  adherencia: 'Adherencia a la dieta (%)',
  manual: 'Verificado a mano (sin dato automático)',
};

function newPhase(order: number): PlanPhase {
  return {
    id: `phase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    order,
    name: 'Nueva fase',
    color: PHASE_COLORS[order % PHASE_COLORS.length],
    icon: PHASE_ICONS[order % PHASE_ICONS.length],
    status: 'futura',
    metrics: [],
  };
}

function newMetric(): PhaseMetricTarget {
  return { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'peso', label: '' };
}

interface Props {
  roadmap: Roadmap;
  onSave: (roadmap: Roadmap) => Promise<void>;
  phaseData: PhaseData; // para previsualizar el progreso con datos reales del atleta
  nutritionProgram: NutritionProgram | null;
  currentWeightKg?: number;
  onProgramSaved: (program: NutritionProgram) => void;
}

export default function PlanPhaseEditor({ roadmap, onSave, phaseData, nutritionProgram, currentWeightKg, onProgramSaved }: Props) {
  const [phases, setPhases] = useState<PlanPhase[]>(roadmap.planPhases ?? []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [generatingNutrition, setGeneratingNutrition] = useState(false);

  const sorted = [...phases].sort((a, b) => a.order - b.order);

  function commit(next: PlanPhase[]) {
    setPhases(next);
    setDirty(true);
  }

  function updatePhase(id: string, patch: Partial<PlanPhase>) {
    commit(phases.map(p => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPhase() {
    commit([...phases, newPhase(phases.length)]);
  }

  function removePhase(id: string) {
    commit(phases.filter(p => p.id !== id).map((p, idx) => ({ ...p, order: idx })));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex(p => p.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    commit(phases.map(p => {
      if (p.id === a.id) return { ...p, order: b.order };
      if (p.id === b.id) return { ...p, order: a.order };
      return p;
    }));
  }

  function completeAndActivateNext(id: string) {
    const today = new Date().toISOString().split('T')[0];
    const idx = sorted.findIndex(p => p.id === id);
    const next = sorted[idx + 1];
    commit(phases.map(p => {
      if (p.id === id) return { ...p, status: 'completada', completedAt: today };
      if (next && p.id === next.id) return { ...p, status: 'actual', startedAt: today };
      return p;
    }));
  }

  function activate(id: string) {
    const today = new Date().toISOString().split('T')[0];
    updatePhase(id, { status: 'actual', startedAt: today });
  }

  function addMetric(phaseId: string) {
    updatePhase(phaseId, { metrics: [...(phases.find(p => p.id === phaseId)?.metrics ?? []), newMetric()] });
  }

  function updateMetric(phaseId: string, metricId: string, patch: Partial<PhaseMetricTarget>) {
    const phase = phases.find(p => p.id === phaseId);
    if (!phase) return;
    updatePhase(phaseId, { metrics: phase.metrics.map(m => (m.id === metricId ? { ...m, ...patch } : m)) });
  }

  function removeMetric(phaseId: string, metricId: string) {
    const phase = phases.find(p => p.id === phaseId);
    if (!phase) return;
    updatePhase(phaseId, { metrics: phase.metrics.filter(m => m.id !== metricId) });
  }

  async function save() {
    setSaving(true);
    try {
      const prevById = new Map((roadmap.planPhases ?? []).map(p => [p.id, p]));
      const freshlyCompleted = phases.filter(p => p.status === 'completada' && prevById.get(p.id)?.status !== 'completada');
      await onSave({ ...roadmap, planPhases: phases });
      setDirty(false);
      for (const phase of freshlyCompleted) {
        await createNotificationDeduped(`notif_pf_${roadmap.athleteId}_${phase.id}`, {
          recipientEmail: roadmap.athleteId,
          type: 'plan_phase_change',
          title: 'Fase completada 🎉',
          body: `Has completado la fase "${phase.name}". Tu coach ha activado la siguiente.`,
          link: 'roadmap',
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(err => console.warn('createNotificationDeduped (plan_phase_change) failed:', err));
      }
    } finally {
      setSaving(false);
    }
  }

  function useStandardPreset() {
    if (phases.length > 0 && !window.confirm('Esto reemplaza las fases actuales. ¿Continuar?')) return;
    commit(buildPhasesFromPreset(new Date().toISOString().split('T')[0]));
  }

  async function generateNutritionProgram(mode: 'full' | 'futuras') {
    if (currentWeightKg == null) {
      window.alert('No se ha podido determinar el peso actual del atleta.');
      return;
    }
    setGeneratingNutrition(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const activeStart = sorted.find(p => p.status === 'actual')?.startedAt ?? today;
      const { program, linkedPlanPhases } = buildNutritionProgramDraft({
        athleteId: roadmap.athleteId,
        planPhases: phases,
        currentWeightKg,
        startDate: activeStart,
        existing: nutritionProgram,
        mode,
        today,
      });
      await saveNutritionProgram(program);
      await onSave({ ...roadmap, planPhases: linkedPlanPhases });
      setPhases(linkedPlanPhases);
      setDirty(false);
      onProgramSaved(program);
      setShowNutritionModal(false);
    } finally {
      setGeneratingNutrition(false);
    }
  }

  function onGenerateClick() {
    if (dirty) {
      window.alert('Guarda las fases primero.');
      return;
    }
    if (nutritionProgram) {
      setShowNutritionModal(true);
    } else {
      generateNutritionProgram('full');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-ink-2 text-label font-mono flex-1 min-w-[200px]">
          Fases del plan por progresión, no por tiempo. El cliente ve la actual destacada y las siguientes como "lo que le queda por delante".
        </p>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={useStandardPreset}
            className="py-2 px-3 border border-hairline text-ink-2 font-sans font-bold text-label uppercase rounded-control hover:text-white hover:border-strong transition-all"
          >
            Usar plan estándar (6 fases)
          </button>
          <button
            onClick={onGenerateClick}
            disabled={generatingNutrition || phases.length === 0}
            className="py-2 px-3 border border-data/40 text-data font-sans font-bold text-label uppercase rounded-control hover:bg-data/10 transition-all disabled:opacity-40"
          >
            {generatingNutrition ? 'Generando...' : 'Generar periodización nutricional'}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="py-2 px-4 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {showNutritionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowNutritionModal(false)}>
          <div className="bg-surface border border-hairline rounded-surface p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-sans font-bold text-white text-body-s">Ya existe una periodización nutricional</p>
            <p className="text-label text-ink-2 font-mono leading-relaxed">
              ¿Regeneras todo el programa desde cero, o solo las fases futuras (conservando el histórico y la fase en curso)?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => generateNutritionProgram('futuras')}
                disabled={generatingNutrition}
                className="py-2 bg-data text-black font-sans font-bold text-label uppercase rounded-control hover:opacity-90 disabled:opacity-50"
              >
                Regenerar solo fases futuras
              </button>
              <button
                onClick={() => generateNutritionProgram('full')}
                disabled={generatingNutrition}
                className="py-2 border border-red-500/40 text-red-400 font-sans font-bold text-label uppercase rounded-control hover:bg-red-500/10 disabled:opacity-50"
              >
                Regenerar todo (sobrescribe)
              </button>
              <button
                onClick={() => setShowNutritionModal(false)}
                className="py-2 text-ink-2 font-mono text-label hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {sorted.map((phase, idx) => {
        const progress = computePhaseProgress(phase, phaseData);
        return (
          <div key={phase.id} className="bg-surface border border-hairline rounded-surface p-4 space-y-3" style={{ borderLeftColor: phase.color, borderLeftWidth: 3 }}>
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                <button onClick={() => move(phase.id, -1)} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center rounded-control bg-raised text-white text-label disabled:opacity-30">↑</button>
                <button onClick={() => move(phase.id, 1)} disabled={idx === sorted.length - 1} className="w-6 h-6 flex items-center justify-center rounded-control bg-raised text-white text-label disabled:opacity-30">↓</button>
              </div>

              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={phase.name}
                    onChange={e => updatePhase(phase.id, { name: e.target.value })}
                    placeholder="Nombre de la fase"
                    className="flex-1 min-w-[140px] bg-bg border border-hairline rounded-control p-2 text-body-s font-bold text-white focus:outline-none focus:border-accent"
                  />
                  <span
                    className={`font-mono text-caption uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0 ${
                      phase.status === 'actual' ? 'bg-accent/15 text-accent' : phase.status === 'completada' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-ink-2'
                    }`}
                  >
                    {phase.status}
                  </span>
                  {phase.nutritionPhaseId && (
                    <span className="font-mono text-caption uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0 bg-data/15 text-data">
                      → enlazada a nutrición
                    </span>
                  )}
                </div>

                <input
                  value={phase.motto ?? ''}
                  onChange={e => updatePhase(phase.id, { motto: e.target.value })}
                  placeholder="Frase motivadora (opcional)"
                  className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent"
                />

                <textarea
                  value={phase.description ?? ''}
                  onChange={e => updatePhase(phase.id, { description: e.target.value })}
                  placeholder="Descripción de la fase"
                  rows={2}
                  className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent resize-none"
                />

                <div className="flex flex-wrap gap-2 items-start">
                  <div className="flex gap-2">
                    {PHASE_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => updatePhase(phase.id, { color: c })}
                        className="w-6 h-6 rounded-full border-2"
                        style={{ backgroundColor: c, borderColor: phase.color === c ? '#fff' : 'transparent' }}
                      />
                    ))}
                  </div>
                  <IconPicker value={phase.icon} onChange={icon => updatePhase(phase.id, { icon })} accent={phase.color} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="font-mono text-caption uppercase text-ink-2">Semanas sugeridas</span>
                    <input
                      type="number"
                      min={1}
                      value={phase.suggestedWeeks ?? ''}
                      onChange={e => updatePhase(phase.id, { suggestedWeeks: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className="w-24 bg-bg border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="font-mono text-caption uppercase text-ink-2">Dirección de peso</span>
                    <select
                      value={phase.weightDirection ?? 'mantenimiento'}
                      onChange={e => updatePhase(phase.id, { weightDirection: e.target.value as WeightDirection })}
                      className="bg-bg border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none focus:border-accent"
                    >
                      {(Object.keys(WEIGHT_DIRECTION_LABEL) as WeightDirection[]).map(d => (
                        <option key={d} value={d}>{WEIGHT_DIRECTION_LABEL[d]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="font-mono text-caption uppercase text-ink-2">Kg por semana</span>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      value={phase.weightRateKgWeek ?? ''}
                      onChange={e => updatePhase(phase.id, { weightRateKgWeek: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className="w-24 bg-bg border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none focus:border-accent"
                    />
                  </label>
                </div>

                {/* Métricas objetivo */}
                <div className="space-y-1.5 pt-1">
                  {phase.metrics.map(m => (
                    <div key={m.id} className="flex flex-wrap items-center gap-1.5 bg-bg border border-hairline rounded-surface p-2">
                      <select
                        value={m.kind}
                        onChange={e => updateMetric(phase.id, m.id, { kind: e.target.value as PhaseMetricKind })}
                        className="bg-raised border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none"
                      >
                        {(Object.keys(METRIC_KIND_LABEL) as PhaseMetricKind[]).map(k => (
                          <option key={k} value={k}>{METRIC_KIND_LABEL[k]}</option>
                        ))}
                      </select>
                      <input
                        value={m.label}
                        onChange={e => updateMetric(phase.id, m.id, { label: e.target.value })}
                        placeholder="Etiqueta (ej. Bajar a 82 kg)"
                        className="flex-1 min-w-[120px] bg-raised border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none"
                      />
                      {m.kind !== 'manual' && (
                        <input
                          type="number"
                          value={m.targetValue ?? ''}
                          onChange={e => updateMetric(phase.id, m.id, { targetValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                          placeholder="Objetivo"
                          className="w-20 bg-raised border border-hairline rounded-control p-1.5 text-caption text-white focus:outline-none"
                        />
                      )}
                      {m.kind === 'manual' && (
                        <label className="flex items-center gap-1 text-caption text-ink-2 font-mono">
                          <input type="checkbox" checked={m.manualDone ?? false} onChange={e => updateMetric(phase.id, m.id, { manualDone: e.target.checked })} />
                          Verificado
                        </label>
                      )}
                      <button onClick={() => removeMetric(phase.id, m.id)} className="text-ink-2 hover:text-red-400">
                        <span className="material-symbols-outlined text-body-s">close</span>
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addMetric(phase.id)} className="font-mono text-caption text-data hover:underline">
                    + Añadir métrica objetivo
                  </button>
                </div>

                {phase.metrics.length > 0 && (
                  <p className="font-mono text-caption text-ink-2">Progreso actual estimado: <span className="text-white font-bold">{progress.overallPct}%</span></p>
                )}

                <textarea
                  value={phase.exitCriteria ?? ''}
                  onChange={e => updatePhase(phase.id, { exitCriteria: e.target.value })}
                  placeholder="Criterios para pasar a la siguiente fase"
                  rows={2}
                  className="w-full bg-bg border border-hairline rounded-control p-2 text-label text-white focus:outline-none focus:border-accent resize-none"
                />

                <div className="flex items-center gap-2 pt-1">
                  {phase.status === 'futura' && (
                    <button onClick={() => activate(phase.id)} className="font-mono text-caption text-accent hover:underline">
                      Activar esta fase ahora
                    </button>
                  )}
                  {phase.status === 'actual' && idx < sorted.length - 1 && (
                    <button onClick={() => completeAndActivateNext(phase.id)} className="font-mono text-caption text-emerald-400 hover:underline">
                      Completar fase → activar siguiente
                    </button>
                  )}
                  <button onClick={() => removePhase(phase.id)} className="font-mono text-caption text-ink-2 hover:text-red-400 ml-auto">
                    Eliminar fase
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={addPhase}
        className="w-full py-3 border border-dashed border-hairline rounded-control text-ink-2 hover:text-accent hover:border-accent/40 font-mono text-label transition-colors"
      >
        + Añadir fase
      </button>
    </div>
  );
}
