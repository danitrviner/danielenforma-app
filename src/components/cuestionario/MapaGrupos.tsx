import React from 'react';
import { MUSCLE_LABELS, type QuestionnaireQuestion } from '../../types';
import { ZONAS_IEM, type ZonaIem } from '../../utils/cdg/zonas';
import MapaCorporal from './MapaCorporal';

/* Pregunta de «elige grupos musculares» pintada como mapa (cierre de bloque:
   grupos a priorizar / con demasiado volumen). La respuesta sigue siendo la de
   siempre —las etiquetas de los grupos separadas por comas— para que el
   sugeridor de volumen la lea igual. Tocar una zona marca todos sus grupos
   (Deltoides = anterior, lateral y posterior). */

export const esPreguntaDeMapa = (q: QuestionnaireQuestion) =>
  q.type === 'choice' && !!q.multiSelect && (q.presentacion === 'mapa' || /^meso_end\.(priority|overload)_groups$/.test(q.signalKey ?? ''));

interface Props {
  pregunta: QuestionnaireQuestion;
  valor: string | undefined;
  onChange: (valor: string) => void;
}

export default function MapaGrupos({ pregunta, valor, onChange }: Props) {
  const opciones = new Set(pregunta.options ?? []);
  const elegidas = new Set((valor ?? '').split(',').filter(Boolean));
  const etiquetasDe = (z: ZonaIem) => (ZONAS_IEM.find(x => x.clave === z)?.grupos ?? [])
    .map(g => MUSCLE_LABELS[g]).filter(l => opciones.has(l));

  const seleccion = new Set(ZONAS_IEM.filter(z => etiquetasDe(z.clave).some(l => elegidas.has(l))).map(z => z.clave));

  const alternar = (z: ZonaIem) => {
    const ets = etiquetasDe(z);
    const marcada = seleccion.has(z);
    const nuevas = new Set(elegidas);
    for (const l of ets) { if (marcada) nuevas.delete(l); else nuevas.add(l); }
    onChange([...(pregunta.options ?? [])].filter(o => nuevas.has(o)).join(','));
  };

  const nombres = ZONAS_IEM.filter(z => seleccion.has(z.clave)).map(z => z.nombre);
  return (
    <div className="space-y-2">
      <MapaCorporal seleccion={seleccion} onZona={alternar} alto={150} />
      <p className="font-sans text-caption text-ink-3 text-pretty min-h-[1.25rem]">
        {nombres.length > 0 ? nombres.join(' · ') : 'Toca las zonas en el dibujo. Si no hay ninguna, sigue sin marcar.'}
      </p>
    </div>
  );
}
