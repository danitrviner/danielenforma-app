import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Workout, WorkoutAssignment, Exercise, WorkoutLog, WorkoutEntryLog, ExercisePersonalNote } from '../types';
import LoadHistoryPanel from './LoadHistoryPanel';
import {
  getWorkoutAssignmentsForAthlete, getWorkoutsByIds, getExercises,
  createWorkoutLog, updateWorkoutAssignment, getWorkoutLogs, getExerciseNotesForAthlete,
  getCardioAssignmentsForAthlete, getMesocycles,
} from '../dbService';
import { MONTHS_ES, formatDate, hoyIsoLocal } from '../utils/trainingWeek';
import { bloquesDelCiclo, bloqueActual, BloqueDelCiclo, DiaDelCiclo, EstadoDeDia } from '../utils/cicloDelAtleta';
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
  guardarSesion, cargarSesion, borrarSesion, borrarDescanso, formaDeSesion, tieneSeriesHechas,
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

function diaCorto(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]}`;
}

/** «Esta semana · 6 sep – 11 sep» — el rango REAL de la vuelta, no lunes-domingo. */
function etiquetaBloque(b: BloqueDelCiclo, esActual: boolean): string {
  const rango = `${diaCorto(b.primeraFecha)} – ${diaCorto(b.ultimaFecha)}`;
  return esActual ? `Esta semana · ${rango}` : rango;
}

// Un día del ciclo tiene un solo estado y un solo color: verde hecho, amarillo
// el de hoy, rojo el que se pasó, gris el que aún no toca. Antes el color salía
// del `status` de Firestore, que no distingue "pendiente de mañana" de
// "pendiente de anteayer" — las dos se pintaban de amarillo.
const ESTADO_LABEL: Record<EstadoDeDia, string> = {
  completado: 'Completado',
  saltado:    'Saltado',
  hoy:        'Hoy',
  perdido:    'No hecho',
  pendiente:  'Pendiente',
};

const ESTADO_TONE: Record<EstadoDeDia, BadgeTone> = {
  completado: 'success',
  saltado:    'neutral',
  hoy:        'accent',
  perdido:    'danger',
  pendiente:  'neutral',
};

const ESTADO_ICONO: Record<EstadoDeDia, string> = {
  completado: 'check_circle',
  saltado:    'skip_next',
  hoy:        'bolt',
  perdido:    'event_busy',
  pendiente:  'fitness_center',
};

const ESTADO_CIRCULO: Record<EstadoDeDia, string> = {
  completado: 'bg-success/15 text-success',
  saltado:    'bg-raised text-ink-2',
  hoy:        'bg-accent/15 text-accent',
  perdido:    'bg-danger/10 text-danger',
  pendiente:  'bg-raised text-ink-2',
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
    queryFn: () => getWorkoutAssignmentsForAthlete({ uid: profile.userId, email: profile.email }),
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
  const { data: mesocycles = [], isPending: loadingMesocycles } = useQuery({
    queryKey: ['mesocycles', profile.email],
    queryFn: () => getMesocycles(profile.email),
  });
  // Los mesociclos entran en el `loading` porque son los que dicen dónde
  // empieza y acaba la vuelta: sin ellos la lista se agruparía un instante por
  // semanas de calendario y se recolocaría sola al llegar la consulta.
  const loading = loadingAssignments || loadingWorkouts || loadingExercises || loadingLogs || loadingNotes || loadingMesocycles;

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
  // Un borrador caduca a las 36h (sesionEnCurso.ts) sin que cambie nada de lo
  // anterior — si la lista se queda abierta en primer plano más tiempo que
  // eso, el badge se quedaría clavado diciendo "Continuar" sobre un borrador
  // que `cargarSesion` ya descartaría en silencio al pulsarlo. Un tick cada
  // 10 min basta para que el badge se autocorrija sin depender de que el
  // atleta navegue a otro sitio y vuelva.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const borradores = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const a of assignments) {
      const hechas = seriesHechasEnBorrador(profile.email, a.id);
      if (hechas > 0) mapa[a.id] = hechas;
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, profile.email, activeAssignment, tick]);

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

  // La fecha LOCAL, no la de `toISOString()` (que es UTC): entre medianoche y
  // las 2 de la mañana en España el UTC va un día por detrás, y con él se
  // pintaba de rojo la sesión de hoy y de amarillo la de ayer.
  const today = hoyIsoLocal();

  const sortedAssignments = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  const filteredAssignments = listFilter === 'all'
    ? sortedAssignments
    : sortedAssignments.filter(a => a.status === listFilter);

  // La vuelta del microciclo que el atleta está viviendo, del Día 1 al Día N y
  // en ese orden. Sustituye al par «Esta semana (lunes-domingo) + Atrasados»:
  // la semana natural partía el ciclo por la mitad (Día 2…Día 6, Día 1, Día 2)
  // y los que se pasaban se acumulaban en un cajón al final. Ahora cada día
  // sale en su sitio con su color, y lo de vueltas anteriores no se arrastra.
  const bloques = useMemo(
    () => bloquesDelCiclo(assignments, workouts, mesocycles, today),
    [assignments, workouts, mesocycles, today],
  );
  const bloqueHoy = useMemo(() => bloqueActual(bloques, today), [bloques, today]);
  const diasDelBloque = bloqueHoy?.dias ?? [];

  // El destacado es el de HOY; si hoy es descanso (o ya está hecho), el
  // siguiente que quede por hacer — nunca uno del pasado, que ya sale en rojo.
  const destacadoId =
    diasDelBloque.find(d => d.estado === 'hoy')?.assignment.id
    ?? diasDelBloque.find(d => d.estado === 'pendiente')?.assignment.id
    ?? null;

  const visiblePendingCount = diasDelBloque.filter(d => d.estado === 'hoy' || d.estado === 'pendiente' || d.estado === 'perdido').length;
  const bloqueCompletados = diasDelBloque.filter(d => d.estado === 'completado').length;

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

  // Solo se copia el array del ejercicio TOCADO, no los de todos — antes
  // `prev.map(ex => [...ex])` clonaba las N filas de series en cada tecla,
  // así que `exSets` cambiaba de referencia para TODOS los ejercicios de la
  // sesión aunque solo uno tuviera un cambio real. Con ExerciseCard en
  // React.memo (ver WorkoutSessionPlayer.tsx) eso habría invalidado el memo
  // de cada tarjeta cada vez que se marcaba una sola serie — el caso más
  // frecuente de toda la pantalla.
  const updateSet = (exIdx: number, sIdx: number, field: keyof SetInput, value: string | boolean) => {
    setPlayerSets(prev => {
      const next = [...prev];
      next[exIdx] = [...next[exIdx]];
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
      const next = [...prev];
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
      // Y el descanso con él: si no, reabrir la rutina resucitaría el
      // cronómetro de la serie que se acaba de guardar.
      borrarDescanso(profile.email, activeAssignment.id);
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

  // ── Tarjeta de un día del ciclo (la usan tanto la vuelta en curso como el
  // histórico por vueltas) ───────────────────────────────────────────────────
  const renderAssignmentCard = (dia: DiaDelCiclo, opts?: { destacado?: boolean }) => {
    const a = dia.assignment;
    const estado = dia.estado;
    const wo = getWorkout(a.workoutId);
    // Destacado = el día que toca ahora. Se pinta con el marco dorado, y solo
    // uno por lista: los demás son verdes, rojos o grises según su estado.
    const isNext = opts?.destacado ?? false;
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
            : estado === 'perdido'
              ? 'rounded-surface bg-surface border-danger/40'
              : 'rounded-surface bg-surface border-hairline'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-surface flex items-center justify-center flex-shrink-0 ${
            isNext && estado === 'pendiente' ? 'bg-accent/15 text-accent' : ESTADO_CIRCULO[estado]
          }`}>
            <Icon
              name={isNext && estado === 'pendiente' ? 'bolt' : ESTADO_ICONO[estado]}
              size="m"
              filled
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-sans font-bold text-ink text-title-s">{wo?.name || 'Rutina'}</p>
              {isNext && estado === 'pendiente' && <Badge tone="accent">Siguiente</Badge>}
              {seriesAMedias > 0 && (
                <Badge tone="warning" icon="pause_circle">
                  Sin terminar · {seriesAMedias} serie{seriesAMedias !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="font-mono text-label text-ink-2 ">
              {formatDate(a.date)} · {wo ? `${wo.exercises.length} ejercicio${wo.exercises.length !== 1 ? 's' : ''}` : '—'}
            </p>
            {/* Nota del coach para ESE día (día señalado: AMRAP, toma de marcas,
                subida obligatoria). Va en la tarjeta y no dentro del player para
                que se vea ANTES de empezar, que es cuando cambia lo que hace. */}
            {a.note && (
              <div className="flex gap-2 items-start mt-1 bg-accent-bg border border-accent-line rounded-surface p-2">
                <Icon name="push_pin" size="s" filled className="text-accent mt-0.5 shrink-0" />
                <p className="text-caption text-ink">{a.note}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <Badge tone={ESTADO_TONE[estado]}>{ESTADO_LABEL[estado]}</Badge>
          {canAct && (
            <>
              <Button variant="secondary" size="s" icon="skip_next" onClick={() => handleSkip(a)}>Saltar</Button>
              {wo && (
                <Button
                  variant="primary" size="s"
                  icon={seriesAMedias > 0 ? 'play_arrow' : 'play_circle'}
                  onClick={() => openPlayer(a)}
                >
                  {seriesAMedias > 0 ? 'Continuar' : estado === 'perdido' ? 'Recuperar' : 'Empezar'}
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
          borrarDescanso(profile.email, activeAssignment.id);
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
          <span className="font-mono text-body-s font-bold text-ink">{bloqueCompletados}/{diasDelBloque.length}</span>
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
                {f === 'pending' ? `Esta semana (${visiblePendingCount})` :
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
            diasDelBloque.length === 0 ? (
              <div className="rounded-surface border border-dashed border-accent/45 bg-surface p-10">
                <EmptyState
                  icon="fitness_center"
                  title="Sin entrenamientos pendientes"
                  description="Tu entrenador asignará sesiones próximamente."
                />
              </div>
            ) : (
              /* La vuelta en curso, del Día 1 al Día N y en ese orden. Sin bloque
                 «Atrasados» al final: el que se pasó sale en su sitio, en rojo. */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-caption uppercase font-bold tracking-widest text-accent">
                    {bloqueHoy ? etiquetaBloque(bloqueHoy, true) : 'Esta semana'}
                  </span>
                  <div className="flex-1 h-px bg-raised" />
                  <span className="font-mono text-caption text-ink-2">
                    {bloqueCompletados}/{diasDelBloque.length}
                  </span>
                </div>
                {diasDelBloque.map(d => renderAssignmentCard(d, { destacado: d.assignment.id === destacadoId }))}
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
              // Histórico de «Completados» y «Todos»: las mismas vueltas del
              // microciclo que la lista de arriba —no semanas de calendario—,
              // para que el Día 1 siga siendo el primero también aquí.
              const bloquesFiltrados = bloquesDelCiclo(filteredAssignments, workouts, mesocycles, today);
              return (
                <div className="space-y-6">
                  {bloquesFiltrados.map(b => {
                    const esActual = b.clave === bloqueHoy?.clave;
                    return (
                      <div key={b.clave} className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-caption uppercase font-bold tracking-widest ${esActual ? 'text-accent' : 'text-ink-2'}`}>
                            {etiquetaBloque(b, esActual)}
                          </span>
                          <div className="flex-1 h-px bg-raised" />
                          <span className="font-mono text-caption text-ink-2">
                            {b.dias.filter(d => d.estado === 'completado').length}/{b.dias.length}
                          </span>
                        </div>

                        {b.dias.map(d => renderAssignmentCard(d, { destacado: esActual && d.assignment.id === destacadoId }))}
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
