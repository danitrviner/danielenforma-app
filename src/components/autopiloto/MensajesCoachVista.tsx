/* Elegida por Dani el 29-10-2026: la variante B (burbujas tipo chat); las otras dos se
   compararon en /dev/autopiloto y se retiraron.

   Las TRES propuestas visuales del CANAL DEL ATLETA (diseño §6): los mensajes
   del coach que no caen en una revisión (`mensajesCoach`: qué cambia esta
   semana, una pregunta por sus faltas, un ánimo cuando lleva días sin pesarse).
   Firma siempre Dani; en pantalla nunca aparece el asistente. La lógica (leer,
   marcar leído) vive en MensajesDelCoach.tsx; aquí solo cambia cómo se ve. Se
   comparan en /dev/autopiloto y al final queda una:

   A · Tarjeta     — como la «Nota de tu entrenador» que ya hay en Inicio: una
                     tarjeta por mensaje sin leer, con fecha y el texto entero.
                     Los leídos se van; quedan en «anteriores».
   B · Burbuja     — un hilo tipo chat de una sola dirección: burbujas con la
                     inicial de Dani, el último abajo del todo, «Nuevo» en los
                     sin leer. Se lee como WhatsApp, que es lo que el atleta
                     usa.
   C · Bandeja     — una fila por mensaje (motivo, fecha, primera línea) y se
                     abre el que se toque. Para cuando haya varios a la vez. */
import React, { useState } from 'react';
import type { MensajeCoach } from '../../types';
import { Icon } from '../ui';

export interface MensajesCoachVistaProps {
  mensajes: MensajeCoach[];
  /** Nombre que firma. Siempre Dani; se pasa para el banco de pruebas. */
  firma: string;
  onLeido: (m: MensajeCoach) => void;
}

export const ETIQUETA_MOTIVO: Record<MensajeCoach['motivo'], string> = {
  semana_nueva: 'Tu semana', perdidas: 'Tus entrenos', peso_sin_registrar: 'Tu peso', dolor: 'Tu molestia', viaje: 'Tu viaje', otro: 'De tu entrenador',
};

const DIAS_VISIBLES = 21;

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Los mensajes que tiene sentido enseñar en Inicio: los de las últimas tres semanas, el más nuevo primero. */
export function mensajesVigentes(mensajes: MensajeCoach[], ahora = Date.now()): MensajeCoach[] {
  const desde = ahora - DIAS_VISIBLES * 864e5;
  return [...mensajes].filter(m => Date.parse(m.creadoEn) >= desde).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export default function MensajesCoachVista(props: MensajesCoachVistaProps) {
  const vigentes = mensajesVigentes(props.mensajes);
  if (vigentes.length === 0) return null;
  return <Vista {...props} mensajes={vigentes} />;
}

/* Burbuja ------------------------------------------------------------- */

function Vista({ mensajes, firma, onLeido }: MensajesCoachVistaProps) {
  const [abierto, setAbierto] = useState(true);
  const sinLeer = mensajes.filter(m => !m.leidoEn).length;
  const enOrden = [...mensajes].reverse(); // el último abajo
  const inicial = firma.trim().charAt(0).toUpperCase() || 'D';
  return (
    <section className="rounded-canvas border border-hairline bg-surface overflow-hidden" aria-label={`Mensajes de ${firma}`}>
      <button type="button" onClick={() => setAbierto(v => !v)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left" aria-expanded={abierto}>
        <span className="w-8 h-8 rounded-full bg-accent text-on-accent grid place-items-center shrink-0 font-sans font-bold text-label" aria-hidden>{inicial}</span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-label font-bold text-ink">{firma}</p>
          <p className="font-sans text-caption text-ink-4 truncate">{sinLeer > 0 ? `${sinLeer} ${sinLeer === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}` : 'Al día'}</p>
        </div>
        {sinLeer > 0 && <span className="rounded-chip bg-accent text-on-accent font-mono text-caption px-2">{sinLeer}</span>}
        <Icon name={abierto ? 'expand_less' : 'expand_more'} size="s" className="text-ink-3" />
      </button>
      {abierto && (
        <ol className="m-0 p-0 list-none px-4 pb-4 space-y-2.5 border-t border-hairline pt-3">
          {enOrden.map(m => (
            <li key={m.id} className="flex flex-col items-start gap-1 max-w-[92%]">
              <div className={`rounded-canvas rounded-tl-none px-3.5 py-2.5 ${m.leidoEn ? 'bg-raised' : 'bg-accent/10 border border-accent-line'}`}>
                <p className="font-mono text-caption text-ink-4 mb-1">{ETIQUETA_MOTIVO[m.motivo]} · {fechaCorta(m.creadoEn)}{!m.leidoEn && <span className="text-accent-ink"> · nuevo</span>}</p>
                <p className="font-sans text-body-s text-ink leading-relaxed whitespace-pre-wrap" style={{ textWrap: 'pretty' }}>{m.texto}</p>
              </div>
              {!m.leidoEn && (
                <button type="button" onClick={() => onLeido(m)} className="text-caption font-mono uppercase tracking-wider text-accent-ink pl-1 hover:underline">Marcar leído</button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
