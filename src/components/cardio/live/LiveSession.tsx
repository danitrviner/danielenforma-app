import React, { useState } from 'react';
import { CardioZones, CardioIntervalBlock } from '../../../types';
import { HeartRateStatus } from '../../../services/bleHeartRate';
import { ZONE_COLOR, BELOW_ZONE_COLOR } from '../../../utils/cardioZones';
import { CardioLivePrefs } from '../../../utils/cardioLivePrefs';
import { Icon, Pager } from '../../ui';
import TopBar from './TopBar';
import MetricRow from './MetricRow';
import BottomBar from './BottomBar';
import ActionDrawer from './ActionDrawer';
import LockOverlay from './LockOverlay';
import LiveSettingsSheet from './LiveSettingsSheet';
import PageObjetivo from './pages/PageObjetivo';
import PageCalorias from './pages/PageCalorias';
import PageZonas from './pages/PageZonas';
import PageGrafica from './pages/PageGrafica';
import PageOtras from './pages/PageOtras';

/* ═══════════════════════════════════════════════════════════════════════════
   LiveSession — F4 del plan de réplica FITIV: misma ESTRUCTURA que FITIV
   (§4bis.1/§4bis.2bis del análisis), piel del Design System propio.

   Diferencias deliberadas con la implementación anterior (un solo fichero,
   columna scrollable):
   - El color de zona se acota al bloque de contenido central. La barra
     inferior y el cajón son SIEMPRE `--color-surface`/`--color-raised`
     neutros — antes el color de zona bañaba también los controles.
   - Carrusel de 5 páginas con puntos (`Pager`, F3) en vez de todo apilado en
     una columna con scroll.
   - Fila de 3 métricas (antes 2: faltaba METs).
   - Pausa real (F4 del motor, `useCardioSession.tsx`) con el único elemento
     oro relleno de la pantalla — regla del DS, un oro por pantalla.
   - Cajón colapsable en vez de los deslizadores siempre visibles.

   Deliberadamente IGUAL que antes: los colores de zona (Z2 cian, no verde),
   y que esto sigue siendo una vista a pantalla completa, no un modal — F9 de
   la migración del DS ya lo clasificó así a propósito.
   ═══════════════════════════════════════════════════════════════════════════ */

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
  intervalBlocks?: CardioIntervalBlock[];
  currentBlockIndex?: number;
  blockRemainingSec?: number;
  paused: boolean;
  onTogglePause: () => void;
  onHide: () => void;
  liveMets?: number;
  liveCaloriesKcal?: number;
  liveCaloriesActiveKcal?: number;
  livePoints?: number;
  onSave: () => void;
  onDiscard: () => void;
  locked: boolean;
  onRegisterActivity: () => void;
  onUnlock: () => void;
  onLock: () => void;
  livePrefs: CardioLivePrefs;
  onChangePrefs: (patch: Partial<CardioLivePrefs>) => void;
}

export default function LiveSession({
  saving, deviceStatus, bpm, currentZone, zones, maxHR, elapsedSec, avgHR, maxHRSoFar,
  chartData, timeInZone, belowZoneSec, targetZone, targetDurationSec,
  intervalBlocks, currentBlockIndex, blockRemainingSec,
  paused, onTogglePause, onHide,
  liveMets, liveCaloriesKcal, liveCaloriesActiveKcal, livePoints,
  onSave, onDiscard,
  locked, onRegisterActivity, onUnlock, onLock, livePrefs, onChangePrefs,
}: Props) {
  const [pagina, setPagina] = useState(0);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const zoneColor = currentZone ? ZONE_COLOR[currentZone] : BELOW_ZONE_COLOR;
  const targetProgressSec = targetZone ? timeInZone[targetZone] : 0;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg" onPointerDown={onRegisterActivity}>
      <div
        className="flex flex-1 min-h-0 flex-col transition-colors duration-700"
        style={{ background: `linear-gradient(180deg, ${zoneColor}f2, ${zoneColor}cc)` }}
      >
        <TopBar deviceStatus={deviceStatus} onHide={onHide} />

        <div className="flex items-center justify-center gap-2 pt-3">
          <p className="font-sans font-bold text-7xl text-bg tabular-nums leading-none">{bpm ?? '--'}</p>
          {/* "El corazón late a la frecuencia real medida, no a un ritmo
              fijo" — regla de motion del prototipo de Fase 3 (panel
              "Zonas de Frecuencia" de Graficas - Experiencia.dc.html), que
              no se había aplicado hasta ahora. `animate-pulse-dot` ya existe
              en el DS (1.6s fijos); aquí se sobreescribe solo la duración
              vía estilo en línea para que lata a 60000/bpm ms de verdad. */}
          {bpm !== null && bpm > 0 && (
            <Icon
              name="favorite"
              size="l"
              filled
              className="text-bg animate-pulse-dot"
              style={{ animationDuration: `${60000 / bpm}ms` }}
            />
          )}
        </div>

        <MetricRow avgHR={avgHR} mets={liveMets} maxHR={maxHRSoFar} />

        <div className="flex-1 min-h-0 mt-3">
          <Pager value={pagina} onChange={setPagina} label="Métricas de la sesión" dots="inside" className="h-full">
            <PageObjetivo
              intervalBlocks={intervalBlocks}
              currentBlockIndex={currentBlockIndex}
              blockRemainingSec={blockRemainingSec}
              targetZone={targetZone}
              targetDurationSec={targetDurationSec}
              targetProgressSec={targetProgressSec}
            />
            <PageCalorias caloriesKcal={liveCaloriesKcal} caloriesActiveKcal={liveCaloriesActiveKcal} points={livePoints} />
            <PageZonas timeInZone={timeInZone} belowZoneSec={belowZoneSec} elapsedSec={elapsedSec} currentZone={currentZone} />
            <PageGrafica chartData={chartData} zones={zones} maxHR={maxHR} />
            <PageOtras elapsedSec={elapsedSec} bpm={bpm} maxHR={maxHR} />
          </Pager>
        </div>
      </div>

      <BottomBar
        elapsedSec={elapsedSec}
        paused={paused}
        onTogglePause={onTogglePause}
        expanded={drawerExpanded}
        onToggleExpanded={() => setDrawerExpanded(v => !v)}
      />
      <ActionDrawer
        expanded={drawerExpanded}
        saving={saving}
        onSave={onSave}
        onDiscard={onDiscard}
        onLock={onLock}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {locked && <LockOverlay onUnlock={onUnlock} />}

      <LiveSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        deviceStatus={deviceStatus}
        prefs={livePrefs}
        onChangePrefs={onChangePrefs}
      />
    </div>
  );
}
