import React, { useEffect, useState } from 'react';
import { Icon } from './ui';
import type { UserProfile } from '../types';
import { vecesVisto, apuntarVisto, DESCARTADO } from '../utils/avisosVistos';

// Reemplaza el carrusel genérico de AppTour: en vez de un tutorial de 6
// pantallas que el atleta ve antes de tocar nada y olvida al cerrarlo, esto
// es un aviso corto que aparece en el sitio real la primera vez que llega a
// esa pantalla.
//
// Deja de aparecer de dos formas: al pulsar la X, o solo —tras MAX_VISTAS
// apariciones—. La cuenta se guarda en el perfil del atleta además de en el
// móvil (utils/avisosVistos.ts): solo en localStorage se perdía al cerrar
// sesión y el aviso volvía a salir «cada vez que entras».
const MAX_VISTAS = 2;

/** La clave que usaba la versión anterior: se sigue leyendo para no repetir a quien ya lo vio. */
const claveLegado = (id: string, email: string) => `enforma_coachmark_${id}_${email}`;

interface Props {
  id: string;
  profile: Pick<UserProfile, 'email' | 'userId' | 'avisosVistos'>;
  icon: string;
  text: string;
}

export default function Coachmark({ id, profile, icon, text }: Props) {
  const [dismissed, setDismissed] = useState(() => vecesVisto(profile, `coachmark_${id}`, claveLegado(id, profile.email)) >= MAX_VISTAS);

  // Cuenta esta aparición una sola vez por montaje. Si con ella se alcanza el
  // tope, esta es la última: se muestra ahora y ya no vuelve.
  useEffect(() => {
    if (dismissed) return;
    const vistas = vecesVisto(profile, `coachmark_${id}`, claveLegado(id, profile.email));
    apuntarVisto(profile, `coachmark_${id}`, vistas + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 bg-accent/8 border border-accent/25 rounded-surface px-4 py-3">
      <Icon name={icon} size="l" className="text-accent-ink flex-shrink-0" />
      <p className="flex-1 text-label text-accent-ink leading-relaxed">{text}</p>
      <button
        onClick={() => { apuntarVisto(profile, `coachmark_${id}`, DESCARTADO); setDismissed(true); }}
        aria-label="Cerrar aviso"
        className="text-accent-ink/60 hover:text-accent-ink flex-shrink-0 -m-1 p-1"
      >
        <Icon name="close" size="m" />
      </button>
    </div>
  );
}
