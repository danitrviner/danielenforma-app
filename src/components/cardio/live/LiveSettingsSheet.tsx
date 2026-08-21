import React from 'react';
import { HeartRateStatus } from '../../../services/bleHeartRate';
import { CardioLivePrefs } from '../../../utils/cardioLivePrefs';
import { Icon, Sheet } from '../../ui';

/* Hoja de ajustes de la sesión en vivo (F8 del plan de réplica FITIV,
   §4bis.2 del análisis: "Dispositivo de entrenamiento" · "Entrenamiento por
   voz" · "Controles de entrenamiento de bloqueo automático"). Mismo patrón
   de interruptor que ProfileScreen.tsx, copiado tal cual para que un ajuste
   se vea igual en toda la app. */

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{ padding: '2px' }}
      className={`w-11 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-accent' : 'bg-white/12'}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-bg transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function Row({ icon, title, subtitle, children }: { icon: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Icon name={icon} size="m" className="text-ink-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-body-s font-sans font-bold text-ink">{title}</p>
        {subtitle && <p className="text-caption font-sans text-ink-2 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const DEVICE_STATUS_LABEL: Record<HeartRateStatus, string> = {
  connected: 'Conectada',
  reconnecting: 'Reconectando…',
  disconnected: 'Desconectada',
};

interface Props {
  open: boolean;
  onClose: () => void;
  deviceStatus: HeartRateStatus;
  prefs: CardioLivePrefs;
  onChangePrefs: (patch: Partial<CardioLivePrefs>) => void;
}

export default function LiveSettingsSheet({ open, onClose, deviceStatus, prefs, onChangePrefs }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Ajustes del entrenamiento">
      <div className="divide-y divide-hairline">
        <Row icon="bluetooth_connected" title="Dispositivo de entrenamiento" subtitle={DEVICE_STATUS_LABEL[deviceStatus]} />
        <Row icon="mic" title="Entrenamiento por voz" subtitle="Avisos al cambiar de bloque o salir de zona">
          <Switch on={prefs.voiceEnabled} onToggle={() => onChangePrefs({ voiceEnabled: !prefs.voiceEnabled })} />
        </Row>
        {/* El interruptor de "Bloqueo automático" (F8, auto-lock por
            inactividad) se quitó de aquí a petición de Dani (21-08): la
            pantalla en vivo no se debe bloquear nunca sola. El candado
            manual del cajón inferior sigue disponible. */}
      </div>
    </Sheet>
  );
}
