/* CALIDAD — la pestaña de Propuestas donde Dani audita en cinco minutos lo que
   el asistente aplicó solo la semana pasada (diseño §5.4). La muestra es
   determinista por semana (calidad.ts). Cada veredicto se guarda en la propia
   propuesta (`calidad`); «no vuelvas» además baja ese tipo de decisión a
   `proponer` en la política y deja una instrucción fija para el asistente.

   Este archivo es la LÓGICA; la capa visual está en CalidadVista.tsx
   (variante «lista», elegida el 29-10). */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AiProposal } from '../../types';
import {
  getAiProposalsPorEstado, getAllUserProfilesOrThrow, updateAiProposal, getPoliticaAutopiloto, savePoliticaAutopiloto,
  getCoachInstructions, saveCoachInstructions,
} from '../../dbService';
import { muestraDeCalidad, resumenCalidad, bajarPorNoVuelvas, instruccionDeNoVuelvas, anadirInstruccionFija, type Veredicto } from '../../autopiloto/calidad';
import { tipoDeDecision } from '../../autopiloto/politica';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import CalidadVista from './CalidadVista';

export default function CalidadAutopiloto() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [juzgandoId, setJuzgandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hoy = hoyIsoLocal();

  const { data: aplicadas = [] } = useQuery({ queryKey: ['aiProposalsPorEstado', 'aplicada'], queryFn: () => getAiProposalsPorEstado(['aplicada']) });
  const { data: perfiles = [] } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfilesOrThrow });
  const { semana, muestra, total } = useMemo(() => muestraDeCalidad(aplicadas, hoy), [aplicadas, hoy]);
  const resumen = useMemo(() => resumenCalidad(aplicadas), [aplicadas]);
  const nombreDe = (email: string) => perfiles.find(u => u.email.toLowerCase() === email.toLowerCase())?.displayName || email;

  const onVeredicto = async (p: AiProposal, veredicto: Veredicto, nota: string) => {
    setJuzgandoId(p.id); setError(null);
    const en = new Date().toISOString();
    try {
      await updateAiProposal(p.id, { calidad: { veredicto, en, ...(nota.trim() ? { nota: nota.trim() } : {}) } });
      if (veredicto === 'no_vuelvas') {
        const tipo = tipoDeDecision(p);
        const { politica, cambio } = bajarPorNoVuelvas(await getPoliticaAutopiloto(), tipo);
        if (cambio) await savePoliticaAutopiloto(politica);
        const texto = await getCoachInstructions();
        await saveCoachInstructions(anadirInstruccionFija(texto, instruccionDeNoVuelvas(p, tipo, en, nota)));
        queryClient.invalidateQueries({ queryKey: ['politicaAutopiloto'] });
      }
      queryClient.invalidateQueries({ queryKey: ['aiProposalsPorEstado'] });
      queryClient.invalidateQueries({ queryKey: ['aiProposalsRecientes'] });
    } catch (err) {
      console.error('No se pudo guardar el veredicto:', err);
      setError('No se pudo guardar el veredicto. Inténtalo de nuevo.');
    } finally {
      setJuzgandoId(null);
    }
  };

  return (
    <CalidadVista
      semana={semana} muestra={muestra} total={total} resumen={resumen} nombreDe={nombreDe}
      juzgandoId={juzgandoId} error={error} onVeredicto={onVeredicto}
      onIrAlAtleta={email => navigate(`/clients/${encodeURIComponent(email)}/revision`)}
    />
  );
}
