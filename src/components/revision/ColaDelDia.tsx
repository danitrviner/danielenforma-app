import React, { useMemo, useState } from 'react';
import type { Questionnaire, QuestionnaireResponse, UserProfile } from '../../types';
import { colaDeRevisiones, nombreDelDia, type TonoAviso } from '../../utils/colaDeRevisiones';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { Avatar, Icon } from '../ui';
import { pulsable } from '../../utils/a11y';

/* ═══════════════════════════════════════════════════════════════════════════
   Hoy revisas (27-10)

   Arriba de Revisiones: los atletas cuyo día de revisión es hoy, ordenados por
   prioridad con su semáforo. Plegable y compacto: es un punto de partida, no
   otra bandeja. «Ver todos» enseña también a los de otros días.
   ═══════════════════════════════════════════════════════════════════════════ */

const TONO: Record<TonoAviso, string> = {
  rojo: 'bg-danger/12 text-danger',
  ambar: 'bg-accent-bg text-accent-ink',
  gris: 'bg-inset text-ink-3',
};

interface Props {
  atletas: UserProfile[];
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
  onAbrir: (email: string) => void;
}

export default function ColaDelDia({ atletas, responses, questionnaires, onAbrir }: Props) {
  const hoy = hoyIsoLocal();
  const [todos, setTodos] = useState(false);
  const cola = useMemo(
    () => colaDeRevisiones({ hoy, atletas, responses, questionnaires, soloHoy: !todos }),
    [hoy, atletas, responses, questionnaires, todos],
  );
  const dia = nombreDelDia(new Date(hoy + 'T00:00:00').getDay());
  const enRiesgo = cola.filter(f => f.riesgoAbandono).length;
  if (!todos && cola.length === 0) return null;

  return (
    <section className="bg-surface border border-hairline rounded-surface overflow-hidden" aria-label="Revisiones de hoy">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-hairline">
        <Icon name="event" size="m" className="text-accent-ink" />
        <div className="flex-1 min-w-0">
          <p className="font-sans font-bold text-label text-ink">{todos ? 'Todos tus atletas' : `Hoy revisas · ${dia}`}</p>
          <p className="font-sans text-caption text-ink-4">
            {cola.length} atleta{cola.length === 1 ? '' : 's'} · {cola.filter(f => f.enviada).length} ya han enviado
            {enRiesgo > 0 && <span className="text-danger"> · {enRiesgo} en riesgo de abandono</span>}
          </p>
        </div>
        <button type="button" onClick={() => setTodos(t => !t)} className="font-sans text-caption text-ink-4 hover:text-ink">
          {todos ? 'Solo hoy' : 'Ver todos'}
        </button>
      </div>
      <ul className="divide-y divide-hairline/60 max-h-[22rem] overflow-y-auto">
        {cola.map(f => (
          <li key={f.atleta.email} {...pulsable(() => onAbrir(f.atleta.email))} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 cursor-pointer hover:bg-raised/60 transition-colors">
            <Avatar src={f.atleta.avatarUrl} name={f.atleta.displayName} className="w-8 h-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`font-sans text-label truncate ${f.enviada ? 'font-bold text-ink' : 'text-ink-3'}`}>{f.atleta.displayName}</p>
              {f.avisos.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {f.avisos.map(a => (
                    <span key={a.clave} className={`font-sans text-[11px] font-bold px-1.5 py-0.5 rounded-full ${TONO[a.tono]}`}>{a.texto}</span>
                  ))}
                </div>
              )}
            </div>
            <Icon name="chevron_right" size="s" className="text-ink-5 shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}
