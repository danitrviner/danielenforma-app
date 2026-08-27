import React, { useEffect, useState } from 'react';
import { Icon } from './ui';

// Reemplaza el carrusel genérico de AppTour: en vez de un tutorial de 6
// pantallas que el atleta ve antes de tocar nada y olvida al cerrarlo, esto
// es un aviso corto que aparece en el sitio real la primera vez que llega a
// esa pantalla.
//
// Deja de aparecer de dos formas: al pulsar la X, o solo —tras MAX_VISTAS
// apariciones—. Antes únicamente lo cerraba la X, así que a quien no la
// pulsara le salía en cada visita para siempre. Ahora se cuenta cada montaje
// (localStorage por id+atleta): valor 'x' = descartado a mano; un número =
// nº de veces visto.
const keyFor = (id: string, email: string) => `enforma_coachmark_${id}_${email}`;

const MAX_VISTAS = 2;

function estadoActual(id: string, email: string): { visto: boolean; vistas: number } {
  try {
    const raw = localStorage.getItem(keyFor(id, email));
    if (raw === null) return { visto: false, vistas: 0 };
    // Legado: la versión anterior guardaba '1' al cerrar con la X.
    if (raw === 'x' || raw === '1') return { visto: true, vistas: MAX_VISTAS };
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return { visto: true, vistas: MAX_VISTAS };
    return { visto: n >= MAX_VISTAS, vistas: n };
  } catch {
    return { visto: false, vistas: 0 };
  }
}

function guardar(id: string, email: string, valor: string): void {
  try { localStorage.setItem(keyFor(id, email), valor); } catch { /* noop */ }
}

interface Props {
  id: string;
  email: string;
  icon: string;
  text: string;
}

export default function Coachmark({ id, email, icon, text }: Props) {
  const [dismissed, setDismissed] = useState(() => estadoActual(id, email).visto);

  // Cuenta esta aparición una sola vez por montaje. Si con ella se alcanza el
  // tope, esta es la última: se muestra ahora y ya no vuelve.
  useEffect(() => {
    if (dismissed) return;
    const { vistas } = estadoActual(id, email);
    guardar(id, email, String(vistas + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 bg-accent/8 border border-accent/25 rounded-surface px-4 py-3">
      <Icon name={icon} size="l" className="text-accent flex-shrink-0" />
      <p className="flex-1 text-label text-accent leading-relaxed">{text}</p>
      <button
        onClick={() => { guardar(id, email, 'x'); setDismissed(true); }}
        aria-label="Cerrar aviso"
        className="text-accent/60 hover:text-accent flex-shrink-0 -m-1 p-1"
      >
        <Icon name="close" size="m" />
      </button>
    </div>
  );
}
