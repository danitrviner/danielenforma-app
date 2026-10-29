import React from 'react';
import type { UserProfile } from '../../types';
import { COACH_NOMBRE } from '../../utils/coach';
import { diasEntreFechas, hoyIsoLocal } from '../../utils/trainingWeek';
import { Icon } from '../ui';

/* «Bienvenido de vuelta» (29-10): tras tres días o más sin registrar nada,
   lo primero que ve no es una fila de rojos sino una tarea pequeña. Sin
   culpa (es la regla de la vuelta amable del plan). No va firmado por Dani:
   lo escribe la app, y lo dice en tercera persona. Una tarjeta con icono
   (versión elegida por Dani el 29-10). */

export const DIAS_PARA_VUELTA = 3;

export function diasDeSilencio(profile: Pick<UserProfile, 'senales'>, hoy: string): number | null {
  const u = profile.senales?.ultimoRegistro;
  return u ? diasEntreFechas(u, hoy) : null;
}

export default function VueltaCard({ profile }: { profile: Pick<UserProfile, 'senales' | 'displayName'> }) {
  const dias = diasDeSilencio(profile, hoyIsoLocal());
  if (dias === null || dias < DIAS_PARA_VUELTA) return null;
  const texto = `Hoy, solo lo de hoy: la sesión y el peso. Lo demás ya lo cuadra ${COACH_NOMBRE} contigo.`;
  return (
    <section className="rounded-canvas border border-accent-line bg-accent-bg/40 p-4 flex gap-3" aria-label="Bienvenido de vuelta">
      <Icon name="waving_hand" size="l" className="text-accent-ink shrink-0" />
      <div className="min-w-0">
        <p className="font-sans font-bold text-body-s text-ink">Bienvenido de vuelta</p>
        <p className="font-sans text-body-s text-ink-2 text-pretty">{texto}</p>
      </div>
    </section>
  );
}
