import React, { useState } from 'react';
import { UserProfile, WeightCheckIn } from '../types';
import PlanInPreparationCard from './PlanInPreparationCard';
import CheckInScreen from './CheckInScreen';
import AthleteRoadmapScreen from './AthleteRoadmapScreen';
import ProfileScreen from './ProfileScreen';
import { Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Sala de espera del atleta sin plan — bloqueo total (16-08).

   La tarea 8 del rastreo (14-08) ya resolvía el "valle de la muerte"
   post-onboarding ocultando Rutinas/Academia/Nutrición/Cardio de la barra
   de navegación, dejando Hoy (con PlanInPreparationCard) y Perfil. Dani
   pidió algo más contundente: mismo bloqueo total que el wizard de alta o
   el catálogo de gimnasio — SIN barra de navegación, una única pantalla a
   pantalla completa hasta que el coach publique el plan.

   Las tres acciones de "mientras tanto" (foto inicial, peso, Road map) y
   "ver mi anamnesis" seguían necesitando pantallas reales —CheckInScreen,
   AthleteRoadmapScreen, ProfileScreen—, así que en vez de reconstruirlas
   aquí dentro, este componente es su propio mini-navegador: un `vista`
   local en vez de rutas de verdad (no hace falta más — solo hay cuatro
   sitios a los que ir, y todos vuelven al mismo punto).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  profile: UserProfile;
  checkins: WeightCheckIn[];
  onRefreshProfile: () => void;
  onLogOut: () => void;
}

type Vista = 'espera' | 'checkin' | 'roadmap' | 'perfil';

export default function PlanEnEsperaScreen({ profile, checkins, onRefreshProfile, onLogOut }: Props) {
  const [vista, setVista] = useState<Vista>('espera');

  if (vista !== 'espera') {
    return (
      <div className="min-h-screen bg-bg">
        {/* pt: mismo motivo que el resto de cabeceras fijas de la app — sin
            reservar la safe area, "Volver" queda bajo la isla dinámica. */}
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm border-b border-hairline px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3">
          <button
            type="button"
            onClick={() => setVista('espera')}
            className="flex items-center gap-2 font-sans text-label font-bold uppercase tracking-wider text-ink-2 hover:text-accent transition-colors"
          >
            <Icon name="arrow_back" size="s" />
            Volver
          </button>
        </div>
        <div className="max-w-lg mx-auto p-4">
          {vista === 'checkin' && <CheckInScreen profile={profile} checkins={checkins} />}
          {vista === 'roadmap' && <AthleteRoadmapScreen profile={profile} />}
          {vista === 'perfil' && (
            <ProfileScreen
              profile={profile}
              isCoach={false}
              checkins={checkins}
              onRefreshProfile={onRefreshProfile}
              onLogOut={onLogOut}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-bg flex flex-col">
      <div className="flex-none w-full max-w-lg mx-auto px-6 pt-[calc(2rem+var(--safe-top))] pb-2">
        <div className="flex items-center gap-2">
          <img src="/atlas-logo.png" alt="En Forma" className="w-7 h-7 object-contain" />
          <span className="font-sans font-bold text-title-m tracking-tighter uppercase text-accent">EN FORMA</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-lg mx-auto px-6 py-6">
        <PlanInPreparationCard
          profile={profile}
          onNavigate={tab => setVista(tab === 'checkin' ? 'checkin' : tab === 'roadmap' ? 'roadmap' : 'perfil')}
        />
      </div>
    </div>
  );
}
