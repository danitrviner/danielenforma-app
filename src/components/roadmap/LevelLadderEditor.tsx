import React, { useState } from 'react';
import { Roadmap, LevelLadder, LadderLevel, LevelCriterion, LevelCriterionKind } from '../../types';
import { computeLadderStatus, LadderData } from '../../utils/levelLadder';
import { DEFAULT_LEVEL_LADDER } from '../../data/defaultLevelLadder';
import { LADDER_PRESETS } from '../../data/ladderPresets';
import IconPicker from './IconPicker';

const CRITERION_KIND_LABEL: Record<LevelCriterionKind, string> = {
  peso_perdido_kg: 'Kg perdidos desde el inicio',
  sentadilla_xbw: 'Sentadilla x veces peso corporal',
  pasos_media_diaria: 'Media diaria de pasos (4 semanas)',
  manual: 'Verificado a mano (flexiones, dominadas...)',
};

function newLevel(order: number): LadderLevel {
  return { id: `lvl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, order, name: 'Nuevo nivel', icon: 'military_tech', criteria: [] };
}

function newCriterion(): LevelCriterion {
  return { id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'manual', label: '' };
}

interface Props {
  roadmap: Roadmap;
  onSave: (roadmap: Roadmap) => Promise<void>;
  ladderData: LadderData; // para previsualizar el nivel calculado del atleta
}

export default function LevelLadderEditor({ roadmap, onSave, ladderData }: Props) {
  const [ladder, setLadder] = useState<LevelLadder>(roadmap.levelLadder ?? DEFAULT_LEVEL_LADDER);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const sorted = [...ladder.levels].sort((a, b) => a.order - b.order);
  const status = computeLadderStatus(ladder, ladderData);

  function commit(next: LevelLadder) {
    setLadder(next);
    setDirty(true);
  }

  function updateLevel(id: string, patch: Partial<LadderLevel>) {
    commit({ ...ladder, levels: ladder.levels.map(l => (l.id === id ? { ...l, ...patch } : l)) });
  }

  function addLevel() {
    commit({ ...ladder, levels: [...ladder.levels, newLevel(ladder.levels.length)] });
  }

  function removeLevel(id: string) {
    commit({ ...ladder, levels: ladder.levels.filter(l => l.id !== id).map((l, idx) => ({ ...l, order: idx })) });
  }

  function addCriterion(levelId: string) {
    const level = ladder.levels.find(l => l.id === levelId);
    if (!level) return;
    updateLevel(levelId, { criteria: [...level.criteria, newCriterion()] });
  }

  function updateCriterion(levelId: string, critId: string, patch: Partial<LevelCriterion>) {
    const level = ladder.levels.find(l => l.id === levelId);
    if (!level) return;
    updateLevel(levelId, { criteria: level.criteria.map(c => (c.id === critId ? { ...c, ...patch } : c)) });
  }

  function removeCriterion(levelId: string, critId: string) {
    const level = ladder.levels.find(l => l.id === levelId);
    if (!level) return;
    updateLevel(levelId, { criteria: level.criteria.filter(c => c.id !== critId) });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ ...roadmap, levelLadder: ladder });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function loadPreset(presetId: string) {
    const preset = LADDER_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    if (ladder.levels.length > 0 && !window.confirm('Esto reemplaza los niveles y criterios actuales (se conservan los logros ya alcanzados). ¿Continuar?')) return;
    // Los logros persistidos se conservan aunque los ids de nivel no coincidan
    // con la nueva plantilla — simplemente no se pintarán como logrados si no
    // hay match; no se pierden datos.
    commit({ ...preset.ladder, achievedLevelIds: ladder.achievedLevelIds });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="text-[#c6c9ab] text-xs font-mono">Escalera de niveles motivadores. Un nivel se alcanza cumpliendo todos sus criterios.</p>
          <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">
            Nivel actual del atleta: <span className="text-[#fbcb1a] font-bold">{status.currentLevel?.name ?? 'ninguno todavía'}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <select
            value=""
            onChange={e => e.target.value && loadPreset(e.target.value)}
            className="bg-[#0e0e0e] border border-white/15 rounded-lg p-2 text-xs text-[#c6c9ab] focus:outline-none focus:border-[#fbcb1a]"
          >
            <option value="">Cargar plantilla…</option>
            {LADDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="py-2 px-4 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {sorted.map(level => {
        const achieved = ladder.achievedLevelIds?.[level.id];
        return (
          <div key={level.id} className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-start gap-2">
              <input
                value={level.name}
                onChange={e => updateLevel(level.id, { name: e.target.value })}
                placeholder="Nombre del nivel"
                className="flex-1 min-w-[140px] bg-[#0e0e0e] border border-white/7 rounded p-2 text-sm font-bold text-white focus:outline-none focus:border-[#fbcb1a]"
              />
              {achieved && (
                <span className="font-mono text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">logrado {achieved}</span>
              )}
            </div>
            <IconPicker value={level.icon} onChange={icon => updateLevel(level.id, { icon })} />

            <div className="space-y-1.5">
              {level.criteria.map(c => (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5 bg-[#0e0e0e] border border-white/7 rounded-lg p-2">
                  <select
                    value={c.kind}
                    onChange={e => updateCriterion(level.id, c.id, { kind: e.target.value as LevelCriterionKind })}
                    className="bg-[#1e1e1b] border border-white/7 rounded p-1.5 text-[10px] text-white focus:outline-none"
                  >
                    {(Object.keys(CRITERION_KIND_LABEL) as LevelCriterionKind[]).map(k => (
                      <option key={k} value={k}>{CRITERION_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                  <input
                    value={c.label}
                    onChange={e => updateCriterion(level.id, c.id, { label: e.target.value })}
                    placeholder="Etiqueta (ej. 10 dominadas)"
                    className="flex-1 min-w-[120px] bg-[#1e1e1b] border border-white/7 rounded p-1.5 text-[10px] text-white focus:outline-none"
                  />
                  {c.kind !== 'manual' && (
                    <input
                      type="number"
                      step="0.1"
                      value={c.targetValue ?? ''}
                      onChange={e => updateCriterion(level.id, c.id, { targetValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="Objetivo"
                      className="w-20 bg-[#1e1e1b] border border-white/7 rounded p-1.5 text-[10px] text-white focus:outline-none"
                    />
                  )}
                  {c.kind === 'sentadilla_xbw' && (
                    <input
                      value={c.exerciseNameMatch ?? 'sentadilla'}
                      onChange={e => updateCriterion(level.id, c.id, { exerciseNameMatch: e.target.value })}
                      placeholder="nombre del ejercicio"
                      className="w-28 bg-[#1e1e1b] border border-white/7 rounded p-1.5 text-[10px] text-white focus:outline-none"
                    />
                  )}
                  {c.kind === 'manual' && (
                    <label className="flex items-center gap-1 text-[10px] text-[#c6c9ab] font-mono">
                      <input type="checkbox" checked={c.manualDone ?? false} onChange={e => updateCriterion(level.id, c.id, { manualDone: e.target.checked })} />
                      Verificado
                    </label>
                  )}
                  <button onClick={() => removeCriterion(level.id, c.id)} className="text-[#c6c9ab] hover:text-red-400">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
              <button onClick={() => addCriterion(level.id)} className="font-mono text-[10px] text-[#00eefc] hover:underline">
                + Añadir criterio
              </button>
            </div>

            <button onClick={() => removeLevel(level.id)} className="font-mono text-[10px] text-[#c6c9ab] hover:text-red-400">
              Eliminar nivel
            </button>
          </div>
        );
      })}

      <button
        onClick={addLevel}
        className="w-full py-3 border border-dashed border-white/15 rounded-2xl text-[#c6c9ab] hover:text-[#fbcb1a] hover:border-[#fbcb1a]/40 font-mono text-xs transition-colors"
      >
        + Añadir nivel
      </button>
    </div>
  );
}
