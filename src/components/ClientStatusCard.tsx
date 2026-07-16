import React, { useEffect, useMemo, useState } from 'react';
import {
  UserProfile, OnboardingData, Mesocycle, WeightCheckIn, CoachReport,
  WorkoutLog, BodyweightLog, PlanPhase, NutritionPhase, GoalBody,
} from '../types';
import {
  getRoadmap, getNutritionProgram, computeActivePhase,
  getAthleteStatusNote, saveAthleteStatusNote,
} from '../dbService';

// Panel de estado del cliente — lo primero que ve el coach al abrir su ficha:
// en qué fase está, qué objetivo persigue, qué ha cambiado últimamente y una
// nota libre del coach ("qué está haciendo ahora"). Los datos derivados salen
// de props que ClientHub ya tiene cargadas; fase de roadmap/nutrición y la nota
// se cargan aquí para no engordar más el fetch inicial del Hub.

interface Props {
  athlete: UserProfile;
  onboardingData: OnboardingData | null;
  mesocycles: Mesocycle[];
  checkins: WeightCheckIn[];
  coachReports: CoachReport[];
  athleteLogs: WorkoutLog[];
  bodyweightLogs: BodyweightLog[];
}

const GOAL_LABEL: Record<GoalBody, string> = {
  aumentar_musculo: 'Aumentar músculo',
  reducir_grasa: 'Reducir grasa',
  mantener: 'Mantener',
};

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

interface ChangeEvent { date: string; icon: string; text: string }

export default function ClientStatusCard({
  athlete, onboardingData, mesocycles, checkins, coachReports, athleteLogs, bodyweightLogs,
}: Props) {
  const [planPhase, setPlanPhase] = useState<PlanPhase | null>(null);
  const [nutriPhase, setNutriPhase] = useState<NutritionPhase | null>(null);
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    getRoadmap(athlete.email)
      .then(r => setPlanPhase(r.planPhases?.find(p => p.status === 'actual') ?? null))
      .catch(() => {});
    getNutritionProgram(athlete.email)
      .then(p => setNutriPhase(p ? computeActivePhase(p, new Date().toISOString().slice(0, 10)) : null))
      .catch(() => {});
    getAthleteStatusNote(athlete.email).then(setNote).catch(() => {});
  }, [athlete.email]);

  // Mesociclo en curso + semana actual dentro de él.
  const activeMeso = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const started = mesocycles.filter(m => m.startDate <= today);
    const current = started.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
    if (!current) return null;
    const week = Math.floor((Date.now() - new Date(current.startDate).getTime()) / (7 * 86_400_000)) + 1;
    return { meso: current, week: Math.min(Math.max(week, 1), current.weeks), inRange: week <= current.weeks };
  }, [mesocycles]);

  // Últimos cambios: eventos recientes derivados de datos ya cargados.
  const recentChanges = useMemo(() => {
    const events: ChangeEvent[] = [];
    const lastCheckin = [...checkins].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (lastCheckin) events.push({ date: new Date(lastCheckin.timestamp).toISOString(), icon: 'monitor_weight', text: `Check-in (${lastCheckin.weight} kg)` });
    const lastLog = [...athleteLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastLog) events.push({ date: lastLog.completedAt || lastLog.date, icon: 'fitness_center', text: 'Entrenamiento registrado' });
    const lastSent = coachReports.filter(r => r.status === 'sent' && r.sentAt).sort((a, b) => (b.sentAt!).localeCompare(a.sentAt!))[0];
    if (lastSent) events.push({ date: lastSent.sentAt!, icon: 'analytics', text: 'Reporte enviado' });
    const lastBw = [...bodyweightLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastBw) events.push({ date: lastBw.date, icon: 'scale', text: `Peso registrado (${lastBw.weight} kg)` });
    if (activeMeso) events.push({ date: activeMeso.meso.startDate, icon: 'calendar_month', text: `Empezó mesociclo #${activeMeso.meso.number}` });
    return events
      .filter(e => !isNaN(new Date(e.date).getTime()))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4);
  }, [checkins, athleteLogs, coachReports, bodyweightLogs, activeMeso]);

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await saveAthleteStatusNote(athlete.email, noteDraft.trim());
      setNote(noteDraft.trim());
      setEditingNote(false);
    } finally {
      setSavingNote(false);
    }
  };

  const latestWeight = bodyweightLogs.length > 0
    ? [...bodyweightLogs].sort((a, b) => b.date.localeCompare(a.date))[0].weight
    : athlete.actualWeight || null;

  return (
    <div className="bg-gradient-to-br from-[#16150f] to-[#121212] border border-[#fbcb1a]/20 rounded-2xl p-5 space-y-4">
      {/* Nota del coach — editable, lo más visible del panel */}
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[#fbcb1a] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>sticky_note_2</span>
        {editingNote ? (
          <div className="flex-1 space-y-2">
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder="¿Qué está haciendo ahora este cliente? (ej. semana 2 de definición, volviendo de lesión de hombro…)"
              className="w-full resize-none bg-[#181818] border border-white/10 focus:border-[#fbcb1a]/50 rounded-xl px-3 py-2 text-sm text-[#e5e2e1] placeholder-[#c6c9ab]/50 outline-none"
            />
            <div className="flex gap-2">
              <button onClick={saveNote} disabled={savingNote}
                className="px-3 py-1.5 rounded-lg bg-[#fbcb1a] text-black text-[10px] font-bold uppercase tracking-wide disabled:opacity-40">
                {savingNote ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={() => setEditingNote(false)} disabled={savingNote}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#c6c9ab] text-[10px] font-bold uppercase tracking-wide">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setNoteDraft(note); setEditingNote(true); }} className="flex-1 text-left group">
            {note ? (
              <p className="text-sm text-white leading-relaxed">{note}</p>
            ) : (
              <p className="text-sm text-[#c6c9ab]/60 italic">Añade una nota: qué está haciendo ahora este cliente…</p>
            )}
            <span className="text-[9px] font-mono uppercase text-[#c6c9ab]/50 group-hover:text-[#fbcb1a] transition-colors">Editar</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 border-t border-white/7">
        {/* Fase */}
        <div className="space-y-1.5 pt-3">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-[#fbcb1a]">flag</span> Fase
          </p>
          {planPhase ? (
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base" style={{ color: planPhase.color }}>{planPhase.icon}</span>
              {planPhase.name}
            </p>
          ) : (
            <p className="text-xs text-[#c6c9ab]/60 italic">Sin fase de plan definida</p>
          )}
          {activeMeso && (
            <p className="font-mono text-[10px] text-[#c6c9ab]">
              Meso #{activeMeso.meso.number} · {activeMeso.meso.objective} · sem {activeMeso.week}/{activeMeso.meso.weeks}
              {!activeMeso.inRange && <span className="text-amber-300"> (terminado)</span>}
            </p>
          )}
          {nutriPhase && (
            <p className="font-mono text-[10px] text-[#00eefc]">
              Nutrición: {nutriPhase.name}{nutriPhase.targetKcal ? ` · ${nutriPhase.targetKcal} kcal` : ''}
            </p>
          )}
        </div>

        {/* Objetivo */}
        <div className="space-y-1.5 pt-3">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-[#fbcb1a]">target</span> Objetivo
          </p>
          {onboardingData?.goalBody ? (
            <p className="text-sm font-bold text-white">{GOAL_LABEL[onboardingData.goalBody]}</p>
          ) : (
            <p className="text-xs text-[#c6c9ab]/60 italic">Sin objetivo registrado</p>
          )}
          {onboardingData?.goalFreeText && (
            <p className="text-[11px] text-[#c6c9ab] leading-snug">"{onboardingData.goalFreeText}"</p>
          )}
          {latestWeight != null && athlete.targetWeight ? (
            <p className="font-mono text-[10px] text-[#c6c9ab]">
              {latestWeight} kg → <span className="text-[#fbcb1a] font-bold">{athlete.targetWeight} kg</span>
              {' '}({Math.round(Math.abs(latestWeight - athlete.targetWeight) * 10) / 10} kg restantes)
            </p>
          ) : null}
        </div>

        {/* Últimos cambios */}
        <div className="space-y-1.5 pt-3">
          <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-[#fbcb1a]">history</span> Últimos cambios
          </p>
          {recentChanges.length === 0 ? (
            <p className="text-xs text-[#c6c9ab]/60 italic">Sin actividad registrada aún</p>
          ) : (
            <ul className="space-y-1">
              {recentChanges.map((e, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] text-[#e5e2e1]">
                  <span className="material-symbols-outlined text-xs text-[#c6c9ab]">{e.icon}</span>
                  <span className="flex-1 truncate">{e.text}</span>
                  <span className="font-mono text-[9px] text-[#c6c9ab]/70 flex-shrink-0">{daysAgo(e.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
