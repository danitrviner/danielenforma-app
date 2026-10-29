import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BodyweightLog, Diet, DietCompletionLog, NutritionProgram, Questionnaire, QuestionnaireResponse, StepLog, UserProfile,
  WorkoutAssignment, WorkoutLog,
} from '../types';
import type { CambioAtleta } from '../utils/cambiosAtleta';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';
import RespuestaCoachBox from './revision/RespuestaCoachBox';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas del cuadro de respuesta del coach (29-10) — `/dev/respuesta`.

   Sin sesión de coach en desarrollo: todo lo que el borrador lee se siembra
   en la caché (mismas claves que SeguimientoPlanPanel). «Firmar y enviar»
   fallará por permisos aquí: lo que se comprueba es el borrador, los tres
   campos y el copiado.
   ═══════════════════════════════════════════════════════════════════════════ */

const HOY = hoyIsoLocal();
const EMAIL = 'dev.atleta@example.com';
const UID = 'uid_dev_atleta';

const ATLETA: UserProfile = {
  userId: UID, email: EMAIL, displayName: 'Javier Vergara', role: 'client', avatarUrl: '', level: 1, currentStreak: 4, maxStreak: 9,
  initialWeight: 84.2, targetWeight: 79, actualWeight: 80.6, planPublishedAt: `${addDays(HOY, -45)}T10:00:00.000Z`,
};

const DIETA: Diet = { id: 'd1', athleteId: EMAIL, name: 'Déficit', meals: [], mode: 'OMNIVORO' } as unknown as Diet;
const PROGRAMA: NutritionProgram = {
  athleteId: EMAIL, startDate: addDays(HOY, -6 * 7 - 3),
  phases: [{ id: 'f1', name: 'Déficit', weeks: 10, dietId: 'd1', objetivo: 'deficit', targetWeight: 79, targetKcal: 2100, stepGoal: 9000 }],
} as unknown as NutritionProgram;

const PESOS: BodyweightLog[] = Array.from({ length: 45 }, (_, i) => {
  const d = addDays(HOY, -44 + i);
  return { id: `p_${d}`, athleteId: EMAIL, date: d, weight: Math.round((84.2 - i * 0.08 + ((i * 7) % 3) * 0.1) * 10) / 10, createdAt: '' };
});
const REGISTROS: DietCompletionLog[] = Array.from({ length: 28 }, (_, i) => ({ id: `r_${i}`, athleteId: EMAIL, date: addDays(HOY, -27 + i), dietId: 'd1', doneItemIds: [] }));
const PASOS: StepLog[] = Array.from({ length: 28 }, (_, i) => ({ id: `s_${i}`, athleteId: EMAIL, date: addDays(HOY, -27 + i), steps: 8200 + (i % 5) * 400, source: 'manual', createdAt: '' }));

const ASIGNACIONES: WorkoutAssignment[] = [6, 4, 2, 1].map(n => ({ id: `as_${n}`, athleteId: EMAIL, workoutId: 'w', date: addDays(HOY, -n), status: n === 2 ? 'pending' : 'completed' }));
const LOGS: WorkoutLog[] = ASIGNACIONES.filter(a => a.status === 'completed').map(a => ({ id: `l_${a.id}`, athleteId: EMAIL, workoutId: 'w', assignmentId: a.id, date: a.date, completedAt: `${a.date}T19:00:00.000Z`, entries: [] }));
const CAMBIOS: CambioAtleta[] = [
  { id: 'c1', athleteId: EMAIL, area: 'entreno', objeto: 'sesion', titulo: 'Sesión Pierna A', lineas: ['Sentadilla → Prensa'], at: `${addDays(HOY, -1)}T11:00:00.000Z`, autor: 'coach' },
];

const CUESTIONARIO: Questionnaire = {
  id: 'q_semana', ownerId: 'coach', title: 'Tu semana', createdAt: '',
  questions: [
    { id: 'q1', type: 'text', label: 'Sensaciones y feedback ENTRENO:' },
    { id: 'q2', type: 'boolean', label: '¿Alguna molestia o lesión?', signalKey: 'alerta.molestia' },
    { id: 'q3', type: 'scale', label: '¿Cómo has dormido?' },
  ],
} as unknown as Questionnaire;

const RESPUESTA: QuestionnaireResponse = {
  id: 'resp_1', questionnaireId: 'q_semana', assignmentId: 'a1', athleteId: EMAIL, submittedAt: `${addDays(HOY, -2)}T18:30:00.000Z`,
  answers: [
    { questionId: 'q1', value: 'He subido peso en casi todo; el tercer día se me hace largo con tantas elevaciones.' },
    { questionId: 'q2', value: true },
    { questionId: 'q2__comentario', value: 'rodilla derecha en la última serie de sentadilla' },
    { questionId: 'q3', value: 7 },
  ],
};

/** Para la galería de variantes: los mismos datos, sembrados en cualquier QueryClient. */
export const FIXTURE_RESPUESTA = {
  atleta: ATLETA, cuestionario: CUESTIONARIO, respuesta: RESPUESTA,
  sembrar(c: QueryClient) {
    c.setQueryData(['nutritionProgram', EMAIL], PROGRAMA);
    c.setQueryData(['dietsForAthlete', EMAIL], [DIETA]);
    c.setQueryData(['dietCompletionLogsForAthlete', EMAIL], REGISTROS);
    c.setQueryData(['stepsForAthlete', EMAIL], PASOS);
    c.setQueryData(['athleteNutritionConfig', EMAIL], { stepGoal: 9000 });
    c.setQueryData(['cambiosAtleta', EMAIL], CAMBIOS);
    c.setQueryData(['workoutAssignments', UID], ASIGNACIONES);
    c.setQueryData(['workoutLogs', EMAIL], LOGS);
    c.setQueryData(bodyweightForAthleteKey(EMAIL), PESOS);
    c.setQueryData(['onboarding', EMAIL], { goalFreeText: 'Llegar a los 40 en forma me haría sentir muy orgulloso de mí mismo' });
  },
  pesos: PESOS,
};

export default function RespuestaDevHarness() {
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    c.setQueryData(['nutritionProgram', EMAIL], PROGRAMA);
    c.setQueryData(['dietsForAthlete', EMAIL], [DIETA]);
    c.setQueryData(['dietCompletionLogsForAthlete', EMAIL], REGISTROS);
    c.setQueryData(['stepsForAthlete', EMAIL], PASOS);
    c.setQueryData(['athleteNutritionConfig', EMAIL], { stepGoal: 9000 });
    c.setQueryData(['cambiosAtleta', EMAIL], CAMBIOS);
    c.setQueryData(['workoutAssignments', UID], ASIGNACIONES);
    c.setQueryData(['workoutLogs', EMAIL], LOGS);
    c.setQueryData(bodyweightForAthleteKey(EMAIL), PESOS);
    return c;
  }, []);
  const [respuesta, setRespuesta] = useState(RESPUESTA);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/respuesta — datos de mentira</p>
          <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
            <RespuestaCoachBox respuesta={respuesta} questionnaire={CUESTIONARIO} athlete={ATLETA} onGuardada={setRespuesta} />
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
