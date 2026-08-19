import React from 'react';
import { HeartRateStatus } from '../../../services/bleHeartRate';
import { Icon } from '../../ui';

/* Barra superior de la pantalla en vivo (§4bis.1 del análisis FITIV): chip
   Bluetooth + "Ocultar". Los controles de música son F7 (plugin nativo
   nuevo, sin patrón previo en el proyecto) — se dejan fuera a propósito en
   vez de simular botones que no hacen nada. */

const STATUS_ICON: Record<HeartRateStatus, string> = {
  connected: 'bluetooth_connected',
  reconnecting: 'bluetooth_searching',
  disconnected: 'bluetooth_disabled',
};

interface Props {
  deviceStatus: HeartRateStatus;
  onHide: () => void;
}

export default function TopBar({ deviceStatus, onHide }: Props) {
  return (
    <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)]">
      <Icon
        name={STATUS_ICON[deviceStatus]}
        size="l"
        className="text-white/80"
        label={deviceStatus === 'connected' ? 'Banda conectada' : deviceStatus === 'reconnecting' ? 'Reconectando con la banda' : 'Banda desconectada'}
      />
      <button
        type="button"
        onClick={onHide}
        className="rounded-full bg-black/25 px-4 py-2 text-label font-sans text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
      >
        Ocultar
      </button>
    </div>
  );
}
