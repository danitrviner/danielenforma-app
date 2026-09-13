import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  UserProfile, Questionnaire, QuestionnaireAssignment, QuestionnairePack, QuestionnaireResponse,
  WeightCheckIn,
} from '../types';
import ClientReviewsPanel from './ClientReviewsPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de Cliente › Revisiones (las DOS pestañas: Recibidas y
   Asignadas) — ruta `/dev/asignados`, solo en desarrollo (podada en producción,
   ver App.tsx).

   Mismo motivo que `/dev/revision`: este repo no tiene la sesión de coach, así
   que sin esto la única forma de mirar la pantalla es desplegar a producción y
   entrar con la cuenta de Dani. Los paquetes se siembran en la caché de
   react-query con `staleTime: Infinity`, así que ninguna LECTURA sale hacia
   Firestore. Las ESCRITURAS (asignar, guardar paquete) sí lo intentan y caen a
   local al no haber sesión: esto sirve para ver y recorrer la pantalla, no
   para probar la persistencia.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.atleta@example.com';
const COACH = 'coach_dev';

const pad = (n: number) => String(n).padStart(2, '0');
function iso(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function haceDias(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }

const PERFIL: UserProfile = {
  userId: 'dev', email: EMAIL, displayName: 'Gonzalo Miranda', role: 'client',
} as UserProfile;

const Q_SEMANAL: Questionnaire = {
  id: 'q_semanal', ownerId: COACH, title: 'Revisión Semanal',
  questions: Array.from({ length: 9 }, (_, i) => ({
    id: `q_sem_${i}`, label: `Pregunta semanal ${i + 1}`, type: 'scale' as const,
    required: true, scaleMin: 1, scaleMax: 10,
  })),
};
const Q_DOMS: Questionnaire = {
  id: 'q_doms', ownerId: COACH, title: 'DOM’s o "agujetas"',
  questions: Array.from({ length: 14 }, (_, i) => ({
    id: `q_doms_${i}`, label: `Grupo muscular ${i + 1}`, type: 'scale' as const,
    required: true, scaleMin: 0, scaleMax: 10,
  })),
};
const Q_MEDICIONES: Questionnaire = {
  id: 'q_medic', ownerId: COACH, title: 'Mediciones',
  questions: Array.from({ length: 7 }, (_, i) => ({
    id: `q_med_${i}`, label: `Perímetro ${i + 1}`, type: 'numeric' as const, required: true, unit: 'cm',
  })),
};
const PLANTILLAS = [Q_SEMANAL, Q_DOMS, Q_MEDICIONES];

const ASIGNACIONES: QuestionnaireAssignment[] = [
  { id: 'as_medic', questionnaireId: 'q_medic', athleteId: EMAIL, schedule: { type: 'monthly', dayOfMonth: 26 }, startDate: haceDias(90), active: true, createdAt: haceDias(90) },
  { id: 'as_semanal', questionnaireId: 'q_semanal', athleteId: EMAIL, schedule: { type: 'weekdays', weekdays: [6] }, startDate: haceDias(60), active: true, createdAt: haceDias(60) },
  {
    id: 'as_doms', questionnaireId: 'q_doms', athleteId: EMAIL,
    schedule: { type: 'interval', intervalDays: 14 }, startDate: haceDias(56), active: true, createdAt: haceDias(56),
    overrides: { hidden: ['q_doms_12', 'q_doms_13'], relabeled: { q_doms_0: 'Cuádriceps (pierna operada)' } },
  },
];

const respuestasDe = (q: Questionnaire, base: number) =>
  q.questions.map((qq, i) => ({ questionId: qq.id, value: (base + i) % 10 + 1 }));

const RESPUESTAS: QuestionnaireResponse[] = [
  { id: 'r1', questionnaireId: 'q_semanal', assignmentId: 'as_semanal', athleteId: EMAIL, submittedAt: `${haceDias(1)}T09:50:00.000Z`, answers: respuestasDe(Q_SEMANAL, 5) },
  { id: 'r2', questionnaireId: 'q_medic', assignmentId: 'as_medic', athleteId: EMAIL, submittedAt: `${haceDias(1)}T09:20:00.000Z`, answers: respuestasDe(Q_MEDICIONES, 70) },
  { id: 'r3', questionnaireId: 'q_doms', assignmentId: 'as_doms', athleteId: EMAIL, submittedAt: `${haceDias(6)}T20:05:00.000Z`, answers: respuestasDe(Q_DOMS, 2) },
  { id: 'r4', questionnaireId: 'q_semanal', assignmentId: 'as_semanal', athleteId: EMAIL, submittedAt: `${haceDias(8)}T10:02:00.000Z`, answers: respuestasDe(Q_SEMANAL, 3) },
  { id: 'r5', questionnaireId: 'q_semanal', assignmentId: 'as_semanal', athleteId: EMAIL, submittedAt: `${haceDias(15)}T09:41:00.000Z`, answers: respuestasDe(Q_SEMANAL, 7) },
];

const CHECKINS: WeightCheckIn[] = [2, 9, 16].map((d, i) => ({
  id: `ck_${i}`, userId: 'dev', email: EMAIL,
  timestamp: new Date(`${haceDias(d)}T18:00:00.000Z`),
  dateStr: haceDias(d), weight: [80.4, 81.0, 81.6][i], mood: ['😊', '😐', '🔥'][i],
  adherence: (['Sí', 'Parcial', 'Sí'] as const)[i],
  notes: ['Semana redonda, cero saltos de dieta.', 'Comí fuera dos veces.', 'Con energía de sobra.'][i],
  coachFeedback: i > 0 ? 'Perfecto, seguimos igual. Sube 5 min de zona 2 el viernes.' : undefined,
  approved: i > 0,
}));

const PAQUETES: QuestionnairePack[] = [
  {
    id: 'pack_alta', ownerId: COACH, name: 'Alta de cliente', createdAt: haceDias(120),
    items: [
      { questionnaireId: 'q_semanal', schedule: { type: 'weekdays', weekdays: [6] } },
      { questionnaireId: 'q_medic', schedule: { type: 'monthly', dayOfMonth: 26 } },
      { questionnaireId: 'q_doms', schedule: { type: 'interval', intervalDays: 14 } },
    ],
  },
  {
    id: 'pack_ligero', ownerId: COACH, name: 'Seguimiento ligero', createdAt: haceDias(40),
    items: [{ questionnaireId: 'q_semanal', schedule: { type: 'weekdays', weekdays: [0] } }],
  },
];

export default function AsignadosDevHarness() {
  const [plantillas, setPlantillas] = useState(PLANTILLAS);
  // `?vacio=1` para ver el estado sin nada asignado.
  const vacio = new URLSearchParams(window.location.search).has('vacio');
  const [asignaciones, setAsignaciones] = useState<QuestionnaireAssignment[]>(vacio ? [] : ASIGNACIONES);
  const [respuestas, setRespuestas] = useState(vacio ? [] : RESPUESTAS);

  const client = useMemo(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } } });
    qc.setQueryData(['questionnairePacks', COACH], PAQUETES);
    qc.setQueryData(['tasks', EMAIL], []);
    return qc;
  }, []);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-5xl mx-auto">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest mb-3">/dev/asignados — datos de mentira</p>
          <ClientReviewsPanel
            athlete={PERFIL}
            coachId={COACH}
            athleteCheckins={CHECKINS}
            onRefreshCheckIns={() => {}}
            athleteQResponses={respuestas}
            setAthleteQResponses={setRespuestas}
            coachQuestionnaires={plantillas}
            setCoachQuestionnaires={setPlantillas}
            athleteQAssignments={asignaciones}
            setAthleteQAssignments={setAsignaciones}
          />
        </div>
      </div>
    </QueryClientProvider>
  );
}
