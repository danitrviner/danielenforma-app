import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Workout, WorkoutAssignment, Exercise, WorkoutLog, WorkoutEntryLog, ExercisePersonalNote, MUSCLE_LABELS } from '../types';
import LoadHistoryPanel from './LoadHistoryPanel';
import StatTile from './StatTile';
import {
  getWorkoutAssignmentsForAthlete, getWorkouts, getExercises, seedExercisesIfEmpty,
  createWorkoutLog, updateWorkoutAssignment, getWorkoutLogs, getExerciseNotesForAthlete,
} from '../dbService';
import { getWeekRange, getWeekStart, MONTHS_ES, formatDate } from '../utils/trainingWeek';
import { TECHNIQUE_EMOJI, TECHNIQUE_LABEL, TECHNIQUE_COLOR, TECHNIQUE_DESCRIPTION } from '../utils/workoutTechniques';
import { generateWarmup } from '../utils/warmup/WarmupGenerator';
import { parseTargetReps } from '../utils/warmup/WarmupEngine';
import { expandSetGroups } from '../utils/setGroups';
import { prefillWorkoutSets } from '../utils/setPrefill';
import { useToast } from '../hooks/useToast';
import { registerTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import Coachmark from './Coachmark';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import ExerciseBestSetCard from './ExerciseBestSetCard';
import { exerciseBestProgress, exerciseWeightTrend, ExerciseBestProgress } from '../utils/athleteMetrics';
import { epley } from '../utils/oneRepMax';
import { allTimeBestBefore } from '../utils/trainingReport';
import { Skeleton } from './ui';
import { startRestTimer, stopRestTimer } from '../services/restTimer';
import { useBotonAtras } from '../services/botonAtras';
import {
  guardarSesion, cargarSesion, borrarSesion, formaDeSesion, tieneSeriesHechas,
  limpiarSesionesCaducadas,
} from '../utils/sesionEnCurso';
import { haptics } from '../services/haptics';
import { Badge, BadgeTone, Dialog, Button, Icon, ProgressBar, SegmentedControl, Chip, EmptyState } from './ui';

interface TrainingScreenProps {
  profile: UserProfile;
}

// ── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'programa' | 'progresion';

/** `rir` guarda '0'-'5' o el literal 'fallo' — Fase 3: FALLO no es RIR 0
 * (decisión de Dani, 2026-08-07), así que necesita su propio valor, no un
 * número reservado. */
interface SetInput {
  weight: string;
  repsDone: string;
  rir: string;
  done: boolean;
}

/** Orden de ciclo del selector compacto de la tabla: el valor más bajo (serie
 * más dura) primero, con FALLO como un séptimo escalón aparte, no dentro del
 * 0-5. */
const RIR_OPCIONES = ['fallo', '0', '1', '2', '3', '4', '5'] as const;

function rirTexto(valor: string): string {
  return valor === 'fallo' ? 'FALLO' : valor;
}

/** Mismo criterio de color que la primitiva RirScale (ui/RirScale.tsx),
 * aplicado aquí a un `<select>` nativo en vez de a los 7 botones de la
 * primitiva: la tabla no tiene sitio para el selector completo por fila, así
 * que el toque abre la rueda nativa y esto solo pinta el valor ya elegido. */
function rirClaseColor(valor: string): string {
  if (valor === 'fallo') return 'text-danger';
  const n = Number(valor);
  if (n <= 1) return 'text-accent';
  if (n <= 3) return 'text-accent/70';
  return 'text-ink-2';
}

interface SessionCelebration {
  isFirstEver: boolean;
  totalSets: number;
  tonnage: number;
  prs: { exerciseId: string; name: string; newBest: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatWeekLabel(weekStartStr: string, isCurrent: boolean): string {
  const s = new Date(weekStartStr + 'T00:00:00');
  const e = new Date(weekStartStr + 'T00:00:00');
  e.setDate(e.getDate() + 6);
  const sl = `${s.getDate()} ${MONTHS_ES[s.getMonth()]}`;
  const el = `${e.getDate()} ${MONTHS_ES[e.getMonth()]}`;
  return isCurrent ? `Esta semana · ${sl} – ${el}` : `${sl} – ${el}`;
}

const STATUS_LABEL: Record<WorkoutAssignment['status'], string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  skipped:   'Saltado',
  perdido:   'Perdido',
};

const STATUS_TONE: Record<WorkoutAssignment['status'], BadgeTone> = {
  pending:   'warning',
  completed: 'success',
  skipped:   'neutral',
  perdido:   'danger',
};

const TYPE_CHIP: Record<string, string> = {
  fuerza:       'bg-data/10 text-data border border-data/20',
  cardio:       'bg-orange-500/10 text-orange-300 border border-orange-500/20',
  estiramiento: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  pliometría:   'bg-accent/10 text-accent border border-accent/20',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrainingScreen({ profile }: TrainingScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const tutorial = useTutorialEngine();
  const [mainTab, setMainTab] = useState<MainTab>('programa');

  // Data
  const assignmentsKey = ['workoutAssignmentsForAthlete', profile.userId] as const;
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
  });
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      await seedExercisesIfEmpty();
      return getExercises();
    },
  });
  const logsKey = ['workoutLogs', profile.email] as const;
  const { data: logs = [], isPending: loadingLogs } = useQuery({
    queryKey: logsKey,
    queryFn: () => getWorkoutLogs(profile.email),
  });
  const { data: personalNotes = [], isPending: loadingNotes } = useQuery({
    queryKey: ['exerciseNotesForAthlete', profile.email],
    queryFn: () => getExerciseNotesForAthlete(profile.email),
  });
  const loading = loadingAssignments || loadingWorkouts || loadingExercises || loadingLogs || loadingNotes;

  // Pending assignments more than a week past their date are lost — the athlete missed
  // the weekly block entirely. Persist so the coach sees it too (ClientHub). Runs once
  // per athlete once assignments have loaded (guard pattern like StepsWidget) instead of
  // being baked into the fetch, so this query's cache entry stays a plain, shareable read
  // (also used as-is by AthleteRoadmapScreen).
  const markLostInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadingAssignments || markLostInitFor.current === profile.userId) return;
    markLostInitFor.current = profile.userId;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const toMarkLost = assignments.filter(a => a.status === 'pending' && a.date < cutoffStr);
    if (toMarkLost.length === 0) return;
    const lostIds = new Set(toMarkLost.map(a => a.id));
    queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev =>
      prev?.map(a => lostIds.has(a.id) ? { ...a, status: 'perdido' as const } : a));
    Promise.all(toMarkLost.map(a => updateWorkoutAssignment(a.id, { status: 'perdido' })))
      .catch(err => console.error('mark lost assignments failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAssignments, profile.userId]);

  // List filter
  const [listFilter, setListFilter] = useState<WorkoutAssignment['status'] | 'all'>('pending');

  // Player state
  const [activeAssignment, setActiveAssignment] = useState<WorkoutAssignment | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [playerSets, setPlayerSets] = useState<SetInput[][]>([]);
  const [prevEntries, setPrevEntries] = useState<WorkoutEntryLog[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [celebration, setCelebration] = useState<SessionCelebration | null>(null);
  const [exerciseNoteInputs, setExerciseNoteInputs] = useState<string[]>([]);
  const [workoutNoteInput, setWorkoutNoteInput] = useState('');

  // 05-5. Barrido de borradores de sesión caducados: una sesión que se abre y
  // nunca se termina deja su clave, y sin esto se acumularían una por semana.
  useEffect(() => { limpiarSesionesCaducadas(profile.email); }, [profile.email]);
  // Vídeo demo abierto (F3.13, "ficha de ejercicio" — el tutorial ya promete
  // "aquí tienes el vídeo a 0,5× o velocidad normal" señalando esta tarjeta,
  // pero hasta ahora solo había una miniatura estática sin reproducir nada).
  // Uno solo a la vez: N iframes de YouTube cargados a la vez en una sesión
  // con varios ejercicios sería peso muerto en cada carga de pantalla.
  const [openVideoIdx, setOpenVideoIdx] = useState<number | null>(null);

  // "Tu mejor serie" de la ficha de ejercicio (F3.13, Biblioteca panel 02) —
  // useMemo a nivel de componente, no dentro del .map() de tarjetas de
  // ejercicio: llamar un hook con un nº de iteraciones variable rompería las
  // Rules of Hooks si el entreno activo cambiara de nº de ejercicios entre
  // renders. Se calcula sobre TODOS los ejercicios del entreno de una vez.
  const exerciseProgressById = useMemo(() => {
    const map = new Map<string, { progress: ExerciseBestProgress; trend: number[] }>();
    for (const we of activeWorkout?.exercises ?? []) {
      const progress = exerciseBestProgress(logs, we.exerciseId);
      if (progress) map.set(we.exerciseId, { progress, trend: exerciseWeightTrend(logs, we.exerciseId) });
    }
    return map;
  }, [logs, activeWorkout]);

  // Cronómetro de descanso: se arranca solo al marcar una serie como hecha,
  // con el restSeconds prescrito del ejercicio — antes el atleta tenía que
  // llevar la cuenta él mismo en el momento de mayor intensidad de la sesión.
  const [restTimer, setRestTimer] = useState<{ totalSeconds: number; secondsLeft: number } | null>(null);

  // Cuenta atrás del descanso: se reprograma sola cada segundo vía el propio
  // cambio de estado; se detiene al llegar a 0 (el efecto de abajo la cierra).
  useEffect(() => {
    if (!restTimer || restTimer.secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setRestTimer(prev => (prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null));
    }, 1000);
    return () => clearTimeout(id);
  }, [restTimer]);

  // Al llegar a 0: una vibración corta (no pide permiso, no-op si el
  // navegador no la soporta) y se cierra sola a los pocos segundos.
  useEffect(() => {
    if (restTimer?.secondsLeft !== 0) return;
    navigator.vibrate?.([150, 80, 150]);
    stopRestTimer().catch(() => {}); // ya lo vimos en primer plano, evita el duplicado/la notificación colgada en background
    const id = setTimeout(() => setRestTimer(null), 3000);
    return () => clearTimeout(id);
  }, [restTimer?.secondsLeft]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const getWorkout = (id: string) => workouts.find(w => w.id === id);
  const getExercise = (id: string) => exercises.find(e => e.id === id);
  const getPersonalNote = (exerciseId: string) => personalNotes.find(n => n.exerciseId === exerciseId)?.observation;

  const today = new Date().toISOString().split('T')[0];
  const curWeekStart = getWeekRange().start;

  const sortedAssignments = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  const filteredAssignments = listFilter === 'all'
    ? sortedAssignments
    : sortedAssignments.filter(a => a.status === listFilter);

  // Current week's block (any status) + overdue pending carried over from earlier weeks.
  // Future weeks stay hidden until they become the current week; anything pending for
  // more than 7 days already flipped to 'perdido' in loadAll, so overdueBlock is always
  // recent backlog, never a growing pile.
  const thisWeekBlock = sortedAssignments.filter(a => getWeekStart(a.date) === curWeekStart);
  const overdueBlock = sortedAssignments.filter(a => a.status === 'pending' && getWeekStart(a.date) < curWeekStart);
  const nextAssignmentId = thisWeekBlock.find(a => a.status === 'pending')?.id ?? null;

  const visiblePendingCount = thisWeekBlock.filter(a => a.status === 'pending').length + overdueBlock.length;

  // Weekly stats
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const weekAssignments = assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
  const weekCompleted = weekAssignments.filter(a => a.status === 'completed').length;

  // ── Player helpers ─────────────────────────────────────────────────────────
  // Fase 3 (decisión de Dani, 2026-08-07 — "Registro editable en la sesión"):
  // la tabla llega PRERRELLENADA con lo del último día y el atleta corrige,
  // no un campo vacío con el dato anterior solo como referencia gris. La
  // lógica vive en utils/setPrefill.ts (testeada ahí) para no depender de
  // montar todo el player en el test.
  const openPlayer = (assignment: WorkoutAssignment) => {
    const wo = getWorkout(assignment.workoutId);
    if (!wo) return;

    // Para cada ejercicio de la rutina, la sesión registrada más reciente
    // entre TODAS las sesiones anteriores — es lo que rellena la tabla.
    const sortedPrev = logs
      .filter(l => l.date < assignment.date)
      .sort((a, b) => b.date.localeCompare(a.date));
    const seenExercises = new Set<string>();
    const entries: WorkoutEntryLog[] = [];
    for (const log of sortedPrev) {
      for (const entry of log.entries) {
        if (!seenExercises.has(entry.exerciseId)) {
          seenExercises.add(entry.exerciseId);
          entries.push(entry);
        }
      }
    }

    const prerrellenadas = prefillWorkoutSets(wo, entries);

    // 05-5. Si esta misma sesión quedó a medias —la app murió en segundo plano,
    // o el atleta salió a la lista entre series— se recupera lo que ya había
    // marcado en vez de volver a empezar. `cargarSesion` solo devuelve algo si
    // la rutina sigue teniendo la misma forma; si el coach la cambió, prefiere
    // perder el borrador antes que colocar los kilos en el ejercicio de al lado.
    const borrador = cargarSesion(profile.email, assignment.id, wo.id, formaDeSesion(prerrellenadas));

    setActiveAssignment(assignment);
    setActiveWorkout(wo);
    setPlayerSets(borrador?.playerSets ?? prerrellenadas);
    setExerciseNoteInputs(borrador?.exerciseNoteInputs
      ?? wo.exercises.slice().sort((a, b) => a.order - b.order).map(() => ''));
    setWorkoutNoteInput(borrador?.workoutNoteInput ?? '');
    setCelebration(null);
    setPrevEntries(entries);

    if (borrador && tieneSeriesHechas(borrador)) {
      const hechas = borrador.playerSets.reduce((n, ex) => n + ex.filter(s => s.done).length, 0);
      showToast(`Recuperamos tu sesión: ${hechas} ${hechas === 1 ? 'serie marcada' : 'series marcadas'}.`);
    }
  };

  /** Cierra el player y deja el estado como estaba antes de abrirlo. **No borra
   *  el borrador a propósito**: salir a la lista a mitad de sesión es algo que
   *  se hace para mirar otra cosa, no para tirar 20 minutos de trabajo, así que
   *  volver a entrar en la misma sesión la recupera. El borrador solo se borra
   *  cuando la sesión se cierra de verdad: al terminarla o al saltarla. */
  const cerrarPlayer = () => {
    setActiveAssignment(null);
    setActiveWorkout(null);
    setPlayerSets([]);
    setPrevEntries([]);
    setExerciseNoteInputs([]);
    setWorkoutNoteInput('');
    setRestTimer(null);
  };

  const updateSet = (exIdx: number, sIdx: number, field: keyof SetInput, value: string | boolean) => {
    setPlayerSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx][sIdx] = { ...next[exIdx][sIdx], [field]: value };
      return next;
    });
  };

  const updateExerciseNote = (exIdx: number, value: string) => {
    setExerciseNoteInputs(prev => {
      const next = [...prev];
      next[exIdx] = value;
      return next;
    });
  };

  // 07-9. El player no es una ruta, es estado de esta pantalla, así que sin
  // esto el Atrás de Android navegaba fuera del entrenamiento —o cerraba la
  // app— en vez de volver a la lista de sesiones. Se apila igual que un
  // overlay, y mientras la celebración esté abierta manda ella.
  useBotonAtras(cerrarPlayer, !!activeAssignment && !celebration);

  const canFinish = playerSets.some(exSets => exSets.some(s => s.done));

  // 05-5. Autoguardado del entrenamiento en curso: cada serie marcada y cada
  // nota persiste al instante en el dispositivo. Antes, la única escritura era
  // «Terminar sesión», así que 40 minutos de gimnasio con la pantalla apagada
  // entre series desaparecían si iOS decidía matar la app en segundo plano.
  useEffect(() => {
    if (!activeAssignment || !activeWorkout || celebration) return;

    const hayTrabajo = canFinish
      || workoutNoteInput.trim() !== ''
      || exerciseNoteInputs.some(n => n.trim() !== '');

    // Una tabla solo prerrellenada, sin nada marcado, no es trabajo que
    // proteger: guardarla dejaría una clave por cada sesión que se abre y se
    // cierra sin entrenar. Y si el atleta desmarca todo, el borrador se va con
    // ello en vez de quedarse resucitando series que él mismo quitó.
    if (!hayTrabajo) {
      borrarSesion(profile.email, activeAssignment.id);
      return;
    }

    guardarSesion(profile.email, {
      assignmentId:      activeAssignment.id,
      workoutId:         activeWorkout.id,
      playerSets,
      exerciseNoteInputs,
      workoutNoteInput,
      guardadoEn:        new Date().toISOString(),
    });
  }, [activeAssignment, activeWorkout, playerSets, exerciseNoteInputs, workoutNoteInput,
      celebration, canFinish, profile.email]);

  const handleFinish = async () => {
    if (!activeAssignment || !activeWorkout || !canFinish) return;
    setIsFinishing(true);
    try {
      const orderedExercises = activeWorkout.exercises.slice().sort((a, b) => a.order - b.order);
      const entries: WorkoutEntryLog[] = orderedExercises
        .map((we, exIdx) => ({
          exerciseId: we.exerciseId,
          sets: (playerSets[exIdx] || [])
            .filter(s => s.done)
            .map(s => ({
              weight: parseFloat(s.weight) || 0,
              repsDone: parseInt(s.repsDone) || 0,
              rir: s.rir === 'fallo' ? 0 : parseInt(s.rir) || 0,
              alFallo: s.rir === 'fallo',
            })),
          note: (exerciseNoteInputs[exIdx] || '').trim() || undefined,
        }))
        .filter(e => e.sets.length > 0);

      // PRs: mejor 1RM estimado de esta sesión por ejercicio contra el mejor
      // histórico ANTES de esta fecha — mismo criterio que el motor de
      // reportes (exige historial previo; un primer registro nunca es récord).
      const priorBest = allTimeBestBefore(logs, activeAssignment.date);
      const prs: SessionCelebration['prs'] = [];
      for (const entry of entries) {
        const newBest = entry.sets.reduce((max, s) => Math.max(max, epley(s.weight, s.repsDone)), 0);
        const prevBest = priorBest.get(entry.exerciseId);
        if (newBest > 0 && prevBest != null && newBest > prevBest) {
          prs.push({ exerciseId: entry.exerciseId, name: getExercise(entry.exerciseId)?.name || entry.exerciseId, newBest });
        }
      }
      const tonnage = entries.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + set.weight * set.repsDone, 0), 0);
      const totalSets = entries.reduce((sum, e) => sum + e.sets.length, 0);
      const isFirstEver = logs.length === 0;

      const now = new Date().toISOString();
      const newLog = await createWorkoutLog({
        athleteId:   profile.email,
        workoutId:   activeWorkout.id,
        assignmentId: activeAssignment.id,
        mesocycleId:  activeAssignment.mesocycleId,
        date:         activeAssignment.date,
        completedAt:  now,
        entries,
        note: workoutNoteInput.trim() || undefined,
      });

      await updateWorkoutAssignment(activeAssignment.id, { status: 'completed' });

      queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev => prev?.map(a =>
        a.id === activeAssignment.id ? { ...a, status: 'completed' } : a
      ));
      queryClient.setQueryData<WorkoutLog[]>(logsKey, prev => [...(prev ?? []), newLog]);
      setRestTimer(null);
      // 05-5. El entrenamiento ya está en Firestore: el borrador local sobra.
      // Va después de las dos escrituras y no antes, para que un fallo al
      // guardar deje el trabajo del atleta donde estaba.
      borrarSesion(profile.email, activeAssignment.id);
      void haptics.success();
      // El modal de celebración se muestra ANTES de cerrar el player — el
      // atleta lo despide él mismo (dismissCelebration) y ahí se limpia todo.
      setCelebration({ isFirstEver, totalSets, tonnage, prs });
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el entrenamiento.');
    } finally {
      setIsFinishing(false);
    }
  };

  const dismissCelebration = () => {
    setCelebration(null);
    cerrarPlayer();
  };

  const handleSkip = async (assignment: WorkoutAssignment) => {
    try {
      await updateWorkoutAssignment(assignment.id, { status: 'skipped' });
      queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev => prev?.map(a =>
        a.id === assignment.id ? { ...a, status: 'skipped' } : a
      ));
    } catch (err) {
      console.error('Error saltando sesión:', err);
      showToast('No se pudo saltar la sesión.');
    }
  };

  // ── Assignment card (shared by the "Esta semana / Atrasados" view and the classic
  // per-week history view) ────────────────────────────────────────────────────
  const renderAssignmentCard = (a: WorkoutAssignment, opts?: { isNext?: boolean }) => {
    const wo = getWorkout(a.workoutId);
    const isToday = a.date === today;
    const isPast = a.date < today;
    const isNext = opts?.isNext ?? false;
    const canAct = a.status === 'pending' || a.status === 'perdido';
    return (
      <div
        key={a.id}
        className={`border p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isNext
            ? 'rounded-canvas bg-accent-bg border-accent/50 shadow-glow'
            : 'rounded-surface bg-surface border-hairline'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-surface flex items-center justify-center flex-shrink-0 ${
            a.status === 'completed' ? 'bg-success/15 text-success'
            : a.status === 'skipped'  ? 'bg-raised text-ink-2'
            : a.status === 'perdido'  ? 'bg-danger/10 text-danger'
            : isNext ? 'bg-accent/15 text-accent'
            : 'bg-raised text-ink-2'
          }`}>
            <Icon
              name={a.status === 'completed' ? 'check_circle'
                : a.status === 'skipped' ? 'skip_next'
                : a.status === 'perdido' ? 'event_busy'
                : isNext || isToday ? 'bolt' : 'fitness_center'}
              size="m"
              filled
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-sans font-bold text-ink text-title-s">{wo?.name || 'Rutina'}</p>
              {isNext && a.status === 'pending' && <Badge tone="accent">Siguiente</Badge>}
              {!isNext && isPast && a.status === 'pending' && <Badge tone="danger">Atrasado</Badge>}
            </div>
            <p className="font-mono text-label text-ink-2 ">
              {formatDate(a.date)} · {wo ? `${wo.exercises.length} ejercicio${wo.exercises.length !== 1 ? 's' : ''}` : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
          {canAct && (
            <>
              <Button variant="secondary" size="s" icon="skip_next" onClick={() => handleSkip(a)}>Saltar</Button>
              {wo && (
                <Button variant="primary" size="s" icon="play_circle" onClick={() => openPlayer(a)}>
                  {a.status === 'perdido' ? 'Recuperar' : 'Empezar'}
                </Button>
              )}
            </>
          )}
          {a.status === 'completed' && <Icon name="task_alt" size="l" filled className="text-success" />}
        </div>
      </div>
    );
  };

  // ── Render: PLAYER ─────────────────────────────────────────────────────────
  if (activeAssignment && activeWorkout) {
    const orderedExercises = activeWorkout.exercises.slice().sort((a, b) => a.order - b.order);
    const doneSetsTotal = playerSets.flat().filter(s => s.done).length;
    const totalSets = playerSets.flat().length;

    return (
      <div className="space-y-6 pb-14">
        {/* Player header */}
        <header className="flex items-center gap-3 pb-4 border-b border-hairline sticky top-[var(--header-h)] bg-bg/92 backdrop-blur-md z-[var(--z-sticky)] pt-2">
          <Button
            variant="ghost"
            size="s"
            icon="arrow_back"
            label="Volver"
            onClick={cerrarPlayer}
            className="shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-title-l font-black uppercase tracking-tight text-ink truncate">{activeWorkout.name}</h1>
            <p className="font-mono text-caption text-ink-2">{formatDate(activeAssignment.date)} · EJERCICIO {orderedExercises.length}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="font-mono text-label text-accent font-bold">{doneSetsTotal}/{totalSets}</span>
            <span className="block font-mono text-caption text-ink-2 uppercase">series hechas</span>
          </div>
        </header>

        {/* Cronómetro de descanso — flotante, no bloquea el resto de la UI.
            Pastilla oro con punto que late mientras cuenta (handoff, Sesión
            módulo 3): al llegar a 0 el icono deja de latir y el texto pasa a
            "¡Listo!" un instante antes de cerrarse sola. */}
        {restTimer && (
          <div className="fixed top-20 right-4 z-[var(--z-fab)] flex items-center gap-3 rounded-full border border-accent-line bg-surface py-2 pl-4 pr-2 shadow-e1">
            <span className="relative flex h-2 w-2" aria-hidden>
              {restTimer.secondsLeft > 0 && (
                <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-accent" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <div className="leading-none">
              <p className="font-mono text-title-m font-bold tabular-nums text-ink">
                {Math.floor(restTimer.secondsLeft / 60)}:{String(restTimer.secondsLeft % 60).padStart(2, '0')}
              </p>
              <p className="font-mono text-caption uppercase tracking-wide text-ink-2">
                {restTimer.secondsLeft > 0 ? 'Descanso' : '¡Listo!'}
              </p>
            </div>
            <Button variant="ghost" size="s" icon="close" label="Saltar descanso" onClick={() => setRestTimer(null)} />
          </div>
        )}

        {/* Progress bar */}
        <ProgressBar value={totalSets > 0 ? (doneSetsTotal / totalSets) * 100 : 0} label={`${doneSetsTotal} de ${totalSets} series hechas`} />

        {/* Stat tiles: real progress metrics */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon="check_circle" label="Series hechas" value={`${doneSetsTotal}/${totalSets}`} />
          <StatTile icon="format_list_numbered" label="Ejercicios" value={orderedExercises.length} />
        </div>

        <Coachmark
          id="training_player_mark_set"
          email={profile.email}
          icon="touch_app"
          text="Marca el círculo al terminar cada serie — es lo que usa tu coach para progresarte."
        />

        {/* Exercise cards */}
        {orderedExercises.map((we, exIdx) => {
          const ex = getExercise(we.exerciseId);
          const exSets = playerSets[exIdx] || [];
          const prevEntry = prevEntries.find(e => e.exerciseId === we.exerciseId);
          const expanded = expandSetGroups(we);
          const totalSets = expanded.length;
          const doneSets = exSets.filter(s => s.done).length;
          // Warm-up reacts live to whatever the athlete is currently typing for the first
          // effective set (first row of the first block, top set included) — there's no
          // separate "prescribed weight" field, it's only known once the athlete types it.
          const set1Weight = parseFloat(exSets[0]?.weight || '') || 0;
          const warmup = generateWarmup({
            mode: we.warmupMode,
            manualSets: we.manualWarmupSets,
            targetWeight: set1Weight,
            targetReps: parseTargetReps(expanded[0]?.reps ?? we.reps),
            previousSets: prevEntry?.sets,
          });
          return (
            <div
              key={`${we.exerciseId}-${exIdx}`}
              className={`bg-surface border rounded-surface overflow-hidden ${
                we.recordVideoSet ? 'border-accent/50' : 'border-hairline'
              }`}
            >
              {/* Exercise header — nombre en Archivo 900 (handoff, Sesión): es
                  el único titular de la tarjeta, todo lo demás es dato o chip. */}
              <div
                ref={el => { if (exIdx === 0) registerTourTarget('training-exercise-video', el); }}
                className="flex items-center gap-3 p-4 bg-surface border-b border-hairline"
              >
                <span className="font-mono text-caption text-ink-3 w-5 text-center font-bold flex-shrink-0">{exIdx + 1}</span>
                {ex?.imageUrl ? (
                  <img src={ex.imageUrl} alt={ex.name} className="w-11 h-11 rounded-full object-cover border border-hairline flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                    <Icon name="fitness_center" size="m" className="text-ink-2" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-display text-title-m font-black uppercase tracking-tight text-ink truncate flex items-center gap-2">
                    {ex?.name || we.exerciseId}
                    {we.technique && (
                      <span className={`inline-flex items-center gap-1 text-caption font-mono font-bold uppercase px-2 rounded-control border flex-shrink-0 ${TECHNIQUE_COLOR[we.technique]}`}>
                        {TECHNIQUE_EMOJI[we.technique]} {TECHNIQUE_LABEL[we.technique]}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-caption text-ink-2">
                      {we.setGroups && we.setGroups.length > 0
                        ? we.setGroups.map((g, i) => `${g.label || `Bloque ${i + 1}`} ${g.sets}×${g.reps} (RIR ${g.rir})`).join(' · ')
                        : `${we.sets}×${we.reps} · RIR ${we.rir}`} · {we.restSeconds}s
                    </span>
                    {ex?.type && (
                      <span className={`text-caption font-sans px-2 rounded-control capitalize ${TYPE_CHIP[ex.type] || ''}`}>{ex.type}</span>
                    )}
                    {ex?.muscleGroup && (
                      <span className="text-caption font-sans px-2 rounded-control bg-white/5 text-ink-2">{MUSCLE_LABELS[ex.muscleGroup]}</span>
                    )}
                    {ex?.equipment?.map(eq => (
                      <span key={eq} className="text-caption font-sans px-2 rounded-control bg-white/5 text-ink-3">{eq}</span>
                    ))}
                    {(ex?.videoUrl || exerciseProgressById.has(we.exerciseId)) && (
                      <button
                        type="button"
                        onClick={() => setOpenVideoIdx(v => v === exIdx ? null : exIdx)}
                        className={`inline-flex items-center gap-1 text-caption font-sans font-bold uppercase px-2 rounded-control border transition-colors ${
                          openVideoIdx === exIdx ? 'bg-accent text-on-accent border-accent' : 'text-accent border-accent/30 hover:bg-accent/10'
                        }`}
                      >
                        <Icon name={ex?.videoUrl ? 'play_circle' : 'trending_up'} size="s" filled={openVideoIdx === exIdx} />
                        {ex?.videoUrl ? 'Vídeo' : 'Progreso'}
                      </button>
                    )}
                    {warmup.readiness && (
                      <span
                        title={warmup.readiness.message}
                        className={`text-caption font-mono px-2 rounded-control border ${
                          warmup.readiness.score >= 75 ? 'text-success border-success/30 bg-success/10'
                          : warmup.readiness.score >= 45 ? 'text-warning border-warning/30 bg-warning/10'
                          : 'text-danger border-danger/30 bg-danger/10'
                        }`}
                      >
                        🔥 Readiness {warmup.readiness.score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {doneSets === totalSets ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-on-accent">
                      <Icon name="check" size="s" filled />
                    </span>
                  ) : (
                    <span className="font-mono text-caption font-bold px-2 py-1 rounded-control bg-inset text-ink-2">
                      {doneSets}/{totalSets}
                    </span>
                  )}
                </div>
              </div>

              {openVideoIdx === exIdx && (
                <>
                  {ex?.videoUrl && <ExerciseVideoPlayer videoUrl={ex.videoUrl} />}
                  {exerciseProgressById.get(we.exerciseId) && (
                    <ExerciseBestSetCard {...exerciseProgressById.get(we.exerciseId)!} />
                  )}
                </>
              )}

              {we.recordVideoSet && (
                <div className="flex items-center gap-2 px-4 py-2 bg-accent/6 border-b border-accent-line">
                  <Icon name="videocam" size="s" className="text-accent" />
                  <p className="font-sans text-label font-bold text-accent">
                    {we.recordVideoSet === 'all'
                      ? 'Tu entrenador quiere que grabes todas las series con el móvil'
                      : `Tu entrenador quiere que grabes la serie ${we.recordVideoSet} con el móvil`}
                  </p>
                </div>
              )}

              {we.technique && (
                <div className={`flex items-start gap-2 px-4 py-3 border-b ${TECHNIQUE_COLOR[we.technique]}`}>
                  <span className="text-title-s flex-shrink-0 leading-none">{TECHNIQUE_EMOJI[we.technique]}</span>
                  <p className="font-sans text-label leading-relaxed">
                    <span className="font-bold uppercase tracking-wide">{TECHNIQUE_LABEL[we.technique]}. </span>
                    {TECHNIQUE_DESCRIPTION[we.technique]}
                  </p>
                </div>
              )}

              {/* Set table
                  07-4. Era `min-w-[480px]` dentro de un ancho útil de 343-361 px,
                  así que en CUALQUIER iPhone la última columna quedaba fuera de
                  pantalla — y la última columna es «Hecha», la casilla que el
                  atleta pulsa una vez por serie, de pie, con las manos ocupadas y
                  el pulso a 150. Había que arrastrar la tabla en horizontal cada
                  vez, dentro de una página que ya scrollea en vertical.

                  Ahora en móvil la tabla CABE, en vez de caber a medias: se
                  esconde la columna «Anterior» y se aprietan paddings y campos.
                  Esconder «Anterior» no pierde el dato: la tabla llega
                  prerrellenada con lo del último día (utils/setPrefill.ts) y ese
                  mismo valor está de placeholder en cada campo, así que la
                  columna era la tercera vez que se decía lo mismo. En pantallas
                  anchas no cambia nada. */}
              <div className="overflow-x-auto">
                <table className="w-full text-left sm:min-w-[480px]">
                  <thead>
                    <tr className="bg-bg border-b border-hairline">
                      <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase w-12">Serie</th>
                      <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Peso</th>
                      <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">Reps</th>
                      <th className="px-2 sm:px-3 py-2 font-mono text-caption text-ink-2 uppercase">RIR</th>
                      <th className="hidden sm:table-cell px-3 py-2 font-mono text-caption text-ink-3 uppercase">Anterior</th>
                      <th className="px-2 sm:px-4 py-2 font-mono text-caption text-ink-2 uppercase text-center">Hecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warmup.sets.map((w, wIdx) => (
                      <tr key={`warmup-${wIdx}`} className="border-b border-hairline bg-warning/6">
                        <td className="px-2 sm:px-4 py-3">
                          <span className="font-mono text-label font-bold text-warning flex items-center gap-1">
                            🔥 W{wIdx + 1}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-2">
                          <span className="w-16 sm:w-20 inline-block text-center text-warning font-mono text-body-s">{w.weight}</span>
                        </td>
                        <td className="px-2 sm:px-3 py-2">
                          <span className="w-14 sm:w-16 inline-block text-center text-warning font-mono text-body-s">{w.reps}</span>
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-center text-warning/50 font-mono text-body-s">—</td>
                        <td className="hidden sm:table-cell px-3 py-2 text-center text-warning/50 font-mono text-caption">Warm-up</td>
                        <td className="px-2 sm:px-4 py-2 text-center text-warning/40 font-mono text-body-s">—</td>
                      </tr>
                    ))}
                    {exSets.map((setInput, sIdx) => {
                      const prev = prevEntry?.sets[sIdx];
                      const shouldRecord = we.recordVideoSet === 'all' || we.recordVideoSet === sIdx + 1;
                      // Serie siguiente anticipada (handoff): la primera sin
                      // marcar, en orden — número y casilla en oro para que el
                      // atleta sepa dónde está sin tener que contar filas.
                      const esSiguiente = !setInput.done && exSets.slice(0, sIdx).every(s => s.done);
                      return (
                        <tr
                          key={sIdx}
                          className={`border-b border-hairline transition-colors duration-(--duration-state) ${
                            setInput.done ? 'bg-accent/6' : shouldRecord ? 'bg-accent/5' : esSiguiente ? 'bg-accent/[.03]' : 'hover:bg-raised'
                          }`}
                        >
                          <td className="px-2 sm:px-4 py-3">
                            <span className={`font-mono text-label font-bold flex items-center gap-1 ${setInput.done || esSiguiente ? 'text-accent' : 'text-ink-2'}`}>
                              {String(sIdx + 1).padStart(2, '0')}
                              {shouldRecord && <Icon name="videocam" size="s" className="text-accent" label="Grabar con el móvil" />}
                            </span>
                            {(we.setGroups?.length ?? 0) > 1 && expanded[sIdx]?.label && (
                              <span className="block font-sans text-caption text-accent/70 uppercase ">{expanded[sIdx].label}</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 py-2" ref={el => { if (exIdx === 0 && sIdx === 0) registerTourTarget('training-set-editor', el); }}>
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={setInput.weight}
                              onChange={e => updateSet(exIdx, sIdx, 'weight', e.target.value)}
                              placeholder={prev && prev.weight > 0 ? String(prev.weight) : '—'}
                              disabled={setInput.done}
                              className={`w-16 sm:w-20 rounded-control border bg-field px-1 sm:px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${esSiguiente ? 'border-accent/55' : 'border-hairline'}`}
                            />
                          </td>
                          <td className="px-2 sm:px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              value={setInput.repsDone}
                              onChange={e => updateSet(exIdx, sIdx, 'repsDone', e.target.value)}
                              placeholder={prev && prev.repsDone > 0 ? String(prev.repsDone) : (expanded[sIdx]?.reps || '—')}
                              disabled={setInput.done}
                              className={`w-14 sm:w-16 rounded-control border bg-field px-1 sm:px-2 py-2 text-center font-mono text-title-s text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${esSiguiente ? 'border-accent/55' : 'border-hairline'}`}
                            />
                          </td>
                          <td className="px-2 sm:px-3 py-2">
                            {/* FALLO no es RIR 0: es un séptimo valor, no un número
                                reservado — de ahí el <select> en vez de un <input
                                type="number"> con min/max 0-5. La rueda nativa es
                                el mismo criterio que ya usa `Select` (ui/Select.tsx):
                                en móvil gana a cualquier lista propia. */}
                            <select
                              value={setInput.rir}
                              onChange={e => updateSet(exIdx, sIdx, 'rir', e.target.value)}
                              disabled={setInput.done}
                              className={`w-14 sm:w-16 appearance-none bg-field border border-hairline rounded-control px-1 sm:px-2 py-2 text-center font-mono text-title-s focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${rirClaseColor(setInput.rir)}`}
                            >
                              {RIR_OPCIONES.map(v => (
                                <option key={v} value={v}>{rirTexto(v)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="hidden sm:table-cell px-3 py-2">
                            {prev ? (
                              <span className="font-mono text-caption text-ink-3 whitespace-nowrap">
                                {prev.weight > 0 ? `${prev.weight}kg` : '—'} × {prev.repsDone > 0 ? `${prev.repsDone}r` : '—'}
                              </span>
                            ) : (
                              <span className="font-mono text-caption text-ink-3">—</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-2 text-center">
                            {/* Casilla oro con check en on-accent al completar (handoff,
                                Componentes 06) — desmarcar es tocar otra vez, sin confirmar. */}
                            <button
                              ref={el => { if (exIdx === 0 && sIdx === 0) registerTourTarget('training-first-set-row', el); }}
                              onClick={() => {
                                const markingDone = !setInput.done;
                                void haptics.light();
                                updateSet(exIdx, sIdx, 'done', markingDone);
                                if (markingDone) tutorial.markActionDone('marcar-serie');
                                if (markingDone && we.restSeconds) {
                                  setRestTimer({ totalSeconds: we.restSeconds, secondsLeft: we.restSeconds });
                                  startRestTimer(ex?.name || 'tu ejercicio', we.restSeconds).catch(() => {});
                                } else if (!markingDone) {
                                  stopRestTimer().catch(() => {});
                                }
                              }}
                              className={`mx-auto flex h-11 w-11 items-center justify-center rounded-control border transition-colors duration-(--duration-state) ${
                                setInput.done
                                  ? 'bg-accent border-accent text-on-accent'
                                  : 'border-hairline text-ink-3 hover:border-accent-line hover:text-accent'
                              }`}
                            >
                              <Icon name={setInput.done ? 'check_circle' : 'radio_button_unchecked'} size="m" filled={setInput.done} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Athlete's note for this exercise */}
              <div className="px-4 py-3 bg-bg border-t border-hairline">
                <label className="font-mono text-caption text-ink-2 uppercase tracking-wider block mb-2">Tu nota (opcional)</label>
                <textarea
                  value={exerciseNoteInputs[exIdx] || ''}
                  onChange={e => updateExerciseNote(exIdx, e.target.value)}
                  placeholder="ej. Molestia leve en el hombro derecho..."
                  rows={2}
                  className="w-full bg-bg border border-hairline rounded-control p-3 text-title-s text-white placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>

              {we.notes && (
                <div className="px-4 py-2 bg-bg border-t border-hairline">
                  <p className="font-sans text-caption text-ink-2 italic">📌 {we.notes}</p>
                </div>
              )}

              {ex?.instructions && (
                <div className="px-4 py-2 bg-bg border-t border-hairline">
                  <p className="font-mono text-caption text-ink-3 uppercase ">Descripción</p>
                  <p className="text-label text-ink-2">{ex.instructions}</p>
                </div>
              )}

              {getPersonalNote(we.exerciseId) && (
                <div className="px-4 py-2 bg-accent-bg border-t border-accent/15">
                  <p className="font-sans text-caption text-accent/70 uppercase ">Nota de tu entrenador para ti</p>
                  <p className="text-label text-accent">{getPersonalNote(we.exerciseId)}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Nota del entrenamiento completo */}
        <div className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
          <label className="font-sans text-caption text-ink-2 uppercase tracking-wider">Nota del entrenamiento (opcional)</label>
          <textarea
            value={workoutNoteInput}
            onChange={e => setWorkoutNoteInput(e.target.value)}
            placeholder="¿Cómo te sentiste hoy? Cualquier comentario general para tu entrenador..."
            rows={2}
            className="w-full bg-bg border border-hairline rounded-control p-3 text-title-s text-white placeholder-ink-2/40 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {/* Player action bar — pie fijo con degradado al fondo (handoff): el
            retroceso es un botón cuadrado y el primario es quien lleva la
            acción de verdad. */}
        <div className="fixed bottom-24 md:bottom-6 left-0 right-0 z-[var(--z-fab)] px-4 pt-8 bg-gradient-to-t from-bg via-bg/90 to-transparent">
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              size="l"
              icon="skip_next"
              label="Saltar sesión"
              onClick={async () => {
                await handleSkip(activeAssignment);
                // Saltar la sesión sí es abandonarla: aquí el borrador se va.
                borrarSesion(profile.email, activeAssignment.id);
                cerrarPlayer();
              }}
            />
            <Button
              variant="primary"
              size="l"
              icon="flag"
              loading={isFinishing}
              loadingLabel="Guardando"
              disabled={!canFinish || !!celebration}
              onClick={handleFinish}
              className="flex-1 max-w-xs"
            >
              Terminar sesión
            </Button>
          </div>
        </div>

        {/* Celebración al terminar — se muestra antes de volver a la lista;
            el atleta la despide él mismo (dismissCelebration cierra ambas cosas). */}
        {celebration && (
          <Dialog
            open
            onClose={dismissCelebration}
            size="s"
            label={celebration.isFirstEver ? 'Primera sesión registrada' : 'Entreno completado'}
            footer={(
              <Button onClick={dismissCelebration} fullWidth>Genial</Button>
            )}
          >
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 mx-auto rounded-surface bg-accent/10 border border-accent/30 flex items-center justify-center">
                <Icon name={celebration.isFirstEver ? 'celebration' : 'bolt'} size="xl" filled className="text-accent" />
              </div>
              <div>
                <h2 className="font-sans font-bold text-title-m text-white">
                  {celebration.isFirstEver ? '¡Primera sesión registrada! 💪' : '¡Entreno completado! 💪'}
                </h2>
                <p className="text-body-s text-ink-2 mt-1">
                  {celebration.isFirstEver ? 'Así se empieza — a partir de aquí, todo suma.' : 'Buen trabajo. Sigue así.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-raised rounded-surface p-3">
                  <p className="font-mono text-title-l font-bold text-white tabular-nums">{celebration.totalSets}</p>
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Series</p>
                </div>
                <div className="bg-raised rounded-surface p-3">
                  <p className="font-mono text-title-l font-bold text-white tabular-nums">{Math.round(celebration.tonnage).toLocaleString('es-ES')}</p>
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">kg movidos</p>
                </div>
              </div>
              {celebration.prs.length > 0 && (
                <div className="bg-accent/10 border border-accent/30 rounded-surface p-3 space-y-2 text-left">
                  {celebration.prs.map(pr => (
                    <p key={pr.exerciseId} className="text-label text-accent flex items-center gap-2">
                      <Icon name="military_tech" size="s" />
                      Récord en {pr.name} — {pr.newBest} kg est.
                    </p>
                  ))}
                </div>
              )}
            </div>
          </Dialog>
        )}
      </div>
    );
  }

  // ── Render: LIST + PROGRESSION ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-hairline gap-3">
        <div>
          <h1 className="font-display text-hero font-black tracking-tight text-ink uppercase">Rutinas</h1>
          <p className="text-ink-2 text-body-s mt-1">
            {visiblePendingCount > 0
              ? `${visiblePendingCount} entrenamientos pendientes`
              : 'Todo al día — sin pendientes'}
          </p>
        </div>
        {/* Week summary chip */}
        <div className="flex items-center gap-2 bg-surface border border-hairline px-4 py-2 rounded-surface">
          <Icon name="calendar_today" size="s" className="text-accent" />
          <span className="font-sans text-label text-ink-2">Esta semana:</span>
          <span className="font-mono text-body-s font-bold text-ink">{weekCompleted}/{weekAssignments.length}</span>
          <span className="font-mono text-label text-ink-2">completados</span>
        </div>
      </header>

      {/* Main tabs */}
      <SegmentedControl
        label="Vista"
        value={mainTab}
        onChange={(v) => setMainTab(v as MainTab)}
        options={[{ value: 'programa', label: 'Programa' }, { value: 'progresion', label: 'Progresión' }]}
        className="w-full sm:w-fit"
      />

      {/* ── PROGRAMA TAB ───────────────────────────────────────────────────── */}
      {mainTab === 'programa' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(['pending', 'completed', 'all'] as const).map(f => (
              <Chip key={f} selected={listFilter === f} onClick={() => setListFilter(f)}>
                {f === 'pending' ? `Pendientes (${visiblePendingCount})` :
                 f === 'completed' ? `Completados (${assignments.filter(a => a.status === 'completed').length})` :
                 `Todos (${assignments.length})`}
              </Chip>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : listFilter === 'pending' ? (
            thisWeekBlock.length === 0 && overdueBlock.length === 0 ? (
              <div className="rounded-surface border border-dashed border-accent/45 bg-surface p-10">
                <EmptyState
                  icon="fitness_center"
                  title="Sin entrenamientos pendientes"
                  description="Tu entrenador asignará sesiones próximamente."
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Esta semana — siempre primero */}
                {thisWeekBlock.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-caption uppercase font-bold tracking-widest text-accent">
                        {formatWeekLabel(curWeekStart, true)}
                      </span>
                      <div className="flex-1 h-px bg-raised" />
                      <span className="font-mono text-caption text-ink-2">
                        {thisWeekBlock.filter(a => a.status === 'completed').length}/{thisWeekBlock.length}
                      </span>
                    </div>
                    {thisWeekBlock.map(a => renderAssignmentCard(a, { isNext: a.id === nextAssignmentId }))}
                  </div>
                )}

                {/* Atrasados — semanas anteriores, todavía dentro de la semana de gracia */}
                {overdueBlock.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-caption uppercase font-bold tracking-widest text-red-300">Atrasados</span>
                      <div className="flex-1 h-px bg-raised" />
                      <span className="font-mono text-caption text-ink-2">{overdueBlock.length}</span>
                    </div>
                    {overdueBlock.map(a => renderAssignmentCard(a))}
                  </div>
                )}
              </div>
            )
          ) : filteredAssignments.length === 0 ? (
            <EmptyState
              icon="fitness_center"
              title={`Sin entrenamientos ${listFilter === 'completed' ? 'completados' : ''}`}
              description="Tu entrenador asignará sesiones próximamente."
            />
          ) : (
            (() => {
              // Group by week — used for "Completados" (history) and "Todos" (full picture,
              // including future weeks and 'perdido' items for recovery).
              const weekMap = new Map<string, WorkoutAssignment[]>();
              for (const a of filteredAssignments) {
                const ws = getWeekStart(a.date);
                if (!weekMap.has(ws)) weekMap.set(ws, []);
                weekMap.get(ws)!.push(a);
              }
              const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));
              return (
                <div className="space-y-6">
                  {weeks.map(([weekStart, items]) => {
                    const isCurWeek = weekStart === curWeekStart;
                    return (
                      <div key={weekStart} className="space-y-3">
                        {/* Week header */}
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-caption uppercase font-bold tracking-widest ${isCurWeek ? 'text-accent' : 'text-ink-2'}`}>
                            {formatWeekLabel(weekStart, isCurWeek)}
                          </span>
                          <div className="flex-1 h-px bg-raised" />
                          <span className="font-mono text-caption text-ink-2">
                            {items.filter(a => a.status === 'completed').length}/{items.length}
                          </span>
                        </div>

                        {items.map(a => renderAssignmentCard(a, { isNext: isCurWeek && a.id === nextAssignmentId }))}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── PROGRESIÓN TAB ─────────────────────────────────────────────────── */}
      {mainTab === 'progresion' && (
        <LoadHistoryPanel logs={logs} exercises={exercises} athleteId={profile.email} />
      )}
    </div>
  );
}
