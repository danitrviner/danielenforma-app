import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserProfile, WeightCheckIn } from '../types';
import { hoyIsoLocal } from '../utils/trainingWeek';
import ClientsScreen from './ClientsScreen';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de la LISTA DE CLIENTES del coach — ruta `/dev/clientes`,
   solo en desarrollo. TEMPORAL: creado para la revisión del modo claro
   (docs/revision-modo-claro-2026-10-27.md); se borra o se queda según diga
   Dani. Perfiles sembrados en la caché de react-query; las consultas que no
   se siembran (revisiones sin leer, tareas vencidas…) fallan sin sesión y la
   pantalla las trata como vacías.
   ═══════════════════════════════════════════════════════════════════════════ */

const COACH_ID = 'coach_dev';
const COACH_EMAIL = 'coach@example.com';
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

function perfil(i: number, nombre: string, extra: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: `uid_${i}`, email: `${nombre.split(' ')[0].toLowerCase()}@example.com`, displayName: nombre, role: 'client',
    avatarUrl: '', level: i, currentStreak: i * 2, maxStreak: 10, initialWeight: 90, targetWeight: 80, actualWeight: 84,
    planStartDate: iso(haceDias(60 + i * 10)), planDurationMonths: 6, createdAt: haceDias(90).toISOString(),
    lastLoginAt: haceDias(i).toISOString(),
    ...extra,
  } as UserProfile;
}

const PERFILES: UserProfile[] = [
  perfil(1, 'Marcos García'),
  perfil(2, 'Nora Fernández'),
  perfil(3, 'Gonzalo Miranda', { setupSummary: { pct: 40, attention: 2, updatedAt: haceDias(3).toISOString() } }),
  perfil(4, 'Lucía Ortega'),
  perfil(5, 'Javier Soto', { planStartDate: iso(haceDias(170)), planDurationMonths: 6 }),
  perfil(6, 'Andrea Pons'),
  perfil(7, 'Pablo Ruiz', { estadoCrm: 'baja' as UserProfile['estadoCrm'], fechaBaja: iso(haceDias(20)) } as Partial<UserProfile>),
];

const CHECKINS: WeightCheckIn[] = PERFILES.slice(0, 5).map((p, i) => ({
  id: `c_${i}`, userId: p.userId, email: p.email, timestamp: haceDias(i), dateStr: iso(haceDias(i)),
  weight: 84 - i * 0.3, mood: '😊', adherence: 'Sí', notes: i === 1 ? 'Esta semana he dormido fatal.' : '',
}));

export default function ClientesDevHarness() {
  const client = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } },
    });
    qc.setQueryData(['userProfiles'], PERFILES);
    for (const p of PERFILES) qc.setQueryData(['workoutAssignments', p.userId], []);
    qc.setQueryData(['coachTasksVencidas', hoyIsoLocal()], []);
    qc.setQueryData(['coachNotes'], []);
    qc.setQueryData(['crmSuscripciones'], []);
    qc.setQueryData(['aiProposalsPendientes'], []);
    qc.setQueryData(['questionnairesByCoach', COACH_ID], []);
    return qc;
  }, []);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg">
        <p className="px-4 pt-3 font-mono text-caption uppercase tracking-wider text-ink-3">/dev/clientes — datos de mentira</p>
        <div className="mx-auto max-w-5xl p-4">
          <ClientsScreen checkins={CHECKINS} onRefreshCheckIns={() => {}} coachId={COACH_ID} coachEmail={COACH_EMAIL} />
        </div>
      </div>
    </QueryClientProvider>
  );
}
