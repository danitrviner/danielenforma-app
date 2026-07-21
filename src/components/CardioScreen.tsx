import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { UserProfile, CardioZones, CardioSessionType } from '../types';
import { getCardioProfile, getCardioSessionsForAthlete, createCardioSession } from '../dbService';
import { HeartRateMonitor, isBleAvailable } from '../services/bleHeartRate';
import { getZoneForBpm, ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from '../utils/cardioZones';
import { grantXp } from '../utils/xp';
import Skeleton from './Skeleton';
import HrTestsPanel from './HrTestsPanel';

const XP_PER_SESSION = 15;

interface Props {
  profile: UserProfile;
}

const SAMPLE_INTERVAL_SEC = 4; // submuestreo — nunca FC cruda por segundo (§7.4)

type SessionState = 'idle' | 'connecting' | 'live' | 'saving';

export default function CardioScreen({ profile }: Props) {
  const queryClient = useQueryClient();
  const { data: cardioProfile, isPending: loadingProfile } = useQuery({
    queryKey: ['cardioProfile', profile.email],
    queryFn: () => getCardioProfile(profile.email),
  });
  const { data: sessions = [], isPending: loadingSessions } = useQuery({
    queryKey: ['cardioSessions', profile.email],
    queryFn: () => getCardioSessionsForAthlete(profile.email),
  });

  const [state, setState] = useState<SessionState>('idle');
  const [sessionType, setSessionType] = useState<CardioSessionType>('libre');
  const [bpm, setBpm] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [samples, setSamples] = useState<number[]>([]);
  const [timeInZone, setTimeInZone] = useState<Record<keyof CardioZones, number>>({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 });
  const [error, setError] = useState<string | null>(null);

  const monitorRef = useRef<HeartRateMonitor | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const bpmBufferRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => { stopTicking(); monitorRef.current?.disconnect(); }, []);

  function stopTicking() {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  }

  const handleStart = async () => {
    setError(null);
    if (!isBleAvailable()) {
      setError('Conectar la banda BLE requiere la app nativa (iOS/Android). En la web puedes seguir viendo tus zonas y tu historial.');
      return;
    }
    setState('connecting');
    try {
      const monitor = new HeartRateMonitor();
      await monitor.requestAndConnect(() => { setError('La banda se desconectó.'); handleStop(); });
      await monitor.startListening((value) => { setBpm(value); bpmBufferRef.current.push(value); });
      monitorRef.current = monitor;
      startedAtRef.current = new Date().toISOString();
      setElapsedSec(0);
      setSamples([]);
      setTimeInZone({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 });
      setState('live');

      tickRef.current = window.setInterval(() => {
        setElapsedSec(s => s + 1);
      }, 1000);

      // Submuestreo: cada SAMPLE_INTERVAL_SEC promediamos el buffer de BPM
      // recibido de la banda y lo empujamos a `samples` — así 60 min de
      // sesión son ~900 números en vez de ~3600 lecturas crudas.
      window.setInterval(() => {
        if (bpmBufferRef.current.length === 0) return;
        const avg = Math.round(bpmBufferRef.current.reduce((a, b) => a + b, 0) / bpmBufferRef.current.length);
        bpmBufferRef.current = [];
        setSamples(prev => [...prev, avg]);
        if (cardioProfile) {
          const zone = getZoneForBpm(avg, cardioProfile.zones);
          if (zone) setTimeInZone(prev => ({ ...prev, [zone]: prev[zone] + SAMPLE_INTERVAL_SEC }));
        }
      }, SAMPLE_INTERVAL_SEC * 1000);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo conectar con la banda.');
      setState('idle');
    }
  };

  const handleStop = async () => {
    stopTicking();
    await monitorRef.current?.stopListening();
    await monitorRef.current?.disconnect();
    monitorRef.current = null;
    if (!startedAtRef.current || elapsedSec < 10) { setState('idle'); return; }
    setState('saving');
    const avgHR = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : undefined;
    const maxHR = samples.length ? Math.max(...samples) : undefined;
    const session = await createCardioSession({
      athleteId: profile.email,
      type: sessionType,
      date: new Date().toISOString().slice(0, 10),
      startedAt: startedAtRef.current,
      durationSec: elapsedSec,
      avgHR, maxHR,
      timeInZoneSec: timeInZone,
      samples,
      sampleIntervalSec: SAMPLE_INTERVAL_SEC,
    });
    queryClient.setQueryData(['cardioSessions', profile.email], (prev: any[] = []) => [...prev, session]);
    grantXp(profile, XP_PER_SESSION).catch(err => console.warn('grantXp (cardio session) failed:', err));
    startedAtRef.current = null;
    setState('idle');
  };

  if (loadingProfile || loadingSessions) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  const currentZone = bpm !== null && cardioProfile ? getZoneForBpm(bpm, cardioProfile.zones) : null;
  const chartData = samples.map((v, i) => ({ t: i * SAMPLE_INTERVAL_SEC, bpm: v }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Cardio</h1>
        <p className="text-xs text-[#c6c9ab] font-mono mt-1">Zonas de FC y dashboard en vivo</p>
      </header>

      {!cardioProfile && (
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 text-center">
          <p className="text-xs text-[#c6c9ab] font-mono">Tu entrenador todavía no ha configurado tus zonas de FC.</p>
        </div>
      )}

      {cardioProfile && (
        <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {ZONE_ORDER.map(z => (
              <div key={z} className="flex-1 min-w-[100px] rounded-xl p-2.5 text-center" style={{ backgroundColor: `${ZONE_COLOR[z]}1a`, border: `1px solid ${ZONE_COLOR[z]}40` }}>
                <p className="text-[9px] font-mono uppercase" style={{ color: ZONE_COLOR[z] }}>{ZONE_LABEL[z]}</p>
                <p className="text-xs font-bold text-white mt-0.5">{cardioProfile.zones[z].min}-{cardioProfile.zones[z].max}</p>
              </div>
            ))}
          </div>

          {state === 'idle' && (
            <div className="flex items-center gap-2">
              <select value={sessionType} onChange={e => setSessionType(e.target.value as CardioSessionType)}
                className="bg-[#0e0e0e] border border-white/7 rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#fbcb1a]">
                <option value="libre">Libre</option>
                <option value="zona2">Sesión Zona 2</option>
                <option value="intervalos">Intervalos</option>
              </select>
              <button onClick={handleStart} className="flex-1 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all">
                Conectar banda y empezar
              </button>
            </div>
          )}

          {state === 'connecting' && <p className="text-xs text-[#c6c9ab] font-mono text-center py-4">Conectando con la banda...</p>}

          {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

          {(state === 'live' || state === 'saving') && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <p className="font-sans font-black text-6xl text-white tabular-nums">{bpm ?? '--'}</p>
                  <p className="text-[10px] font-mono uppercase text-[#c6c9ab]">BPM</p>
                </div>
                {currentZone && (
                  <div className="text-center px-4 py-2 rounded-xl" style={{ backgroundColor: `${ZONE_COLOR[currentZone]}1a`, border: `1px solid ${ZONE_COLOR[currentZone]}40` }}>
                    <p className="font-sans font-bold text-sm" style={{ color: ZONE_COLOR[currentZone] }}>{ZONE_LABEL[currentZone]}</p>
                  </div>
                )}
              </div>
              <p className="text-center text-xs font-mono text-[#c6c9ab]">{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}</p>

              {chartData.length > 1 && (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="t" hide />
                      <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                      <Tooltip contentStyle={{ background: '#181816', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
                      <Line type="monotone" dataKey="bpm" stroke="#00eefc" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                {ZONE_ORDER.map(z => (
                  <span key={z} style={{ color: ZONE_COLOR[z] }}>{ZONE_LABEL[z].split(' ')[0]}: {Math.floor(timeInZone[z] / 60)}:{String(timeInZone[z] % 60).padStart(2, '0')}</span>
                ))}
              </div>

              <button onClick={handleStop} disabled={state === 'saving'} className="w-full py-2.5 bg-red-500/10 border border-red-500/40 text-red-400 font-sans font-bold text-xs uppercase rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50">
                {state === 'saving' ? 'Guardando...' : 'Terminar sesión'}
              </button>
            </div>
          )}
        </section>
      )}

      {sessions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase text-[#00eefc] tracking-wider">Historial</h3>
          {[...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map(s => (
            <div key={s.id} className="flex items-center gap-3 bg-[#181816] border border-white/7 rounded-xl p-3">
              <span className="material-symbols-outlined text-[#00eefc]">favorite</span>
              <div className="flex-1 min-w-0">
                <p className="font-sans font-semibold text-sm text-white">{s.date} · {Math.round(s.durationSec / 60)} min</p>
                <p className="text-[10px] text-[#c6c9ab] font-mono">Media {s.avgHR ?? '—'} bpm · Máx {s.maxHR ?? '—'} bpm</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <HrTestsPanel profile={profile} cardioProfile={cardioProfile ?? null} />
    </div>
  );
}
