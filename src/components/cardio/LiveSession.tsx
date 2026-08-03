import React from 'react';
import { CardioZones, CardioIntervalBlock } from '../../types';
import { HeartRateStatus } from '../../services/bleHeartRate';
import { ZONE_LABEL, ZONE_COLOR, BELOW_ZONE_LABEL, BELOW_ZONE_COLOR } from '../../utils/cardioZones';
import HrChart from './HrChart';
import ZoneBars from './ZoneBars';
import SlideAction from './SlideAction';

// La pantalla de entreno en vivo de FITIV (§4bis.1 del análisis): el fondo
// ENTERO de la pantalla es el color de la zona actual — "sabes tu zona sin
// leer nada, con el móvil a un metro". Se sustituye toda la UI de la app
// (tabs incluidas) mientras dura la sesión, igual que en su app.

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

interface Props {
  saving: boolean;
  deviceStatus: HeartRateStatus;
  bpm: number | null;
  currentZone: keyof CardioZones | null;
  zones: CardioZones;
  maxHR?: number;
  elapsedSec: number;
  avgHR?: number;
  maxHRSoFar?: number;
  chartData: { t: number; bpm: number }[];
  timeInZone: Record<keyof CardioZones, number>;
  belowZoneSec: number;
  targetZone?: keyof CardioZones;
  targetDurationSec?: number;
  // Intervalos (§F6) — mutuamente excluyente con targetZone/targetDurationSec.
  intervalBlocks?: CardioIntervalBlock[];
  currentBlockIndex?: number;
  blockRemainingSec?: number;
  onSave: () => void;
  onDiscard: () => void;
}

export default function LiveSession({
  saving, deviceStatus, bpm, currentZone, zones, maxHR, elapsedSec, avgHR, maxHRSoFar,
  chartData, timeInZone, belowZoneSec, targetZone, targetDurationSec,
  intervalBlocks, currentBlockIndex, blockRemainingSec, onSave, onDiscard,
}: Props) {
  const zoneColor = currentZone ? ZONE_COLOR[currentZone] : BELOW_ZONE_COLOR;
  const zoneLabel = currentZone ? ZONE_LABEL[currentZone] : BELOW_ZONE_LABEL;

  const targetProgressSec = targetZone ? timeInZone[targetZone] : 0;
  const targetFraction = targetDurationSec ? Math.min(targetProgressSec / targetDurationSec, 1) : null;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col transition-colors duration-700"
      style={{ background: `linear-gradient(180deg, ${zoneColor}f2, ${zoneColor}cc)` }}
    >
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <span className="material-symbols-outlined text-white/80 text-lg">
          {deviceStatus === 'connected' ? 'bluetooth_connected' : deviceStatus === 'reconnecting' ? 'bluetooth_searching' : 'bluetooth_disabled'}
        </span>
        <p className="text-label font-mono text-white/80 tabular-nums">{fmtClock(elapsedSec)}</p>
      </div>

      {deviceStatus === 'reconnecting' && (
        <p className="mx-5 mt-2 text-center text-caption font-mono uppercase text-white bg-black/25 rounded-surface py-1.5">
          Reconectando con la banda… la sesión sigue grabándose
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
        <div className="text-center pt-2">
          <p className="font-sans font-black text-7xl text-white tabular-nums leading-none drop-shadow-sm">{bpm ?? '--'}</p>
          <p className="text-label font-mono uppercase text-white/90 mt-1.5 tracking-wider">{zoneLabel}</p>
        </div>

        {intervalBlocks && currentBlockIndex !== undefined && (
          <div className="bg-black/25 rounded-surface p-3.5 space-y-2 text-center">
            <p className="text-caption font-mono uppercase text-white/80">
              Bloque {currentBlockIndex + 1}/{intervalBlocks.length} · {intervalBlocks[currentBlockIndex].label}
            </p>
            <p className="font-sans font-black text-4xl text-white tabular-nums">{fmtClock(blockRemainingSec ?? 0)}</p>
            {intervalBlocks[currentBlockIndex + 1] && (
              <p className="text-caption font-mono text-white/60">Siguiente: {intervalBlocks[currentBlockIndex + 1].label}</p>
            )}
          </div>
        )}

        {!intervalBlocks && targetZone && (
          <div className="bg-black/25 rounded-surface p-3.5 space-y-2">
            <p className="text-caption font-mono uppercase text-white/80 text-center">
              Objetivo: {ZONE_LABEL[targetZone]}
              {targetDurationSec ? ` · ${fmtClock(targetProgressSec)} / ${fmtClock(targetDurationSec)}` : ` · ${fmtClock(targetProgressSec)}`}
            </p>
            {targetFraction !== null && (
              <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                <div className="h-full rounded-full bg-white transition-all duration-1000" style={{ width: `${targetFraction * 100}%` }} />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <div className="flex-1 max-w-[140px] bg-black/25 rounded-surface p-2.5 text-center">
            <p className="text-caption font-mono uppercase text-white/70">FC prom.</p>
            <p className="text-lg font-sans font-bold text-white tabular-nums">{avgHR ?? '--'}</p>
          </div>
          <div className="flex-1 max-w-[140px] bg-black/25 rounded-surface p-2.5 text-center">
            <p className="text-caption font-mono uppercase text-white/70">FC máx.</p>
            <p className="text-lg font-sans font-bold text-white tabular-nums">{maxHRSoFar ?? '--'}</p>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="bg-black/25 rounded-surface p-3">
            <HrChart data={chartData} zones={zones} maxHR={maxHR} />
          </div>
        )}

        <div className="bg-black/25 rounded-surface p-3">
          <ZoneBars timeInZone={timeInZone} belowZoneSec={belowZoneSec} elapsedSec={elapsedSec} />
        </div>
      </div>

      <div className="px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2 space-y-2.5">
        <SlideAction label="Desliza para guardar" icon="fiber_manual_record" color="var(--color-danger)" onConfirm={onSave} disabled={saving} />
        <SlideAction label="Deslizar para descartar" icon="delete" color="var(--color-ink)" onConfirm={onDiscard} disabled={saving} />
      </div>
    </div>
  );
}
