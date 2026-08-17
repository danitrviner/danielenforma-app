import React, { useEffect, useState } from 'react';
import LiveSession from './LiveSession';
import { CardioZones } from '../../../types';
import { ZONE_ORDER } from '../../../utils/cardioZones';
import { DEFAULT_LIVE_PREFS, CardioLivePrefs } from '../../../utils/cardioLivePrefs';

/* Banco de pruebas SOLO de desarrollo (misma poda que UiShowcase/
   GimnasioHarness — ver App.tsx) para ver `LiveSession` con datos, sin
   sesión real: ni login (no hay credenciales que manejar) ni banda BLE (no
   hay hardware aquí). Sin esto no había forma de comprobar el rediseño de
   F4 más que leyendo el JSX. */

const MOCK_ZONES: CardioZones = {
  z1: { min: 95, max: 113 },
  z2: { min: 114, max: 132 },
  z3: { min: 133, max: 151 },
  z4: { min: 152, max: 170 },
  z5: { min: 171, max: 190 },
};

export default function CardioLiveDemo() {
  const [zoneIndex, setZoneIndex] = useState(2);
  const [elapsedSec, setElapsedSec] = useState(742);
  const [paused, setPaused] = useState(false);
  const [chartData, setChartData] = useState(() => Array.from({ length: 20 }, (_, i) => ({ t: i * 4, bpm: 120 + Math.round(Math.sin(i / 3) * 20) })));
  const [mode, setMode] = useState<'libre' | 'zona2' | 'intervalos'>('zona2');
  const [locked, setLocked] = useState(false);
  const [prefs, setPrefs] = useState<CardioLivePrefs>(DEFAULT_LIVE_PREFS);

  const zone = ZONE_ORDER[zoneIndex];
  const bpm = MOCK_ZONES[zone].min + 5;

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  const timeInZone = { z1: 120, z2: 340, z3: 180, z4: 60, z5: 20 };

  return (
    <div className="min-h-screen bg-bg">
      <div className="fixed top-2 left-2 z-[999] flex flex-wrap gap-2 max-w-[90vw]">
        {ZONE_ORDER.map((z, i) => (
          <button key={z} onClick={() => setZoneIndex(i)} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">
            {z}
          </button>
        ))}
        <button onClick={() => setMode('libre')} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">libre</button>
        <button onClick={() => setMode('zona2')} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">zona2</button>
        <button onClick={() => setMode('intervalos')} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">intervalos</button>
        <button onClick={() => setLocked(l => !l)} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">
          {locked ? 'desbloquear (debug)' : 'bloquear (debug)'}
        </button>
      </div>

      <LiveSession
        saving={false}
        deviceStatus="connected"
        bpm={bpm}
        currentZone={zone}
        zones={MOCK_ZONES}
        maxHR={190}
        elapsedSec={elapsedSec}
        avgHR={bpm - 3}
        maxHRSoFar={bpm + 8}
        chartData={chartData}
        timeInZone={timeInZone}
        belowZoneSec={15}
        targetZone={mode === 'zona2' ? 'z2' : undefined}
        targetDurationSec={mode === 'zona2' ? 2400 : undefined}
        intervalBlocks={mode === 'intervalos' ? [
          { label: 'Sprint', durationSec: 30, targetZone: 'z5' },
          { label: 'Recuperación', durationSec: 60, targetZone: 'z1' },
        ] : undefined}
        currentBlockIndex={mode === 'intervalos' ? 0 : undefined}
        blockRemainingSec={mode === 'intervalos' ? 22 : undefined}
        paused={paused}
        onTogglePause={() => setPaused(p => !p)}
        onHide={() => window.alert('onHide (en la app real: navigate a /home)')}
        liveMets={7.8}
        liveCaloriesKcal={244}
        liveCaloriesActiveKcal={210}
        livePoints={194}
        onSave={() => window.alert('onSave')}
        onDiscard={() => window.alert('onDiscard')}
        locked={locked}
        onRegisterActivity={() => {}}
        onUnlock={() => setLocked(false)}
        onLock={() => setLocked(true)}
        livePrefs={prefs}
        onChangePrefs={(patch) => setPrefs(p => ({ ...p, ...patch }))}
      />
    </div>
  );
}
