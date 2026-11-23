import React from 'react';
import { WorkoutLog, Workout, AiProposal } from '../types';
import { Icon } from './ui';

interface Props {
  athleteLogs: WorkoutLog[];
  getWorkout: (id: string) => Workout | undefined;
  aiProposals?: AiProposal[];
  onGoToNotes: () => void;
  onGoToAiProposals?: () => void;
}


// Franja de "qué hay que mirar hoy" para este atleta, independiente de en qué
// zona/pestaña estés — agrega señales que ya vive dispersas por el Hub (notas
// de entreno sin ver en Entrenamientos, reportes atrasados) en un solo sitio
// con acceso directo. Se oculta si no hay nada pendiente: el objetivo es
// reducir ruido, no añadir un banner permanente. Los check-ins sin revisar
// (la "próxima revisión" del handoff Fase 3) ya no viven aquí — ClientHub los
// destaca en su propia tarjeta de cabecera, ver F3.13b.
export default function PendingTray({
  athleteLogs, getWorkout, aiProposals = [],
  onGoToNotes, onGoToAiProposals,
}: Props) {
  const unseenNotes = athleteLogs.filter(l => (l.note || l.entries.some(e => e.note)) && !l.noteCoachSeen);
  const pendingProposals = aiProposals.filter(p => p.status === 'proposed');

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

  if (pendingProposals.length > 0 && onGoToAiProposals) {
    items.push({
      key: 'ai-proposals',
      icon: 'smart_toy',
      text: pendingProposals.length === 1 ? '1 propuesta por revisar' : `${pendingProposals.length} propuestas por revisar`,
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
          className="flex items-center gap-2 bg-warning/10 border border-warning/25 hover:border-warning/50 text-warning px-3 py-2 rounded-control font-mono text-caption font-bold transition-[color,background-color,border-color,opacity,transform,box-shadow]"
        >
          <Icon name={item.icon} size="m" />
          {item.text}
        </button>
      ))}
    </div>
  );
}
