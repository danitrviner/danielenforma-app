import React, { useEffect, useState } from 'react';
import { isLocalBypassActive, setLocalBypassMode, hayFalloDePermisos } from '../dbService';
import { Icon } from './ui';

// Aviso persistente cuando lo que el usuario guarda NO está llegando al
// servidor: sin esto el fallo es invisible y sigue editando creyendo que guarda.
//
// Dos causas, dos mensajes, y la distinción no es cosmética (P1-6 de la
// auditoría visual):
//   · red      — Firestore no responde. Reintentar puede funcionar.
//   · permisos — la cuenta no tiene acceso. Reintentar NO va a funcionar nunca,
//                y decirle "revisa tu conexión" manda a la persona a mirar su
//                wifi mientras el problema está en su cuenta. Es exactamente lo
//                que le pasó al atleta que no podía completar el onboarding.
//
// Polling barato: las banderas son booleanos de módulo sin sistema de
// suscripción, y 3 s de latencia para un aviso es fina.
export default function LocalModeBanner() {
  const [estado, setEstado] = useState<'ok' | 'red' | 'permisos'>(
    () => (isLocalBypassActive() ? 'red' : hayFalloDePermisos() ? 'permisos' : 'ok')
  );

  useEffect(() => {
    const id = setInterval(
      () => setEstado(isLocalBypassActive() ? 'red' : hayFalloDePermisos() ? 'permisos' : 'ok'),
      3000
    );
    return () => clearInterval(id);
  }, []);

  if (estado === 'ok') return null;

  const retry = () => {
    // Vuelve a intentar Firestore: la próxima operación real confirmará si hay
    // conexión (y si falla, el propio dbService reactivará el bypass).
    setLocalBypassMode(false);
    window.location.reload();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-e1">
      <Icon name={estado === 'permisos' ? 'lock' : 'cloud_off'} size="m" />
      <p className="font-sans text-label font-bold">
        {estado === 'permisos'
          ? 'Tu cuenta no tiene permiso para guardar — los cambios NO se están guardando. Avisa a Dani.'
          : 'Sin conexión con el servidor — los cambios NO se están guardando.'}
      </p>
      {/* Reintentar solo tiene sentido con un fallo de red. Ante uno de permisos
          recargar da exactamente el mismo resultado, y ofrecerlo solo consigue
          que la persona lo pulse cinco veces antes de rendirse. */}
      {estado === 'red' && (
        <button
          onClick={retry}
          className="font-sans text-caption font-bold uppercase bg-white/20 hover:bg-white/30 px-3 py-1 rounded-control transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
