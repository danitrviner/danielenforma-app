import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CardioZones, CardioIntervalBlock } from '../../../types';
import { HeartRateStatus } from '../../../services/bleHeartRate';
import { ZONE_COLOR, BELOW_ZONE_COLOR } from '../../../utils/cardioZones';
import { CardioLivePrefs } from '../../../utils/cardioLivePrefs';
import { useScrollLock } from '../../ui/internal/overlayHooks';
import { Icon, Pager } from '../../ui';
import TopBar from './TopBar';
import MetricRow from './MetricRow';
import BottomBar from './BottomBar';
import ActionDrawer from './ActionDrawer';
import LockOverlay from './LockOverlay';
import LiveSettingsSheet from './LiveSettingsSheet';
import PageObjetivo from './pages/PageObjetivo';
import PageGrafica from './pages/PageGrafica';
import PageAvanzado from './pages/PageAvanzado';

/* ═══════════════════════════════════════════════════════════════════════════
   LiveSession — F4 del plan de réplica FITIV: misma ESTRUCTURA que FITIV
   (§4bis.1/§4bis.2bis del análisis), piel del Design System propio.

   Diferencias deliberadas con la implementación anterior (un solo fichero,
   columna scrollable):
   - El color de zona es un ACENTO puntual (franja de 3px arriba + corazón),
     no un baño de color de toda la pantalla — decisión de estilo explícita
     del rediseño (handoff Fase 3.2, "Cardio"), distinta del gradiente de
     fondo que teñía todo el bloque de contenido antes. La barra inferior y
     el cajón siguen SIEMPRE `--color-surface`/`--color-raised` neutros.
   - Carrusel de páginas con puntos (`Pager`, F3) en vez de todo apilado en
     una columna con scroll.
   - Fila de 3 métricas (antes 2: faltaba METs).
   - Pausa real (F4 del motor, `useCardioSession.tsx`) con el único elemento
     oro relleno de la pantalla — regla del DS, un oro por pantalla.
   - Cajón colapsable en vez de los deslizadores siempre visibles.

   Deliberadamente IGUAL que antes: los colores de zona (Z2 cian, no verde),
   y que esto sigue siendo una vista a pantalla completa, no un modal — F9 de
   la migración del DS ya lo clasificó así a propósito.

   Portal a `document.body` (rastreo móvil, 17-08): antes se montaba en su
   sitio normal dentro de `<main>`, y en el iPhone físico de Dani la cabecera
   y la barra de navegación se quedaban visibles por encima/debajo, con el
   contenido de la sesión encogido entre medias en vez de a pantalla
   completa — el mismo fallo silencioso que el docstring de `Sheet.tsx` ya
   describe para overlays no portados: el `fixed inset-0` deja de cubrir el
   viewport real si algo por el camino le rompe el containing block, y en un
   WKWebView eso puede pasar sin que ninguna regla de `index.css` lo delate
   en el navegador de escritorio. Mismo remedio que ya usa `Sheet`: portal +
   `useScrollLock`, para que quede fuera del árbol de `AppContent` del todo.
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
  /** Solo relevante si el bloque en curso tiene `closeType: 'calories'` (F9). */
  blockProgressKcal?: number;
  paused: boolean;
  onTogglePause: () => void;
  onHide: () => void;
  /** Solo se pasa (y solo se usa) cuando el bloque en curso cierra manualmente (F9). */
  onAdvanceBlock?: () => void;
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
  intervalBlocks, currentBlockIndex, blockRemainingSec, blockProgressKcal,
  paused, onTogglePause, onHide, onAdvanceBlock,
  liveMets, liveCaloriesKcal, liveCaloriesActiveKcal, livePoints,
  onSave, onDiscard,
  locked, onRegisterActivity, onUnlock, onLock, livePrefs, onChangePrefs,
}: Props) {
  const [pagina, setPagina] = useState(0);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useScrollLock(true);

  const zoneColor = currentZone ? ZONE_COLOR[currentZone] : BELOW_ZONE_COLOR;
  const targetProgressSec = targetZone ? timeInZone[targetZone] : 0;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg" onPointerDown={onRegisterActivity}>
      <div className="flex flex-1 min-h-0 flex-col bg-bg">
        {/* El color de zona es un acento puntual (franja superior, texto,
            borde) — no un baño de color de toda la pantalla. Antes el
            gradiente de fondo teñía TODO este bloque (BPM, métricas, las 5
            páginas del carrusel); decisión de estilo explícita: solo esta
            franja de 3px y el corazón llevan el color de zona. */}
        <div className="h-[3px] flex-shrink-0 transition-colors duration-700" style={{ background: zoneColor }} />

        <TopBar deviceStatus={deviceStatus} onHide={onHide} />

        <div className="flex items-center justify-center gap-2 pt-3">
          <p className="font-sans font-bold text-7xl text-ink tabular-nums leading-none">{bpm ?? '--'}</p>
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
              className="animate-pulse-dot"
              style={{ animationDuration: `${60000 / bpm}ms`, color: zoneColor }}
            />
          )}
        </div>

        <MetricRow bpm={bpm} mets={liveMets} maxHR={maxHRSoFar} />

        <div className="flex-1 min-h-0 mt-3">
          <Pager value={pagina} onChange={setPagina} label="Métricas de la sesión" dots="inside" activeDotColor={zoneColor} className="h-full" height="fill">
            <PageObjetivo
              intervalBlocks={intervalBlocks}
              currentBlockIndex={currentBlockIndex}
              blockRemainingSec={blockRemainingSec}
              blockProgressKcal={blockProgressKcal}
              bpm={bpm}
              currentZone={currentZone}
              targetZone={targetZone}
              targetDurationSec={targetDurationSec}
              targetProgressSec={targetProgressSec}
              onAdvanceBlock={onAdvanceBlock}
              caloriesKcal={liveCaloriesKcal}
              caloriesActiveKcal={liveCaloriesActiveKcal}
              points={livePoints}
            />
            <PageGrafica
              chartData={chartData} zones={zones} maxHR={maxHR}
              timeInZone={timeInZone} belowZoneSec={belowZoneSec} elapsedSec={elapsedSec} currentZone={currentZone}
            />
            <PageAvanzado
              ctx={{
                bpm, avgHR, maxHRSoFar, maxHR, currentZone, elapsedSec,
                caloriesKcal: liveCaloriesKcal, caloriesActiveKcal: liveCaloriesActiveKcal, mets: liveMets,
              }}
              layout={livePrefs.advancedLayout}
              onChangeLayout={next => onChangePrefs({ advancedLayout: next })}
            />
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
    </div>,
    document.body
  );
}
