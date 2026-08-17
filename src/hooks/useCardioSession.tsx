import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, CardioZones, CardioSessionType, CardioIntervalBlock, CardioSession, CardioWeeklyGoal } from '../types';
import { getCardioProfile, getCardioSessionsForAthlete, getCardioAssignmentsForAthlete, createCardioSession, getOnboarding, getCardioWeeklyGoal, saveCardioWeeklyGoal } from '../dbService';
import { HeartRateMonitor, HeartRateStatus, isBleAvailable } from '../services/bleHeartRate';
import { getZoneForBpm, getZoneAlertDirection } from '../utils/cardioZones';
import {
  ZERO_TIME_IN_ZONE, ZoneAccumulator, createZoneAccumulator, flushZoneTime, setActiveZone,
  roundTimeInZone, elapsedSecFromWallClock, shouldDiscardSession, summarizeSamples, pickActiveZona2Assignment,
  pickActiveIntervalAssignment, weeklyCardioMinutesDone, defaultWeeklyCardioGoal, isoWeekKey,
} from '../utils/cardioSession';
import {
  caloriesKeytel, caloriesActive, metsFromCalories, fitivPoints, trimpBanister, hrTss,
  effortMinutes, hrrEligibility, heartRateRecovery, sampleNearElapsed,
} from '../utils/cardioMetrics';
import { calcAge, mifflinBMR } from '../utils/energyCalc';
import { haptics } from '../services/haptics';
import { speak, speakUrgent, cancelSpeech } from '../services/cardioVoice';
import { grantXp } from '../utils/xp';

/* ═══════════════════════════════════════════════════════════════════════════
   El motor de la sesión de cardio en vivo (F2 del plan de réplica FITIV).

   Hasta aquí este estado (ticks, BLE, acumulador de zonas, motor de
   intervalos) vivía dentro de `CardioScreen`. Al navegar fuera de /cardio el
   componente se desmontaba y el cleanup desconectaba la banda — con lo que
   una sesión en vivo no sobrevivía a salir de la pantalla, ni de coña al
   móvil bloqueado. `CardioSessionProvider` se monta una vez en `App.tsx`,
   por encima del router, y sigue vivo mientras dura la sesión de la app —
   así el mini-reproductor persistente (F6) y la futura actualización nativa
   por tick (F5) son posibles.

   Deliberadamente NO es un singleton fuera de React (como proponía el plan
   inicial): un Provider montado por encima de <Routes> logra exactamente lo
   mismo — el estado sobrevive a cambiar de pantalla — reutilizando
   Context+hooks, que es el patrón que ya usa el resto de la app (ver
   `useToast.tsx`), en vez de introducir `useSyncExternalStore` y una forma
   nueva solo para este módulo. Mismo resultado, con muchísimo menos riesgo
   sobre un motor que ya funcionaba bien.

   `CardioScreen.tsx` sigue siendo la única pantalla que renderiza esto:
   consume el motor vía `useCardioSession()`, pero ya no lo posee. Sus
   propias queries (hrvReadings, todaysSteps, nutritionConfig, y una segunda
   copia de cardioProfile/sessions/assignments para el render) se quedan
   donde estaban — React Query comparte caché por queryKey, así que no hay
   coste de red por duplicarlas aquí y allí.
   ═══════════════════════════════════════════════════════════════════════════ */

const XP_PER_SESSION = 15;
export const SAMPLE_INTERVAL_SEC = 4; // submuestreo — nunca FC cruda por segundo (§7.4)
const ZONE_ALERT_COOLDOWN_MS = 20_000;
const COOLDOWN_TARGET_SEC = [60, 120] as const;

interface SessionDraft {
  elapsedSec: number;
  samples: number[];
  timeInZoneSec: Record<keyof CardioZones, number>;
  startedAtIso: string;
  hrr1Min?: number;
  hrr2Min?: number;
}

// 'ready' = banda conectada y emitiendo, sesión aún sin arrancar — el chip
// con BPM en vivo de FITIV antes de empezar (§4bis.3 del análisis).
// 'cooldown' = entreno ya cerrado, 2 min de vuelta a la calma para el Heart
// Rate Recovery (§5.6) — solo si la sesión cumple sus condiciones y la
// banda sigue conectada.
// 'effort' = pidiendo el Esfuerzo Percibido antes de guardar (§5.4).
export type CardioSessionState = 'idle' | 'connecting' | 'ready' | 'live' | 'cooldown' | 'effort' | 'saving' | 'summary';

interface CardioSessionContextValue {
  state: CardioSessionState;
  sessionType: CardioSessionType;
  setSessionType: (t: CardioSessionType) => void;
  bpm: number | null;
  deviceStatus: HeartRateStatus;
  error: string | null;
  paused: boolean;
  displayElapsedSec: number;
  displaySamples: number[];
  displayTimeInZone: Record<keyof CardioZones, number>;
  displayBelowZoneSec: number;
  displayBlockIndex: number;
  displayBlockRemainingSec: number;
  displayLive: { caloriesKcal?: number; caloriesActiveKcal?: number; mets?: number; points?: number };
  justSavedSession: CardioSession | null;
  weekJustClosed: boolean;
  /** Bloques de intervalos de la sesión en curso, o null fuera de modo intervalos. Ref: se lee en cada render, no dispara uno propio. */
  intervalBlocksRef: React.MutableRefObject<CardioIntervalBlock[] | null>;
  /** Zona objetivo activa en este instante (cambia por bloque en modo intervalos). */
  sessionTargetZoneRef: React.MutableRefObject<keyof CardioZones | null>;

  connect: () => Promise<void>;
  cancelReady: () => Promise<void>;
  start: () => void;
  pause: () => void;
  resume: () => void;
  save: () => Promise<void>;
  discard: () => Promise<void>;
  finishCooldown: () => Promise<void>;
  confirmEffort: (pe: number) => Promise<void>;
  closeSummary: () => void;
}

const CardioSessionContext = createContext<CardioSessionContextValue | null>(null);

interface ProviderProps {
  profile: UserProfile | null;
  /** Solo el atleta tiene módulo de cardio propio — el coach no. */
  enabled: boolean;
  children: React.ReactNode;
}

export function CardioSessionProvider({ profile, enabled, children }: ProviderProps) {
  if (!enabled || !profile) return <>{children}</>;
  return <CardioSessionProviderInner profile={profile}>{children}</CardioSessionProviderInner>;
}

function CardioSessionProviderInner({ profile, children }: { profile: UserProfile; children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: cardioProfile } = useQuery({
    queryKey: ['cardioProfile', profile.email],
    queryFn: () => getCardioProfile(profile.email),
  });
  const { data: sessions = [] } = useQuery({
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentIsoWeek = isoWeekKey(todayIso);
  const { data: weeklyGoal } = useQuery({
    queryKey: ['cardioWeeklyGoal', profile.email, currentIsoWeek],
    queryFn: () => getCardioWeeklyGoal(profile.email, currentIsoWeek),
  });

  const [state, setState] = useState<CardioSessionState>('idle');
  const [justSavedSession, setJustSavedSession] = useState<CardioSession | null>(null);
  const [weekJustClosed, setWeekJustClosed] = useState(false);
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

  // Capa de cálculo en vivo (F4 del plan de réplica FITIV — fila de 3
  // métricas y página 2 del carrusel: FC PROM · METS · FC MAX y CAL ACTIVA ·
  // CAL TOTAL · PUNTOS). El motor de F4 del análisis (Keytel, METs, Points)
  // hasta ahora solo corría una vez al cerrar la sesión, en `confirmEffort`;
  // aquí se repite cada submuestreo con lo grabado hasta el momento. Sin
  // peso/edad/sexo en la anamnesis, simplemente no hay cifra — nunca se
  // inventa un valor.
  const [displayLive, setDisplayLive] = useState<{ caloriesKcal?: number; caloriesActiveKcal?: number; mets?: number; points?: number }>({});

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

  // Prescripción activa de la sesión en curso, fijada al arrancar (§F1, bug
  // 3): antes solo se guardaba en modo 'zona2' y en 'intervalos' se perdía,
  // así que esas sesiones no se podían enlazar con su prescripción.
  const activeAssignmentIdRef = useRef<string | undefined>(undefined);

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

  // Pausa (F4 del plan de réplica FITIV: el botón ámbar de la barra
  // inferior). `pausedRef` es la fuente de verdad para los callbacks (nunca
  // el estado de React, que llegaría con retraso a un closure); `paused` es
  // solo para pintar el botón. Mientras está pausada: se sigue viendo el BPM
  // en vivo (la banda sigue midiendo), pero no se acumula tiempo de sesión,
  // ni tiempo en zona, ni avance de bloque de intervalos, ni muestras.
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const pausedAtMsRef = useRef<number | null>(null);
  const pausedTotalMsRef = useRef(0);

  /** Milisegundos pausados hasta `nowMs`, incluida la pausa en curso si la hay. */
  function totalPausedMs(nowMs: number): number {
    const current = pausedRef.current && pausedAtMsRef.current !== null ? nowMs - pausedAtMsRef.current : 0;
    return pausedTotalMsRef.current + current;
  }

  // Este cleanup ya NO se dispara al navegar fuera de /cardio (el Provider
  // vive por encima del router) — solo al desmontar la app entera (logout).
  // Es justo el cambio que hace F2: antes esto mataba la sesión al salir de
  // la pantalla.
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
  const connect = async () => {
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

        const profileForZones = cardioProfileRef.current;
        const zone = profileForZones ? getZoneForBpm(sample.bpm, profileForZones.zones) : null;

        // Solo se acumula/alerta si la sesión ya está grabando (§ready vs
        // live) y no está en pausa: conectar antes de empezar, o una pausa a
        // mitad de sesión, no deben contaminar el tiempo en zona ni las
        // muestras — el BPM se sigue viendo (arriba, `setBpm`), pero no cuenta.
        if (startedAtRef.current !== null && !pausedRef.current) {
          bpmBufferRef.current.push(sample.bpm);
          zoneAccRef.current = setActiveZone(flushZoneTime(zoneAccRef.current, sample.at), zone);

          const alertZone = sessionTargetZoneRef.current;
          if (alertZone && profileForZones) {
            const direction = getZoneAlertDirection(sample.bpm, profileForZones.zones[alertZone]);
            if (direction !== 'in' && sample.at - lastAlertAtRef.current > ZONE_ALERT_COOLDOWN_MS) {
              lastAlertAtRef.current = sample.at;
              void haptics.warning();
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

  const cancelReady = async () => {
    await teardownMonitor();
    setState('idle');
    setBpm(null);
  };

  /** Paso 2: la banda ya está conectada — arranca el cronómetro y el registro. */
  const start = () => {
    const now = Date.now();
    startedAtRef.current = now;
    samplesRef.current = [];
    zoneAccRef.current = createZoneAccumulator(now);
    bpmBufferRef.current = [];
    lastAlertAtRef.current = 0;
    pausedRef.current = false;
    pausedAtMsRef.current = null;
    pausedTotalMsRef.current = 0;
    setPaused(false);
    setDisplayElapsedSec(0);
    setDisplaySamples([]);
    setDisplayTimeInZone({ ...ZERO_TIME_IN_ZONE });
    setDisplayBelowZoneSec(0);
    setDisplayLive({});

    if (sessionType === 'intervalos' && intervalAssignment?.intervals?.length) {
      intervalBlocksRef.current = intervalAssignment.intervals;
      currentBlockIndexRef.current = 0;
      blockStartedAtSecRef.current = 0;
      sessionTargetZoneRef.current = intervalAssignment.intervals[0].targetZone;
      activeAssignmentIdRef.current = intervalAssignment.id;
      setDisplayBlockIndex(0);
      setDisplayBlockRemainingSec(intervalAssignment.intervals[0].durationSec);
      speakUrgent(`Empieza: ${intervalAssignment.intervals[0].label}`);
    } else {
      intervalBlocksRef.current = null;
      sessionTargetZoneRef.current = targetZone ?? null;
      activeAssignmentIdRef.current = sessionType === 'zona2' ? zona2Assignment?.id : undefined;
    }
    setState('live');

    // Reloj de pared: el tiempo mostrado sale de Date.now() - startedAt, no
    // de un contador de ticks, así no se atrasa si el SO estrangula el
    // intervalo con la pantalla bloqueada (§F1 del plan; sobrevivir de
    // verdad al bolsillo es F5, que además necesita UIBackgroundModes).
    clockTickRef.current = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      const nowMs = Date.now();
      const elapsedSec = Math.floor((nowMs - startedAtRef.current - totalPausedMs(nowMs)) / 1000);
      setDisplayElapsedSec(elapsedSec);

      // En pausa no avanza ni el cronómetro visible (arriba) más allá de lo
      // ya descontado, ni los bloques de intervalos: se congela el entreno,
      // no se salta un bloque mientras el atleta está parado.
      if (pausedRef.current) return;

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
            void haptics.heavy();
            speakUrgent(blocks[nextIndex].label);
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

      // Capa de cálculo en vivo — mismo cálculo que `confirmEffort`, repetido
      // con lo grabado hasta ahora. No corre en pausa: no tiene sentido subir
      // calorías con el cronómetro congelado.
      if (!pausedRef.current) {
        const nowMs = Date.now();
        const durationMin = elapsedSecFromWallClock(startedAtRef.current! + totalPausedMs(nowMs), nowMs) / 60;
        const { avgHR } = summarizeSamples(samplesRef.current);
        const ob = onboardingRef.current;
        if (avgHR && durationMin > 0 && ob?.weightKg && ob?.sex && ob?.birthDate) {
          const ageYears = calcAge(ob.birthDate);
          const caloriesKcal = caloriesKeytel({ avgHR, weightKg: ob.weightKg, ageYears, sex: ob.sex, durationMin });
          let caloriesActiveKcal: number | undefined;
          if (ob.heightCm) {
            const bmrPerDay = mifflinBMR(ob.sex, ob.weightKg, ob.heightCm, ageYears);
            caloriesActiveKcal = caloriesActive(caloriesKcal, bmrPerDay, durationMin);
          }
          const mets = metsFromCalories(caloriesActiveKcal ?? caloriesKcal, durationMin, ob.weightKg);
          setDisplayLive({ caloriesKcal, caloriesActiveKcal, mets, points: fitivPoints(mets, durationMin) });
        }
      }
    }, SAMPLE_INTERVAL_SEC * 1000);
  };

  const pause = () => {
    if (startedAtRef.current === null || pausedRef.current) return;
    pausedRef.current = true;
    pausedAtMsRef.current = Date.now();
    setPaused(true);
    // También se congela la alerta de zona: al reanudar no debe saltar de
    // inmediato con el BPM que tenía justo antes de pararse.
    lastAlertAtRef.current = Date.now();
  };

  const resume = () => {
    if (!pausedRef.current || pausedAtMsRef.current === null) return;
    pausedTotalMsRef.current += Date.now() - pausedAtMsRef.current;
    pausedAtMsRef.current = null;
    pausedRef.current = false;
    setPaused(false);
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
    // Si se guarda/descarta con la sesión en pausa (p.ej. desde el cajón sin
    // reanudar antes), el tiempo pausado hasta este instante también se
    // descuenta — igual que hace el cronómetro en vivo.
    const elapsedSec = elapsedSecFromWallClock(startedAtRef.current + totalPausedMs(now), now);
    const samples = samplesRef.current;
    const timeInZoneSec = roundTimeInZone(zoneAccRef.current.timeInZoneSec);
    const startedAtIso = new Date(startedAtRef.current).toISOString();
    startedAtRef.current = null; // marca "cerrado" antes de cualquier await
    sessionTargetZoneRef.current = null;
    intervalBlocksRef.current = null;
    pausedRef.current = false;
    pausedAtMsRef.current = null;
    setPaused(false);

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
    // reintentos", la ref sigue viva pero la banda ya no lo está — no tiene
    // sentido pedir 2 min de vuelta a la calma que nunca medirán nada.
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
      assignmentId: activeAssignmentIdRef.current,
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

    // Semana de cardio (§F3.9, contrato "objetivosCardio"): los minutos
    // hechos siempre se derivan de las sesiones reales, nunca se guardan.
    // Solo se persiste si la semana ya cerró — para no repetir el haptic de
    // éxito en sesiones posteriores de la misma semana ya completa.
    const goalDefaults = defaultWeeklyCardioGoal(assignments);
    const minutesGoal = weeklyGoal?.minutesGoal ?? goalDefaults.minutesGoal;
    const minutesDoneAfter = weeklyCardioMinutesDone([...sessions, session], todayIso);
    const alreadyClosed = weeklyGoal?.closed ?? false;
    const closesNow = !alreadyClosed && minutesDoneAfter >= minutesGoal;
    if (closesNow) {
      const updatedGoal: CardioWeeklyGoal = {
        id: `${profile.email}_${currentIsoWeek}`,
        athleteId: profile.email,
        isoWeek: currentIsoWeek,
        minutesGoal,
        sessionsGoal: weeklyGoal?.sessionsGoal ?? goalDefaults.sessionsGoal,
        closed: true,
        closedAt: new Date().toISOString(),
      };
      queryClient.setQueryData(['cardioWeeklyGoal', profile.email, currentIsoWeek], updatedGoal);
      saveCardioWeeklyGoal(updatedGoal).catch(err => console.warn('saveCardioWeeklyGoal failed:', err));
      void haptics.success();
    }

    draftRef.current = null;
    setJustSavedSession(session);
    setWeekJustClosed(closesNow);
    setState('summary');
    setBpm(null);
  };

  const closeSummary = () => {
    setJustSavedSession(null);
    setWeekJustClosed(false);
    setState('idle');
  };

  const value: CardioSessionContextValue = {
    state, sessionType, setSessionType, bpm, deviceStatus, error, paused,
    displayElapsedSec, displaySamples, displayTimeInZone, displayBelowZoneSec,
    displayBlockIndex, displayBlockRemainingSec, displayLive, justSavedSession, weekJustClosed,
    intervalBlocksRef, sessionTargetZoneRef,
    connect, cancelReady, start, pause, resume,
    save: () => finishSession('save'),
    discard: () => finishSession('discard'),
    finishCooldown, confirmEffort, closeSummary,
  };

  return <CardioSessionContext.Provider value={value}>{children}</CardioSessionContext.Provider>;
}

/** Solo se usa dentro de rutas de atleta, envueltas por `CardioSessionProvider` en App.tsx. */
export function useCardioSession(): CardioSessionContextValue {
  const ctx = useContext(CardioSessionContext);
  if (!ctx) throw new Error('useCardioSession() fuera de <CardioSessionProvider> — ¿falta envolver la ruta en App.tsx?');
  return ctx;
}
