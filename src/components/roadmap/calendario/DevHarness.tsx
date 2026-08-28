import React, { useMemo, useState } from 'react';
import {
  Mesocycle, NutritionProgram, Roadmap, WorkoutAssignment, WorkoutLog, Workout, Exercise,
  Diet, DietCompletionLog, CardioSession, BodyweightLog, TaskItem, ProgressPhoto,
  QuestionnaireAssignment, Questionnaire, CoachDayNote, MuscleGroup, MuscleGroupConfig,
  MesocycleTemplate, WeekDay,
} from '../../../types';
import RoadmapCalendario from './RoadmapCalendario';
import { planificarPlantillaMeso, insertarFaseNutricion, alternarRefeeds } from '../../../utils/accionesCalendario';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de Roadmap → Calendario — ruta `/dev/calendario`, solo en
   desarrollo (podado en producción, ver App.tsx). Mismo motivo que
   `/ui`/`/dev/gimnasio`: verificar la pantalla del COACH en el navegador sin
   necesitar su sesión real — no hay login sandbox de coach en este repo.

   Todo vive en memoria (useState) — ninguna escritura toca Firestore. Los
   datos de ejemplo replican la periodización de `scripts/sembrarCalendarioMarcos.mjs`
   (mismos 9 bloques, ahora centrados en la fecha real de hoy en vez de fija a
   2026, para que el harness tenga sentido se abra cuando se abra).
   ═══════════════════════════════════════════════════════════════════════════ */

const pad = (n: number) => String(n).padStart(2, '0');
function iso(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return iso(date);
}
function rnd(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return ((x >>> 0) % 1000) / 1000;
}

const TODOS_LOS_GRUPOS: MuscleGroup[] = [
  'pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo', 'cuadriceps', 'isquios', 'gluteo',
  'aductores', 'gemelo', 'core', 'lumbares', 'rotadores',
];
function grupos(): Record<MuscleGroup, MuscleGroupConfig> {
  const g = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const m of TODOS_LOS_GRUPOS) g[m] = { series: 8, priority: 'media' };
  return g;
}

function construirFixture(hoyBase: string) {
  // Ancla el año de la periodización 8 meses antes de hoy, para que la fecha
  // real de apertura caiga siempre dentro del bloque "Mantenimiento" (semana
  // intermedia), como en las capturas de referencia del handoff.
  const inicioAno = addDays(hoyBase, -240);

  const BLOQUES: { n: string; semanas: number; tipo: Mesocycle['phaseType'] }[] = [
    { n: 'Fuerza base', semanas: 8, tipo: 'fuerza' },
    { n: 'Hipertrofia I', semanas: 6, tipo: 'hipertrofia' },
    { n: 'Descarga', semanas: 2, tipo: 'descarga' },
    { n: 'Hipertrofia II', semanas: 6, tipo: 'hipertrofia' },
    { n: 'Definición', semanas: 8, tipo: 'definicion' },
    { n: 'Mantenimiento', semanas: 7, tipo: 'mantenimiento' },
    { n: 'Fuerza máxima', semanas: 7, tipo: 'fuerza' },
    { n: 'Descarga', semanas: 2, tipo: 'descarga' },
    { n: 'Definición', semanas: 6, tipo: 'definicion' },
  ];
  const FASES_NUTRI: { n: string; semanas: number; kcal: number; tipo: NonNullable<import('../../../types').NutritionPhaseType>; peso: number }[] = [
    { n: 'Volumen controlado', semanas: 8, kcal: 2600, tipo: 'superavit', peso: 79 },
    { n: 'Superávit +250', semanas: 6, kcal: 2850, tipo: 'superavit', peso: 81 },
    { n: 'Mantenimiento', semanas: 2, kcal: 2500, tipo: 'mantenimiento', peso: 81 },
    { n: 'Superávit +250', semanas: 6, kcal: 2850, tipo: 'superavit', peso: 83 },
    { n: 'Déficit −400', semanas: 8, kcal: 2100, tipo: 'deficit', peso: 77 },
    { n: 'Mantenimiento', semanas: 7, kcal: 2350, tipo: 'mantenimiento', peso: 76.5 },
    { n: 'Superávit ligero', semanas: 7, kcal: 2700, tipo: 'superavit', peso: 78 },
    { n: 'Mantenimiento', semanas: 2, kcal: 2500, tipo: 'mantenimiento', peso: 78 },
    { n: 'Déficit −400', semanas: 6, kcal: 2100, tipo: 'deficit', peso: 75 },
  ];

  const RUTINAS: { nombre: string; ejercicios: { exerciseId: string; muscleGroup: MuscleGroup; sets: number; reps: string; rir: number; restSeconds: number; kg: number }[] }[] = [
    { nombre: 'Empuje A · Pecho y hombro', ejercicios: [
      { exerciseId: 'ex_press_banca', muscleGroup: 'pecho', sets: 4, reps: '6-8', rir: 2, restSeconds: 150, kg: 60 },
      { exerciseId: 'ex_press_hombro', muscleGroup: 'deltoide_ant', sets: 3, reps: '8-10', rir: 2, restSeconds: 120, kg: 35 },
      { exerciseId: 'ex_elev_lateral', muscleGroup: 'deltoide_lat', sets: 4, reps: '12-15', rir: 1, restSeconds: 75, kg: 9 },
    ] },
    { nombre: 'Pierna · Cuádriceps', ejercicios: [
      { exerciseId: 'ex_sentadilla', muscleGroup: 'cuadriceps', sets: 4, reps: '6-8', rir: 2, restSeconds: 180, kg: 80 },
      { exerciseId: 'ex_peso_muerto_rum', muscleGroup: 'isquios', sets: 3, reps: '8-10', rir: 2, restSeconds: 150, kg: 70 },
    ] },
    { nombre: 'Tirón A · Espalda', ejercicios: [
      { exerciseId: 'ex_jalon', muscleGroup: 'dorsal', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 55 },
      { exerciseId: 'ex_remo', muscleGroup: 'trapecio', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 50 },
    ] },
    { nombre: 'Pierna · Cadera', ejercicios: [
      { exerciseId: 'ex_hip_thrust', muscleGroup: 'gluteo', sets: 4, reps: '8-10', rir: 2, restSeconds: 150, kg: 85 },
      { exerciseId: 'ex_zancada', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 2, restSeconds: 120, kg: 40 },
    ] },
  ];

  const exercisesFixture: Exercise[] = Array.from(new Set(RUTINAS.flatMap(r => r.ejercicios.map(e => e.exerciseId))))
    .map(id => ({ id, ownerId: 'coach_dev', name: id.replace('ex_', '').replace(/_/g, ' '), muscleGroup: RUTINAS.flatMap(r => r.ejercicios).find(e => e.exerciseId === id)!.muscleGroup, equipment: [] } as unknown as Exercise));

  const workouts: Workout[] = RUTINAS.map((r, i) => ({
    id: `w_dev_${i}`, ownerId: 'coach_dev', name: r.nombre,
    exercises: r.ejercicios.map((e, j) => ({
      exerciseId: e.exerciseId, order: j, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds, rir: e.rir, muscleGroup: e.muscleGroup,
      // Rampa de volumen en el primer ejercicio de cada rutina, para que el
      // carril de volumen del Nivel Mes tenga una progresión real que enseñar
      // en vez de seis semanas planas.
      ...(j === 0 ? { weeklyProgression: [{ atWeek: 3, addSets: 1 }, { atWeek: 5, addSets: 2 }] } : {}),
    })),
  }));

  const mesocycles: Mesocycle[] = [];
  let cursor = inicioAno;
  BLOQUES.forEach((b, i) => {
    mesocycles.push({
      id: `meso_dev_${i}`, athleteId: 'dev@enforma.com', number: i + 1, startDate: cursor,
      objective: b.n, phaseType: b.tipo, daysPerWeek: 4, groups: grupos(), weeks: b.semanas,
      ...(b.tipo === 'descarga' ? { deloadWeek: 1 } : {}),
    });
    cursor = addDays(cursor, b.semanas * 7);
  });

  const diets: Diet[] = [2100, 2350, 2600, 2850].map(kcal => ({
    id: `diet_dev_${kcal}`, athleteId: 'dev@enforma.com', name: `Plan · ${kcal} kcal`,
    budget: { HC: 8, PROT: 6, GRASA: 5, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [
      { id: 'c1', name: 'Desayuno', items: [{ category: 'HC', foodLabel: 'avena', quantity: 2 }, { category: 'PROT', foodLabel: 'huevos', quantity: 2 }] },
      { id: 'c2', name: 'Comida', items: [{ category: 'PROT', foodLabel: 'pollo', quantity: 3 }, { category: 'HC', foodLabel: 'arroz', quantity: 3 }, { category: 'GRASA', foodLabel: 'aceite', quantity: 2 }] },
      { id: 'c3', name: 'Cena', items: [{ category: 'PROT', foodLabel: 'pescado', quantity: 2 }, { category: 'GRASA', foodLabel: 'aguacate', quantity: 3 }] },
    ],
  }));
  // Dos menús guardados ("Guardar como menú" en Nutrición) para probar la
  // acción "Programar un menú" del hub.
  const menus: Diet[] = [
    { ...diets[1], id: 'menu_dev_alto', name: 'Menú alto en HC (día de pierna)', menuTemplate: true },
    { ...diets[0], id: 'menu_dev_bajo', name: 'Menú bajo en HC (día libre)', menuTemplate: true },
  ];

  const mesocycleTemplates: MesocycleTemplate[] = [
    {
      id: 'tpl_dev_1', ownerId: 'coach_dev', name: 'Fuerza → Hipertrofia (12 sem)',
      stages: [
        { id: 'st1', name: 'Fuerza base', weeks: 6, daysPerWeek: 4, groups: grupos(), reviewCadenceWeeks: 3, reviewType: 'revision' },
        { id: 'st2', name: 'Hipertrofia', weeks: 6, daysPerWeek: 4, groups: grupos(), deloadWeek: 6 },
      ],
    },
    {
      id: 'tpl_dev_2', ownerId: 'coach_dev', name: 'Definición con descarga (10 sem)',
      stages: [
        { id: 'st3', name: 'Definición', weeks: 8, daysPerWeek: 5, groups: grupos() },
        { id: 'st4', name: 'Descarga', weeks: 2, daysPerWeek: 3, groups: grupos() },
      ],
    },
  ];

  const dietPorKcal = (kcal: number) => diets.reduce((a, b) => Math.abs(Number(b.id.split('_')[2]) - kcal) < Math.abs(Number(a.id.split('_')[2]) - kcal) ? b : a).id;

  let cursorN = inicioAno;
  const nutritionProgram: NutritionProgram = {
    athleteId: 'dev@enforma.com', startDate: inicioAno,
    phases: FASES_NUTRI.map((f, i) => {
      const ph = { id: `fase_dev_${i}`, name: f.n, weeks: f.semanas, dietId: dietPorKcal(f.kcal), targetKcal: f.kcal, phaseType: f.tipo, targetWeight: f.peso };
      cursorN = addDays(cursorN, f.semanas * 7);
      return ph;
    }),
  };

  const workoutAssignments: WorkoutAssignment[] = [];
  const workoutLogs: WorkoutLog[] = [];
  const bodyweightLogs: BodyweightLog[] = [];
  const cardioSessions: CardioSession[] = [];
  const dietCompletionLogs: DietCompletionLog[] = [];
  const finAno = addDays(inicioAno, 365);

  let cursorPeso = 78;
  let d = inicioAno;
  let dietIdx = 0;
  while (d <= finAno) {
    const esFuturo = d >= hoyBase;
    const meso = mesocycles.find(m => d >= m.startDate && d < addDays(m.startDate, m.weeks * 7));
    const dow = new Date(d + 'T00:00:00').getDay(); // 0=dom..6=sáb
    if (meso && [1, 2, 4, 5].includes(dow)) {
      const idxDia = [1, 2, 4, 5].indexOf(dow);
      const wo = workouts[idxDia];
      const r = rnd(d);
      const status: WorkoutAssignment['status'] = esFuturo ? 'pending' : (r < 0.72 ? 'completed' : r < 0.88 ? 'completed' : 'skipped');
      const assignmentId = `wa_dev_${d}_${idxDia}`;
      workoutAssignments.push({ id: assignmentId, workoutId: wo.id, athleteId: 'dev@enforma.com', date: d, status, mesocycleId: meso.id });
      if (!esFuturo && status === 'completed') {
        const parcial = r >= 0.72 && r < 0.88;
        const rutina = RUTINAS[idxDia];
        const ejercicios = parcial ? rutina.ejercicios.slice(0, Math.max(1, rutina.ejercicios.length - 1)) : rutina.ejercicios;
        workoutLogs.push({
          id: `wl_dev_${d}`, athleteId: 'dev@enforma.com', workoutId: wo.id, assignmentId, mesocycleId: meso.id,
          date: d, completedAt: `${d}T19:00:00.000Z`,
          entries: ejercicios.map(e => ({
            exerciseId: e.exerciseId,
            sets: Array.from({ length: parcial ? Math.max(1, e.sets - 1) : e.sets }, (_, s) => ({ weight: e.kg, repsDone: 8 - Math.floor(s / 2), rir: Math.max(0, e.rir - (s === e.sets - 1 ? 1 : 0)) })),
          })),
        });
      }
    }
    if (!esFuturo) {
      const faseNutri = nutritionProgram.phases.find((_, i) => {
        let acc = inicioAno;
        for (let j = 0; j < i; j++) acc = addDays(acc, nutritionProgram.phases[j].weeks * 7);
        const finFase = addDays(acc, nutritionProgram.phases[i].weeks * 7);
        return d >= acc && d < finFase;
      });
      cursorPeso += ((faseNutri?.targetWeight ?? 78) - cursorPeso) * 0.05 + (rnd(d + 'p') - 0.5) * 0.3;
      if (rnd(d + 'log') > 0.6) bodyweightLogs.push({ id: `bw_dev_${d}`, athleteId: 'dev@enforma.com', date: d, weight: Math.round(cursorPeso * 10) / 10, kind: 'daily', createdAt: `${d}T07:00:00.000Z` });
      if (dow === 3 || dow === 6) {
        if (rnd(d + 'c') > 0.25) {
          const esInt = dow === 6;
          cardioSessions.push({
            id: `cs_dev_${d}`, athleteId: 'dev@enforma.com', type: esInt ? 'intervalos' : 'zona2', date: d,
            startedAt: `${d}T08:00:00.000Z`, durationSec: (esInt ? 30 : 40) * 60, avgHR: esInt ? 155 : 132, maxHR: esInt ? 175 : 145,
            timeInZoneSec: { z1: 0, z2: 1800, z3: 0, z4: 0, z5: 0 }, samples: [], sampleIntervalSec: 5,
          });
        }
      }
      if (rnd(d + 'diet') > 0.15) {
        const dietaId = diets[dietIdx % diets.length].id;
        dietCompletionLogs.push({ id: `dcl_dev_${d}`, athleteId: 'dev@enforma.com', date: d, dietId: dietaId, doneItemIds: ['c1_0', 'c1_1', 'c2_0', 'c2_1'] });
      }
    }
    dietIdx++;
    d = addDays(d, 1);
  }

  const tasks: TaskItem[] = [
    { id: 't1', athleteId: 'dev@enforma.com', type: 'revision', title: 'Revisión con coach', dueDate: addDays(hoyBase, -14), status: 'done', createdBy: 'coach', createdAt: addDays(hoyBase, -20) + 'T08:00:00.000Z' },
    { id: 't2', athleteId: 'dev@enforma.com', type: 'foto', title: 'Foto de progreso', dueDate: addDays(hoyBase, 2), status: 'pending', createdBy: 'coach', createdAt: addDays(hoyBase, -5) + 'T08:00:00.000Z' },
    { id: 't3', athleteId: 'dev@enforma.com', type: 'revision', title: 'Test de fuerza · fecha clave', dueDate: addDays(hoyBase, -9), status: 'done', createdBy: 'coach', createdAt: addDays(hoyBase, -15) + 'T08:00:00.000Z' },
  ];

  const progressPhotos: ProgressPhoto[] = [addDays(hoyBase, -180), addDays(hoyBase, -60)].map(fecha => ({
    id: `dev@enforma.com_${fecha}_front`, athleteId: 'dev@enforma.com', date: fecha, view: 'front',
    url: `https://placehold.co/480x640/141414/FFC72C?text=${fecha}`, uploadedAt: `${fecha}T09:00:00.000Z`,
  }));

  const roadmap: Roadmap = {
    athleteId: 'dev@enforma.com',
    items: [
      { id: 'hito_dev_1', title: 'Competición · objetivo', type: 'objetivo', lane: 'general', targetDate: addDays(hoyBase, 40), status: 'pendiente' },
    ],
    highlightedDays: [],
  };

  const questionnaires: Questionnaire[] = [
    { id: 'q_dev_1', ownerId: 'coach_dev', title: 'Revisión Semanal', questions: [] },
    { id: 'q_dev_2', ownerId: 'coach_dev', title: 'Mediciones', questions: [] },
    { id: 'q_dev_3', ownerId: 'coach_dev', title: "DOM's o \"agujetas\"", questions: [] },
    { id: 'q_dev_4', ownerId: 'coach_dev', title: 'Datos sobre final de mesociclo', questions: [] },
    { id: 'q_dev_5', ownerId: 'coach_dev', title: 'Revisión Semana 3', questions: [] },
    { id: 'q_dev_6', ownerId: 'coach_dev', title: 'Control de medidas', questions: [] },
    { id: 'q_dev_7', ownerId: 'coach_dev', title: '📝Revisión express (semanal)', questions: [] },
    { id: 'q_dev_8', ownerId: 'coach_dev', title: 'Revisión Quincenal Completa', questions: [] },
  ];
  const questionnaireAssignments: QuestionnaireAssignment[] = [
    { id: 'qa_dev_1', questionnaireId: 'q_dev_1', athleteId: 'dev@enforma.com', schedule: { type: 'weekdays', weekdays: [1] }, startDate: inicioAno, active: true, createdAt: `${inicioAno}T08:00:00.000Z` },
  ];

  return {
    mesocycles, nutritionProgram, roadmap, workoutAssignments, workoutLogs, workouts, exercises: exercisesFixture,
    diets: [...diets, ...menus], mesocycleTemplates,
    dietCompletionLogs, cardioSessions, bodyweightLogs, tasks, progressPhotos,
    questionnaireAssignments, questionnaires, coachDayNotes: [] as CoachDayNote[],
  };
}

export default function DevCalendarioHarness() {
  const hoyBase = useMemo(() => iso(new Date()), []);
  const fixture = useMemo(() => construirFixture(hoyBase), [hoyBase]);

  const [roadmap, setRoadmap] = useState<Roadmap>(fixture.roadmap);
  const [workoutAssignments, setWorkoutAssignments] = useState<WorkoutAssignment[]>(fixture.workoutAssignments);
  const workouts: Workout[] = fixture.workouts; // ningún handler del harness los muta todavía
  const [tasks, setTasks] = useState<TaskItem[]>(fixture.tasks);
  const [coachDayNotes, setCoachDayNotes] = useState<CoachDayNote[]>(fixture.coachDayNotes);
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>(fixture.mesocycles);
  const [nutritionProgram, setNutritionProgram] = useState<NutritionProgram | null>(fixture.nutritionProgram);
  const [questionnaireAssignments, setQuestionnaireAssignments] = useState(fixture.questionnaireAssignments);
  const [log, setLog] = useState<string[]>([]);
  const registrar = (msg: string) => setLog(prev => [`${new Date().toLocaleTimeString()} · ${msg}`, ...prev].slice(0, 12));

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-center gap-2 text-caption font-mono text-ink-4 uppercase tracking-wider">
          <span>/dev/calendario</span>·<span>datos de ejemplo en memoria, sin Firestore</span>
        </div>
        <RoadmapCalendario
          athleteEmail="dev@enforma.com" athleteName="Nora Fernández (ejemplo)" coachId="coach_dev"
          mesocycles={mesocycles} nutritionProgram={nutritionProgram} roadmap={roadmap}
          workoutAssignments={workoutAssignments} workoutLogs={fixture.workoutLogs} workouts={workouts}
          exercises={fixture.exercises} diets={fixture.diets} dietCompletionLogs={fixture.dietCompletionLogs}
          cardioSessions={fixture.cardioSessions} bodyweightLogs={fixture.bodyweightLogs} tasks={tasks}
          progressPhotos={fixture.progressPhotos} questionnaireAssignments={questionnaireAssignments}
          questionnaires={fixture.questionnaires} coachDayNotes={coachDayNotes} initialWeight={78}
          onSave={async r => { setRoadmap(r); registrar('onSave (roadmap)'); }}
          onCreateReview={async input => {
            setTasks(prev => [...prev, { id: `t_${Date.now()}`, athleteId: 'dev@enforma.com', type: input.type, title: input.title, dueDate: input.date, status: 'pending', createdBy: 'coach', createdAt: new Date().toISOString() }]);
            registrar(`onCreateReview: ${input.title}`);
          }}
          onMoveReview={async (id, newDate) => { setTasks(prev => prev.map(t => t.id === id ? { ...t, dueDate: newDate } : t)); registrar(`onMoveReview → ${newDate}`); }}
          onResizeMesocycle={async (id, weeks) => { setMesocycles(prev => prev.map(m => m.id === id ? { ...m, weeks } : m)); registrar(`onResizeMesocycle → ${weeks}sem`); }}
          onResizeNutritionPhase={async (phaseId, weeks) => { setNutritionProgram(prev => prev && ({ ...prev, phases: prev.phases.map(p => p.id === phaseId ? { ...p, weeks } : p) })); registrar(`onResizeNutritionPhase → ${weeks}sem`); }}
          onAddVolumeRule={async () => registrar('onAddVolumeRule')}
          onMoveVolumeEvent={async () => registrar('onMoveVolumeEvent')}
          onSaveDayNote={async (date, text) => {
            setCoachDayNotes(prev => [...prev.filter(n => n.date !== date), { id: `dev_${date}`, athleteId: 'dev@enforma.com', date, text, createdAt: new Date().toISOString() }]);
            registrar(`onSaveDayNote ${date}`);
          }}
          onMoveWorkoutAssignment={async (id, newDate) => { setWorkoutAssignments(prev => prev.map(a => a.id === id ? { ...a, date: newDate } : a)); registrar(`onMoveWorkoutAssignment → ${newDate}`); }}
          onApplyTemplate={async ocurrencias => {
            setQuestionnaireAssignments(prev => [...prev, ...ocurrencias.map((o, i) => ({ id: `qa_dev_new_${Date.now()}_${i}`, questionnaireId: 'q_dev_1', athleteId: 'dev@enforma.com', schedule: { type: 'once' as const }, startDate: o.fecha, active: true, createdAt: new Date().toISOString() }))]);
            setRoadmap(prev => ({ ...prev, items: [...prev.items, ...ocurrencias.map((o, i) => ({ id: `hito_tpl_${Date.now()}_${i}`, title: o.titulo, type: 'hito' as const, lane: 'general' as const, targetDate: o.fecha, status: 'pendiente' as const }))] }));
            registrar(`onApplyTemplate: ${ocurrencias.length} ocurrencias`);
          }}
          mesocycleTemplates={fixture.mesocycleTemplates}
          cargandoPlantillas={false}
          onImportarBloque={async (tpl, inicio) => {
            const { mesociclos, revisiones } = planificarPlantillaMeso(tpl, 'dev@enforma.com', inicio, mesocycles.length + 1, `prog_${Date.now()}`);
            setMesocycles(prev => [...prev, ...mesociclos.map((m, i) => ({ ...m, id: `m_dev_new_${Date.now()}_${i}` }))]);
            setTasks(prev => [...prev, ...revisiones.map((r, i) => ({ ...r, id: `t_dev_new_${Date.now()}_${i}` }))]);
            registrar(`onImportarBloque: «${tpl.name}» desde ${inicio} (${mesociclos.length} mesos, ${revisiones.length} revisiones)`);
          }}
          onProgramarMenu={async (dietId: string, dia: WeekDay) => registrar(`onProgramarMenu: ${dietId} los ${dia}`)}
          onEventoNutricion={async (fecha, fase) => {
            if (!nutritionProgram) throw new Error('sin programa');
            const { programa, inicioReal } = insertarFaseNutricion(nutritionProgram, fecha, fase);
            setNutritionProgram(programa);
            registrar(`onEventoNutricion: «${fase.name}» desde ${inicioReal}`);
            return inicioReal;
          }}
          onAsignarCuestionario={async (questionnaireId, fecha) => {
            setQuestionnaireAssignments(prev => [...prev, { id: `qa_dev_${Date.now()}`, questionnaireId, athleteId: 'dev@enforma.com', schedule: { type: 'once' as const }, startDate: fecha, active: true, createdAt: new Date().toISOString() }]);
            registrar(`onAsignarCuestionario: ${questionnaireId} el ${fecha}`);
          }}
          onAvisarConNota={async (fecha, texto, avisar) => {
            setCoachDayNotes(prev => [...prev.filter(n => n.date !== fecha), { id: `dev_${fecha}`, athleteId: 'dev@enforma.com', date: fecha, text: texto, createdAt: new Date().toISOString() }]);
            registrar(`onAvisarConNota ${fecha}${avisar ? ' + notificación' : ''}`);
          }}
          onMarcarRecargas={async (fechas, activar, opciones) => {
            if (!nutritionProgram) throw new Error('sin programa');
            setNutritionProgram(alternarRefeeds(nutritionProgram, fechas, activar, opciones));
            registrar(`onMarcarRecargas: ${activar ? 'marca' : 'quita'} ${fechas.length} día(s)`);
          }}
          onGoToTab={tab => registrar(`onGoToTab → ${tab} (en la app real salta a esa pestaña del cliente)`)}
        />
        <div className="bg-surface border border-hairline rounded-surface p-4">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-2">Registro de acciones (harness)</p>
          {log.length === 0 && <p className="text-caption text-ink-4 font-sans">Nada todavía — interactúa con el calendario.</p>}
          <div className="space-y-1">
            {log.map((l, i) => <p key={i} className="text-caption font-mono text-ink-2">{l}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
