import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, CardioSessionType } from '../types';
import { getCardioProfile, getCardioSessionsForAthlete, getCardioAssignmentsForAthlete, getHrvReadingsForAthlete, getCardioWeeklyGoal, getStepsForAthlete, getAthleteNutritionConfig } from '../dbService';
import { getZoneForBpm, ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from '../utils/cardioZones';
import {
  summarizeSamples, pickActiveZona2Assignment, pickActiveIntervalAssignment,
  weeklyCardioMinutesDone, dailyCardioMinutesForWeek, defaultWeeklyCardioGoal, isoWeekKey,
} from '../utils/cardioSession';
import { suggestedPerceivedEffort } from '../utils/cardioMetrics';
import { DateRangeFilter, filterSessions, allTags } from '../utils/cardioHistory';
import { isCardioSkippedToday, skipCardioToday } from '../utils/cardioSkipToday';
import { useCardioSession, SAMPLE_INTERVAL_SEC } from '../hooks/useCardioSession';
import { Skeleton } from './ui';
import CardioZonesSettingsCard from './cardio/CardioZonesSettingsCard';
import LiveSession from './cardio/live/LiveSession';
import EffortPrompt from './cardio/EffortPrompt';
import CooldownPrompt from './cardio/CooldownPrompt';
import TrainingLoadPanel from './cardio/TrainingLoadPanel';
import HrvReadinessCard from './cardio/HrvReadinessCard';
import HrvTestScreen from './cardio/HrvTestScreen';
import CardioSessionDetail from './cardio/CardioSessionDetail';
import CardioSessionSummary from './cardio/CardioSessionSummary';
import CardioToday from './cardio/CardioToday';
import ManualSessionModal from './cardio/ManualSessionModal';
import { Icon, Button, PageHeader, Chip } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   CardioScreen — la PANTALLA, ya no la dueña del motor.

   Desde F2, el estado que tiene que sobrevivir a salir de /cardio (conexión
   BLE, cronómetro, acumulador de zonas, motor de intervalos, máquina de
   estados) vive en `CardioSessionProvider` (src/hooks/useCardioSession.tsx),
   montado una vez en App.tsx por encima del router. Este componente consume
   ese motor con `useCardioSession()` y sigue siendo dueño solo de lo que es
   puramente de esta pantalla: qué sesión del historial está abierta, los
   filtros, y los modales de test/alta manual.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  profile: UserProfile;
}

export default function CardioScreen({ profile }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cardio = useCardioSession();

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
  const { data: hrvReadings = [] } = useQuery({
    queryKey: ['hrvReadings', profile.email],
    queryFn: () => getHrvReadingsForAthlete(profile.email),
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentIsoWeek = isoWeekKey(todayIso);
  const { data: weeklyGoal } = useQuery({
    queryKey: ['cardioWeeklyGoal', profile.email, currentIsoWeek],
    queryFn: () => getCardioWeeklyGoal(profile.email, currentIsoWeek),
  });
  const { data: todaysSteps = [] } = useQuery({
    queryKey: ['stepsForAthlete', profile.email],
    queryFn: () => getStepsForAthlete(profile.email),
  });
  const { data: nutritionConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', profile.email],
    queryFn: () => getAthleteNutritionConfig(profile.email).catch(() => null),
  });

  const [skippedToday, setSkippedToday] = useState(() => isCardioSkippedToday(profile.email, todayIso));
  const [showHrvTest, setShowHrvTest] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState<DateRangeFilter>('all');
  const [historyType, setHistoryType] = useState<CardioSessionType | ''>('');
  const [historyTag, setHistoryTag] = useState('');

  // Igual que dentro del motor: preselecciona el tipo de sesión en la
  // tarjeta de hoy sin pisar la elección manual del atleta. Se recalcula
  // aquí porque es puramente de render (props de CardioToday); el motor
  // tiene su propia copia para decidir qué arranca al pulsar Empezar.
  const zona2Assignment = pickActiveZona2Assignment(assignments);
  const intervalAssignment = pickActiveIntervalAssignment(assignments);

  const { state, sessionType, setSessionType, bpm, deviceStatus, error, paused,
    displayElapsedSec, displaySamples, displayTimeInZone, displayBelowZoneSec,
    displayBlockIndex, displayBlockRemainingSec, displayBlockProgressKcal, displayLive, justSavedSession, weekJustClosed,
    intervalBlocksRef, sessionTargetZoneRef, livePrefs, setLivePrefs, locked, registerActivity, unlock, lock,
    connect, cancelReady, start, pause, resume, advanceBlockManually, save, discard, finishCooldown, confirmEffort, closeSummary,
  } = cardio;

  const targetZone = sessionType === 'zona2' ? (zona2Assignment?.targetZone ?? 'z2') : undefined;
  const targetDurationSec = sessionType === 'zona2' ? zona2Assignment?.targetDurationSec : undefined;

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

  if (state === 'summary' && justSavedSession) {
    const goalDefaults = defaultWeeklyCardioGoal(assignments);
    return (
      <CardioSessionSummary
        session={justSavedSession}
        weeklyMinutesGoal={weeklyGoal?.minutesGoal ?? goalDefaults.minutesGoal}
        weeklyMinutesDone={weeklyCardioMinutesDone(sessions, todayIso)}
        weekJustClosed={weekJustClosed}
        onClose={closeSummary}
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
        blockProgressKcal={displayBlockProgressKcal}
        paused={paused}
        onTogglePause={paused ? resume : pause}
        onHide={() => navigate('/home')}
        onAdvanceBlock={advanceBlockManually}
        liveMets={displayLive.mets}
        liveCaloriesKcal={displayLive.caloriesKcal}
        liveCaloriesActiveKcal={displayLive.caloriesActiveKcal}
        livePoints={displayLive.points}
        onSave={save}
        onDiscard={discard}
        locked={locked}
        onRegisterActivity={registerActivity}
        onUnlock={unlock}
        onLock={lock}
        livePrefs={livePrefs}
        onChangePrefs={setLivePrefs}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Cardio" subtitle="Zonas de FC y dashboard en vivo" />

      {!cardioProfile && (
        <div className="bg-surface border border-hairline rounded-surface p-4 text-center">
          <p className="text-label text-ink-2 font-sans">Tu entrenador todavía no ha configurado tus zonas de FC.</p>
        </div>
      )}

      {cardioProfile && (state === 'idle' || state === 'connecting' || state === 'ready') && (() => {
        const goalDefaults = defaultWeeklyCardioGoal(assignments);
        const minutesGoal = weeklyGoal?.minutesGoal ?? goalDefaults.minutesGoal;
        const sessionsGoal = weeklyGoal?.sessionsGoal ?? goalDefaults.sessionsGoal;
        const sessionsDone = sessions.filter(s => isoWeekKey(s.date) === currentIsoWeek).length;
        const todaysStepsEntry = todaysSteps.find(s => s.date === todayIso);
        return (
          <CardioToday
            connState={state}
            bpm={bpm}
            deviceStatus={deviceStatus}
            error={error}
            zona2Assignment={zona2Assignment}
            intervalAssignment={intervalAssignment}
            sessionType={sessionType}
            onChangeSessionType={setSessionType}
            skippedToday={skippedToday}
            onConnect={connect}
            onCancelReady={cancelReady}
            onStart={start}
            onManualAdd={() => setShowManualAdd(true)}
            onSkipToday={() => { skipCardioToday(profile.email, todayIso); setSkippedToday(true); }}
            weeklyMinutesGoal={minutesGoal}
            weeklyMinutesDone={weeklyCardioMinutesDone(sessions, todayIso)}
            sessionsGoal={sessionsGoal}
            sessionsDone={sessionsDone}
            dailyMinutes={dailyCardioMinutesForWeek(sessions, todayIso)}
            todaysSteps={todaysStepsEntry?.steps ?? null}
            stepGoal={nutritionConfig?.stepGoal}
          />
        );
      })()}

      {cardioProfile && state === 'idle' && (
        <details className="bg-surface border border-hairline rounded-surface p-3">
          <summary className="text-caption font-mono uppercase text-ink-2 cursor-pointer select-none">Tus zonas de FC</summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {ZONE_ORDER.map(z => (
              <div key={z} className="flex-1 min-w-[100px] rounded-surface p-3 text-center" style={{ backgroundColor: `${ZONE_COLOR[z]}1a`, border: `1px solid ${ZONE_COLOR[z]}40` }}>
                <p className="text-caption font-sans uppercase" style={{ color: ZONE_COLOR[z] }}>{ZONE_LABEL[z]}</p>
                <p className="text-label font-bold text-white ">{cardioProfile.zones[z].min}-{cardioProfile.zones[z].max}</p>
              </div>
            ))}
          </div>
        </details>
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
              <Button variant="ghost" size="s" onClick={() => setShowManualAdd(true)} icon="add">Añadir a mano</Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(['all', 'week', 'month', 'year'] as const).map(r => (
                <Chip key={r} selected={historyRange === r} onClick={() => setHistoryRange(r)}>
                  {{ all: 'Todo', week: 'Semana', month: 'Mes', year: 'Año' }[r]}
                </Chip>
              ))}
              <select value={historyType} onChange={e => setHistoryType(e.target.value as CardioSessionType | '')}
                className="bg-bg border border-hairline rounded-full px-3 py-1 text-title-s font-mono uppercase text-ink-2 focus:outline-none">
                <option value="">Cualquier tipo</option>
                <option value="libre">Libre</option>
                <option value="zona2">Zona 2</option>
                <option value="intervalos">Intervalos</option>
              </select>
              {tags.length > 0 && (
                <select value={historyTag} onChange={e => setHistoryTag(e.target.value)}
                  className="bg-bg border border-hairline rounded-full px-3 py-1 text-title-s font-mono uppercase text-ink-2 focus:outline-none">
                  <option value="">Cualquier etiqueta</option>
                  {tags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>

            {filtered.length === 0 && <p className="text-label text-ink-2 font-sans py-3 text-center">Ningún entreno con estos filtros.</p>}

            {[...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map(s => (
              <button key={s.id} onClick={() => setSelectedSessionId(s.id)}
                className="w-full flex items-center gap-3 bg-surface border border-hairline rounded-control p-3 text-left hover:border-strong transition-colors">
                <Icon name="favorite" size="l" className="text-data" />
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-body-s text-white">
                    {s.title || `${s.date} · ${Math.round(s.durationSec / 60)} min`}
                    {s.manual && <span className="ml-2 text-caption font-mono text-ink-2 uppercase">manual</span>}
                  </p>
                  <p className="text-caption text-ink-2 font-mono">Media {s.avgHR ?? '—'} bpm · Máx {s.maxHR ?? '—'} bpm</p>
                  {(s.caloriesActiveKcal || s.caloriesKcal || s.fitivPoints || s.trimp) && (
                    <p className="text-caption text-accent font-mono ">
                      {(s.caloriesActiveKcal ?? s.caloriesKcal) !== undefined && `${Math.round(s.caloriesActiveKcal ?? s.caloriesKcal!)} kcal · `}
                      {s.fitivPoints !== undefined && `${s.fitivPoints} pts · `}
                      {s.trimp !== undefined && `TRIMP ${Math.round(s.trimp)}`}
                      {s.perceivedEffort !== undefined && ` · PE ${s.perceivedEffort}/10`}
                      {s.hrr1Min !== undefined && ` · HRR 1' ${s.hrr1Min}`}
                    </p>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <p className="text-caption text-ink-2 font-mono ">{s.tags.join(' · ')}</p>
                  )}
                </div>
                <Icon name="chevron_right" size="l" className="text-ink-2" />
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

      <CardioZonesSettingsCard profile={profile} />
    </div>
  );
}
