import React, { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  UserProfile, WeightCheckIn, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse,
  BodyweightLog, BodyMeasurement, ProgressPhoto, PhotoAssignment,
} from '../types';
import { bodyweightForAthleteKey, pesoPrimeroKey, pesoUltimoKey } from '../hooks/useAthleteWeight';
import { bodyMeasurementsForAthleteKey } from '../hooks/useBodyMeasurements';
import CheckInScreen from './CheckInScreen';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de Perfil › Revisión — ruta `/dev/revision`, solo en
   desarrollo (podado en producción, ver App.tsx). Mismo motivo que
   `/dev/calendario` y `/dev/gimnasio`: ver la pantalla del ATLETA en el
   navegador sin necesitar su sesión real, que este repo no tiene.

   Todo vive en la caché de react-query, sembrada a mano con `staleTime:
   Infinity` para que ninguna consulta salga hacia Firestore. Nada de lo que
   se escriba aquí se guarda en ningún sitio.
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.atleta@example.com';

const pad = (n: number) => String(n).padStart(2, '0');
function iso(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function haceDias(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); }

const PERFIL: UserProfile = {
  userId: 'dev', email: EMAIL, displayName: 'Marcos Dev', role: 'client',
  avatarUrl: '', level: 4, currentStreak: 6, maxStreak: 11,
  initialWeight: 84.2, targetWeight: 78, actualWeight: 80.4,
} as UserProfile;

// ── Cuestionarios ─────────────────────────────────────────────────────────────
const Q_SEMANAL: Questionnaire = {
  id: 'q_semanal', ownerId: 'coach', title: 'Revisión semanal',
  questions: [
    { id: 'q_sem_1', label: '¿Cómo has dormido esta semana?', type: 'scale', required: true, scaleMin: 1, scaleMax: 10, scaleMinLabel: 'Fatal', scaleMaxLabel: 'De lujo' },
    { id: 'q_sem_2', label: 'Energía en los entrenos', type: 'scale', required: true, scaleMin: 1, scaleMax: 10 },
    { id: 'q_sem_3', label: 'Pasos diarios de media', type: 'numeric', required: false, unit: 'pasos' },
    { id: 'q_sem_4', label: '¿Algo que quieras contarme?', type: 'text', required: false },
  ],
};
const Q_DOMS: Questionnaire = {
  id: 'q_doms', ownerId: 'coach', title: 'DOM’s o "agujetas"',
  questions: ['CUÁDRICEPS', 'ISQUIOTIBIALES', 'GLÚTEOS', 'PECTORAL', 'TRAPECIO', 'DORSAL'].map((z, i) => ({
    id: `q_doms_${i}`, label: z, type: 'scale' as const, required: true,
    scaleMin: 0, scaleMax: 10, scaleMinLabel: 'Nada', scaleMaxLabel: 'Muchísimo',
    signalKey: `doms.grupo${i}`,
  })),
};
const Q_MEDICIONES: Questionnaire = {
  id: 'q_medic', ownerId: 'coach', title: 'Mediciones',
  questions: [
    { id: 'q_med_1', label: 'Perímetro de cintura (cm)', type: 'numeric', required: true, unit: 'cm' },
    { id: 'q_med_2', label: 'Contorno de pecho (cm)', type: 'numeric', required: true, unit: 'cm' },
  ],
};

const ASIGNACIONES: QuestionnaireAssignment[] = [
  { id: 'as_semanal', questionnaireId: 'q_semanal', athleteId: EMAIL, schedule: { type: 'weekdays', weekdays: [0] }, startDate: haceDias(60), active: true, createdAt: haceDias(60) },
  { id: 'as_doms', questionnaireId: 'q_doms', athleteId: EMAIL, schedule: { type: 'interval', intervalDays: 14 }, startDate: haceDias(56), active: true, createdAt: haceDias(56) },
  { id: 'as_medic', questionnaireId: 'q_medic', athleteId: EMAIL, schedule: { type: 'monthly', dayOfMonth: 26 }, startDate: haceDias(90), active: true, createdAt: haceDias(90) },
];

const RESPUESTAS: QuestionnaireResponse[] = [
  ...[35, 28, 21, 14, 7].map((d, i) => ({
    id: `r_sem_${i}`, questionnaireId: 'q_semanal', assignmentId: 'as_semanal', athleteId: EMAIL,
    submittedAt: `${haceDias(d)}T19:12:00.000Z`,
    answers: [
      { questionId: 'q_sem_1', value: [5, 6, 6, 8, 7][i] },
      { questionId: 'q_sem_2', value: [6, 7, 5, 8, 9][i] },
      { questionId: 'q_sem_3', value: [7200, 8100, 6400, 9500, 10200][i] },
      { questionId: 'q_sem_4', value: ['Semana liada en el trabajo.', 'Mejor.', 'Dormí mal el martes.', 'Todo bien.', 'Muy fino esta semana.'][i] },
    ],
  })),
  ...[28, 14].map((d, i) => ({
    id: `r_doms_${i}`, questionnaireId: 'q_doms', assignmentId: 'as_doms', athleteId: EMAIL,
    submittedAt: `${haceDias(d)}T20:00:00.000Z`,
    answers: Q_DOMS.questions.map((q, j) => ({ questionId: q.id, value: (i + j) % 8 })),
  })),
  {
    id: 'r_medic_0', questionnaireId: 'q_medic', assignmentId: 'as_medic', athleteId: EMAIL,
    submittedAt: `${haceDias(40)}T09:00:00.000Z`,
    answers: [{ questionId: 'q_med_1', value: 88.5 }, { questionId: 'q_med_2', value: 103 }],
  },
];

// ── Peso, medidas y fotos ─────────────────────────────────────────────────────
const PESOS: BodyweightLog[] = Array.from({ length: 12 }, (_, i) => ({
  id: `bw_${i}`, athleteId: EMAIL, date: haceDias(77 - i * 7),
  weight: Math.round((84.2 - i * 0.32) * 10) / 10, kind: 'daily' as const,
  createdAt: `${haceDias(77 - i * 7)}T07:30:00.000Z`,
}));

const MEDIDAS: BodyMeasurement[] = ([['cintura', 91], ['pecho', 101], ['cuello', 39], ['cadera', 99], ['biceps_der_contraido', 36]] as const)
  .flatMap(([key, base]) => [0, 1, 2].map(i => ({
    id: `bm_${key}_${i}`, athleteId: EMAIL, date: haceDias(70 - i * 28),
    metricKey: key, value: Math.round((base - i * 0.9) * 10) / 10,
    unit: 'cm' as const, source: 'questionnaire' as const,
    createdAt: `${haceDias(70 - i * 28)}T09:00:00.000Z`,
  })));

const FOTOS: ProgressPhoto[] = [];
const ASIG_FOTOS: PhotoAssignment[] = [];

const CHECKINS: WeightCheckIn[] = [21, 14, 7].map((d, i) => ({
  id: `ck_${i}`, userId: 'dev', email: EMAIL,
  timestamp: new Date(`${haceDias(d)}T18:00:00.000Z`),
  dateStr: haceDias(d), weight: [81.6, 81.0, 80.4][i], mood: '😊',
  adherence: (['Sí', 'Parcial', 'Sí'] as const)[i],
  notes: ['Semana redonda, cero saltos de dieta.', 'Comí fuera dos veces.', 'Muy bien, con energía de sobra.'][i],
  coachFeedback: i < 2 ? 'Perfecto, seguimos igual. Sube 5 min de zona 2 el viernes.' : undefined,
}));

export default function RevisionDevHarness() {
  // `?abierto=1` despliega todos los <details> de la pantalla, para poder
  // capturarla entera de una vez (el histórico de respuestas y los futuros
  // vienen plegados por defecto).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('abierto')) return;
    const t = setTimeout(() => document.querySelectorAll('details').forEach(d => { d.open = true; }), 400);
    return () => clearTimeout(t);
  }, []);

  const client = useMemo(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } } });
    qc.setQueryData(pesoUltimoKey(EMAIL), PESOS[PESOS.length - 1]);
    qc.setQueryData(pesoPrimeroKey(EMAIL), PESOS[0]);
    qc.setQueryData(bodyweightForAthleteKey(EMAIL), PESOS);
    qc.setQueryData(bodyMeasurementsForAthleteKey(EMAIL), MEDIDAS);
    qc.setQueryData(['assignmentsForAthlete', EMAIL], ASIGNACIONES);
    qc.setQueryData(['responsesForAthlete', EMAIL], RESPUESTAS);
    for (const q of [Q_SEMANAL, Q_DOMS, Q_MEDICIONES]) qc.setQueryData(['questionnaireById', q.id], q);
    qc.setQueryData(['mesocycles', EMAIL], []);
    qc.setQueryData(['photoAssignmentsForAthlete', EMAIL], ASIG_FOTOS);
    qc.setQueryData(['progressPhotos', EMAIL], FOTOS);
    return qc;
  }, []);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest mb-3">/dev/revision — datos de mentira</p>
          <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5">
            <CheckInScreen profile={PERFIL} checkins={CHECKINS} />
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
