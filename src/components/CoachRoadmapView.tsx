import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Roadmap, WeeklyProgressionRule, MesocycleTemplate, WeekDay, Mesocycle } from '../types';
import {
  getMesocycles, getNutritionProgram, getRoadmap, saveRoadmap, getUserProfileByEmail,
  getStepsForAthlete, getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete,
  getDietsForAthlete, getWorkoutAssignments, updateWorkoutAssignment, getTasksForAthlete, getWorkouts, createTask, updateTask,
  updateWorkout, updateMesocycle, saveNutritionProgram,
  getCardioSessionsForAthlete, getProgressPhotos, getAssignmentsForAthlete, getQuestionnairesByCoach,
  getCoachDayNotesForAthlete, saveCoachDayNote,
  getMesocycleTemplates, createMesocycle, getAthleteDietConfig, saveAthleteDietConfig,
  assignQuestionnaire, createNotificationDeduped,
} from '../dbService';
import { planificarPlantillaMeso, insertarFaseNutricion, alternarRefeeds, FaseNueva } from '../utils/accionesCalendario';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import PlanPhaseEditor from './roadmap/PlanPhaseEditor';
import ChallengeManager from './roadmap/ChallengeManager';
import LevelLadderEditor from './roadmap/LevelLadderEditor';
import RoadmapCalendario, { DestinoPlan } from './roadmap/calendario/RoadmapCalendario';
import { PhaseData } from '../utils/planPhase';
import { LadderData } from '../utils/levelLadder';
import { ChallengeData } from '../utils/weeklyChallenge';
import { Icon, Tabs } from './ui';

interface Props {
  athleteEmail: string;
  coachId: string;
  /** Navegación real por pestañas del cliente, inyectada por ClientHub. */
  onGoToClientTab?: (tab: DestinoPlan) => void;
}

type SubTab = 'fases' | 'retos' | 'niveles' | 'calendario';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'fases', label: 'Fases', icon: 'route' },
  { id: 'retos', label: 'Retos', icon: 'flag' },
  { id: 'niveles', label: 'Niveles', icon: 'military_tech' },
  { id: 'calendario', label: 'Calendario', icon: 'calendar_month' },
];

export default function CoachRoadmapView({ athleteEmail, coachId, onGoToClientTab }: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('fases');
  const { logs: bodyweightLogs } = useAthleteWeight(athleteEmail);

  const roadmapKey = ['roadmap', athleteEmail] as const;

  const { data: profile, isPending: loadingProfile } = useQuery({
    queryKey: ['userProfileByEmail', athleteEmail],
    queryFn: () => getUserProfileByEmail(athleteEmail),
  });
  const { data: mesocycles = [], isPending: loadingMesos } = useQuery({
    queryKey: ['mesocycles', athleteEmail],
    queryFn: () => getMesocycles(athleteEmail),
  });
  const { data: nutritionProgram = null, isPending: loadingNutri } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { data: roadmap, isPending: loadingRoadmap } = useQuery({
    queryKey: roadmapKey,
    queryFn: () => getRoadmap(athleteEmail),
  });
  const { data: stepLogs = [], isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: workoutLogs = [], isPending: loadingWorkoutLogs } = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail),
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });
  // Solo para derivar los marcadores de subida de volumen (Bloque F → H) del carril
  // de Entrenamiento — las reglas `weeklyProgression` ya viven en estos Workout.
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  const { data: dietCompletionLogs = [], isPending: loadingDcl } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  // Carril "Revisiones" del timeline (Bloque H) — se deriva de las tareas del
  // atleta, no se guarda aparte: programar un check-in/cuestionario ya lo pone
  // aquí solo.
  const { data: tasks = [], isPending: loadingTasks } = useQuery({
    queryKey: ['tasksForAthlete', athleteEmail],
    queryFn: () => getTasksForAthlete(athleteEmail),
  });
  const { data: diets = [], isPending: loadingDiets } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const uid = profile?.userId;
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignments', uid],
    queryFn: () => getWorkoutAssignments({ uid: uid!, email: athleteEmail }),
    enabled: !!uid,
  });

  // ── Roadmap → Calendario (nivel Mes/Día) — mismas claves de caché que ya
  // usan otras pantallas (ClientCardioPanel, ClientHub), para no duplicar
  // lecturas del mismo dato.
  const { data: cardioSessions = [], isPending: loadingCardio } = useQuery({
    queryKey: ['cardioSessions', athleteEmail],
    queryFn: () => getCardioSessionsForAthlete(athleteEmail),
  });
  const { data: progressPhotos = [], isPending: loadingPhotos } = useQuery({
    queryKey: ['progressPhotos', athleteEmail],
    queryFn: () => getProgressPhotos(athleteEmail),
  });
  const { data: questionnaireAssignments = [], isPending: loadingQAssignments } = useQuery({
    queryKey: ['assignmentsForAthlete', athleteEmail],
    queryFn: () => getAssignmentsForAthlete(athleteEmail),
  });
  const { data: questionnaires = [], isPending: loadingQuestionnaires } = useQuery({
    queryKey: ['questionnairesByCoach', coachId],
    queryFn: () => getQuestionnairesByCoach(coachId),
  });
  // Plantillas de mesociclos del coach, para «Importar bloque» del hub de
  // acciones. Fuera del `loading` general y con la misma clave que usa
  // MesocycleManager: es un dato secundario, no debe retrasar la pantalla.
  const { data: mesocycleTemplates = [], isPending: cargandoPlantillas } = useQuery({
    queryKey: ['mesocycleTemplates', coachId],
    queryFn: () => getMesocycleTemplates(coachId),
    enabled: subTab === 'calendario',
  });

  const coachDayNotesKey = ['coachDayNotes', athleteEmail] as const;
  const { data: coachDayNotes = [], isPending: loadingDayNotes } = useQuery({
    queryKey: coachDayNotesKey,
    queryFn: () => getCoachDayNotesForAthlete(athleteEmail),
  });

  const initialWeight = profile?.actualWeight ?? profile?.initialWeight;
  const loading = loadingProfile || loadingMesos || loadingNutri || loadingRoadmap
    || loadingSteps || loadingWorkoutLogs || loadingExercises || loadingWorkouts || loadingDcl || loadingDiets
    || loadingTasks || (!!uid && loadingAssignments)
    || loadingCardio || loadingPhotos || loadingQAssignments || loadingQuestionnaires || loadingDayNotes;

  async function handleSave(updated: Roadmap) {
    await saveRoadmap(updated);
    queryClient.setQueryData(roadmapKey, updated);
  }

  const tasksKey = ['tasksForAthlete', athleteEmail] as const;
  async function handleCreateReview(input: { title: string; date: string; type: 'revision' | 'cuestionario' | 'foto' }) {
    await createTask({
      athleteId: athleteEmail, type: input.type, title: input.title, dueDate: input.date,
      status: 'pending', createdBy: 'coach', createdAt: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: tasksKey });
  }

  async function handleMoveReview(taskId: string, newDate: string) {
    queryClient.setQueryData<typeof tasks>(tasksKey, prev =>
      prev?.map(t => t.id === taskId ? { ...t, dueDate: newDate } : t));
    await updateTask(taskId, { dueDate: newDate });
    queryClient.invalidateQueries({ queryKey: tasksKey });
  }

  // Panel "+ Evento" (Pantalla 2) → subida de volumen: añade la regla al
  // ejercicio dentro del Workout ya guardado — no crea un Workout nuevo, sigue
  // siendo la misma plantilla reutilizada en todas las semanas del mesociclo.
  async function handleAddVolumeRule(workoutId: string, exerciseId: string, rule: WeeklyProgressionRule) {
    const wo = workouts.find(w => w.id === workoutId);
    if (!wo) return;
    const updatedExercises = wo.exercises.map(we =>
      we.exerciseId === exerciseId ? { ...we, weeklyProgression: [...(we.weeklyProgression ?? []), rule] } : we);
    await updateWorkout(workoutId, { exercises: updatedExercises });
    queryClient.invalidateQueries({ queryKey: ['workouts'] });
  }

  // Arrastrar un marcador de subida de volumen a otra semana (Pantalla 1 y
  // Nivel Mes del calendario) — reescribe el `atWeek` de la regla que lo
  // originó, la regla misma no cambia.
  async function handleMoveVolumeRule(workoutId: string, exerciseId: string, oldAtWeek: number, newAtWeek: number) {
    const wo = workouts.find(w => w.id === workoutId);
    if (!wo) return;
    const updatedExercises = wo.exercises.map(we =>
      we.exerciseId === exerciseId
        ? { ...we, weeklyProgression: (we.weeklyProgression ?? []).map(r => r.atWeek === oldAtWeek ? { ...r, atWeek: newAtWeek } : r) }
        : we);
    await updateWorkout(workoutId, { exercises: updatedExercises });
    queryClient.invalidateQueries({ queryKey: ['workouts'] });
  }

  // Arrastrar el borde derecho de una barra (Pantalla 1) — alarga/acorta el
  // mesociclo o la fase de nutrición. Optimista: la UI ya mostró la duración
  // en curso durante el arrastre, aquí solo se persiste.
  const mesosKey = ['mesocycles', athleteEmail] as const;
  async function handleResizeMesocycle(id: string, weeks: number) {
    queryClient.setQueryData<typeof mesocycles>(mesosKey, prev =>
      prev?.map(m => m.id === id ? { ...m, weeks } : m));
    await updateMesocycle(id, { weeks });
    queryClient.invalidateQueries({ queryKey: mesosKey });
  }

  const nutriKey = ['nutritionProgram', athleteEmail] as const;
  async function handleResizeNutritionPhase(phaseId: string, weeks: number) {
    if (!nutritionProgram) return;
    const updated = { ...nutritionProgram, phases: nutritionProgram.phases.map(ph => ph.id === phaseId ? { ...ph, weeks } : ph) };
    queryClient.setQueryData(nutriKey, updated);
    await saveNutritionProgram(updated);
    queryClient.invalidateQueries({ queryKey: nutriKey });
  }

  // ── Handlers propios del Roadmap → Calendario (Nivel Mes/Día) ──────────────
  const assignmentsKey = ['workoutAssignments', uid] as const;
  async function handleMoveWorkoutAssignment(assignmentId: string, newDate: string) {
    queryClient.setQueryData<typeof assignments>(assignmentsKey, prev =>
      prev?.map(a => a.id === assignmentId ? { ...a, date: newDate } : a));
    await updateWorkoutAssignment(assignmentId, { date: newDate });
    queryClient.invalidateQueries({ queryKey: assignmentsKey });
  }

  async function handleSaveDayNote(date: string, text: string) {
    if (!text.trim()) return;
    await saveCoachDayNote(athleteEmail, date, text.trim());
    queryClient.invalidateQueries({ queryKey: coachDayNotesKey });
  }

  const questionnaireAssignmentsKey = ['assignmentsForAthlete', athleteEmail] as const;
  const questionnairesKey = ['questionnairesByCoach', coachId] as const;
  // "Aplicar al bloque" ya creó los cuestionarios/asignaciones reales (lo hace
  // el propio modal, contra dbService directamente). Aquí: refrescar la caché
  // y persistir cada ocurrencia como hito del roadmap, para que aparezcan en
  // la rejilla sin tener que volver a expandir el schedule cada vez.
  async function handleApplyTemplate(ocurrencias: { titulo: string; fecha: string }[]) {
    queryClient.invalidateQueries({ queryKey: questionnaireAssignmentsKey });
    queryClient.invalidateQueries({ queryKey: questionnairesKey });
    if (!roadmap) return;
    const nuevos = ocurrencias.map((o, i) => ({
      id: `qtpl_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      title: o.titulo, type: 'hito' as const, lane: 'general' as const,
      targetDate: o.fecha, status: 'pendiente' as const,
    }));
    await handleSave({ ...roadmap, items: [...roadmap.items, ...nuevos] });
  }

  // ── Hub «Programar aquí» del sheet de día ────────────────────────────────
  const mesocyclesKey = ['mesocycles', athleteEmail] as const;

  /** Instancia una plantilla de mesociclos empezando en el día elegido (no en
   *  hoy, que es lo único que sabía hacer el picker de MesocycleManager). */
  async function handleImportarBloque(tpl: MesocycleTemplate, inicio: string) {
    const { mesociclos, revisiones } = planificarPlantillaMeso(
      tpl, athleteEmail, inicio, mesocycles.length + 1, `prog_${Date.now()}`,
    );
    const creados: Mesocycle[] = [];
    for (const m of mesociclos) creados.push(await createMesocycle(m));
    await Promise.all(revisiones.map(r => createTask(r)));
    queryClient.setQueryData<Mesocycle[]>(mesocyclesKey, prev => [...(prev ?? []), ...creados]);
    queryClient.invalidateQueries({ queryKey: tasksKey });
  }

  /** El plan de comidas va por día de la semana, no por fecha: programar un
   *  menú «este jueves» es fijarlo para todos los jueves. El sheet lo dice. */
  async function handleProgramarMenu(dietId: string, dia: WeekDay) {
    const config = await getAthleteDietConfig(athleteEmail);
    await saveAthleteDietConfig({
      ...config,
      weeklySchedule: { ...(config.weeklySchedule ?? {}), [dia]: dietId },
      activeDietIds: config.activeDietIds.includes(dietId) ? config.activeDietIds : [...config.activeDietIds, dietId],
    });
    queryClient.invalidateQueries({ queryKey: ['athleteDietConfig', athleteEmail] });
  }

  /** Devuelve el día en que la fase empieza DE VERDAD, para que el sheet lo
   *  diga en vez de que el coach lo descubra después en el calendario. */
  async function handleEventoNutricion(fecha: string, fase: FaseNueva): Promise<string> {
    if (!nutritionProgram) throw new Error('sin programa de nutrición');
    const { programa, inicioReal } = insertarFaseNutricion(nutritionProgram, fecha, fase);
    await saveNutritionProgram(programa);
    queryClient.setQueryData(['nutritionProgram', athleteEmail], programa);
    return inicioReal;
  }

  /** Días de recarga sueltos — no parten la fase, solo marcan el día. */
  async function handleMarcarRecargas(fechas: string[], activar: boolean, opciones: { dietId?: string; note?: string }) {
    if (!nutritionProgram) throw new Error('sin programa de nutrición');
    const actualizado = alternarRefeeds(nutritionProgram, fechas, activar, opciones);
    await saveNutritionProgram(actualizado);
    queryClient.setQueryData(['nutritionProgram', athleteEmail], actualizado);
  }

  async function handleAsignarCuestionario(questionnaireId: string, fecha: string) {
    await assignQuestionnaire({
      questionnaireId, athleteId: athleteEmail, schedule: { type: 'once' },
      startDate: fecha, active: true, createdAt: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: questionnaireAssignmentsKey });
  }

  /** Nota del día + (opcional) notificación. El aviso solo tiene sentido si la
   *  nota es de hoy o de antes: para una nota futura el atleta la verá en su
   *  Inicio ese día, y avisarle hoy de algo que aún no puede leer confunde. */
  async function handleAvisarConNota(fecha: string, texto: string, avisar: boolean) {
    await saveCoachDayNote(athleteEmail, fecha, texto);
    queryClient.invalidateQueries({ queryKey: coachDayNotesKey });
    if (!avisar) return;
    // La clave lleva el texto para que editar la nota y volver a avisar SÍ
    // mande un aviso nuevo, mientras que darle dos veces al mismo botón no
    // duplica nada. Sin el texto, corregir una nota dejaba al atleta sin
    // enterarse y al coach viendo un "aviso enviado" que no era verdad.
    let hash = 2166136261;
    for (let i = 0; i < texto.length; i++) { hash ^= texto.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    await createNotificationDeduped(`coachnote_${athleteEmail}_${fecha}_${(hash >>> 0).toString(36)}`, {
      recipientEmail: athleteEmail,
      type: 'coach_day_note',
      title: 'Nota de tu entrenador',
      body: texto.length > 120 ? `${texto.slice(0, 117)}…` : texto,
      link: 'home',
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  // Accesos rápidos del sheet de día ("Editar series y ejercicios", "Editar
  // intercambios y macros", "Editar cardio"): saltan a la PESTAÑA REAL del
  // cliente, donde vive cada editor. `onGoToClientTab` lo inyecta ClientHub,
  // que es quien controla la navegación por pestañas; sin él (por ejemplo
  // montado suelto) se cae a Fases, el editor más cercano que hay aquí dentro.
  function handleGoToTab(tab: DestinoPlan) {
    if (onGoToClientTab) onGoToClientTab(tab);
    else setSubTab('fases');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Icon name="refresh" size="xl" className="text-accent animate-spin" />
      </div>
    );
  }

  const rm = roadmap ?? { athleteId: athleteEmail, items: [] };
  const today = new Date().toISOString().split('T')[0];

  const phaseData: PhaseData = {
    bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight, today,
    completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
  };
  const ladderData: LadderData = { bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight, today };

  const challengeData: ChallengeData = {
    stepLogs, bodyweightLogs, workoutLogs, exercises,
    completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
    assignments, projection: null, liftExerciseIds: rm.challengeConfig?.liftExerciseIds,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans font-bold text-title-m text-white uppercase tracking-tight">Road map del atleta</h2>
        <p className="text-ink-2 text-label font-sans mt-1">Fases, retos semanales, niveles y calendario — editable por el coach</p>
      </div>

      <Tabs items={SUB_TABS} value={subTab} onChange={id => setSubTab(id as SubTab)} label="Secciones del Road map" />

      {subTab === 'fases' && (
        <PlanPhaseEditor
          roadmap={rm}
          onSave={handleSave}
          phaseData={phaseData}
          nutritionProgram={nutritionProgram}
          currentWeightKg={initialWeight}
          onProgramSaved={program => queryClient.setQueryData(['nutritionProgram', athleteEmail], program)}
        />
      )}
      {subTab === 'retos' && (uid
        ? <ChallengeManager athleteEmail={athleteEmail} challengeData={challengeData} roadmap={rm} onSaveRoadmap={handleSave} />
        : <p className="text-label text-ink-3 font-sans py-4">No se ha podido cargar el perfil del atleta.</p>
      )}
      {subTab === 'niveles' && <LevelLadderEditor roadmap={rm} onSave={handleSave} ladderData={ladderData} />}
      {subTab === 'calendario' && (
        <RoadmapCalendario
          athleteEmail={athleteEmail}
          athleteName={profile?.displayName ?? athleteEmail}
          coachId={coachId}
          mesocycles={mesocycles}
          nutritionProgram={nutritionProgram}
          roadmap={rm}
          workoutAssignments={assignments}
          workoutLogs={workoutLogs}
          workouts={workouts}
          exercises={exercises}
          diets={diets}
          dietCompletionLogs={dietCompletionLogs}
          cardioSessions={cardioSessions}
          bodyweightLogs={bodyweightLogs}
          tasks={tasks}
          progressPhotos={progressPhotos}
          questionnaireAssignments={questionnaireAssignments}
          questionnaires={questionnaires}
          coachDayNotes={coachDayNotes}
          initialWeight={initialWeight}
          onSave={handleSave}
          onCreateReview={handleCreateReview}
          onMoveReview={handleMoveReview}
          onResizeMesocycle={handleResizeMesocycle}
          onResizeNutritionPhase={handleResizeNutritionPhase}
          onAddVolumeRule={handleAddVolumeRule}
          onMoveVolumeEvent={handleMoveVolumeRule}
          onSaveDayNote={handleSaveDayNote}
          onMoveWorkoutAssignment={handleMoveWorkoutAssignment}
          onApplyTemplate={handleApplyTemplate}
          mesocycleTemplates={mesocycleTemplates}
          cargandoPlantillas={cargandoPlantillas}
          onImportarBloque={handleImportarBloque}
          onProgramarMenu={handleProgramarMenu}
          onEventoNutricion={handleEventoNutricion}
          onAsignarCuestionario={handleAsignarCuestionario}
          onAvisarConNota={handleAvisarConNota}
          onMarcarRecargas={handleMarcarRecargas}
          onGoToTab={handleGoToTab}
        />
      )}
    </div>
  );
}
