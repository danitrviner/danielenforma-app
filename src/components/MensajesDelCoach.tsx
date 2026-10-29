/* Los mensajes del coach al atleta fuera de la revisión (`mensajesCoach`,
   diseño §6): el canal único por el que le llegan los textos de los episodios
   (qué cambia esta semana, una pregunta por sus faltas…). Firma Dani, siempre.
   Vive en Inicio, debajo de la nota del día. Marcar leído escribe `leidoEn`
   (las reglas solo le dejan tocar ese campo).

   Este archivo es la LÓGICA; la capa visual está en
   autopiloto/MensajesCoachVista.tsx en tres variantes que se comparan en
   /dev/autopiloto; `variante` elige cuál. */
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MensajeCoach } from '../types';
import { getMensajesCoach, marcarMensajeLeido } from '../dbService';
import MensajesCoachVista, { type VarianteMensajes } from './autopiloto/MensajesCoachVista';

export const VARIANTE_MENSAJES_ACTUAL: VarianteMensajes = 'A';
export const FIRMA_COACH = 'Dani';

export default function MensajesDelCoach({ athleteEmail, variante = VARIANTE_MENSAJES_ACTUAL }: { athleteEmail: string; variante?: VarianteMensajes }) {
  const queryClient = useQueryClient();
  const clave = ['mensajesCoach', athleteEmail];
  const { data: mensajes = [] } = useQuery({ queryKey: clave, queryFn: () => getMensajesCoach(athleteEmail) });

  const onLeido = (m: MensajeCoach) => {
    const leidoEn = new Date().toISOString();
    // Optimista: el atleta lo ve leído al instante; si falla, se queda sin
    // marcar y volverá a salir como nuevo, que es lo honesto.
    queryClient.setQueryData<MensajeCoach[]>(clave, prev => (prev ?? []).map(x => x.id === m.id ? { ...x, leidoEn } : x));
    marcarMensajeLeido(m.id).catch(err => {
      console.warn('No se pudo marcar el mensaje como leído:', err);
      queryClient.invalidateQueries({ queryKey: clave });
    });
  };

  return <MensajesCoachVista variante={variante} mensajes={mensajes} firma={FIRMA_COACH} onLeido={onLeido} />;
}
