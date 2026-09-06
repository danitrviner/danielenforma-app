import React, { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, TaskType, Questionnaire, PhotoAssignment } from '../types';
import { getTasksForAthlete, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getPhotoAssignmentsForAthlete, getProgressPhotos, getMesocycles } from '../dbService';
import { isDueToday, isOverdue, hasAnsweredThisOccurrence, todayStr, ScheduleContext } from '../utils/questionnaireSchedule';
import { hasUploadedThisOccurrence } from '../utils/photoSchedule';
import { Skeleton } from './ui';
import { ListRow } from './ui';

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
  revision: 'text-data',
  cuestionario: 'text-accent',
  foto: 'text-violet-300',
  manual: 'text-amber-300',
  otro: 'text-ink-2',
};

/** "frente, lateral y espalda": con la "y" del final, como lo diría una
 *  persona, en vez de una lista separada por comas hasta el último elemento. */
function listaNatural(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** "Para hoy" / "Para mañana" / "Se te pasó el lunes", en vez de
 *  "Vence: 2026-09-06" — una fecha de máquina en la pantalla de Inicio. */
function textoVencimiento(fechaIso: string): string {
  const [y, m, d] = fechaIso.split('-').map(Number);
  if (!y || !m || !d) return fechaIso;
  const objetivo = new Date(y, m - 1, d);
  if (isNaN(objetivo.getTime())) return fechaIso;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
  const largo = objetivo.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  if (dias === 0) return 'Para hoy';
  if (dias === 1) return 'Para mañana';
  if (dias > 1) return `Para el ${largo}`;
  if (dias === -1) return 'Se te pasó ayer';
  return `Se te pasó el ${largo}`;
}

export default function PendingTasksPanel({ profile, checkins, onNavigate }: Props) {
  const { data: tasks = [], isPending: loadingTasks } = useQuery({
    queryKey: ['tasksForAthlete', profile.email],
    queryFn: () => getTasksForAthlete(profile.email),
  });
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['assignmentsForAthlete', profile.email],
    queryFn: () => getAssignmentsForAthlete(profile.email),
  });
  const { data: responses = [], isPending: loadingResponses } = useQuery({
    queryKey: ['responsesForAthlete', profile.email],
    queryFn: () => getResponsesForAthlete(profile.email),
  });
  const { data: photoAssignments = [], isPending: loadingPhotoAssignments } = useQuery({
    queryKey: ['photoAssignmentsForAthlete', profile.email],
    queryFn: () => getPhotoAssignmentsForAthlete(profile.email),
  });
  const { data: photos = [], isPending: loadingPhotos } = useQuery({
    queryKey: ['progressPhotos', profile.email],
    queryFn: () => getProgressPhotos(profile.email),
  });
  // Contexto para los disparadores 'plan_week'/'mesocycle_end' (ver CheckInScreen).
  const { data: mesocycles = [] } = useQuery({
    // Misma clave que TrainingScreen/HomeScreen/ClientHub — ver CheckInScreen.
    queryKey: ['mesocycles', profile.email],
    queryFn: () => getMesocycles(profile.email),
  });
  const scheduleCtx: ScheduleContext = useMemo(() => ({ mesocycles }), [mesocycles]);

  const manualTasks = tasks.filter(t => t.status === 'pending');

  const due = useMemo(
    () => assignments.filter(a => a.active && isOverdue(a, scheduleCtx) && !hasAnsweredThisOccurrence(a, responses, scheduleCtx)),
    [assignments, responses, scheduleCtx]
  );

  // One cache entry per questionnaire id (['questionnaireById', id]) so this
  // reuses/gets reused by CheckInScreen and ProfileScreen's own lookups of
  // the same questionnaire instead of each fetching it independently.
  const questionnaireQueries = useQueries({
    queries: due.map(a => ({
      queryKey: ['questionnaireById', a.questionnaireId],
      queryFn: (): Promise<Questionnaire | null> => getQuestionnaireById(a.questionnaireId),
    })),
  });
  const pendingQuestionnaires = due.map((a, i) => ({
    id: a.id,
    title: (questionnaireQueries[i]?.data as Questionnaire | null | undefined)?.title ?? 'Cuestionario',
  }));

  // Sin asignación explícita del coach: por defecto se piden las 3 vistas
  // cada semana (mismo criterio que CheckInScreen).
  const effectivePhotoAssignments: PhotoAssignment[] = useMemo(() => {
    const active = photoAssignments.filter(a => a.active);
    if (active.length > 0) return active;
    return [{
      id: 'implicit-default',
      athleteId: profile.email,
      schedule: { type: 'interval', intervalDays: 7 },
      startDate: todayStr(),
      views: ['front', 'side', 'back'],
      active: true,
      createdAt: new Date().toISOString(),
    }];
  }, [photoAssignments, profile.email]);

  const duePhotos = effectivePhotoAssignments.filter(a => isDueToday(a) && !hasUploadedThisOccurrence(a, photos));
  const pendingPhotos = duePhotos.map(a => ({
    id: a.id,
    viewsLabel: listaNatural(a.views.map(v => v === 'front' ? 'frente' : v === 'side' ? 'lateral' : 'espalda')),
  }));

  const loading = loadingTasks || loadingAssignments || loadingResponses || loadingPhotoAssignments || loadingPhotos
    || (due.length > 0 && questionnaireQueries.some(q => q.isPending));

  // "Revisión próxima": último check-in pendiente de feedback, o sin check-in en 7+ días.
  const lastCheckinMs = checkins.reduce<number | null>((best, c) => {
    const ms = (c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp)).getTime();
    return best === null || ms > best ? ms : best;
  }, null);
  const daysSinceCheckin = lastCheckinMs === null ? null : Math.floor((Date.now() - lastCheckinMs) / 86_400_000);
  const needsCheckin = daysSinceCheckin === null || daysSinceCheckin >= 7;

  type Row = { key: string; type: TaskType; title: string; dueDate?: string; onOpen: () => void; urgent?: boolean };

  // Los cuestionarios pendientes (Mediciones, Revisión Semanal, DOM's...)
  // alimentan directamente las métricas del coach — sin respuesta, esas
  // gráficas se quedan sin datos. Se destacan más que una tarea manual
  // cualquiera, aunque sin bloquear el resto de la app.
  const rows: Row[] = [
    ...pendingQuestionnaires.map(q => ({
      key: `q_${q.id}`,
      type: 'cuestionario' as TaskType,
      title: q.title,
      dueDate: todayStr(),
      onOpen: () => onNavigate('checkin'),
      urgent: true,
    })),
    ...(needsCheckin ? [{
      key: 'checkin-due',
      type: 'revision' as TaskType,
      title: 'Enviar tu revisión',
      dueDate: todayStr(),
      onOpen: () => onNavigate('checkin'),
    }] : []),
    ...pendingPhotos.map(p => ({
      key: `foto_${p.id}`,
      type: 'foto' as TaskType,
      title: `Hacerte las fotos de ${p.viewsLabel}`,
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
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
      <h2 className="font-sans font-bold text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
        <span className="material-symbols-outlined text-accent">checklist</span>
        Tareas pendientes
        {rows.length > 0 && (
          <span className="ml-auto bg-accent text-black text-caption font-bold px-2 rounded-full">{rows.length}</span>
        )}
      </h2>

      {rows.length === 0 ? (
        <p className="text-label text-ink-3 font-sans py-2">Todo al día — sin tareas pendientes.</p>
      ) : (
        <div className="space-y-2">
          {rows.some(r => r.urgent) && (
            <p className="font-sans text-caption text-warning uppercase tracking-wider px-1">
              Sin responder — tu coach no ve datos actualizados hasta que lo hagas
            </p>
          )}
          {rows.map(row => (
            <ListRow
              key={row.key}
              onClick={row.onOpen}
              className={row.urgent
                ? 'bg-warning/10 border border-warning/40 rounded-control'
                : 'bg-raised border border-hairline rounded-control'}
              leading={<span className={`material-symbols-outlined flex-shrink-0 ${row.urgent ? 'text-warning' : TYPE_COLOR[row.type]}`}>{row.urgent ? 'warning' : TYPE_ICON[row.type]}</span>}
              title={row.title}
              subtitle={row.dueDate ? textoVencimiento(row.dueDate) : undefined}
              chevron
            />
          ))}
        </div>
      )}
    </section>
  );
}
