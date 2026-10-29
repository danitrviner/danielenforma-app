import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Contacto, Mesocycle, QuestionnaireResponse, SenalesDelAtleta, UserProfile, WorkoutAssignment } from '../types';
import HomeCoachScreen from './HomeCoachScreen';
import { claveRespuestasDeBandeja, clavePlantillasDelCoach, desdeDeLaBandeja } from '../hooks/useRevisionesSinLeer';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de la bandeja del día + panel de retención (28-10-2026).
   Ruta `/dev/bandeja`, solo en desarrollo.

   No hay sesión de coach en desarrollo (`isCoach()` va por el correo real de
   Dani), así que todo lo que HomeCoachScreen pide por react-query se siembra
   aquí en la caché con `staleTime: Infinity`: ninguna consulta sale a
   Firestore. «Ya le he escrito» sí intenta escribir y fallará por permisos:
   es lo esperado aquí.

   El fixture cubre cada señal nueva: uno apagándose por días sin registrar,
   uno por sesiones perdidas, uno sin contestar la revisión, una revisión sin
   respuesta del coach, un bloque terminado sin siguiente, un alta parada y
   dos que van bien (uno en su primera semana).
   ═══════════════════════════════════════════════════════════════════════════ */

const HOY = hoyIsoLocal();
const COACH = 'dev.coach@example.com';

const senales = (p: Partial<SenalesDelAtleta>): SenalesDelAtleta => ({
  calculadoEn: HOY, ultimoRegistro: HOY, registros14d: 9, perdidas14d: 0, ultimaRespuesta: addDays(HOY, -4), tieneCuestionarios: true, ...p,
});
const perfil = (email: string, nombre: string, p: Partial<UserProfile> = {}): UserProfile => ({
  userId: email, email, displayName: nombre, role: 'client', avatarUrl: '', level: 1, currentStreak: 3, maxStreak: 9,
  initialWeight: 0, targetWeight: 0, actualWeight: 0,
  planPublishedAt: `${addDays(HOY, -40)}T10:00:00.000Z`, createdAt: `${addDays(HOY, -42)}T10:00:00.000Z`,
  lastLoginAt: `${HOY}T08:00:00.000Z`, telefono: { prefijo: '+34', numero: '600000000' },
  senales: senales({}),
  ...p,
});

const ATLETAS: UserProfile[] = [
  perfil('israel@example.com', 'Israel Cabrera'),
  perfil('nuevo@example.com', 'David Macías', { planPublishedAt: `${addDays(HOY, -2)}T10:00:00.000Z`, createdAt: `${addDays(HOY, -4)}T10:00:00.000Z`, senales: senales({ registros14d: 2 }) }),
  perfil('ander@example.com', 'Ander Novo', { senales: senales({ ultimoRegistro: addDays(HOY, -6), perdidas14d: 5, ultimaRespuesta: addDays(HOY, -16) }), lastLoginAt: `${addDays(HOY, -6)}T08:00:00.000Z` }),
  perfil('daniel@example.com', 'Daniel Briz', { senales: senales({ perdidas14d: 4 }) }),
  perfil('marco@example.com', 'Marco Delgado', { senales: senales({ ultimaRespuesta: addDays(HOY, -20) }) }),
  perfil('pedro@example.com', 'Pedro Bonares', { senales: senales({ ultimoRegistro: addDays(HOY, -1) }) }),
  perfil('javier@example.com', 'Javier Vergara'),
  perfil('roberto@example.com', 'Roberto Cortés', { planPublishedAt: undefined, createdAt: `${addDays(HOY, -26)}T10:00:00.000Z`, senales: undefined, lastLoginAt: `${addDays(HOY, -25)}T08:00:00.000Z` }),
];

const asignacion = (email: string): WorkoutAssignment[] =>
  [{ id: `as_${email}`, athleteId: email, workoutId: 'w1', date: HOY, status: 'pending' }];
const ASIGNACIONES = new Map(ATLETAS.filter(a => a.email !== 'roberto@example.com').map(a => [a.email, asignacion(a.email)]));

const MESOCICLOS: Mesocycle[] = [
  { id: 'm_pedro', athleteId: 'pedro@example.com', startDate: addDays(HOY, -6 * 7 - 5), weeks: 6 } as Mesocycle,
  { id: 'm_javier', athleteId: 'javier@example.com', startDate: addDays(HOY, -7 * 7), weeks: 8 } as Mesocycle,
  { id: 'm_israel', athleteId: 'israel@example.com', startDate: addDays(HOY, -3 * 7), weeks: 10 } as Mesocycle,
];

const respuesta = (email: string, dia: string, p: Partial<QuestionnaireResponse> = {}): QuestionnaireResponse => ({
  id: `r_${email}_${dia}`, questionnaireId: 'q_semana', assignmentId: 'a', athleteId: email, submittedAt: `${dia}T18:30:00.000Z`, answers: [], ...p,
});
const RESPUESTAS: QuestionnaireResponse[] = [
  respuesta('javier@example.com', addDays(HOY, -3)),
  respuesta('javier@example.com', addDays(HOY, -3), { id: 'r_javier_dom', questionnaireId: 'q_doms' }),
  respuesta('israel@example.com', addDays(HOY, -2), { respuestaCoach: { texto: 'Buena semana.', enviadaEn: `${addDays(HOY, -1)}T09:00:00.000Z` } }),
  respuesta('daniel@example.com', addDays(HOY, -9), { respuestaCoach: { texto: 'Seguimos.', enviadaEn: `${addDays(HOY, -2)}T09:00:00.000Z` } }),
  respuesta('pedro@example.com', HOY),
];

const CONTACTOS: Contacto[] = [
  { id: 'c1', athleteId: 'marco@example.com', fecha: addDays(HOY, -1), motivo: 'sin_revision', canal: 'whatsapp', createdAt: `${addDays(HOY, -1)}T10:00:00.000Z` },
];

export default function BandejaDevHarness() {
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    const desde = desdeDeLaBandeja();
    c.setQueryData(['crmSuscripciones'], []);
    c.setQueryData(['aiProposalsPendientes'], []);
    c.setQueryData(['mesocyclesForAthletes', ATLETAS.map(a => a.email)], MESOCICLOS);
    c.setQueryData(['contactos', addDays(HOY, -28)], CONTACTOS);
    c.setQueryData(clavePlantillasDelCoach(COACH), [{ id: 'q_semana', title: 'Tu semana' }, { id: 'q_doms', title: 'DOM\'s' }]);
    c.setQueryData(claveRespuestasDeBandeja(['q_semana', 'q_doms'], desde), RESPUESTAS);
    return c;
  }, []);

  return (
    <QueryClientProvider client={client}>
      {/* App.tsx ya monta el Router: el harness vive dentro de él. */}
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/bandeja — datos de mentira</p>
          <HomeCoachScreen athletes={ATLETAS} coachId={COACH} checkins={[]} assignmentsByEmail={ASIGNACIONES} loadingAssignments={false} />
        </div>
      </div>
    </QueryClientProvider>
  );
}
