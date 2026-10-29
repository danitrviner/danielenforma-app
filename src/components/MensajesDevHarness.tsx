import React, { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CoachDayNote, MensajeCoach, QuestionnaireResponse, UserProfile } from '../types';
import type { CambioAtleta } from '../utils/cambiosAtleta';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';
import LoUltimoDeDani, { claveMensajesAtleta, DIAS_LO_ULTIMO } from './home/LoUltimoDeDani';
import MensajesCoachPanel, { claveMensajesCoach } from './revision/MensajesCoachPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas del canal de mensajes (29-10) — `/dev/mensajes`.
   Arriba, lo que ve el atleta en Inicio («Lo último de Dani»); abajo, el
   panel del coach en Cliente › Revisión. Mismos datos, dos lados. Todo en
   caché con `staleTime: Infinity`; escribir fallará por permisos aquí.
   ═══════════════════════════════════════════════════════════════════════════ */

const HOY = hoyIsoLocal();
const EMAIL = 'dev.atleta@example.com';
const ATLETA: UserProfile = { userId: 'uid_dev', email: EMAIL, displayName: 'Javier Vergara', role: 'client', avatarUrl: '', level: 1, currentStreak: 4, maxStreak: 9, initialWeight: 0, targetWeight: 0, actualWeight: 0, planPublishedAt: `${addDays(HOY, -40)}T10:00:00.000Z` };

const MENSAJES: MensajeCoach[] = [
  { id: 'fase_x', athleteId: EMAIL, tipo: 'cambio', autor: 'latido', estado: 'borrador', texto: 'Desde esta semana tu plan de comida pasa a la fase «Déficit 2».', fecha: HOY, creadoEn: '' },
  { id: 'cambio_c1', athleteId: EMAIL, tipo: 'cambio', autor: 'coach', estado: 'aprobado', texto: 'He bajado la dieta Déficit a 2.050 kcal.', porque: 'el peso iba más rápido de lo que quiero y prefiero ir con margen.', fecha: addDays(HOY, -2), creadoEn: '', firmadoEn: '', origen: { coleccion: 'cambiosAtleta', id: 'c1' } },
  { id: 'problema_r1', athleteId: EMAIL, tipo: 'problema', autor: 'app', estado: 'aprobado', texto: 'Recibido: rodilla derecha en la última serie de sentadilla. Lo lee Dani en tu revisión y te dice qué cambia.', fecha: addDays(HOY, -3), creadoEn: '', problema: { estado: 'en_curso', actualizadoEn: '', detalle: 'Esta semana sentadilla fuera y prensa en su lugar; me dices el viernes.' }, origen: { coleccion: 'questionnaireResponses', id: 'r1' } },
];
const CAMBIOS: CambioAtleta[] = [
  { id: 'c1', athleteId: EMAIL, area: 'nutricion', objeto: 'dieta:1', titulo: 'Dieta «Déficit»', lineas: ['Kcal 2.200 → 2.050'], at: `${addDays(HOY, -2)}T11:00:00.000Z`, autor: 'coach' },
  { id: 'c2', athleteId: EMAIL, area: 'entreno', objeto: 'sesion', titulo: 'Sesión Pierna A', lineas: ['Sentadilla → Prensa'], at: `${addDays(HOY, -1)}T11:00:00.000Z`, autor: 'coach' },
];
const RESPUESTAS: QuestionnaireResponse[] = [{
  id: 'r1', questionnaireId: 'q', assignmentId: 'a', athleteId: EMAIL, submittedAt: `${addDays(HOY, -4)}T18:30:00.000Z`, answers: [],
  respuestaCoach: { texto: '', enviadaEn: `${addDays(HOY, -3)}T09:30:00.000Z`, canal: 'app', bloques: { comoHaIdo: 'Buena semana, Javier: 4 de 4 entrenos hechos y el peso en el ritmo que buscamos.', queCambia: 'Sentadilla por prensa.', queEspero: 'Otra semana igual.' } },
}];
const NOTA: CoachDayNote = { id: `${EMAIL}_${HOY}`, athleteId: EMAIL, date: HOY, text: 'Hoy la última serie de press va al fallo: apunta las reps.', createdAt: '' };

export default function MensajesDevHarness() {
  const [vacio, setVacio] = useState(false);
  const client = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    c.setQueryData(claveMensajesAtleta(EMAIL, addDays(HOY, -(DIAS_LO_ULTIMO - 1))), vacio ? [] : MENSAJES.filter(m => m.estado === 'aprobado'));
    c.setQueryData(claveMensajesCoach(EMAIL), MENSAJES);
    c.setQueryData(['cambiosAtleta', EMAIL], CAMBIOS);
    return c;
  }, [vacio]);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-bg text-ink p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <p className="font-mono text-caption text-ink-3 uppercase tracking-widest flex-1">/dev/mensajes — datos de mentira</p>
            <button type="button" onClick={() => setVacio(v => !v)} className="font-mono text-caption uppercase text-accent-ink">{vacio ? 'con mensajes' : 'sin mensajes'}</button>
          </div>
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">Atleta · Inicio</p>
          <div className="max-w-sm">
            <LoUltimoDeDani profile={ATLETA} respuestas={vacio ? [] : RESPUESTAS} notaDeHoy={vacio ? null : NOTA} onNavigate={() => undefined} />
          </div>
          <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">Coach · Cliente › Revisión</p>
          <MensajesCoachPanel athlete={ATLETA} cierre={{ id: 'cierre_m1', fecha: HOY, mesoNombre: 'Hipertrofia 1', texto: 'Bloque «Hipertrofia 1» terminado: 20 de 24 sesiones, 90 % del trabajo programado, 2 récords. Has subido en press banca y en remo; el tercer día te ha costado más, y lo tengo en cuenta para el siguiente.' }} />
        </div>
      </div>
    </QueryClientProvider>
  );
}
