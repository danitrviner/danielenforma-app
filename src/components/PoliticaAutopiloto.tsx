/* La pantalla de POLÍTICA del autopiloto (diseño §5.3): el modo (sombra /
   rodaje / política), la tabla de niveles por tipo de decisión, el presupuesto y
   qué pasa con el menú semanal. Y lo que el rodaje ha medido: por cada tipo,
   cuántas decisiones aprobó Dani sin tocar, cuántas editó, rechazó o deshizo, y
   la subida que se puede proponer con esos números. La subida la acepta él:
   nunca sube sola. Vive en Perfil › Ajustes › Entrenadores › Asistente.

   Este archivo es la LÓGICA (leer, guardar, medir). La capa visual está en
   autopiloto/PoliticaVista.tsx en tres variantes que se comparan en
   /dev/autopiloto; `variante` elige cuál. */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPoliticaAutopiloto, savePoliticaAutopiloto, getAiProposalsRecientes } from '../dbService';
import { estadisticasPorTipo, tipoDeDecision, type PoliticaAutopiloto as Politica } from '../autopiloto/politica';
import PoliticaVista, { type VariantePolitica } from './autopiloto/PoliticaVista';

export const VARIANTE_POLITICA_ACTUAL: VariantePolitica = 'A';

export default function PoliticaAutopiloto({ variante = VARIANTE_POLITICA_ACTUAL }: { variante?: VariantePolitica }) {
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

  if (!politica) return null;

  const guardar = async (nueva: Politica) => {
    setGuardando(true); setMsg(null);
    try { await savePoliticaAutopiloto(nueva); setPolitica(nueva); setMsg('Guardado.'); }
    catch { setMsg('No se pudo guardar.'); }
    finally { setGuardando(false); }
  };

  return <PoliticaVista variante={variante} politica={politica} stats={stats} guardando={guardando} msg={msg} onGuardar={nueva => void guardar(nueva)} />;
}
