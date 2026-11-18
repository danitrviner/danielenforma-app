import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMesocycles } from '../../db/training';
import { mapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta';
import {
  PIE_DE_INDICIOS, fotosDeLosBloques, indiciosDeRespuesta, indiciosParaLaFicha,
} from '../../utils/hipotesisDeBloque/respuestaADosis';
import { selloDeLectura } from '../../utils/hipotesisDeBloque/veredictosDelCierre';
import { fechaCorta } from '../../utils/trainingWeek';

/* «Qué le funciona» — el mapa de respuesta del atleta en su ficha viva
   (17-11-2026). Sale de los cierres de bloque FIRMADOS (Revisión › Cierre de
   bloque): a qué palanca ha respondido cada zona y cuántas veces. No se edita
   aquí: es un hecho, no un juicio. Sin ningún bloque con hipótesis no aparece.
   Los bloques de «mejora, menos de lo buscado» (auditoría de cifras,
   17-11-2026) no suman ni restan en el «2 de 2»: la frase los dice aparte y
   su sello va en gris.

   18-11-2026 (a qué responde): debajo, los indicios de las fotos firmadas de
   sus bloques (`respuestaADosis.ts`), resumidos a los que se repiten y el
   mejor indicio. La lista entera está en Revisión › Cierre de bloque. */

const TONO = { bien: 'text-success', atencion: 'text-warning', neutro: 'text-ink-3' } as const;

export default function QueLeFunciona({ athleteEmail }: { athleteEmail: string }) {
  // Misma clave que el resto de la ficha del cliente: casi siempre ya está en caché.
  const { data: bloques = [] } = useQuery({
    queryKey: ['mesocycles', athleteEmail],
    queryFn: () => getMesocycles(athleteEmail),
    enabled: !!athleteEmail,
  });
  const mapa = useMemo(() => mapaDeRespuesta(bloques), [bloques]);
  const indicios = useMemo(() => indiciosParaLaFicha(indiciosDeRespuesta(fotosDeLosBloques(bloques))), [bloques]);
  const conHipotesis = bloques.some(b => Object.keys(b.hipotesis ?? {}).length > 0);
  if (mapa.zonas.length === 0 && !conHipotesis && indicios.length === 0) return null;

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
      {indicios.length > 0 && (
        <>
          <span className="text-label text-ink pt-1">A qué responde</span>
          <ul className="flex flex-col gap-1">
            {indicios.map(i => (
              <li key={i.id} className="text-label text-ink-2">
                <span className={`text-caption font-bold ${i.grado === 'se_repite' ? TONO.bien : TONO.neutro}`}>
                  {i.grado === 'se_repite' ? 'Se repite' : 'Indicio'}:
                </span>{' '}
                {i.frase} <span className="text-caption text-ink-3">({i.casosTexto})</span>
              </li>
            ))}
          </ul>
          <span className="text-caption text-ink-3">{PIE_DE_INDICIOS}</span>
        </>
      )}
    </div>
  );
}
