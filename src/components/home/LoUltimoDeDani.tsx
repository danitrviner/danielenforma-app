import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CoachDayNote, QuestionnaireResponse, UserProfile } from '../../types';
import { getMensajesAprobados } from '../../db/mensajesCoach';
import { loUltimoDeDani, estadoDeRevision, type ItemDeDani } from '../../utils/mensajesCoach';
import { COACH_NOMBRE } from '../../utils/coach';
import { addDays, hoyIsoLocal } from '../../utils/trainingWeek';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Lo último de Dani» (29-10-2026) — la tarjeta de Inicio.

   Todo lo que viene de una persona, en un sitio: la respuesta a su
   revisión, un cambio explicado con su porqué, el acuse de lo que contó
   (con su estado), un hito, la nota del día. Se enseña solo lo más reciente
   de los últimos siete días, sin fecha, y «y N más esta semana» lleva a
   Revisión (versión elegida por Dani el 29-10). Si no hay nada, no se
   finge: dice cuándo se abre la próxima revisión y nada más.

   Lo firmado lleva el nombre; lo que escribió la app (el acuse «Recibido»)
   no, y se distingue a la vista. Es la regla de honestidad del plan.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DIAS_LO_ULTIMO = 7;

const ESTADO_PROBLEMA = {
  recibido: { texto: 'Recibido', tono: 'text-ink-3 bg-raised' },
  en_curso: { texto: 'En ello', tono: 'text-accent-ink bg-accent-bg' },
  hecho: { texto: 'Hecho', tono: 'text-success bg-success/10' },
} as const;

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

export function claveMensajesAtleta(email: string, desde: string) {
  return ['mensajesCoach', email, desde] as const;
}

interface Props {
  profile: UserProfile;
  respuestas: QuestionnaireResponse[];
  notaDeHoy?: CoachDayNote | null;
  onNavigate: (tab: 'checkin' | 'nutrition' | 'training') => void;
}

export default function LoUltimoDeDani({ profile, respuestas, notaDeHoy, onNavigate }: Props) {
  const hoy = hoyIsoLocal();
  const desde = addDays(hoy, -(DIAS_LO_ULTIMO - 1));
  const { data: mensajes = [] } = useQuery({
    queryKey: claveMensajesAtleta(profile.email, desde),
    queryFn: () => getMensajesAprobados(profile.email, desde),
  });
  const items = loUltimoDeDani({ mensajes, respuestas, notaDeHoy, hoy, dias: DIAS_LO_ULTIMO });

  return (
    <section className="rounded-canvas border border-accent-line bg-surface p-4 space-y-3" aria-label={`Lo último de ${COACH_NOMBRE}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-accent text-on-accent grid place-items-center shrink-0" aria-hidden>
          <Icon name="fitness_center" size="s" />
        </span>
        <p className="font-sans text-label font-bold text-ink flex-1">Lo último de {COACH_NOMBRE}</p>
      </div>

      {items.length === 0 ? (
        <SinNada estado={estadoDeRevision(hoy, profile.diaRevision, respuestas)} onNavigate={onNavigate} />
      ) : (
        <>
          <ul><Item item={items[0]} onNavigate={onNavigate} /></ul>
          {items.length > 1 && (
            <button type="button" onClick={() => onNavigate('checkin')} className="font-mono text-caption uppercase tracking-wider text-accent-ink">
              Y {items.length - 1} más esta semana
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* Sin nada de Dani esta semana: lo que toca con la revisión. Abierta = la puede
   rellenar hasta su día de revisión (se abre tres días antes); enviada = Dani la
   mira ese día; cerrada = cuándo se abre la siguiente. */
function SinNada({ estado, onNavigate }: { estado: ReturnType<typeof estadoDeRevision>; onNavigate: Props['onNavigate'] }) {
  if (estado.tipo === 'abierta') {
    return (
      <button type="button" onClick={() => onNavigate('checkin')} className="w-full text-left font-sans text-body-s text-ink-2 rounded-control -mx-1 px-1 transition-colors hover:bg-raised">
        Nada nuevo esta semana. <span className="font-semibold text-ink">Tu revisión está abierta</span>: tienes hasta el {fechaCorta(estado.hasta)} para mandarla.
      </button>
    );
  }
  if (estado.tipo === 'enviada') {
    return <p className="font-sans text-body-s text-ink-2">Revisión enviada. {COACH_NOMBRE} la mira el <span className="font-semibold text-ink">{fechaCorta(estado.revision)}</span> y te contesta aquí.</p>;
  }
  return (
    <p className="font-sans text-body-s text-ink-2">
      Nada nuevo esta semana. Tu próxima revisión se abre el <span className="font-semibold text-ink">{fechaCorta(estado.seAbre)}</span>.
    </p>
  );
}

function Item({ item, onNavigate }: { item: ItemDeDani; onNavigate: Props['onNavigate']; key?: React.Key }) {
  const cuerpo = (
    <>
      <div className="flex items-center gap-2">
        <span className="font-mono text-caption uppercase tracking-[.16em] text-accent-ink">{item.etiqueta}</span>
        {item.problema && (
          <span className={`ml-auto rounded-control px-2 py-0.5 font-mono text-caption font-bold uppercase ${ESTADO_PROBLEMA[item.problema.estado].tono}`}>
            {ESTADO_PROBLEMA[item.problema.estado].texto}
          </span>
        )}
      </div>
      <p className={`mt-1 font-sans text-body-s whitespace-pre-wrap text-pretty ${item.firmado ? 'text-ink' : 'text-ink-2'}`}>{item.texto}</p>
      {item.porque && <p className="mt-0.5 font-sans text-caption text-ink-2 text-pretty">Por qué: {item.porque}</p>}
      {item.problema?.detalle && <p className="mt-0.5 font-sans text-caption text-ink-2 text-pretty">{item.problema.detalle}</p>}
      {item.mediaUrl && (item.mediaKind === 'audio'
        ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- audio o vídeo grabado por el coach: no hay subtítulos que enlazar
          <audio controls src={item.mediaUrl} className="mt-2 w-full" />
          )
        : (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- audio o vídeo grabado por el coach: no hay subtítulos que enlazar
          <video controls src={item.mediaUrl} className="mt-2 w-full rounded-control max-h-64" />
        ))}
    </>
  );
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      {item.destino ? (
        <button type="button" onClick={() => onNavigate(item.destino!)} className="w-full text-left rounded-control -mx-1 px-1 transition-colors hover:bg-raised">
          {cuerpo}
        </button>
      ) : cuerpo}
    </li>
  );
}
