import React, { useEffect, useState } from 'react';
import { isLocalBypassActive, setLocalBypassMode } from '../dbService';

// Aviso persistente cuando dbService ha entrado en modo local (forceLocalOnly):
// a partir de ese momento las escrituras van SOLO a localStorage y se pierden
// al recargar. Sin este banner el fallo era invisible — el usuario seguía
// editando creyendo que guardaba. Polling barato: el flag es un booleano de
// módulo sin sistema de suscripción, y 3 s de latencia para un aviso es fina.
export default function LocalModeBanner() {
  const [active, setActive] = useState(isLocalBypassActive());

  useEffect(() => {
    const id = setInterval(() => setActive(isLocalBypassActive()), 3000);
    return () => clearInterval(id);
  }, []);

  if (!active) return null;

  const retry = () => {
    // Vuelve a intentar Firestore: la próxima operación real confirmará si hay
    // conexión (y si falla, el propio dbService reactivará el bypass).
    setLocalBypassMode(false);
    window.location.reload();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 shadow-lg">
      <span className="material-symbols-outlined text-base">cloud_off</span>
      <p className="font-sans text-xs font-bold">
        Sin conexión con el servidor — los cambios NO se están guardando.
      </p>
      <button
        onClick={retry}
        className="font-mono text-[10px] font-bold uppercase bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}
