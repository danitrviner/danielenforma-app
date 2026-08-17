import React, { useEffect, useState } from 'react';
import { CardioSessionContext, CardioSessionContextValue } from '../../hooks/useCardioSession';
import CardioMiniPlayer from './CardioMiniPlayer';

/* Banco de pruebas SOLO de desarrollo (misma poda que CardioLiveDemo) para
   ver CardioMiniPlayer sin pasar por Firestore ni por CardioSessionProvider
   real: rellena el contexto a mano con un valor simulado. La ruta "actual"
   también es simulada con estado local, no con el router — CardioMiniPlayer
   recibe `currentPath` como prop precisamente para poder probarlo así sin
   montar un segundo Router dentro del que ya envuelve toda la app (eso
   revienta: "You cannot render a <Router> inside another <Router>"). */

function FakePage({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-bg p-6 pb-14">
      <p className="font-sans text-title-m text-ink">{label}</p>
      <p className="font-sans text-body-s text-ink-2 mt-2">
        El mini-reproductor debería verse fijo abajo, salvo en "Cardio".
      </p>
    </div>
  );
}

export default function CardioMiniPlayerDemo() {
  const [paused, setPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(742);
  const [bpm, setBpm] = useState(138);
  const [currentPath, setCurrentPath] = useState('/home');

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => { setElapsedSec(s => s + 1); setBpm(b => 130 + Math.round(Math.sin(Date.now() / 3000) * 10)); }, 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  const value: CardioSessionContextValue = {
    state: 'live',
    sessionType: 'zona2',
    setSessionType: () => {},
    bpm,
    deviceStatus: 'connected',
    error: null,
    paused,
    displayElapsedSec: elapsedSec,
    displaySamples: [],
    displayTimeInZone: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
    displayBelowZoneSec: 0,
    displayBlockIndex: 0,
    displayBlockRemainingSec: 0,
    displayLive: {},
    justSavedSession: null,
    weekJustClosed: false,
    intervalBlocksRef: { current: null },
    sessionTargetZoneRef: { current: 'z2' },
    livePrefs: { voiceEnabled: true, autoLockEnabled: false, autoLockDelaySec: 20 },
    setLivePrefs: () => {},
    locked: false,
    registerActivity: () => {},
    unlock: () => {},
    lock: () => {},
    connect: async () => {},
    cancelReady: async () => {},
    start: () => {},
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    save: async () => {},
    discard: async () => {},
    finishCooldown: async () => {},
    confirmEffort: async () => {},
    closeSummary: () => {},
  };

  return (
    <CardioSessionContext.Provider value={value}>
      <div className="fixed top-2 left-2 z-[999] flex gap-2">
        <button onClick={() => setCurrentPath('/home')} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">
          Ir a Home
        </button>
        <button onClick={() => setCurrentPath('/cardio')} className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">
          Ir a Cardio
        </button>
        <span className="rounded-full bg-black/70 px-3 py-1 text-caption font-mono text-white">
          Ruta simulada: {currentPath}
        </span>
      </div>
      <FakePage label={currentPath === '/cardio' ? 'Cardio (falsa)' : 'Home (falsa)'} />
      <CardioMiniPlayer currentPath={currentPath} onOpen={() => setCurrentPath('/cardio')} />
    </CardioSessionContext.Provider>
  );
}
