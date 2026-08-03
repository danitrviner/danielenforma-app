import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, CardioZones, CardioSessionType, CardioIntervalBlock } from '../types';
import { getCardioProfile, getCardioSessionsForAthlete, getCardioAssignmentsForAthlete, createCardioSession, getOnboarding, getHrvReadingsForAthlete } from '../dbService';
import { HeartRateMonitor, HeartRateStatus, isBleAvailable } from '../services/bleHeartRate';
import { getZoneForBpm, getZoneAlertDirection, ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from '../utils/cardioZones';
import {
  ZERO_TIME_IN_ZONE, ZoneAccumulator, createZoneAccumulator, flushZoneTime, setActiveZone,
  roundTimeInZone, elapsedSecFromWallClock, shouldDiscardSession, summarizeSamples, pickActiveZona2Assignment,
  pickActiveIntervalAssignment,
} from '../utils/cardioSession';
import {
  caloriesKeytel, caloriesActive, metsFromCalories, fitivPoints, trimpBanister, hrTss,
  effortMinutes, suggestedPerceivedEffort, hrrEligibility, heartRateRecovery, sampleNearElapsed,
} from '../utils/cardioMetrics';
import { calcAge, mifflinBMR } from '../utils/energyCalc';
import { DateRangeFilter, filterSessions, allTags } from '../utils/cardioHistory';
import { hapticZoneAlert } from '../services/cardioHaptics';
import { speak, cancelSpeech } from '../services/cardioVoice';
import { grantXp } from '../utils/xp';
import Skeleton from './Skeleton';
import HrTestsPanel from './HrTestsPanel';
import DeviceChip from './cardio/DeviceChip';
import LiveSession from './cardio/LiveSession';
import EffortPrompt from './cardio/EffortPrompt';
import CooldownPrompt from './cardio/CooldownPrompt';
import TrainingLoadPanel from './cardio/TrainingLoadPanel';
import HrvReadinessCard from './cardio/HrvReadinessCard';
import HrvTestScreen from './cardio/HrvTestScreen';
import CardioSessionDetail from './cardio/CardioSessionDetail';
import ManualSessionModal from './cardio/ManualSessionModal';

const XP_PER_SESSION = 15;
const SAMPLE_INTERVAL_SEC = 4; // submuestreo — nunca FC cruda por segundo (§7.4)
const ZONE_ALERT_COOLDOWN_MS = 20_000;

interface Props {
  profile: UserProfile;
}

interface SessionDraft {
  elapsedSec: number;
  samples: number[];
  timeInZoneSec: Record<keyof CardioZones, number>;
  startedAtIso: string;
  hrr1Min?: number;
  hrr2Min?: number;
}

const COOLDOWN_TARGET_SEC = [60, 120] as const;

// 'ready' = banda conectada y emitiendo, sesión aún sin arrancar — el chip
// con BPM en vivo de FITIV antes de empezar (§4bis.3 del análisis).
// 'cooldown' = entreno ya cerrado, 2 min de vuelta a la calma para el Heart
// Rate Recovery (§5.6) — solo si la sesión cumple sus condiciones y la
// banda sigue conectada.
// 'effort' = pidiendo el Esfuerzo Percibido antes de guardar (§5.4).
type SessionState = 'idle' | 'connecting' | 'ready' | 'live' | 'cooldown' | 'effort' | 'saving';

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
  const { data: assignments = [] } = useQuery({
    queryKey: ['cardioAssignments', profile.email],
    queryFn: () => getCardioAssignmentsForAthlete(profile.email),
  });
  // Peso/edad/sexo/altura de la anamnesis — entrada del motor de cálculo
  // (Keytel, TRIMP, METs, §5 del análisis). Ninguno es obligatorio: sin
  // ellos simplemente no se calculan esos campos, no se inventan valores.
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email),
  });
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;
  const { data: hrvReadings = [] } = useQuery({
    queryKey: ['hrvReadings', profile.email],
    queryFn: () => getHrvReadingsForAthlete(profile.email),
  });

  const [state, setState] = useState<SessionState>('idle');
  const [showHrvTest, setShowHrvTest] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState<DateRangeFilter>('all');
  const [historyType, setHistoryType] = useState<CardioSessionType | ''>('');
  const [historyTag, setHistoryTag] = useState('');
  const [sessionType, setSessionType] = useState<CardioSessionType>('libre');
  const [bpm, setBpm] = useState<number | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<HeartRateStatus>('connected');
  const [displayElapsedSec, setDisplayElapsedSec] = useState(0);
  const [displaySamples, setDisplaySamples] = useState<number[]>([]);
  const [displayTimeInZone, setDisplayTimeInZone] = useState<Record<keyof CardioZones, number>>(ZERO_TIME_IN_ZONE);
  const [displayBelowZoneSec, setDisplayBelowZoneSec] = useState(0);
  const [displayBlockIndex, setDisplayBlockIndex] = useState(0);
  const [displayBlockRemainingSec, setDisplayBlockRemainingSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const monitorRef = useRef<HeartRateMonitor | null>(null);
  const cardioProfileRef = useRef(cardioProfile);
  cardioProfileRef.current = cardioProfile;

  // Prescripción activa de Zona 2 / Intervalos (si la hay) — preselecciona
  // el tipo de sesión una sola vez, sin pisar si el atleta ya ha elegido a
  // mano. 'intervalos' solo es seleccionable si el coach definió bloques
  // (§F6) — no hay editor de bloques propio del atleta, es cosa del coach.
  const zona2Assignment = pickActiveZona2Assignment(assignments);
  const intervalAssignment = pickActiveIntervalAssignment(assignments);
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || state !== 'idle') return;
    if (zona2Assignment) { setSessionType('zona2'); autoSelectedRef.current = true; }
    else if (intervalAssignment) { setSessionType('intervalos'); autoSelectedRef.current = true; }
  }, [zona2Assignment, intervalAssignment, state]);

  const targetZone = sessionType === 'zona2' ? (zona2Assignment?.targetZone ?? 'z2') : undefined;
  const targetDurationSec = sessionType === 'zona2' ? zona2Assignment?.targetDurationSec : undefined;

  // Estado "vivo" de la sesión, en refs: es la fuente de verdad que lee
  // cualquier callback (parada manual, desconexión de la banda, cierre por
  // reconexión agotada), nunca el `state` de React capturado en un closure
  // viejo — así una desconexión a mitad de sesión ya no descarta lo grabado.
  const startedAtRef = useRef<number | null>(null); // Date.now() — reloj de pared, no ticks
  const samplesRef = useRef<number[]>([]);
  const zoneAccRef = useRef<ZoneAccumulator>(createZoneAccumulator(Date.now()));
  const bpmBufferRef = useRef<number[]>([]);
  const sessionTargetZoneRef = useRef<keyof CardioZones | null>(null);
  const lastAlertAtRef = useRef(0);
  const draftRef = useRef<SessionDraft | null>(null);

  // Intervalos (§F6): secuencia de bloques del coach + qué bloque toca ahora.
  // `blockStartedAtSecRef` es el `elapsedSec` en el que arrancó el bloque
  // actual — el avance también sale del reloj de pared, no de contar ticks.
  const intervalBlocksRef = useRef<CardioIntervalBlock[] | null>(null);
  const currentBlockIndexRef = useRef(0);
  const blockStartedAtSecRef = useRef(0);

  // Vuelta a la calma (§5.6): mientras está activa, las muestras van aquí en
  // vez de al acumulador de zonas — el entreno ya terminó, esto es otra cosa.
  const cooldownActiveRef = useRef(false);
  const cooldownSamplesRef = useRef<{ bpm: number; atMs: number }[]>([]);
  const cooldownStartMsRef = useRef<number | null>(null);
  const peakHRRef = useRef<number | null>(null);

  const sampleTickRef = useRef<number | null>(null);
  const clockTickRef = useRef<number | null>(null);

  useEffect(() => () => { stopTicking(); cancelSpeech(); monitorRef.current?.disconnect(); }, []);

  function stopTicking() {
    if (sampleTickRef.current !== null) { window.clearInterval(sampleTickRef.current); sampleTickRef.current = null; }
    if (clockTickRef.current !== null) { window.clearInterval(clockTickRef.current); clockTickRef.current = null; }
  }

  async function teardownMonitor() {
    stopTicking();
    await monitorRef.current?.stopListening();
    await monitorRef.current?.disconnect();
    monitorRef.current = null;
  }

  /** Paso 1: conectar la banda y ver el BPM en vivo, sin arrancar aún la sesión. */
  const handleConnect = async () => {
    setError(null);
    if (!isBleAvailable()) {
      setError('Conectar la banda BLE requiere la app nativa (iOS/Android). En la web puedes seguir viendo tus zonas y tu historial.');
      return;
    }
    setState('connecting');
    try {
      const monitor = new HeartRateMonitor();
      await monitor.requestAndConnect((status) => {
        setDeviceStatus(status);
        if (status === 'disconnected') {
          if (startedAtRef.current !== null) {
            // Se agotaron los reintentos a mitad de sesión: se cierra, pero
            // SIEMPRE guardando lo grabado hasta ahora.
            setError('La banda se desconectó y no se pudo reconectar. Sesión guardada con lo registrado.');
            void finishSession('save');
          } else if (cooldownActiveRef.current) {
            // Se fue durante la vuelta a la calma: se cierra el cooldown ya,
            // con lo que se haya podido grabar hasta ahora.
            setError('La banda se desconectó durante la vuelta a la calma.');
            void finishCooldown();
          } else {
            // Aún en 'ready', sin sesión empezada: no hay nada que guardar.
            setError('La banda se desconectó.');
            void teardownMonitor();
            setState('idle');
            setBpm(null);
          }
        }
      });
      await monitor.startListening((sample) => {
        setBpm(sample.bpm);

        if (cooldownActiveRef.current) {
          cooldownSamplesRef.current.push({ bpm: sample.bpm, atMs: sample.at });
          return;
        }

        const profile = cardioProfileRef.current;
        const zone = profile ? getZoneForBpm(sample.bpm, profile.zones) : null;

        // Solo se acumula/alerta si la sesión ya está grabando (§ready vs
        // live): conectar antes de empezar no debe contaminar la sesión.
        if (startedAtRef.current !== null) {
          bpmBufferRef.current.push(sample.bpm);
          zoneAccRef.current = setActiveZone(flushZoneTime(zoneAccRef.current, sample.at), zone);

          const alertZone = sessionTargetZoneRef.current;
          if (alertZone && profile) {
            const direction = getZoneAlertDirection(sample.bpm, profile.zones[alertZone]);
            if (direction !== 'in' && sample.at - lastAlertAtRef.current > ZONE_ALERT_COOLDOWN_MS) {
              lastAlertAtRef.current = sample.at;
              void hapticZoneAlert();
              speak(direction === 'high' ? 'Por encima de tu zona. Baja el ritmo.' : 'Por debajo de tu zona. Sube un poco.');
            }
          }
        }
      });
      monitorRef.current = monitor;
      setDeviceStatus('connected');
      setState('ready');
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo conectar con la banda.');
      setState('idle');
    }
  };

  const handleCancelReady = async () => {
    await teardownMonitor();
    setState('idle');
    setBpm(null);
  };

  /** Paso 2: la banda ya está conectada — arranca el cronómetro y el registro. */
  const handleStartSession = () => {
    const now = Date.now();
    startedAtRef.current = now;
    samplesRef.current = [];
    zoneAccRef.current = createZoneAccumulator(now);
    bpmBufferRef.current = [];
    lastAlertAtRef.current = 0;
    setDisplayElapsedSec(0);
    setDisplaySamples([]);
    setDisplayTimeInZone({ ...ZERO_TIME_IN_ZONE });
    setDisplayBelowZoneSec(0);

    if (sessionType === 'intervalos' && intervalAssignment?.intervals?.length) {
      intervalBlocksRef.current = intervalAssignment.intervals;
      currentBlockIndexRef.current = 0;
      blockStartedAtSecRef.current = 0;
      sessionTargetZoneRef.current = intervalAssignment.intervals[0].targetZone;
      setDisplayBlockIndex(0);
      setDisplayBlockRemainingSec(intervalAssignment.intervals[0].durationSec);
      speak(`Empieza: ${intervalAssignment.intervals[0].label}`);
    } else {
      intervalBlocksRef.current = null;
      sessionTargetZoneRef.current = targetZone ?? null;
    }
    setState('live');

    // Reloj de pared: el tiempo mostrado sale de Date.now() - startedAt, no
    // de un contador de ticks, así no se atrasa si el SO estrangula el
    // intervalo con la pantalla bloqueada (§F1 del plan).
    clockTickRef.current = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      const elapsedSec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setDisplayElapsedSec(elapsedSec);

      const blocks = intervalBlocksRef.current;
      if (blocks) {
        const block = blocks[currentBlockIndexRef.current];
        const blockElapsed = elapsedSec - blockStartedAtSecRef.current;
        if (blockElapsed >= block.durationSec) {
          const nextIndex = currentBlockIndexRef.current + 1;
          if (nextIndex < blocks.length) {
            currentBlockIndexRef.current = nextIndex;
            blockStartedAtSecRef.current = elapsedSec;
            sessionTargetZoneRef.current = blocks[nextIndex].targetZone;
            setDisplayBlockIndex(nextIndex);
            setDisplayBlockRemainingSec(blocks[nextIndex].durationSec);
            void hapticZoneAlert();
            speak(blocks[nextIndex].label);
          } else {
            // Último bloque completado: la secuencia ha terminado sola.
            setDisplayBlockRemainingSec(0);
            void finishSession('save');
          }
        } else {
          setDisplayBlockRemainingSec(block.durationSec - blockElapsed);
        }
      }
    }, 1000);

    // Submuestreo: cada SAMPLE_INTERVAL_SEC promediamos el buffer de BPM
    // recibido de la banda y lo empujamos a `samples` — así 60 min de
    // sesión son ~900 números en vez de ~3600 lecturas crudas.
    sampleTickRef.current = window.setInterval(() => {
      if (bpmBufferRef.current.length > 0) {
        const avg = Math.round(bpmBufferRef.current.reduce((a, b) => a + b, 0) / bpmBufferRef.current.length);
        bpmBufferRef.current = [];
        samplesRef.current = [...samplesRef.current, avg];
        setDisplaySamples(samplesRef.current);
      }
      setDisplayTimeInZone(roundTimeInZone(zoneAccRef.current.timeInZoneSec));
      setDisplayBelowZoneSec(Math.round(zoneAccRef.current.belowZoneSec));
    }, SAMPLE_INTERVAL_SEC * 1000);
  };

  /**
   * Único punto de cierre de sesión, tanto manual (deslizar) como automático
   * (reconexión agotada). Lee siempre de los refs — nunca de `state` — así
   * llega con datos frescos venga de donde venga la llamada. No persiste
   * todavía: al guardar, deja el borrador listo y decide si toca vuelta a la
   * calma (§5.6) o directamente pedir el Esfuerzo Percibido (§5.4).
   */
  const finishSession = async (mode: 'save' | 'discard') => {
    if (startedAtRef.current === null) return; // ya se cerró (evita doble guardado)
    cancelSpeech();

    const now = Date.now();
    zoneAccRef.current = flushZoneTime(zoneAccRef.current, now);
    const elapsedSec = elapsedSecFromWallClock(startedAtRef.current, now);
    const samples = samplesRef.current;
    const timeInZoneSec = roundTimeInZone(zoneAccRef.current.timeInZoneSec);
    const startedAtIso = new Date(startedAtRef.current).toISOString();
    startedAtRef.current = null; // marca "cerrado" antes de cualquier await
    sessionTargetZoneRef.current = null;
    intervalBlocksRef.current = null;

    if (shouldDiscardSession(elapsedSec, mode)) {
      await teardownMonitor();
      setState('idle');
      setBpm(null);
      return;
    }

    draftRef.current = { elapsedSec, samples, timeInZoneSec, startedAtIso };

    const { avgHR, maxHR } = summarizeSamples(samples);
    const eligible = hrrEligibility({ durationSec: elapsedSec, maxHR, avgHR, athleteMaxHR: cardioProfileRef.current?.maxHR }).eligible;
    // isConnected(), no solo la ref: si venimos de un "se agotaron los
    // reintentos" (línea 159), la ref sigue viva pero la banda ya no lo está
    // — no tiene sentido pedir 2 min de vuelta a la calma que nunca medirán nada.
    if (eligible && isBleAvailable() && monitorRef.current?.isConnected()) {
      // La banda sigue conectada: se queda 2 min más midiendo la
      // recuperación en vez de desconectar ya.
      peakHRRef.current = bpm ?? maxHR ?? null;
      cooldownSamplesRef.current = [];
      cooldownStartMsRef.current = Date.now();
      cooldownActiveRef.current = true;
      setState('cooldown');
    } else {
      await teardownMonitor();
      setState('effort');
    }
  };

  /** Cierra la vuelta a la calma (por countdown, "saltar" o desconexión) y calcula el HRR con lo grabado. */
  const finishCooldown = async () => {
    cooldownActiveRef.current = false;
    await teardownMonitor();

    const draft = draftRef.current;
    const startMs = cooldownStartMsRef.current;
    const peak = peakHRRef.current;
    if (draft && startMs !== null && peak !== null) {
      const hrAt1 = sampleNearElapsed(cooldownSamplesRef.current, startMs, COOLDOWN_TARGET_SEC[0]);
      const hrAt2 = sampleNearElapsed(cooldownSamplesRef.current, startMs, COOLDOWN_TARGET_SEC[1]);
      const { hrr1Min, hrr2Min } = heartRateRecovery(peak, hrAt1, hrAt2);
      draftRef.current = { ...draft, hrr1Min, hrr2Min };
    }
    setState('effort');
  };

  /** Cierra el paso de Esfuerzo Percibido: calcula el resto del motor y persiste. */
  const confirmEffort = async (pe: number) => {
    const draft = draftRef.current;
    if (!draft) { setState('idle'); setBpm(null); return; }
    setState('saving');

    const { avgHR, maxHR } = summarizeSamples(draft.samples);
    const durationMin = draft.elapsedSec / 60;
    const ob = onboardingRef.current;
    const cp = cardioProfileRef.current;

    let caloriesKcal: number | undefined;
    let caloriesActiveKcal: number | undefined;
    let mets: number | undefined;
    let points: number | undefined;
    let trimp: number | undefined;
    let hrTssVal: number | undefined;

    if (avgHR && ob?.weightKg && ob?.sex && ob?.birthDate) {
      const ageYears = calcAge(ob.birthDate);
      caloriesKcal = caloriesKeytel({ avgHR, weightKg: ob.weightKg, ageYears, sex: ob.sex, durationMin });
      if (ob.heightCm) {
        const bmrPerDay = mifflinBMR(ob.sex, ob.weightKg, ob.heightCm, ageYears);
        caloriesActiveKcal = caloriesActive(caloriesKcal, bmrPerDay, durationMin);
      }
      mets = metsFromCalories(caloriesActiveKcal ?? caloriesKcal, durationMin, ob.weightKg);
      points = fitivPoints(mets, durationMin);
    }
    if (avgHR && ob?.sex && cp?.restingHR && cp?.maxHR) {
      trimp = trimpBanister({ avgHR, restingHR: cp.restingHR, maxHR: cp.maxHR, durationMin, sex: ob.sex });
    }
    if (avgHR && cp?.lthr) hrTssVal = hrTss(avgHR, cp.lthr, draft.elapsedSec);

    const session = await createCardioSession({
      athleteId: profile.email,
      assignmentId: sessionType === 'zona2' ? zona2Assignment?.id : undefined,
      type: sessionType,
      date: new Date().toISOString().slice(0, 10),
      startedAt: draft.startedAtIso,
      durationSec: draft.elapsedSec,
      avgHR, maxHR,
      timeInZoneSec: draft.timeInZoneSec,
      samples: draft.samples,
      sampleIntervalSec: SAMPLE_INTERVAL_SEC,
      caloriesKcal, caloriesActiveKcal, mets, fitivPoints: points, trimp, hrTss: hrTssVal,
      perceivedEffort: pe, effortMinutes: effortMinutes(pe, durationMin),
      hrr1Min: draft.hrr1Min, hrr2Min: draft.hrr2Min,
    });
    queryClient.setQueryData(['cardioSessions', profile.email], (prev: any[] = []) => [...prev, session]);
    grantXp(profile, XP_PER_SESSION).catch(err => console.warn('grantXp (cardio session) failed:', err));
    draftRef.current = null;
    setState('idle');
    setBpm(null);
  };

  if (loadingProfile || loadingSessions) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full rounded-surface" /></div>;
  }

  const currentZone = bpm !== null && cardioProfile ? getZoneForBpm(bpm, cardioProfile.zones) : null;
  const chartData = displaySamples.map((v, i) => ({ t: i * SAMPLE_INTERVAL_SEC, bpm: v }));
  const { avgHR: liveAvgHR, maxHR: liveMaxHR } = summarizeSamples(displaySamples);

  const selectedSession = selectedSessionId ? sessions.find(s => s.id === selectedSessionId) : undefined;
  if (selectedSession) {
    return (
      <CardioSessionDetail
        session={selectedSession}
        allSessions={sessions}
        zones={cardioProfile?.zones}
        onClose={() => setSelectedSessionId(null)}
        onSaved={(updated) => {
          queryClient.setQueryData(['cardioSessions', profile.email], (prev: any[] = []) => prev.map(s => s.id === updated.id ? updated : s));
          setSelectedSessionId(null);
        }}
      />
    );
  }

  if (showHrvTest) {
    return (
      <HrvTestScreen
        profile={profile}
        pastReadings={hrvReadings}
        onClose={() => setShowHrvTest(false)}
        onSaved={(reading) => {
          queryClient.setQueryData(['hrvReadings', profile.email], (prev: any[] = []) => [...prev, reading]);
          setShowHrvTest(false);
        }}
      />
    );
  }

  if (state === 'cooldown') {
    return <CooldownPrompt bpm={bpm} onDone={() => void finishCooldown()} />;
  }

  if (state === 'effort' || state === 'saving') {
    return (
      <EffortPrompt
        suggested={suggestedPerceivedEffort(displayTimeInZone)}
        onConfirm={confirmEffort}
        saving={state === 'saving'}
      />
    );
  }

  if (state === 'live') {
    return (
      <LiveSession
        saving={false}
        deviceStatus={deviceStatus}
        bpm={bpm}
        currentZone={currentZone}
        zones={cardioProfile!.zones}
        maxHR={cardioProfile!.maxHR}
        elapsedSec={displayElapsedSec}
        avgHR={liveAvgHR}
        maxHRSoFar={liveMaxHR}
        chartData={chartData}
        timeInZone={displayTimeInZone}
        belowZoneSec={displayBelowZoneSec}
        targetZone={intervalBlocksRef.current ? undefined : (sessionTargetZoneRef.current ?? undefined)}
        targetDurationSec={sessionType === 'zona2' ? targetDurationSec : undefined}
        intervalBlocks={intervalBlocksRef.current ?? undefined}
        currentBlockIndex={intervalBlocksRef.current ? displayBlockIndex : undefined}
        blockRemainingSec={displayBlockRemainingSec}
        onSave={() => finishSession('save')}
        onDiscard={() => finishSession('discard')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Cardio</h1>
        <p className="text-label text-ink-2 font-sans mt-1">Zonas de FC y dashboard en vivo</p>
      </header>

      {!cardioProfile && (
        <div className="bg-surface border border-hairline rounded-surface p-4 text-center">
          <p className="text-label text-ink-2 font-sans">Tu entrenador todavía no ha configurado tus zonas de FC.</p>
        </div>
      )}

      {cardioProfile && (
        <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {ZONE_ORDER.map(z => (
              <div key={z} className="flex-1 min-w-[100px] rounded-surface p-3 text-center" style={{ backgroundColor: `${ZONE_COLOR[z]}1a`, border: `1px solid ${ZONE_COLOR[z]}40` }}>
                <p className="text-caption font-sans uppercase" style={{ color: ZONE_COLOR[z] }}>{ZONE_LABEL[z]}</p>
                <p className="text-label font-bold text-white mt-0.5">{cardioProfile.zones[z].min}-{cardioProfile.zones[z].max}</p>
              </div>
            ))}
          </div>

          {state === 'idle' && (
            <button onClick={handleConnect} className="w-full py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all">
              Conectar banda
            </button>
          )}

          {state === 'connecting' && <p className="text-label text-ink-2 font-sans text-center py-4">Conectando con la banda...</p>}

          {error && <p className="text-label text-red-400 font-sans">{error}</p>}

          {state === 'ready' && (
            <div className="space-y-3">
              <DeviceChip status="ready" bpm={bpm} />
              {zona2Assignment && sessionType === 'zona2' && (
                <p className="text-caption font-mono text-ink-2 text-center">
                  Prescrito por tu entrenador: Zona 2{zona2Assignment.targetDurationSec ? ` · ${Math.round(zona2Assignment.targetDurationSec / 60)} min` : ''}
                </p>
              )}
              {intervalAssignment && sessionType === 'intervalos' && (
                <p className="text-caption font-mono text-ink-2 text-center">
                  Prescrito por tu entrenador: {intervalAssignment.intervals?.length} bloques de intervalos
                </p>
              )}
              <div className="flex items-center gap-2">
                <select value={sessionType} onChange={e => setSessionType(e.target.value as CardioSessionType)}
                  className="bg-bg border border-hairline rounded-control p-3 text-label text-white focus:outline-none focus:border-accent">
                  <option value="libre">Libre</option>
                  <option value="zona2">Sesión Zona 2</option>
                  <option value="intervalos" disabled={!intervalAssignment}>
                    {intervalAssignment ? 'Intervalos' : 'Intervalos (sin prescripción)'}
                  </option>
                </select>
                <button onClick={handleStartSession} className="flex-1 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all">
                  Empezar entrenamiento
                </button>
              </div>
              <button onClick={handleCancelReady} className="w-full py-2 text-caption font-sans uppercase text-ink-2 hover:text-white transition-colors">
                Desconectar
              </button>
            </div>
          )}
        </section>
      )}

      {state === 'idle' && <HrvReadinessCard readings={hrvReadings} onMeasure={() => setShowHrvTest(true)} />}

      <TrainingLoadPanel sessions={sessions} />

      {sessions.length > 0 && (() => {
        const tags = allTags(sessions);
        const filtered = filterSessions(sessions, {
          range: historyRange,
          type: historyType || undefined,
          tag: historyTag || undefined,
        });
        return (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-caption font-mono uppercase text-data tracking-wider">Historial</h3>
              <button onClick={() => setShowManualAdd(true)} className="text-caption font-mono uppercase text-ink-2 hover:text-white transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-body-s">add</span> Añadir a mano
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['all', 'week', 'month', 'year'] as const).map(r => (
                <button key={r} onClick={() => setHistoryRange(r)}
                  className={`px-3 py-1 rounded-full text-caption font-mono uppercase border transition-all ${historyRange === r ? 'bg-accent text-black border-accent' : 'text-ink-2 border-hairline hover:text-white'}`}>
                  {{ all: 'Todo', week: 'Semana', month: 'Mes', year: 'Año' }[r]}
                </button>
              ))}
              <select value={historyType} onChange={e => setHistoryType(e.target.value as CardioSessionType | '')}
                className="bg-bg border border-hairline rounded-full px-3 py-1 text-caption font-mono uppercase text-ink-2 focus:outline-none">
                <option value="">Cualquier tipo</option>
                <option value="libre">Libre</option>
                <option value="zona2">Zona 2</option>
                <option value="intervalos">Intervalos</option>
              </select>
              {tags.length > 0 && (
                <select value={historyTag} onChange={e => setHistoryTag(e.target.value)}
                  className="bg-bg border border-hairline rounded-full px-3 py-1 text-caption font-mono uppercase text-ink-2 focus:outline-none">
                  <option value="">Cualquier etiqueta</option>
                  {tags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>

            {filtered.length === 0 && <p className="text-label text-ink-2 font-sans py-3 text-center">Ningún entreno con estos filtros.</p>}

            {[...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map(s => (
              <button key={s.id} onClick={() => setSelectedSessionId(s.id)}
                className="w-full flex items-center gap-3 bg-surface border border-hairline rounded-control p-3 text-left hover:border-strong transition-colors">
                <span className="material-symbols-outlined text-data">favorite</span>
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-body-s text-white">
                    {s.title || `${s.date} · ${Math.round(s.durationSec / 60)} min`}
                    {s.manual && <span className="ml-1.5 text-caption font-mono text-ink-2 uppercase">manual</span>}
                  </p>
                  <p className="text-caption text-ink-2 font-mono">Media {s.avgHR ?? '—'} bpm · Máx {s.maxHR ?? '—'} bpm</p>
                  {(s.caloriesActiveKcal || s.caloriesKcal || s.fitivPoints || s.trimp) && (
                    <p className="text-caption text-accent font-mono mt-0.5">
                      {(s.caloriesActiveKcal ?? s.caloriesKcal) !== undefined && `${Math.round(s.caloriesActiveKcal ?? s.caloriesKcal!)} kcal · `}
                      {s.fitivPoints !== undefined && `${s.fitivPoints} pts · `}
                      {s.trimp !== undefined && `TRIMP ${Math.round(s.trimp)}`}
                      {s.perceivedEffort !== undefined && ` · PE ${s.perceivedEffort}/10`}
                      {s.hrr1Min !== undefined && ` · HRR 1' ${s.hrr1Min}`}
                    </p>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <p className="text-caption text-ink-2 font-mono mt-0.5">{s.tags.join(' · ')}</p>
                  )}
                </div>
                <span className="material-symbols-outlined text-ink-2 text-title-m">chevron_right</span>
              </button>
            ))}
          </section>
        );
      })()}

      {showManualAdd && (
        <ManualSessionModal
          athleteId={profile.email}
          onClose={() => setShowManualAdd(false)}
          onSaved={(session) => {
            queryClient.setQueryData(['cardioSessions', profile.email], (prev: any[] = []) => [...prev, session]);
            setShowManualAdd(false);
          }}
        />
      )}

      <HrTestsPanel profile={profile} cardioProfile={cardioProfile ?? null} />
    </div>
  );
}
