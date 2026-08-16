import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, OnboardingData, Mesocycle, WeightCheckIn, CoachReport,
  WorkoutLog, BodyweightLog, GoalBody,
} from '../types';
import {
  getRoadmap, getNutritionProgram, computeActivePhase,
  getAthleteStatusNote, saveAthleteStatusNote,
} from '../dbService';
import { ScoreStyle } from '../utils/adherence';
import { OPEN_AI_PANEL_EVENT } from '../ai/events';
import { Icon, Button, Banner, Collapsible } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientOverviewCard

   Fusión de lo que eran dos tarjetas separadas (ClientHubSummary +
   ClientStatusCard) — mostraban señales solapadas (peso, fase/plan) siempre
   visibles a la vez en la cabecera del Hub. Ahora es una sola tarjeta:
   KPIs + fase + objetivo siempre visibles arriba, "últimos cambios" y la nota
   del coach plegados abajo, y un acceso directo al resumen del asistente IA
   para no tener que ir a buscarlo aparte.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  onboardingData: OnboardingData | null;
  mesocycles: Mesocycle[];
  checkins: WeightCheckIn[];
  coachReports: CoachReport[];
  athleteLogs: WorkoutLog[];
  bodyweightLogs: BodyweightLog[];
  adherenceScore: number | null;
  adherenceStyle: ScoreStyle;
  averageRir: number | null;
  planUnpublished: boolean;
  pendingReviewsCount: number;
  onGoToEntrenamientos: () => void;
  onGoToRevisiones: () => void;
}

const GOAL_LABEL: Record<GoalBody, string> = {
  aumentar_musculo: 'Aumentar músculo',
  reducir_grasa: 'Reducir grasa',
  mantener: 'Mantener',
};

function esFormat(n: number): string {
  return String(n).replace('.', ',');
}

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

interface ChangeEvent { date: string; icon: string; text: string }

export default function ClientOverviewCard({
  athlete, onboardingData, mesocycles, checkins, coachReports, athleteLogs, bodyweightLogs,
  adherenceScore, adherenceStyle, averageRir, planUnpublished, pendingReviewsCount,
  onGoToEntrenamientos, onGoToRevisiones,
}: Props) {
  const queryClient = useQueryClient();
  const statusNoteKey = ['athleteStatusNote', athlete.email] as const;

  const { data: roadmap } = useQuery({
    queryKey: ['roadmap', athlete.email],
    queryFn: () => getRoadmap(athlete.email),
  });
  const { data: nutritionProgram } = useQuery({
    queryKey: ['nutritionProgram', athlete.email],
    queryFn: () => getNutritionProgram(athlete.email),
  });
  const { data: note = '' } = useQuery({
    queryKey: statusNoteKey,
    queryFn: () => getAthleteStatusNote(athlete.email),
  });

  const planPhase = useMemo(
    () => roadmap?.planPhases?.find(p => p.status === 'actual') ?? null,
    [roadmap]
  );
  const nutriPhase = useMemo(
    () => nutritionProgram ? computeActivePhase(nutritionProgram, new Date().toISOString().slice(0, 10)) : null,
    [nutritionProgram]
  );

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const activeMeso = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const started = mesocycles.filter(m => m.startDate <= today);
    const current = started.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
    if (!current) return null;
    const week = Math.floor((Date.now() - new Date(current.startDate).getTime()) / (7 * 86_400_000)) + 1;
    return { meso: current, week: Math.min(Math.max(week, 1), current.weeks), inRange: week <= current.weeks };
  }, [mesocycles]);

  const recentChanges = useMemo(() => {
    const events: ChangeEvent[] = [];
    const lastCheckin = [...checkins].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (lastCheckin) {
      const ts = new Date(lastCheckin.timestamp);
      if (!isNaN(ts.getTime())) events.push({ date: ts.toISOString(), icon: 'monitor_weight', text: `Check-in (${lastCheckin.weight} kg)` });
    }
    const lastLog = [...athleteLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastLog) events.push({ date: lastLog.completedAt || lastLog.date, icon: 'fitness_center', text: 'Entrenamiento registrado' });
    const lastSent = coachReports.filter(r => r.status === 'sent' && r.sentAt).sort((a, b) => (b.sentAt!).localeCompare(a.sentAt!))[0];
    if (lastSent) events.push({ date: lastSent.sentAt!, icon: 'analytics', text: 'Reporte enviado' });
    const lastBw = [...bodyweightLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastBw) {
      const tag = lastBw.kind === 'weekly_avg' ? ' · media semanal' : '';
      events.push({ date: lastBw.date, icon: 'scale', text: `Peso registrado (${lastBw.weight} kg${tag})` });
    }
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
      queryClient.setQueryData(statusNoteKey, noteDraft.trim());
      setEditingNote(false);
    } finally {
      setSavingNote(false);
    }
  };

  const latestWeight = bodyweightLogs.length > 0
    ? [...bodyweightLogs].sort((a, b) => b.date.localeCompare(a.date))[0].weight
    : athlete.actualWeight || null;

  const openAiSummary = () => {
    window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT, {
      detail: { prompt: 'Resume la situación de este cliente' },
    }));
  };

  return (
    <div className="bg-gradient-to-br from-surface to-bg border border-accent/20 rounded-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-3 gap-2 flex-1">
          <div className="bg-field border border-hairline rounded-field p-3">
            <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">Adherencia</p>
            <p className={`font-display font-black text-title-m mt-2 ${adherenceStyle.text}`}>
              {adherenceScore != null ? `${adherenceScore}%` : '—'}
            </p>
            <p className={`font-mono text-caption uppercase mt-1 ${adherenceStyle.text}`}>{adherenceStyle.label}</p>
          </div>
          <div className="bg-field border border-hairline rounded-field p-3">
            <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">Peso</p>
            <p className="font-display font-black text-title-m text-ink mt-2">
              {latestWeight != null ? esFormat(Math.round(latestWeight * 10) / 10) : '—'}
            </p>
          </div>
          <div className="bg-field border border-hairline rounded-field p-3">
            <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">RIR med.</p>
            <p className="font-display font-black text-title-m text-accent mt-2">
              {averageRir != null ? esFormat(averageRir) : '—'}
            </p>
          </div>
        </div>
      </div>

      <Button variant="ghost" size="s" icon="smart_toy" onClick={openAiSummary}>
        Ver resumen IA
      </Button>

      {planUnpublished && (
        <Banner tone="danger" actionLabel="Ir a Entrenamientos" onAction={onGoToEntrenamientos}>
          Esperando plan — todavía no hay entrenamientos asignados.
        </Banner>
      )}

      {pendingReviewsCount > 0 && (
        <div className="rounded-field border border-accent-line bg-accent-bg p-4 space-y-3">
          <p className="font-mono text-caption font-semibold text-accent uppercase tracking-wider">Próxima revisión</p>
          <p className="font-sans text-body-s font-semibold text-ink">
            {pendingReviewsCount === 1 ? '1 check-in por revisar' : `${pendingReviewsCount} check-ins por revisar`}
          </p>
          <Button variant="primary" size="m" fullWidth onClick={onGoToRevisiones}>
            Ver el hilo de revisiones
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-hairline">
        {/* Fase */}
        <div className="space-y-2 pt-3">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider flex items-center gap-1">
            <Icon name="flag" size="s" className="text-accent" /> Fase
          </p>
          {planPhase ? (
            <p className="text-body-s font-bold text-ink flex items-center gap-2">
              <Icon name={planPhase.icon} size="m" style={{ color: planPhase.color }} />
              {planPhase.name}
            </p>
          ) : (
            <p className="text-label text-ink-2/60 italic">Sin fase de plan definida</p>
          )}
          {activeMeso && (
            <p className="font-mono text-caption text-ink-2">
              Meso #{activeMeso.meso.number} · {activeMeso.meso.objective} · sem {activeMeso.week}/{activeMeso.meso.weeks}
              {!activeMeso.inRange && <span className="text-warning"> (terminado)</span>}
            </p>
          )}
          {nutriPhase && (
            <p className="font-mono text-caption text-data">
              Nutrición: {nutriPhase.name}{nutriPhase.targetKcal ? ` · ${nutriPhase.targetKcal} kcal` : ''}
            </p>
          )}
        </div>

        {/* Objetivo */}
        <div className="space-y-2 pt-3">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider flex items-center gap-1">
            <Icon name="target" size="s" className="text-accent" /> Objetivo
          </p>
          {onboardingData?.goalBody ? (
            <p className="text-body-s font-bold text-ink">{GOAL_LABEL[onboardingData.goalBody]}</p>
          ) : (
            <p className="text-label text-ink-2/60 italic">Sin objetivo registrado</p>
          )}
          {onboardingData?.goalFreeText && (
            <p className="text-caption text-ink-2 leading-snug">"{onboardingData.goalFreeText}"</p>
          )}
          {latestWeight != null && athlete.targetWeight ? (
            <p className="font-mono text-caption text-ink-2">
              {latestWeight} kg → <span className="text-accent font-bold">{athlete.targetWeight} kg</span>
              {' '}({Math.round(Math.abs(latestWeight - athlete.targetWeight) * 10) / 10} kg restantes)
            </p>
          ) : null}
        </div>
      </div>

      <Collapsible
        className="pt-1 border-t border-hairline"
        trigger={<span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Más detalles</span>}
      >
        <div className="space-y-4 pb-1">
          {/* Nota del coach */}
          <div className="flex items-start gap-3">
            <Icon name="sticky_note_2" size="l" filled className="text-accent" />
            {editingNote ? (
              <div className="flex-1 space-y-2">
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="¿Qué está haciendo ahora este cliente? (ej. semana 2 de definición, volviendo de lesión de hombro…)"
                  className="w-full resize-none bg-surface border border-hairline focus:border-accent/50 rounded-control px-3 py-2 text-title-s text-ink placeholder-ink-2/50 outline-none"
                />
                <div className="flex gap-2">
                  <Button size="s" onClick={saveNote} disabled={savingNote}>{savingNote ? 'Guardando…' : 'Guardar'}</Button>
                  <Button variant="secondary" size="s" onClick={() => setEditingNote(false)} disabled={savingNote}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setNoteDraft(note); setEditingNote(true); }} className="flex-1 text-left group">
                {note ? (
                  <p className="text-body-s text-ink leading-relaxed">{note}</p>
                ) : (
                  <p className="text-body-s text-ink-2/60 italic">Añade una nota: qué está haciendo ahora este cliente…</p>
                )}
                <span className="text-caption font-mono uppercase text-ink-2/50 group-hover:text-accent transition-colors">Editar</span>
              </button>
            )}
          </div>

          {/* Últimos cambios */}
          <div className="space-y-2">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider flex items-center gap-1">
              <Icon name="history" size="s" className="text-accent" /> Últimos cambios
            </p>
            {recentChanges.length === 0 ? (
              <p className="text-label text-ink-2/60 italic">Sin actividad registrada aún</p>
            ) : (
              <ul className="space-y-1">
                {recentChanges.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-caption text-ink">
                    <Icon name={e.icon} size="s" className="text-ink-2" />
                    <span className="flex-1 truncate">{e.text}</span>
                    <span className="font-mono text-caption text-ink-2/70 flex-shrink-0">{daysAgo(e.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
