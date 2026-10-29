import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MensajeCoach, UserProfile } from '../types';
import { pesoUltimoKey } from '../hooks/useAthleteWeight';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';
import PlanInPreparationCard from './PlanInPreparationCard';
import PrimeraSemanaCard from './home/PrimeraSemanaCard';
import { claveMensajesAtleta } from './home/LoUltimoDeDani';

/* Banco de pruebas de la primera semana (29-10) — `/dev/primera-semana`:
   la sala de espera con fecha comprometida y el mensaje «he leído tu alta»,
   y la lista «Tu primera semana» en Inicio (día 3, un paso hecho). */

const HOY = hoyIsoLocal();
const EMAIL = 'dev.atleta@example.com';
const base: UserProfile = { userId: 'uid_dev', email: EMAIL, displayName: 'David Macías', role: 'client', avatarUrl: '', level: 0, currentStreak: 0, maxStreak: 0, initialWeight: 0, targetWeight: 0, actualWeight: 0, createdAt: `${addDays(HOY, -1)}T10:00:00.000Z` };
const ESPERANDO: UserProfile = { ...base, planPrometidoPara: addDays(HOY, 2) };
const CON_PLAN: UserProfile = { ...base, planPublishedAt: `${addDays(HOY, -2)}T10:00:00.000Z` };
const MENSAJES: MensajeCoach[] = [{
  id: 'alta_leida', athleteId: EMAIL, tipo: 'implantacion', autor: 'coach', estado: 'aprobado', fecha: HOY, creadoEn: '', firmadoEn: '',
  texto: 'He leído tu alta, David. Lo del hombro lo tengo en cuenta y empezamos con 4 días, como me has dicho. El jueves tienes el plan.',
}];

export default function PrimeraSemanaDevHarness() {
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    c.setQueryData(['progressPhotos', EMAIL], []);
    c.setQueryData(pesoUltimoKey(EMAIL), null);
    c.setQueryData(claveMensajesAtleta(EMAIL, addDays(HOY, -29)), MENSAJES);
    return c;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-sm mx-auto space-y-6">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/primera-semana — datos de mentira</p>
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">Día 0 · sala de espera</p>
          <PlanInPreparationCard profile={ESPERANDO} onNavigate={() => undefined} />
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">Día 3 · Inicio</p>
          <PrimeraSemanaCard
            profile={CON_PLAN}
            assignments={[{ date: addDays(HOY, -1), status: 'completed' }, { date: HOY, status: 'pending' }]}
            pesos={[]}
            respuestas={[]}
            onNavigate={() => undefined}
          />
        </div>
      </div>
    </QueryClientProvider>
  );
}
