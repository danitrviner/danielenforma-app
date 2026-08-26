import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Workout, WorkoutAssignment, Exercise, WorkoutLog, WorkoutEntryLog, ExercisePersonalNote } from '../types';
import LoadHistoryPanel from './LoadHistoryPanel';
import {
  getWorkoutAssignmentsForAthlete, getWorkoutsByIds, getExercises,
  createWorkoutLog, updateWorkoutAssignment, getWorkoutLogs, getExerciseNotesForAthlete,
  getCardioAssignmentsForAthlete, getMesocycles,
} from '../dbService';
import { getWeekRange, getWeekStart, MONTHS_ES, formatDate } from '../utils/trainingWeek';
import { prefillWorkoutSets } from '../utils/setPrefill';
import { mesocycleWeekNumber, resolveExerciseForWeek, diasDeCiclo } from '../utils/progression';
import { useToast } from '../hooks/useToast';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import { exerciseBestProgress, exerciseWeightTrend, ExerciseBestProgress } from '../utils/athleteMetrics';
import { epley } from '../utils/oneRepMax';
import { allTimeBestBefore } from '../utils/trainingReport';
import { Skeleton } from './ui';
import { useBotonAtras } from '../services/botonAtras';
import {
  guardarSesion, cargarSesion, borrarSesion, formaDeSesion, tieneSeriesHechas,
  limpiarSesionesCaducadas, seriesHechasEnBorrador,
} from '../utils/sesionEnCurso';
import { haptics } from '../services/haptics';
import { Badge, BadgeTone, Button, Icon, SegmentedControl, Chip, EmptyState } from './ui';
import WorkoutSessionPlayer, { SessionCelebration } from './training/WorkoutSessionPlayer';
import { SetInput, nuevaSerieVacia } from './training/setInput';

interface TrainingScreenProps {
  profile: UserProfile;
}

// ── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'programa' | 'progresion';

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrainingScreen({ profile }: TrainingScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const tutorial = useTutorialEngine();

  // Objetivos del tour dentro de la tabla de ejercicios (solo el primer
  // ejercicio/primera fila importa). `useTourTarget` da una referencia
  // ESTABLE (useCallback) — llamarlo aquí, fuera del .map(), es obligatorio:
  // una función inline nueva en cada render (`el => registerTourTarget(...)`)
  // hace que React reenganche el ref en CADA render, y cada reenganche
  // notifica al registro y dispara un re-render → bucle infinito ("Maximum
  // update depth exceeded", ver el comentario en TourTargetContext.tsx).
  const videoTargetRef = useTourTarget('training-exercise-video');
  const setEditorTargetRef = useTourTarget('training-set-editor');
  const firstSetRowTargetRef = useTourTarget('training-first-set-row');
  const [mainTab, setMainTab] = useState<MainTab>('programa');

  // Data
  const assignmentsKey = ['workoutAssignmentsForAthlete', profile.userId] as const;
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
  });
  // Solo las rutinas que las asignaciones de ESTE atleta referencian, no la
  // colección entera de todos los atletas — antes `getWorkouts()` se bajaba
  // las rutinas de todos los clientes al móvil de cada atleta.
  const workoutIds = useMemo(() => Array.from(new Set(assignments.map(a => a.workoutId))), [assignments]);
  const { data: workouts = [], isPending: loadingWorkoutsQuery } = useQuery({
    queryKey: ['workoutsByIds', workoutIds],
    queryFn: () => getWorkoutsByIds(workoutIds),
    enabled: workoutIds.length > 0,
  });
  // Con `enabled: false` la consulta se queda en `isPending` para siempre —
  // sin este `&&`, un atleta sin asignaciones vería el esqueleto de carga sin
  // fin en vez del estado vacío.
  const loadingWorkouts = workoutIds.length > 0 && loadingWorkoutsQuery;
  // Sembrar el catálogo de ejercicios es mantenimiento del coach (escribe en
  // `exercises`, colección de solo-coach) — ya se hace desde ExerciseLibraryScreen,
  // WorkoutsScreen y ClientHub. Aquí, en la pantalla del atleta, solo se lee:
  // llamar a seedExercisesIfEmpty() en una sesión de atleta encendía el banner
  // de "sin permiso para guardar" sin que el atleta tocara nada.
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
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
  // Solo para el aviso informativo de cierre de ejercicio ("hoy toca cardio
  // después") — no dispara ninguna navegación, así que basta con la misma
  // query que ya usan HomeScreen/CardioScreen, sin nada nuevo del lado del
  // backend.
  const { data: cardioAssignments = [] } = useQuery({
    // Misma clave que HomeScreen/CardioScreen/useCardioSession — antes llevaba
    // el sufijo "ForAthlete" y react-query la trataba como una consulta
    // aparte, así que esta pantalla pagaba su propia lectura en vez de
    // compartir la de las demás.
    queryKey: ['cardioAssignments', profile.email],
    queryFn: () => getCardioAssignmentsForAthlete(profile.email),
  });
  // Solo para resolver la progresión por semanas (Bloque F) al abrir una sesión — saber
  // en qué semana del mesociclo cae `activeAssignment.date` requiere el `startDate` del
  // Mesocycle, que hasta ahora esta pantalla no necesitaba cargar.
  const { data: mesocycles = [] } = useQuery({
    queryKey: ['mesocycles', profile.email],
    queryFn: () => getMesocycles(profile.email),
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
  // No necesita re-render propio: solo lo lee el autoguardado, y cambia junto
  // con activeWorkout (mismo ciclo de vida que el resto del estado del player).
  const formaPrescritaRef = useRef<number[]>([]);

  // 05-5. Barrido de borradores de sesión caducados: una sesión que se abre y
  // nunca se termina deja su clave, y sin esto se acumularían una por semana.
  useEffect(() => { limpiarSesionesCaducadas(profile.email); }, [profile.email]);

  // Sesiones a medias, por assignmentId → nº de series ya marcadas (Dani,
  // 26-08). El borrador se guardaba desde 05-5 y se restauraba al reabrir la
  // sesión, pero era invisible desde fuera: la tarjeta seguía diciendo
  // «Empezar», así que nada te contaba que tenías medio entreno guardado
  // esperando. Se recalcula también al cerrar el player (`activeAssignment`
  // en las dependencias) para que al volver a la lista el contador esté al
  // día sin recargar la pantalla.
  const [borradores, setBorradores] = useState<Record<string, number>>({});
  useEffect(() => {
    const mapa: Record<string, number> = {};
    for (const a of assignments) {
      const hechas = seriesHechasEnBorrador(profile.email, a.id);
      if (hechas > 0) mapa[a.id] = hechas;
    }
    setBorradores(mapa);
  }, [assignments, profile.email, activeAssignment]);

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

  // Solo la CardioAssignment PUNTUAL (con `date`) del mismo día del entreno —
  // las recurrentes por `timesPerWeek` no se pueden atribuir a un día exacto
  // sin más lógica, así que se dejan fuera a propósito (ver el plan).
  const sameDayCardio = activeAssignment
    ? cardioAssignments.find(c => c.active && c.date === activeAssignment.date) ?? null
    : null;

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
    const baseWorkout = getWorkout(assignment.workoutId);
    if (!baseWorkout) return;

    // Progresión por semanas (Bloque F): la rutina base es una sola plantilla
    // reutilizada en todas las semanas del mesociclo — aquí se resuelve cuál es la
    // prescripción EFECTIVA para la semana en la que cae esta fecha, sin tocar la
    // plantilla guardada.
    const meso = assignment.mesocycleId ? mesocycles.find(m => m.id === assignment.mesocycleId) : undefined;
    // Bloque H2.2 — con qué datos evalúan sus condiciones las reglas
    // condicionales ("+1 serie solo si..."). Solo adherencia de entrenamiento
    // y RIR medio son evaluables aquí (esta pantalla no carga dieta ni peso);
    // una condición que dependa de esas dos métricas simplemente no se aplica
    // desde la sesión del atleta — mismo comportamiento seguro que sin datos.
    const conditionCtx = { today: new Date().toISOString().split('T')[0], workoutAssignments: assignments, workoutLogs: logs, bodyweightLogs: [] };
    const wo: Workout = meso
      ? {
          ...baseWorkout,
          exercises: baseWorkout.exercises.map(we =>
            resolveExerciseForWeek(we, mesocycleWeekNumber(meso.startDate, assignment.date, diasDeCiclo(meso.daysPerWeek)), conditionCtx)
          ),
        }
      : baseWorkout;

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
    // La forma PRESCRITA (sin las filas de dropset/myoreps que el atleta
    // pueda añadir después) — se guarda con cada autoguardado para poder
    // distinguir "el coach cambió la rutina" de "yo añadí una bajada".
    formaPrescritaRef.current = formaDeSesion(prerrellenadas);

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
  };

  const updateSet = (exIdx: number, sIdx: number, field: keyof SetInput, value: string | boolean) => {
    setPlayerSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx][sIdx] = { ...next[exIdx][sIdx], [field]: value };
      return next;
    });
  };

  /** Añade una bajada (dropset) o miniserie (myoreps) suelta durante la
   * sesión — mismo `SetInput` que cualquier otra fila, sin campo nuevo en el
   * modelo de datos (decisión del plan: "Dropset/myoreps: solo visual, dato
   * simple"). `sesionEnCurso.ts` ya sabe tolerar que el borrador tenga más
   * series por ejercicio que el prerelleno recién calculado. */
  const addSetRow = (exIdx: number) => {
    setPlayerSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx] = [...(next[exIdx] || []), nuevaSerieVacia()];
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
      formaPrescrita:    formaPrescritaRef.current,
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

      // El entrenamiento ya está a salvo en `workoutLogs` en este punto. Marcar
      // la asignación como completada es una segunda escritura independiente
      // — si falla, el atleta no debe pensar que ha perdido la sesión (bug
      // real: antes las dos escrituras compartían el mismo mensaje de error,
      // así que un fallo aquí decía "no se pudo guardar el entrenamiento"
      // aunque el entreno sí estuviera guardado).
      let assignmentUpdateFailed = false;
      try {
        await updateWorkoutAssignment(activeAssignment.id, { status: 'completed' });
        queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev => prev?.map(a =>
          a.id === activeAssignment.id ? { ...a, status: 'completed' } : a
        ));
      } catch (err) {
        console.error('No se pudo marcar la asignación como completada:', err);
        assignmentUpdateFailed = true;
      }

      queryClient.setQueryData<WorkoutLog[]>(logsKey, prev => [...(prev ?? []), newLog]);
      // 05-5. El entrenamiento ya está en Firestore: el borrador local sobra.
      // Va después de las escrituras y no antes, para que un fallo al
      // guardar deje el trabajo del atleta donde estaba.
      borrarSesion(profile.email, activeAssignment.id);
      void haptics.success();
      if (assignmentUpdateFailed) {
        showToast('Entreno guardado, pero no se pudo marcar como completado.');
      }
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
    // Series ya marcadas en el borrador local de esta sesión (0 = no hay nada
    // a medias). Solo se muestra en las sesiones que todavía se pueden hacer:
    // en una completada el dato ya está en Firestore y el borrador sobra.
    const seriesAMedias = canAct ? (borradores[a.id] ?? 0) : 0;
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
              {seriesAMedias > 0 && (
                <Badge tone="warning" icon="pause_circle">
                  Sin terminar · {seriesAMedias} serie{seriesAMedias !== 1 ? 's' : ''}
                </Badge>
              )}
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
                <Button
                  variant="primary" size="s"
                  icon={seriesAMedias > 0 ? 'play_arrow' : 'play_circle'}
                  onClick={() => openPlayer(a)}
                >
                  {seriesAMedias > 0 ? 'Continuar' : a.status === 'perdido' ? 'Recuperar' : 'Empezar'}
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
    return (
      <WorkoutSessionPlayer
        profile={profile}
        activeAssignment={activeAssignment}
        activeWorkout={activeWorkout}
        playerSets={playerSets}
        updateSet={updateSet}
        addSetRow={addSetRow}
        prevEntries={prevEntries}
        exerciseNoteInputs={exerciseNoteInputs}
        updateExerciseNote={updateExerciseNote}
        getExercise={getExercise}
        getPersonalNote={getPersonalNote}
        logs={logs}
        exerciseProgressById={exerciseProgressById}
        handleFinish={handleFinish}
        isFinishing={isFinishing}
        canFinish={canFinish}
        celebration={celebration}
        dismissCelebration={dismissCelebration}
        cerrarPlayer={cerrarPlayer}
        onSkipSession={async () => {
          await handleSkip(activeAssignment);
          // Saltar la sesión sí es abandonarla: aquí el borrador se va.
          borrarSesion(profile.email, activeAssignment.id);
          cerrarPlayer();
        }}
        sameDayCardio={sameDayCardio}
        videoTargetRef={videoTargetRef}
        setEditorTargetRef={setEditorTargetRef}
        firstSetRowTargetRef={firstSetRowTargetRef}
        onMarkActionDone={() => tutorial.markActionDone('marcar-serie')}
      />
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
