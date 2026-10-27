import React from 'react';
import type { QuestionnaireResponse } from '../../types';
import { Icon } from '../ui';

/* «Tu coach ha revisado tu semana» (27-10): la última respuesta del coach a una
   revisión, arriba de Perfil › Revisión. Solo las de las dos últimas semanas:
   después ya es historia y estorba. */

const DOS_SEMANAS_MS = 14 * 86400000;

export default function RespuestaDelCoach({ responses }: { responses: QuestionnaireResponse[] }) {
  const ultima = responses
    .filter(r => r.respuestaCoach && Date.now() - new Date(r.respuestaCoach.enviadaEn).getTime() < DOS_SEMANAS_MS)
    .sort((a, b) => b.respuestaCoach!.enviadaEn.localeCompare(a.respuestaCoach!.enviadaEn))[0];
  const rc = ultima?.respuestaCoach;
  if (!rc) return null;
  return (
    <section className="bg-surface border border-accent-line rounded-surface p-4 sm:p-5 space-y-3" aria-label="Respuesta de tu coach">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-accent text-on-accent grid place-items-center shrink-0" aria-hidden>
          <Icon name="fitness_center" size="s" />
        </span>
        <div className="min-w-0">
          <p className="font-sans text-label font-bold text-ink">Tu coach ha revisado tu semana</p>
          <p className="font-sans text-caption text-ink-4">
            {new Date(rc.enviadaEn).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>
      {rc.texto && <p className="font-sans text-body-s text-ink-2 whitespace-pre-wrap text-pretty">{rc.texto}</p>}
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
