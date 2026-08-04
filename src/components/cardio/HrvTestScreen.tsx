import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, HrvReading } from '../../types';
import { HeartRateMonitor, isBleAvailable } from '../../services/bleHeartRate';
import { createHrvReading } from '../../dbService';
import { rmssd, hrvBaseline, readinessScoreFromHrv } from '../../utils/cardioMetrics';

// HRV matinal (F8, §7/§8 del análisis): 3 min tumbado con la banda puesta,
// quieto. Es una lectura puntual e independiente del entreno — su propia
// conexión BLE, no la de CardioScreen — y no requiere aprobación del coach
// (es un hábito diario del atleta, no una calibración de zonas).

const DURATION_SEC = 180;

type Phase = 'intro' | 'connecting' | 'measuring' | 'saving';

interface Props {
  profile: UserProfile;
  pastReadings: HrvReading[];
  onClose: () => void;
  onSaved: (reading: HrvReading) => void;
}

export default function HrvTestScreen({ profile, pastReadings, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [remaining, setRemaining] = useState(DURATION_SEC);
  const [bpm, setBpm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monitorRef = useRef<HeartRateMonitor | null>(null);
  const rrRef = useRef<number[]>([]);
  const bpmSamplesRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    monitorRef.current?.disconnect();
  }, []);

  const finish = async () => {
    if (tickRef.current !== null) { window.clearInterval(tickRef.current); tickRef.current = null; }
    await monitorRef.current?.disconnect();
    monitorRef.current = null;

    const value = rmssd(rrRef.current);
    if (value === undefined) {
      setError('Tu banda no envió datos de variabilidad cardíaca (RR). Prueba con una Polar H10 u otra compatible.');
      setPhase('intro');
      return;
    }

    setPhase('saving');
    const restingHR = bpmSamplesRef.current.length
      ? Math.round(bpmSamplesRef.current.reduce((a, b) => a + b, 0) / bpmSamplesRef.current.length)
      : undefined;
    const baseline = hrvBaseline(pastReadings.map(r => r.rmssd));
    const readinessScore = baseline ? readinessScoreFromHrv(value, baseline) : undefined;

    const reading = await createHrvReading({
      athleteId: profile.email,
      date: new Date().toISOString().slice(0, 10),
      rmssd: Math.round(value * 10) / 10,
      restingHR,
      readinessScore,
      rrIntervals: rrRef.current,
      createdAt: new Date().toISOString(),
    });
    onSaved(reading);
  };

  const start = async () => {
    setError(null);
    if (!isBleAvailable()) {
      setError('Medir la HRV requiere la app nativa (iOS/Android).');
      return;
    }
    setPhase('connecting');
    try {
      const monitor = new HeartRateMonitor();
      await monitor.requestAndConnect((status) => {
        if (status === 'disconnected') { setError('La banda se desconectó.'); void finish(); }
      });
      await monitor.startListening((sample) => {
        setBpm(sample.bpm);
        bpmSamplesRef.current.push(sample.bpm);
        if (sample.rrIntervals?.length) rrRef.current.push(...sample.rrIntervals);
      });
      monitorRef.current = monitor;
      rrRef.current = [];
      bpmSamplesRef.current = [];
      setRemaining(DURATION_SEC);
      setPhase('measuring');

      tickRef.current = window.setInterval(() => {
        setRemaining(r => {
          if (r <= 1) { void finish(); return 0; }
          return r - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo conectar con la banda.');
      setPhase('intro');
    }
  };

  const cancel = async () => {
    if (tickRef.current !== null) { window.clearInterval(tickRef.current); tickRef.current = null; }
    await monitorRef.current?.disconnect();
    monitorRef.current = null;
    onClose();
  };

  return (
    /* No es un modal: es una vista a pantalla completa. Fondo opaco, sin telón
       y sin caja — ocupa la ventana entera durante la sesión. F9 lo clasificó y
       lo dejó fuera a propósito: convertirlo en `Dialog` sería un rediseño, no
       una migración. Cuenta en la métrica `Overlays artesanales` del inventario
       porque esa métrica mide la utilidad de posición, que aquí no significa
       overlay sino pantalla. */
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {phase === 'intro' && (
          <>
            <div>
              <p className="text-caption font-mono uppercase text-ink-2 tracking-wider">HRV matinal</p>
              <span className="material-symbols-outlined text-data text-display mt-3 block">bedtime</span>
              <p className="text-body-s text-white mt-3">Túmbate con la banda puesta y quédate quieto 3 minutos. Mejor nada más despertar, antes de levantarte.</p>
            </div>
            {error && <p className="text-label text-red-400 font-sans">{error}</p>}
            <button onClick={start} className="w-full py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all">
              Empezar
            </button>
            <button onClick={onClose} className="w-full py-2 text-caption font-sans uppercase text-ink-2 hover:text-white transition-colors">
              Cancelar
            </button>
          </>
        )}

        {phase === 'connecting' && <p className="text-label text-ink-2 font-sans">Conectando con la banda...</p>}

        {phase === 'measuring' && (
          <>
            <p className="text-caption font-mono uppercase text-ink-2 tracking-wider">Quédate quieto</p>
            <p className="font-sans font-bold text-6xl text-white tabular-nums mt-2">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-danger text-title-m">favorite</span>
              <p className="font-sans font-bold text-title-l text-white tabular-nums">{bpm ?? '--'}</p>
            </div>
            {error && <p className="text-label text-red-400 font-sans">{error}</p>}
            <button onClick={cancel} className="w-full py-2 text-caption font-sans uppercase text-ink-2 hover:text-white transition-colors">
              Cancelar
            </button>
          </>
        )}

        {phase === 'saving' && <p className="text-label text-ink-2 font-mono">Guardando...</p>}
      </div>
    </div>
  );
}
