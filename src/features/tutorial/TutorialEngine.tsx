import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { UserProfile } from '../../types';
import { updateUserProfile } from '../../dbService';
import { tourReducer, initialTourState } from './tourReducer';
import { TOUR_STEPS } from './steps';
import { getTourTargetRect, useTourTargetVersion } from './TourTargetContext';
import TourOverlay from './TourOverlay';
import type { NavTab } from '../../App';

/* ═══════════════════════════════════════════════════════════════════════════
   TutorialEngine (F3.12)

   Orquesta el tour completo: arranca solo, persiste el progreso en
   `user_profiles.tutorial` (reanudable si se cierra la app), navega a la
   pestaña que toque en cada paso, y expone `markActionDone` para que las
   dos pantallas con acción obligatoria (marcar una serie, registrar una
   ingesta) avisen al motor sin acoplarse a él más que con una línea.

   Arranca solo cuando: el atleta tiene el plan VISIBLE (`planVisible` —
   T7.b, el coach pulsó "Mostrar el plan al atleta", no solo "hay
   asignaciones") y `profile.tutorial` no está completado. Nunca antes — el
   tour enseña datos reales, no puede arrancar sobre una pantalla de espera
   vacía.

   T7.c (18-08): antes la condición era "tutorial nunca tocado"
   (`!profile.tutorial`), y el efecto de persistencia de abajo escribe
   `tutorial: { completado: false, pasoAlcanzado }` en el PRIMER avance. Con
   eso, un tour interrumpido una sola vez —cerrar la app, un `planVisible`
   que tardó en resolver, cualquier cosa— dejaba `profile.tutorial` ya
   creado, y el tour no volvía a arrancar jamás: quedaba con
   `completado: false` para siempre, sin puerta de entrada automática ni
   manual ("Repetir el tour" se dejó fuera a propósito, ver ProfileScreen).
   Ahora la condición es "no completado" — reanuda en `pasoAlcanzado`
   (`initialTourState` ya lo hace) en vez de exigir que nunca se haya
   tocado.

   No arranca solo una vez completado: una vez `tutorial.completado` es
   true, la única puerta de entrada es "Repetir el tour" desde
   Perfil›Ajustes (`TutorialEngineApi.restart()`), que sí puede saltar
   cualquier paso con "Saltar el tour" — la primera pasada no puede
   saltarse entera, solo paso a paso o con "Ahora no" en los saltables.
   ═══════════════════════════════════════════════════════════════════════════ */

interface TutorialEngineApi {
  markActionDone: (stepId: string) => void;
  restart: () => void;
}

const TutorialEngineCtx = createContext<TutorialEngineApi | null>(null);

export function useTutorialEngine(): TutorialEngineApi {
  return useContext(TutorialEngineCtx) ?? { markActionDone: () => {}, restart: () => {} };
}

interface Props {
  profile: UserProfile;
  planVisible: boolean;
  currentTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onProfileChanged: (updates: Partial<UserProfile>) => void;
  children: React.ReactNode;
}

export default function TutorialEngine({ profile, planVisible, currentTab, onNavigate, onProfileChanged, children }: Props) {
  const targetVersion = useTourTargetVersion();
  const startedAutomatically = useRef(false);
  const [state, dispatch] = useReducer(
    tourReducer,
    initialTourState(profile.tutorial?.pasoAlcanzado ?? 0, profile.tutorial?.ejemplosVistos ?? [])
  );
  const isFirstPass = !profile.tutorial?.completado;

  // Arranque/reanudación automática: plan visible + tutorial no completado
  // (reanuda en pasoAlcanzado, no solo arranca de cero — ver comentario de
  // cabecera).
  useEffect(() => {
    if (startedAutomatically.current) return;
    if (!planVisible || profile.tutorial?.completado) return;
    startedAutomatically.current = true;
    dispatch({ type: 'START' });
  }, [planVisible, profile.tutorial]);

  // Navega a la pestaña del paso activo cuando cambia.
  const step = TOUR_STEPS[state.stepIndex];
  useEffect(() => {
    if (!state.active) return;
    if (step.tab !== currentTab) onNavigate(step.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active, state.stepIndex, step.tab]);

  // Persiste el paso alcanzado en cada avance (reanudable) y el cierre real.
  const prevActiveRef = useRef(state.active);
  useEffect(() => {
    if (!state.active && !prevActiveRef.current) return; // sin cambios reales
    prevActiveRef.current = state.active;

    if (state.justCompleted) {
      const updates = { tutorial: { completado: true, pasoAlcanzado: state.stepIndex, ejemplosVistos: state.ejemplosVistos, completadoEn: new Date().toISOString() } };
      onProfileChanged(updates);
      updateUserProfile(profile.userId, updates).catch(err => console.warn('updateUserProfile (tutorial completado) failed:', err));
      return;
    }
    if (state.active) {
      const updates = { tutorial: { completado: false, pasoAlcanzado: state.stepIndex, ejemplosVistos: state.ejemplosVistos } };
      onProfileChanged(updates);
      updateUserProfile(profile.userId, updates).catch(err => console.warn('updateUserProfile (tutorial progreso) failed:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active, state.stepIndex, state.justCompleted]);

  const api: TutorialEngineApi = {
    markActionDone: (stepId: string) => {
      if (state.active && step.id === stepId) dispatch({ type: 'MARK_ACTION_DONE' });
    },
    restart: () => dispatch({ type: 'RESTART' }),
  };

  return (
    <TutorialEngineCtx.Provider value={api}>
      {children}
      {state.active && (
        <TourOverlay
          step={step}
          stepIndex={state.stepIndex}
          totalSteps={TOUR_STEPS.length}
          state={state}
          getRect={getTourTargetRect}
          targetVersion={targetVersion}
          isFirstPass={isFirstPass}
          onNext={() => dispatch({ type: 'NEXT' })}
          onBack={() => dispatch({ type: 'BACK' })}
          onSkipStep={() => dispatch({ type: 'SKIP' })}
          onClose={() => dispatch({ type: 'CLOSE' })}
          onForceUnblock={() => dispatch({ type: 'MARK_ACTION_DONE' })}
        />
      )}
    </TutorialEngineCtx.Provider>
  );
}
