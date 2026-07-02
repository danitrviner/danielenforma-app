import React, { useEffect, useState } from 'react';
import { getAthleteNutritionConfig, getStepsForAthlete, addSteps, updateSteps } from '../dbService';
import { todayStr } from '../utils/questionnaireSchedule';

interface Props {
  athleteEmail: string;
}

const DEFAULT_STEP_GOAL = 8000;

export default function StepsWidget({ athleteEmail }: Props) {
  const [goal, setGoal] = useState(DEFAULT_STEP_GOAL);
  const [todayId, setTodayId] = useState<string | null>(null);
  const [steps, setSteps] = useState(0);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAthleteNutritionConfig(athleteEmail),
      getStepsForAthlete(athleteEmail),
    ]).then(([cfg, logs]) => {
      if (cfg.stepGoal) setGoal(cfg.stepGoal);
      const today = logs.find(l => l.date === todayStr());
      if (today) { setTodayId(today.id); setSteps(today.steps); }
      else setEditing(true);
    }).catch(console.error).finally(() => setLoading(false));
  }, [athleteEmail]);

  const handleSave = async () => {
    const val = parseInt(input, 10);
    if (!input || isNaN(val) || val < 0 || val > 100000) return;
    setSaving(true);
    try {
      if (todayId) {
        await updateSteps(todayId, { steps: val });
        setSteps(val);
      } else {
        const entry = await addSteps({
          athleteId: athleteEmail, date: todayStr(), steps: val,
          source: 'manual', createdAt: new Date().toISOString(),
        });
        setTodayId(entry.id);
        setSteps(val);
      }
      setInput('');
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const remaining = Math.max(0, goal - steps);
  const pct = Math.min(100, (steps / goal) * 100);

  if (loading) {
    return (
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4">
        <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando pasos...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans font-bold text-sm text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#e2ff00] text-base">directions_walk</span>
          Pasos de hoy
        </h2>
        {!editing && (
          <button
            onClick={() => { setInput(String(steps)); setEditing(true); }}
            className="text-[#c6c9ab] hover:text-white transition-colors"
            title="Editar"
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100000}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="0"
            autoFocus
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#e2ff00]"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#e2ff00] flex items-center justify-center text-black transition-all hover:bg-[#bad200] active:scale-95 disabled:opacity-50"
          >
            {saving
              ? <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
              : <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
            }
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2 font-mono text-center">
            <div>
              <span className="block text-[9px] text-[#c6c9ab] uppercase">Realizados</span>
              <span className="block text-sm font-bold text-white">{steps.toLocaleString('es-ES')}</span>
            </div>
            <div>
              <span className="block text-[9px] text-[#c6c9ab] uppercase">Objetivo</span>
              <span className="block text-sm font-bold text-[#00eefc]">{goal.toLocaleString('es-ES')}</span>
            </div>
            <div>
              <span className="block text-[9px] text-[#c6c9ab] uppercase">Restantes</span>
              <span className="block text-sm font-bold text-[#e2ff00]">{remaining.toLocaleString('es-ES')}</span>
            </div>
          </div>
          <div className="h-1.5 bg-[#1c1b1b] rounded-full overflow-hidden">
            <div className="h-full bg-[#e2ff00] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
