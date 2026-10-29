/* «Hecho hoy»: lo que se aplicó en las últimas 24 h, lo hiciera Dani al
   aprobar una propuesta, el latido de la noche o el asistente solo. Cada fila
   dice qué cambió y por qué, y se puede DESHACER si guardó el snapshot de
   antes. Antes de esto el latido escribía y nadie lo veía: solo un recuento
   sin nombres en `latidos/{fecha}`.

   Vive en la pantalla de inicio del coach, encima de la bandeja del día. Este
   archivo es la LÓGICA; la capa visual está en autopiloto/HechoHoyVista.tsx
   (variante «cronología», elegida el 29-10). */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '../types';
import { getAiProposalsRecientes } from '../dbService';
import { useProposalActions } from './ai/useProposalActions';
import HechoHoyVista from './autopiloto/HechoHoyVista';

const HORAS = 24;

export default function HechoHoy({ athletes }: { athletes: UserProfile[] }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const desde = useMemo(() => new Date(Date.now() - HORAS * 3600_000).toISOString(), []);
  const { data: recientes = [] } = useQuery({
    queryKey: ['aiProposalsRecientes', desde],
    queryFn: () => getAiProposalsRecientes(desde),
  });
  const acciones = useProposalActions({ onError: msg => setError(msg || null) });
  const nombreDe = (email: string) => athletes.find(a => a.email.toLowerCase() === email.toLowerCase())?.displayName || email;

  return (
    <HechoHoyVista
      recientes={recientes} horas={HORAS} error={error} ocupadaId={acciones.reviewingId}
      nombreDe={nombreDe} onIr={email => navigate(`/clients/${encodeURIComponent(email)}/revision`)} onDeshacer={p => acciones.deshacer(p)}
    />
  );
}
