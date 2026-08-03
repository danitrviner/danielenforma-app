import React from 'react';

// Chip de banda con BPM en vivo ANTES de arrancar la sesión (§4bis.3 del
// análisis: "🔵 Google Fitbit Air · Conectado  ♥ 99"). Evita el fallo nº1
// de FITIV según sus propios usuarios: descubrir a los 10 min que la banda
// no estaba midiendo.

export type DeviceChipStatus = 'idle' | 'connecting' | 'ready' | 'lost';

const STATUS_CONFIG: Record<DeviceChipStatus, { icon: string; text: string; color: string }> = {
  idle: { icon: 'bluetooth', text: 'Banda no conectada', color: 'var(--color-ink-2)' },
  connecting: { icon: 'bluetooth_searching', text: 'Conectando…', color: 'var(--color-ink-2)' },
  ready: { icon: 'bluetooth_connected', text: 'Conectada', color: 'var(--color-success)' },
  lost: { icon: 'bluetooth_disabled', text: 'Banda desconectada', color: 'var(--color-danger)' },
};

interface Props {
  status: DeviceChipStatus;
  deviceName?: string;
  bpm: number | null;
}

export default function DeviceChip({ status, deviceName, bpm }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div className="flex items-center gap-2.5 bg-bg border border-hairline rounded-full px-3.5 py-2">
      <span className="material-symbols-outlined text-lg" style={{ color: cfg.color }}>{cfg.icon}</span>
      <p className="flex-1 min-w-0 text-label font-mono truncate">
        <span className="text-white">{deviceName ?? 'Banda BLE'}</span>
        <span className="text-ink-2"> · {cfg.text}</span>
      </p>
      {status === 'ready' && (
        <p className="flex items-center gap-1 text-body-s font-sans font-bold text-white tabular-nums">
          <span className="material-symbols-outlined text-danger text-base">favorite</span>
          {bpm ?? '--'}
        </p>
      )}
    </div>
  );
}
