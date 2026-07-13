import React from 'react';
import { WorkoutLog, Workout, WeightCheckIn, CoachReport, AiProposal } from '../types';

interface Props {
  athleteLogs: WorkoutLog[];
  getWorkout: (id: string) => Workout | undefined;
  athleteCheckins: WeightCheckIn[];
  coachReports: CoachReport[];
  aiProposals?: AiProposal[];
  onGoToNotes: () => void;
  onGoToCheckins: () => void;
  onGoToReports: () => void;
  onGoToAiProposals?: () => void;
}

const REPORT_REMINDER_DAYS = 7;
const MS_PER_DAY = 86400000;

// Franja de "qué hay que mirar hoy" para este atleta, independiente de en qué
// zona/pestaña estés — agrega señales que ya vive dispersas por el Hub
// (notas de entreno sin ver en Entrenamientos, check-ins sin feedback en
// Revisiones) en un solo sitio con acceso directo. Se oculta si no hay nada
// pendiente: el objetivo es reducir ruido, no añadir un banner permanente.
export default function PendingTray({
  athleteLogs, getWorkout, athleteCheckins, coachReports, aiProposals = [],
  onGoToNotes, onGoToCheckins, onGoToReports, onGoToAiProposals,
}: Props) {
  const unseenNotes = athleteLogs.filter(l => (l.note || l.entries.some(e => e.note)) && !l.noteCoachSeen);
  const pendingCheckins = athleteCheckins.filter(c => !c.coachFeedback && !c.approved);
  const pendingProposals = aiProposals.filter(p => p.status === 'proposed');

  // Días desde el último reporte ENVIADO (drafts no cuentan — el atleta no los ve).
  const lastSentAt = coachReports
    .filter(r => r.status === 'sent' && r.sentAt)
    .map(r => new Date(r.sentAt as string).getTime())
    .reduce((max, t) => Math.max(max, t), 0);
  const daysSinceReport = lastSentAt > 0 ? Math.floor((Date.now() - lastSentAt) / MS_PER_DAY) : null;
  // Solo avisa si ya hay algo que reportar — un atleta recién dado de alta sin
  // entrenamientos registrados no necesita el recordatorio.
  const needsReport = athleteLogs.length > 0 && (daysSinceReport == null || daysSinceReport >= REPORT_REMINDER_DAYS);

  const items: { key: string; icon: string; text: string; onClick: () => void }[] = [];

  if (unseenNotes.length > 0) {
    const latest = [...unseenNotes].sort((a, b) => b.date.localeCompare(a.date))[0];
    const wo = getWorkout(latest.workoutId);
    items.push({
      key: 'notes',
      icon: 'sticky_note_2',
      text: unseenNotes.length === 1
        ? `1 nota sin ver${wo ? ` (${wo.name})` : ''}`
        : `${unseenNotes.length} notas de entreno sin ver`,
      onClick: onGoToNotes,
    });
  }

  if (pendingCheckins.length > 0) {
    items.push({
      key: 'checkins',
      icon: 'monitor_weight',
      text: pendingCheckins.length === 1 ? '1 check-in por revisar' : `${pendingCheckins.length} check-ins por revisar`,
      onClick: onGoToCheckins,
    });
  }

  if (needsReport) {
    items.push({
      key: 'report',
      icon: 'analytics',
      text: daysSinceReport == null ? 'Nunca se ha enviado un reporte' : `Sin reporte en ${daysSinceReport} días`,
      onClick: onGoToReports,
    });
  }

  if (pendingProposals.length > 0 && onGoToAiProposals) {
    items.push({
      key: 'ai-proposals',
      icon: 'smart_toy',
      text: pendingProposals.length === 1 ? '1 propuesta IA por revisar' : `${pendingProposals.length} propuestas IA por revisar`,
      onClick: onGoToAiProposals,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <button
          key={item.key}
          onClick={item.onClick}
          className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/50 text-amber-200 px-3 py-2 rounded-xl font-mono text-[11px] font-bold transition-all"
        >
          <span className="material-symbols-outlined text-base">{item.icon}</span>
          {item.text}
        </button>
      ))}
    </div>
  );
}
