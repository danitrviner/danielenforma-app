import React from 'react';
import type { SenalDelDia } from '../../utils/bandejaDelDia';
import { Icon } from '../ui';

/* La cola de WhatsApp del día (tanda 7, 29-10): todos los mensajes que la
   bandeja ha preparado, juntos, para mandarlos de una sentada. Cada fila:
   Copiar, Abrir chat, Mandado. Son las mismas acciones de cada señal; aquí
   están una debajo de otra porque así es como Dani lo hace: abre WhatsApp y
   despacha. */

interface Props {
  senales: SenalDelDia[];
  textoDe: (s: SenalDelDia) => string;
  onCopiar: (s: SenalDelDia) => void;
  onAbrir: (s: SenalDelDia) => void;
  onMandado: (s: SenalDelDia) => void;
  copiadoId: string | null;
  ocupado: boolean;
}

export default function ColaWhatsAppCard({ senales, textoDe, onCopiar, onAbrir, onMandado, copiadoId, ocupado }: Props) {
  const cola = senales.filter(s => s.contacto);
  if (cola.length === 0) return null;
  return (
    <section className="rounded-field border border-hairline bg-surface" aria-label="Para mandar por WhatsApp">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
        <Icon name="chat" size="s" className="text-accent-ink" />
        <p className="font-sans font-bold text-body-s text-ink flex-1">Para mandar por WhatsApp · {cola.length}</p>
        <p className="font-mono text-caption text-ink-3">copia, manda, marca</p>
      </div>
      <ul className="divide-y divide-hairline">
        {cola.map(s => (
          <li key={s.id} className="px-4 py-3 space-y-1.5">
            <div className="flex items-baseline gap-2">
              <p className="font-sans font-bold text-body-s text-ink">{s.athleteName}</p>
              <p className="font-mono text-caption text-ink-3 truncate">{s.texto}</p>
            </div>
            <p className="font-sans text-caption text-ink-2 text-pretty">{textoDe(s)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onCopiar(s)} className="inline-flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1 font-mono text-caption font-bold uppercase text-ink-2 hover:bg-raised">
                <Icon name={copiadoId === s.id ? 'check' : 'content_copy'} size="s" />{copiadoId === s.id ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" onClick={() => onAbrir(s)} className="inline-flex items-center gap-1 rounded-control border border-accent-line bg-accent-bg px-2.5 py-1 font-mono text-caption font-bold uppercase text-accent-ink hover:bg-accent/15">
                <Icon name="open_in_new" size="s" />Abrir chat
              </button>
              <button type="button" disabled={ocupado} onClick={() => onMandado(s)} className="inline-flex items-center gap-1 rounded-control px-2.5 py-1 font-mono text-caption font-bold uppercase text-ink-2 hover:bg-raised disabled:opacity-50">
                <Icon name="check" size="s" />Mandado
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
