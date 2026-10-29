import React from 'react';
import type { QuestionnaireResponse, RespuestaCoachRevision } from '../../types';
import { COACH_NOMBRE } from '../../utils/coach';
import { TITULOS_BLOQUES } from '../../utils/borradorRespuesta';
import { Icon } from '../ui';
import { VARIANTES } from '../../data/variantes';

/* «Dani ha revisado tu semana» (27-10, con nombre y bloques desde el 29-10):
   la última respuesta del coach a una revisión. En Perfil › Revisión se
   enseñan las de las dos últimas semanas; en Inicio, solo la de los últimos
   siete días (`maxDias`). Después ya es historia y estorba.

   Si la respuesta fue por WhatsApp (`canal: 'whatsapp'`), la tarjeta lo dice
   en vez de quedarse muda: el atleta ve que hubo respuesta aunque el texto
   esté en otro sitio. */

const DIA_MS = 86400000;

export function ultimaRespuestaDelCoach(responses: QuestionnaireResponse[], maxDias: number, ahora = Date.now()): RespuestaCoachRevision | null {
  const ultima = responses
    .filter(r => r.respuestaCoach && ahora - new Date(r.respuestaCoach.enviadaEn).getTime() < maxDias * DIA_MS)
    .sort((a, b) => b.respuestaCoach!.enviadaEn.localeCompare(a.respuestaCoach!.enviadaEn))[0];
  return ultima?.respuestaCoach ?? null;
}

export default function RespuestaDelCoach({ responses, maxDias = 14, variante = VARIANTES.respuestaAtleta }: { responses: QuestionnaireResponse[]; maxDias?: number; variante?: typeof VARIANTES.respuestaAtleta }) {
  const rc = ultimaRespuestaDelCoach(responses, maxDias);
  if (!rc) return null;
  const fecha = new Date(rc.enviadaEn).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const porWhatsApp = rc.canal === 'whatsapp';
  return (
    <section className="bg-surface border border-accent-line rounded-surface p-4 sm:p-5 space-y-3" aria-label={`Respuesta de ${COACH_NOMBRE}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-accent text-on-accent grid place-items-center shrink-0" aria-hidden>
          <Icon name={porWhatsApp ? 'chat' : 'fitness_center'} size="s" />
        </span>
        <div className="min-w-0">
          <p className="font-sans text-label font-bold text-ink">
            {porWhatsApp ? `${COACH_NOMBRE} te ha escrito por WhatsApp` : `${COACH_NOMBRE} ha revisado tu semana`}
          </p>
          <p className="font-sans text-caption text-ink-4">{fecha}</p>
        </div>
      </div>
      {rc.bloques && variante === 'corrido' ? (
        <p className="font-sans text-body-s text-ink-2 whitespace-pre-wrap text-pretty">
          {(Object.keys(TITULOS_BLOQUES) as (keyof typeof TITULOS_BLOQUES)[]).filter(k => rc.bloques![k].trim()).map(k => (
            <span key={k}><span className="font-semibold text-ink">{TITULOS_BLOQUES[k]}: </span>{rc.bloques![k]}{' '}</span>
          ))}
        </p>
      ) : rc.bloques ? (
        <dl className="space-y-2.5">
          {(Object.keys(TITULOS_BLOQUES) as (keyof typeof TITULOS_BLOQUES)[]).filter(k => rc.bloques![k].trim()).map(k => (
            <div key={k}>
              <dt className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-accent-ink">{TITULOS_BLOQUES[k]}</dt>
              <dd className="font-sans text-body-s text-ink-2 whitespace-pre-wrap text-pretty">{rc.bloques![k]}</dd>
            </div>
          ))}
        </dl>
      ) : rc.texto ? (
        <p className="font-sans text-body-s text-ink-2 whitespace-pre-wrap text-pretty">{rc.texto}</p>
      ) : porWhatsApp ? (
        <p className="font-sans text-body-s text-ink-2">Tu revisión está contestada ahí. Si tienes dudas, contéstale por el mismo sitio.</p>
      ) : null}
      {rc.mediaUrl && (rc.mediaKind === 'audio'
        ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- audio o vídeo grabado por el coach: no hay subtítulos que enlazar
          <audio controls src={rc.mediaUrl} className="w-full" />
          )
        : (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- audio o vídeo grabado por el coach: no hay subtítulos que enlazar
          <video controls src={rc.mediaUrl} className="w-full rounded-control max-h-72" />
        ))}
    </section>
  );
}
