import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMesocycles } from '../../db/training';
import { mapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta';
import { selloDeLectura } from '../../utils/hipotesisDeBloque/veredictosDelCierre';
import { fechaCorta } from '../../utils/trainingWeek';

/* «Qué le funciona» — el mapa de respuesta del atleta en su ficha viva
   (17-11-2026). Sale de los cierres de bloque FIRMADOS (Revisión › Cierre de
   bloque): a qué palanca ha respondido cada zona y cuántas veces. No se edita
   aquí: es un hecho, no un juicio. Sin ningún bloque con hipótesis no aparece. */

const TONO = { bien: 'text-success', atencion: 'text-warning', neutro: 'text-ink-3' } as const;

export default function QueLeFunciona({ athleteEmail }: { athleteEmail: string }) {
  // Misma clave que el resto de la ficha del cliente: casi siempre ya está en caché.
  const { data: bloques = [] } = useQuery({
    queryKey: ['mesocycles', athleteEmail],
    queryFn: () => getMesocycles(athleteEmail),
    enabled: !!athleteEmail,
  });
  const mapa = useMemo(() => mapaDeRespuesta(bloques), [bloques]);
  const conHipotesis = bloques.some(b => Object.keys(b.hipotesis ?? {}).length > 0);
  if (mapa.zonas.length === 0 && !conHipotesis) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-label text-ink">Qué le funciona</span>
      <span className="text-caption text-ink-3">De los cierres de bloque firmados: a qué ha respondido cada zona con estrella.</span>
      {mapa.zonas.length === 0 ? (
        <p className="text-caption text-ink-2">Todavía no hay ningún cierre firmado. Se firma en Revisión › Cierre de bloque, al terminar el bloque.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {mapa.zonas.map(z => (
            <li key={z.zona} className="text-label text-ink-2">
              {z.frase}
              {z.ultima && (
                <span className={`text-caption ${TONO[selloDeLectura(z.ultima.lectura).tono]}`}>
                  {' '}Último: {selloDeLectura(z.ultima.lectura).texto.toLowerCase()} ({fechaCorta(z.ultima.firmadoEn.slice(0, 10), { anio: true })}).
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
