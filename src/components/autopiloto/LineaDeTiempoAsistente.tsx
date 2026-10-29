/* «Lo que ha hecho el asistente» con un atleta (diseño §5.2): la línea de
   tiempo por episodio con sus decisiones (antes → después, política, resultado
   del esperado) y «Plan inicial vs ahora». Vive en la pestaña Revisión del
   coach, antes de «Lo que he cambiado», que es lo que hizo Dani a mano.

   Este archivo es la LÓGICA (leer y construir); la capa visual está en
   LineaDeTiempoVista.tsx (variante «tarjetas», elegida el 29-10). */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { getEpisodiosDeAtleta, getAiProposalsForAthlete, getMesocycles, getDietsForAthlete, getPoliticaAutopiloto } from '../../dbService';
import { construirLineaDeTiempo } from '../../autopiloto/lineaDeTiempo';
import LineaDeTiempoVista from './LineaDeTiempoVista';

export default function LineaDeTiempoAsistente({ athlete, presentando = false }: { athlete: UserProfile; presentando?: boolean }) {
  const navigate = useNavigate();
  const email = athlete.email;
  const { data: episodios = [], isPending: p1 } = useQuery({ queryKey: ['episodios', email], queryFn: () => getEpisodiosDeAtleta(email) });
  const { data: propuestas = [], isPending: p2 } = useQuery({ queryKey: ['aiProposalsForAthlete', email], queryFn: () => getAiProposalsForAthlete(email) });
  const { data: mesociclos = [] } = useQuery({ queryKey: ['mesocycles', email], queryFn: () => getMesocycles(email) });
  const { data: dietas = [] } = useQuery({ queryKey: ['diets', email], queryFn: () => getDietsForAthlete(email) });
  const { data: politica } = useQuery({ queryKey: ['politicaAutopiloto'], queryFn: getPoliticaAutopiloto });

  const linea = useMemo(() => {
    const primerMeso = [...mesociclos].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const inicioPlan = athlete.planStartDate ?? primerMeso?.startDate;
    return construirLineaDeTiempo(episodios, propuestas, { inicioPlan, mesociclos, dietas });
  }, [episodios, propuestas, mesociclos, dietas, athlete.planStartDate]);

  return (
    <LineaDeTiempoVista
      linea={linea} modo={politica?.modo ?? 'sombra'} cargando={p1 || p2} presentando={presentando}
      onIrAPropuesta={id => navigate(`/propuestas?filtro=aplicadas&propuesta=${encodeURIComponent(id)}`)}
    />
  );
}
