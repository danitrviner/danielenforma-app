import React, { useEffect, useState } from 'react';
import { UserProfile, WeightCheckIn, TaskItem, TaskType } from '../types';
import { getTasksForAthlete, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getPhotoAssignmentsForAthlete, getProgressPhotos } from '../dbService';
import { isDueToday, hasAnsweredThisOccurrence, todayStr } from '../utils/questionnaireSchedule';
import { hasUploadedThisOccurrence } from '../utils/photoSchedule';

type NavTarget = 'checkin' | 'training' | 'nutrition' | 'roadmap';

interface Props {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onNavigate: (tab: NavTarget) => void;
}

const TYPE_ICON: Record<TaskType, string> = {
  revision: 'rate_review',
  cuestionario: 'assignment_late',
  foto: 'photo_camera',
  manual: 'push_pin',
  otro: 'task_alt',
};

const TYPE_COLOR: Record<TaskType, string> = {
  revision: 'text-[#00eefc]',
  cuestionario: 'text-[#fbcb1a]',
  foto: 'text-violet-300',
  manual: 'text-amber-300',
  otro: 'text-[#c6c9ab]',
};

export default function PendingTasksPanel({ profile, checkins, onNavigate }: Props) {
  const [manualTasks, setManualTasks] = useState<TaskItem[]>([]);
  const [pendingQuestionnaires, setPendingQuestionnaires] = useState<{ id: string; title: string }[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<{ id: string; viewsLabel: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getTasksForAthlete(profile.email),
      getAssignmentsForAthlete(profile.email),
      getResponsesForAthlete(profile.email),
      getPhotoAssignmentsForAthlete(profile.email),
      getProgressPhotos(profile.email),
    ]).then(async ([tasks, assignments, responses, photoAssignments, photos]) => {
      if (cancelled) return;
      setManualTasks(tasks.filter(t => t.status === 'pending'));

      const due = assignments.filter(a => a.active && isDueToday(a) && !hasAnsweredThisOccurrence(a, responses));
      const withTitles = await Promise.all(due.map(async a => {
        const q = await getQuestionnaireById(a.questionnaireId);
        return { id: a.id, title: q?.title ?? 'Cuestionario' };
      }));
      if (!cancelled) setPendingQuestionnaires(withTitles);

      const duePhotos = photoAssignments.filter(a => a.active && isDueToday(a) && !hasUploadedThisOccurrence(a, photos));
      if (!cancelled) setPendingPhotos(duePhotos.map(a => ({
        id: a.id,
        viewsLabel: a.views.map(v => v === 'front' ? 'Frente' : v === 'side' ? 'Lateral' : 'Espalda').join(', '),
      })));
    }).catch(console.error).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile.email]);

  // "Revisión próxima": último check-in pendiente de feedback, o sin check-in en 7+ días.
  const lastCheckinMs = checkins.reduce<number | null>((best, c) => {
    const ms = (c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp)).getTime();
    return best === null || ms > best ? ms : best;
  }, null);
  const daysSinceCheckin = lastCheckinMs === null ? null : Math.floor((Date.now() - lastCheckinMs) / 86_400_000);
  const needsCheckin = daysSinceCheckin === null || daysSinceCheckin >= 7;

  type Row = { key: string; type: TaskType; title: string; dueDate?: string; onOpen: () => void };

  const rows: Row[] = [
    ...(needsCheckin ? [{
      key: 'checkin-due',
      type: 'revision' as TaskType,
      title: 'Enviar check-in semanal',
      dueDate: todayStr(),
      onOpen: () => onNavigate('checkin'),
    }] : []),
    ...pendingQuestionnaires.map(q => ({
      key: `q_${q.id}`,
      type: 'cuestionario' as TaskType,
      title: q.title,
      dueDate: todayStr(),
      onOpen: () => onNavigate('checkin'),
    })),
    ...pendingPhotos.map(p => ({
      key: `foto_${p.id}`,
      type: 'foto' as TaskType,
      title: `Fotos de check-in: ${p.viewsLabel}`,
      dueDate: todayStr(),
      onOpen: () => onNavigate('checkin'),
    })),
    ...manualTasks.map(t => ({
      key: t.id,
      type: t.type,
      title: t.title,
      dueDate: t.dueDate,
      onOpen: () => onNavigate(t.linkTab ?? 'checkin'),
    })),
  ];

  if (loading) {
    return (
      <div className="bg-[#181816] border border-white/7 rounded-xl p-5">
        <span className="font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando tareas...</span>
      </div>
    );
  }

  return (
    <section className="bg-[#181816] border border-white/7 rounded-xl p-4 sm:p-5">
      <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-white/7 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#fbcb1a]">checklist</span>
        Tareas pendientes
        {rows.length > 0 && (
          <span className="ml-auto bg-[#fbcb1a] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{rows.length}</span>
        )}
      </h2>

      {rows.length === 0 ? (
        <p className="text-xs text-[#555] font-mono py-2">Todo al día — sin tareas pendientes.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (
            <button
              key={row.key}
              onClick={row.onOpen}
              className="w-full flex items-center gap-3 bg-[#1e1e1e] border border-white/7 hover:border-[#fbcb1a]/40 rounded-lg p-3 text-left transition-all group"
            >
              <span className={`material-symbols-outlined flex-shrink-0 ${TYPE_COLOR[row.type]}`}>{TYPE_ICON[row.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-sm text-white group-hover:text-[#fbcb1a] transition-colors truncate">{row.title}</p>
                {row.dueDate && (
                  <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">Vence: {row.dueDate}</p>
                )}
              </div>
              <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors flex-shrink-0">chevron_right</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
