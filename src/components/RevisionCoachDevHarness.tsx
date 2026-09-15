import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  UserProfile, Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, WorkoutLog,
  ProgressPhoto, BodyweightLog, NutritionProgram, Diet, OnboardingData,
  WeightCheckIn, Questionnaire, QuestionnaireResponse, MUSCLE_ORDER,
} from '../types';
import { bodyweightForAthleteKey, pesoPrimeroKey, pesoUltimoKey } from '../hooks/useAthleteWeight';
import { VOLUME_LANDMARKS_DEFAULT } from '../data/volumeLandmarks';
import ClientRevisionPanel from './revision/ClientRevisionPanel';
import ClientImplantacionPanel from './implantacion/ClientImplantacionPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de Cliente › Revisión — ruta `/dev/revision-coach`, solo en
   desarrollo (podado en producción, ver App.tsx).

   Ojo con el nombre: `/dev/revision` (sin sufijo) es el del ATLETA
   (RevisionDevHarness → CheckInScreen, «Perfil › Revisión»). Son dos pantallas
   distintas con el mismo nombre en castellano, y por eso este lleva `-coach`.

   Este repo no tiene sesión de coach —`isCoach()` está clavado al correo real
   de Dani en firestore.rules—, así que esta es la única forma de ver la
   pantalla en el navegador. Todo se sirve por props o desde la caché de
   react-query con `staleTime: Infinity`: ninguna consulta sale hacia Firestore.

   El fixture no es decorativo, ejercita los casos que el motor tiene que
   resolver bien: un bloque EN CURSO (para que la normalización por semanas
   transcurridas se vea), un grupo prioritario al que no se le está dando
   volumen, un ejercicio que se estrena (no debe salir como «el que más sube»)
   y otro que baja.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.coach@example.com';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function haceDias(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }

const PERFIL: UserProfile = {
  userId: 'dev-coach-athlete', email: EMAIL, displayName: 'Gonzalo Dev', role: 'client',
  avatarUrl: '', initialWeight: 84.2, targetWeight: 78, actualWeight: 80.4,
} as UserProfile;

// ── Ejercicios ──────────────────────────────────────────────────────────────
function ej(id: string, name: string, muscleGroup: MuscleGroup, secundarios?: MuscleGroup[]): Exercise {
  return { id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, secondaryMuscleGroups: secundarios, type: 'fuerza' } as Exercise;
}

const EJERCICIOS: Exercise[] = [
  ej('press_banca', 'Press banca', 'pecho', ['triceps', 'deltoide_ant']),
  ej('press_inclinado', 'Press inclinado mancuernas', 'pecho', ['deltoide_ant']),
  ej('remo_barra', 'Remo con barra', 'dorsal', ['biceps']),
  ej('jalon', 'Jalón al pecho', 'dorsal', ['biceps']),
  ej('elevaciones', 'Elevaciones laterales', 'deltoide_lat'),
  ej('curl_polea', 'Curl en polea', 'biceps'),
  ej('frances', 'Press francés', 'triceps'),
  ej('sentadilla', 'Sentadilla', 'cuadriceps', ['gluteo']),
  ej('peso_muerto_rumano', 'Peso muerto rumano', 'isquios', ['gluteo', 'lumbares']),
  ej('plancha', 'Plancha', 'core'),
];

// ── Mesociclos ──────────────────────────────────────────────────────────────
function groups(parcial: Partial<Record<MuscleGroup, MuscleGroupConfig>>): Record<MuscleGroup, MuscleGroupConfig> {
  const base = {} as Record<MuscleGroup, MuscleGroupConfig>;
  for (const g of MUSCLE_ORDER) base[g] = { series: 0, priority: 'baja' };
  return { ...base, ...parcial } as Record<MuscleGroup, MuscleGroupConfig>;
}

const MESO_ACTUAL: Mesocycle = {
  id: 'meso_2', athleteId: EMAIL, number: 2, name: 'Hipertrofia otoño',
  weeks: 5, startDate: haceDias(16), objective: 'Hipertrofia', daysPerWeek: 4,
  groups: groups({
    pecho:         { series: 12, priority: 'alta' },
    dorsal:        { series: 16, priority: 'alta' },
    deltoide_lat:  { series: 12, priority: 'alta' },
    // Programado y con prioridad alta, pero SIN NI UNA serie registrada: es el
    // caso que el mapa de calor tiene que cazar y subir a lo más visible.
    deltoide_post: { series: 10, priority: 'alta' },
    biceps:        { series: 8,  priority: 'media' },
    triceps:       { series: 8,  priority: 'media' },
    cuadriceps:    { series: 10, priority: 'media' },
    isquios:       { series: 8,  priority: 'media' },
    core:          { series: 6,  priority: 'baja' },
  }),
} as Mesocycle;

const MESO_ANTERIOR: Mesocycle = {
  id: 'meso_1', athleteId: EMAIL, number: 1, name: 'Adaptación',
  weeks: 5, startDate: haceDias(51), objective: 'Adaptación anatómica', daysPerWeek: 4,
  groups: groups({
    pecho: { series: 10, priority: 'media' }, dorsal: { series: 12, priority: 'alta' },
    deltoide_lat: { series: 9, priority: 'media' }, biceps: { series: 6, priority: 'baja' },
    triceps: { series: 6, priority: 'baja' }, cuadriceps: { series: 9, priority: 'media' },
    isquios: { series: 6, priority: 'media' }, core: { series: 6, priority: 'baja' },
  }),
} as Mesocycle;

// ── Logs ────────────────────────────────────────────────────────────────────
let contador = 0;
function log(dias: number, entries: { id: string; series: [number, number][]; rir?: number }[]): WorkoutLog {
  const date = haceDias(dias);
  return {
    id: `log_${contador++}`, athleteId: EMAIL, workoutId: 'w', assignmentId: 'as',
    mesocycleId: dias <= 16 ? 'meso_2' : 'meso_1',
    date, completedAt: `${date}T18:30:00.000Z`,
    entries: entries.map(e => ({
      exerciseId: e.id,
      sets: e.series.map(([weight, repsDone]) => ({ weight, repsDone, rir: e.rir ?? 2 })),
    })),
  };
}

/** Una sesión de torso y otra de pierna por «semana», con la carga que se le pase. */
function semana(diaBase: number, carga: number, extra: number): WorkoutLog[] {
  return [
    log(diaBase, [
      { id: 'press_banca', series: [[carga, 8], [carga, 8], [carga, 7]] },
      { id: 'remo_barra', series: [[carga + 10, 9], [carga + 10, 9], [carga + 10, 8]] },
      { id: 'elevaciones', series: [[12 + extra, 14], [12 + extra, 13], [12 + extra, 12]] },
    ]),
    log(diaBase - 2, [
      { id: 'jalon', series: [[55 + extra, 10], [55 + extra, 10], [55 + extra, 9]] },
      { id: 'curl_polea', series: [[26 + extra, 12], [26 + extra, 11]] },
      { id: 'frances', series: [[30 + extra, 12], [30 + extra, 11]] },
    ]),
    log(diaBase - 4, [
      { id: 'sentadilla', series: [[80 + extra * 2, 8], [80 + extra * 2, 8], [80 + extra * 2, 7]] },
      // El rumano BAJA de carga a lo largo del bloque: tiene que aparecer en
      // «va a menos», no perderse entre los que suben.
      { id: 'peso_muerto_rumano', series: [[95 - extra, 10], [95 - extra, 10]] },
      { id: 'plancha', series: [[0, 60], [0, 55]] },
    ]),
  ];
}

const LOGS: WorkoutLog[] = [
  // Bloque anterior (terminado): cargas más bajas, para que haya con qué comparar.
  ...semana(48, 60, 0), ...semana(41, 60, 1), ...semana(34, 62, 1),
  ...semana(27, 62, 2), ...semana(20, 64, 2),
  // Bloque actual, en curso: dos semanas y pico.
  ...semana(14, 66, 3), ...semana(7, 70, 4),
  // Un ejercicio que se ESTRENA hoy: no debe salir como «el que más sube».
  log(1, [{ id: 'press_inclinado', series: [[28, 10], [28, 10], [28, 9]] }]),
];

/**
 * Un ejercicio y un log por grupo muscular, con un número de series creciente
 * para que el mapa recorra las cinco zonas de volumen a la vez. Solo lo usa
 * `?anatomia=1`: no es una vista de datos, es para juzgar el dibujo.
 */
const EJERCICIOS_ANATOMIA: Exercise[] = MUSCLE_ORDER.map(g => ej(`anat_${g}`, `Anat ${g}`, g));

const LOGS_ANATOMIA: WorkoutLog[] = MUSCLE_ORDER.map((g, i) => {
  // 2, 5, 9, 14 y 22 series: MEV → productivo → MAV → MRV.
  const series = [2, 5, 9, 14, 22][i % 5];
  return log(3, [{ id: `anat_${g}`, series: Array.from({ length: series }, () => [40, 10] as [number, number]) }]);
});

// ── Cuerpo ──────────────────────────────────────────────────────────────────
// Peso bajando de 84,2 a 80,4 en 16 semanas, que es lo que la periodización
// dice que debería pasar. Sin esto el dashboard de peso no tiene qué pintar.
const PESOS: BodyweightLog[] = Array.from({ length: 17 }, (_, i) => {
  const date = haceDias((16 - i) * 7);
  return {
    id: `bw_${i}`, athleteId: EMAIL, date,
    weight: Math.round((84.2 - i * 0.24) * 10) / 10,
    createdAt: `${date}T07:00:00.000Z`,
  };
});

const FOTOS: ProgressPhoto[] = [0, 28, 56, 84].flatMap(d =>
  (['front', 'side', 'back'] as const).map(view => {
    const date = haceDias(d);
    return {
      id: `${EMAIL}_${date}_${view}`, athleteId: EMAIL, date, view,
      // Placeholder gris: el harness no sube nada a Storage.
      url: `https://placehold.co/400x560/1a1a1a/555?text=${view}+${date}`,
      uploadedAt: `${date}T09:00:00.000Z`,
    };
  }),
);

const DIETAS: Diet[] = [
  { id: 'd_deficit', athleteId: EMAIL, name: 'Déficit', budget: { HC: 14, PROT: 18, GRASA: 8, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] },
  { id: 'd_mant', athleteId: EMAIL, name: 'Mantenimiento', budget: { HC: 18, PROT: 18, GRASA: 9, MIX_HC: 0, MIX_GRASA: 0 }, meals: [] },
];

const PROGRAMA: NutritionProgram = {
  athleteId: EMAIL,
  startDate: haceDias(112),
  phases: [
    { id: 'f1', name: 'Déficit inicial', weeks: 8, dietId: 'd_deficit', targetKcal: 2100 },
    { id: 'f2', name: 'Mantenimiento', weeks: 4, dietId: 'd_mant', targetKcal: 2500 },
    { id: 'f3', name: 'Segundo déficit', weeks: 8, dietId: 'd_deficit', targetKcal: 2050, targetWeight: 78 },
  ],
};

const ALTA: Partial<OnboardingData> = {
  athleteId: EMAIL, sex: 'male', birthDate: '1994-05-02',
  weightKg: 84.2, heightCm: 178, activityLevel: 'activo', goalBody: 'reducir_grasa',
};

// ── Lo que el atleta manda ──────────────────────────────────────────────────
// Tres check-ins: uno contestado y aprobado, otro contestado sin aprobar y el
// último sin tocar. Así se ve la lista de pendientes con sus dos estados.
const CHECKINS: WeightCheckIn[] = [21, 14, 7].map((d, i) => ({
  id: `chk_${i}`, userId: 'dev-coach-athlete', email: EMAIL,
  timestamp: new Date(`${haceDias(d)}T18:00:00.000Z`), dateStr: haceDias(d),
  weight: [81.6, 81.0, 80.4][i], mood: ['😊', '😐', '🔥'][i],
  adherence: (['Sí', 'Parcial', 'Sí'] as const)[i],
  notes: [
    'Semana redonda, cero saltos de dieta.',
    'Comí fuera dos veces y el jueves no entrené, se me juntó todo.',
    'Muy bien, con energía de sobra. El press me subió solo.',
  ][i],
  coachFeedback: i === 0 ? 'Perfecto, seguimos igual.' : undefined,
  approved: i === 0,
}));

const Q_SEMANAL: Questionnaire = {
  id: 'q_semanal', ownerId: 'coach', title: 'Revisión semanal',
  questions: [
    { id: 'q1', label: '¿Cómo has dormido?', type: 'scale', required: true, scaleMin: 1, scaleMax: 10, scaleMinLabel: 'Fatal', scaleMaxLabel: 'De lujo' },
    { id: 'q2', label: 'Energía en los entrenos', type: 'scale', required: true, scaleMin: 1, scaleMax: 10 },
    { id: 'q3', label: 'Estrés fuera del gimnasio', type: 'scale', required: false, scaleMin: 1, scaleMax: 10 },
  ],
};

const RESPUESTAS: QuestionnaireResponse[] = [35, 28, 21, 14, 7].map((d, i) => ({
  id: `r_${i}`, questionnaireId: 'q_semanal', assignmentId: 'as_semanal', athleteId: EMAIL,
  submittedAt: `${haceDias(d)}T19:12:00.000Z`,
  answers: [
    { questionId: 'q1', value: [6, 7, 7, 8, 8][i] },
    { questionId: 'q2', value: [5, 6, 7, 7, 9][i] },
    { questionId: 'q3', value: [8, 7, 6, 5, 4][i] },
  ],
}));

export default function RevisionCoachDevHarness() {
  // `?anatomia=1` enciende TODOS los grupos a la vez, en las cinco zonas de
  // volumen. No es una vista de datos: es para poder juzgar el DIBUJO —con el
  // fixture normal la mitad de los músculos están a cero y salen apagados, así
  // que no se ve si la lámina está bien hecha.
  const anatomia = new URLSearchParams(window.location.search).has('anatomia');
  // `?pantalla=implantacion` monta la otra pestaña con el mismo fixture.
  const pantalla = new URLSearchParams(window.location.search).get('pantalla');

  const client = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity, gcTime: Infinity, retry: false,
          refetchOnMount: false, refetchOnWindowFocus: false,
        },
      },
    });
    qc.setQueryData(['coachVolumeLandmarks'], VOLUME_LANDMARKS_DEFAULT);
    // Cuerpo. Todo sembrado a mano: ninguna consulta sale hacia Firestore.
    qc.setQueryData(bodyweightForAthleteKey(EMAIL), PESOS);
    qc.setQueryData(pesoPrimeroKey(EMAIL), PESOS[0]);
    qc.setQueryData(pesoUltimoKey(EMAIL), PESOS[PESOS.length - 1]);
    qc.setQueryData(['progressPhotos', EMAIL], FOTOS);
    qc.setQueryData(['bodyMeasurementsForAthlete', EMAIL], []);
    // El dashboard de peso vive de estas seis; `anatomia` las deja vacías para
    // ver también el estado sin periodización.
    qc.setQueryData(['nutritionProgram', EMAIL], anatomia ? null : PROGRAMA);
    qc.setQueryData(['dietsForAthlete', EMAIL], DIETAS);
    qc.setQueryData(['onboarding', EMAIL], ALTA);
    qc.setQueryData(['dietCompletionLogsForAthlete', EMAIL], []);
    qc.setQueryData(['stepsForAthlete', EMAIL], []);
    qc.setQueryData(['athleteNutritionConfig', EMAIL], null);
    // Implantación.
    qc.setQueryData(['roadmap', EMAIL], null);
    // Dos recordatorios: uno vencido sobre un paso del montaje y una tarea
    // suelta para mañana, para ver los dos estados del aviso.
    qc.setQueryData(['coachClientTasks', EMAIL], [
      {
        id: `${EMAIL}_paso_2`, athleteId: EMAIL, itemId: 'paso_2',
        title: 'Sesiones', phase: 'entrenamiento', done: false,
        dueDate: haceDias(3), createdBy: 'seed', createdAt: haceDias(10),
      },
      {
        id: 'extra_1', athleteId: EMAIL, title: 'Llamarle para repasar la dieta',
        done: false, dueDate: haceDias(-1), createdBy: 'coach', createdAt: haceDias(2),
      },
    ]);
    return qc;
  }, [anatomia]);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-5xl mx-auto">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest mb-3">
            /dev/revision-coach — datos de mentira{anatomia ? ' · modo anatomía' : ''}
          </p>
          {pantalla === 'implantacion' ? (
            <ClientImplantacionPanel
              athlete={PERFIL}
              checkins={CHECKINS}
              onboarding={ALTA as never}
              mesocycles={[MESO_ANTERIOR, MESO_ACTUAL]}
              workoutAssignments={[]}
              diets={DIETAS}
              dietConfig={null}
              nutritionConfig={null}
              qAssignments={[]}
              photoAssignments={[]}
              photos={FOTOS}
              workoutLogs={LOGS}
              onGoToTab={t => console.info('[harness] onGoToTab', t)}
              onAbrirEditor={t => console.info('[harness] onAbrirEditor', t)}
            />
          ) : (
          <ClientRevisionPanel
            athlete={PERFIL}
            logs={anatomia ? LOGS_ANATOMIA : LOGS}
            exercises={anatomia ? EJERCICIOS_ANATOMIA : EJERCICIOS}
            mesocycles={anatomia ? [] : [MESO_ANTERIOR, MESO_ACTUAL]}
            photos={FOTOS}
            bodyweightLogs={PESOS}
            sexo="hombre"
            checkins={CHECKINS}
            questionnaires={[Q_SEMANAL]}
            responses={RESPUESTAS}
            onGoToTab={t => console.info('[harness] onGoToTab', t)}
          />
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}
