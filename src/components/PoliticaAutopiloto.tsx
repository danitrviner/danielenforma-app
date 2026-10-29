/* La pantalla de POLÍTICA del autopiloto (diseño §5.3): el modo (sombra /
   rodaje / política), la tabla de niveles por tipo de decisión, el presupuesto y
   qué pasa con el menú semanal. Y lo que el rodaje ha medido: por cada tipo,
   cuántas decisiones aprobó Dani sin tocar, cuántas editó, rechazó o deshizo, y
   la subida que se puede proponer con esos números. La subida la acepta él:
   nunca sube sola. Vive en Perfil › Ajustes › Entrenadores › Asistente.

   Este archivo es la LÓGICA (leer, guardar, medir). La capa visual está en
   autopiloto/PoliticaVista.tsx (variante «semáforo», elegida el 29-10). */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPoliticaAutopiloto, savePoliticaAutopiloto, getAiProposalsRecientes, getAiProposalsPorEstado, getResponsesForAthlete, getAllUserProfilesOrThrow } from '../dbService';
import { getCambiosAtleta } from '../db/cambios';
import { estadisticasPorTipo, tipoDeDecision, type PoliticaAutopiloto as Politica } from '../autopiloto/politica';
import { compararSombra, informeDeSombra } from '../autopiloto/sombra';
import PoliticaVista from './autopiloto/PoliticaVista';

export default function PoliticaAutopiloto() {
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void getPoliticaAutopiloto().then(setPolitica); }, []);

  const desde = useMemo(() => new Date(Date.now() - 90 * 864e5).toISOString(), []);
  const { data: recientes = [] } = useQuery({ queryKey: ['aiProposalsRecientes', desde], queryFn: () => getAiProposalsRecientes(desde) });
  const stats = useMemo(() => {
    const editadas = new Set(recientes.filter(p => p.expediente?.notaAlAprobar).map(p => p.id));
    return new Map(estadisticasPorTipo(recientes, editadas, p => tipoDeDecision(p)).map(e => [e.tipo, e]));
  }, [recientes]);

  // Sombra: cada decisión del asistente en sombra frente a lo que hizo Dani con
  // ese atleta en la semana siguiente (sus aprobaciones, sus cambios a mano, sus
  // respuestas). Solo se leen los atletas que tienen alguna sombra.
  const { data: sombras = [] } = useQuery({ queryKey: ['aiProposalsPorEstado', 'sombra'], queryFn: () => getAiProposalsPorEstado(['sombra']) });
  const atletasEnSombra = useMemo(() => [...new Set(sombras.map(p => p.athleteId))].sort(), [sombras]);
  const { data: referencia } = useQuery({
    queryKey: ['referenciaSombra', atletasEnSombra],
    enabled: atletasEnSombra.length > 0,
    queryFn: async () => {
      const porAtleta = await Promise.all(atletasEnSombra.map(async email => ({
        cambios: await getCambiosAtleta(email).catch(() => []),
        respuestas: await getResponsesForAthlete(email).catch(() => []),
      })));
      return { cambios: porAtleta.flatMap(x => x.cambios), respuestas: porAtleta.flatMap(x => x.respuestas) };
    },
  });
  const sombra = useMemo(() => informeDeSombra(compararSombra(sombras, {
    propuestas: recientes, cambios: referencia?.cambios ?? [], respuestas: referencia?.respuestas ?? [],
  }, new Date().toISOString())), [sombras, recientes, referencia]);

  const { data: perfiles = [] } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfilesOrThrow });
  const atletas = useMemo(() => perfiles
    .filter(u => u.role === 'client' && u.estadoCrm !== 'baja')
    .map(u => ({ email: u.email.toLowerCase(), nombre: u.displayName || u.email }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [perfiles]);

  if (!politica) return null;

  const guardar = async (nueva: Politica) => {
    setGuardando(true); setMsg(null);
    try { await savePoliticaAutopiloto(nueva); setPolitica(nueva); setMsg('Guardado.'); }
    catch { setMsg('No se pudo guardar.'); }
    finally { setGuardando(false); }
  };

  return <PoliticaVista politica={politica} stats={stats} guardando={guardando} msg={msg} sombra={sombra} atletas={atletas} onGuardar={nueva => void guardar(nueva)} />;
}
