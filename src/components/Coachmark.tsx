import React, { useState } from 'react';

// Reemplaza el carrusel genérico de AppTour: en vez de un tutorial de 6
// pantallas que el atleta ve antes de tocar nada y olvida al cerrarlo, esto
// es un aviso corto que aparece en el sitio real la primera vez que llega a
// esa pantalla — se descarta solo (localStorage por id+atleta) y no vuelve.
const keyFor = (id: string, email: string) => `enforma_coachmark_${id}_${email}`;

function isSeen(id: string, email: string): boolean {
  try { return localStorage.getItem(keyFor(id, email)) === '1'; } catch { return false; }
}

function markSeen(id: string, email: string): void {
  try { localStorage.setItem(keyFor(id, email), '1'); } catch { /* noop */ }
}

interface Props {
  id: string;
  email: string;
  icon: string;
  text: string;
}

export default function Coachmark({ id, email, icon, text }: Props) {
  const [dismissed, setDismissed] = useState(() => isSeen(id, email));
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2.5 bg-[#fbcb1a]/8 border border-[#fbcb1a]/25 rounded-xl px-3.5 py-3">
      <span className="material-symbols-outlined text-[#fbcb1a] text-lg flex-shrink-0">{icon}</span>
      <p className="flex-1 text-xs text-[#fbcb1a] leading-relaxed">{text}</p>
      <button
        onClick={() => { markSeen(id, email); setDismissed(true); }}
        aria-label="Cerrar aviso"
        className="text-[#fbcb1a]/60 hover:text-[#fbcb1a] flex-shrink-0 -m-1 p-1"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
