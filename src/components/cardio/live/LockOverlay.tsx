import React from 'react';
import SlideAction from '../SlideAction';
import { Icon } from '../../ui';

/* Pantalla bloqueada de la sesión en vivo (F8, §4bis.2 del análisis:
   "Auto Lock Workout Controls… desbloqueo deslizando de izquierda a
   derecha"). Cubre toda la pantalla en vivo — el BPM sigue viendose debajo
   a través del scrim, pero ningún toque llega a los controles salvo el
   propio deslizador de desbloqueo. */

interface Props {
  onUnlock: () => void;
}

export default function LockOverlay({ onUnlock }: Props) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/55 backdrop-blur-sm px-8">
      <Icon name="lock" size="xl" className="text-white/70" />
      <p className="text-label font-sans uppercase text-white/70 text-center">Controles bloqueados</p>
      <div className="w-full max-w-sm">
        <SlideAction label="Desliza para desbloquear" icon="lock" color="var(--color-ink)" onConfirm={onUnlock} />
      </div>
    </div>
  );
}
