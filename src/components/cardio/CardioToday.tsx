import React from 'react';
import { CardioAssignment, CardioSessionType, CardioZones } from '../../types';
import { HeartRateStatus } from '../../services/bleHeartRate';
import { ZONE_LABEL } from '../../utils/cardioZones';
import DeviceChip from './DeviceChip';
import { Button, Chip, ProgressBar, Sparkline, Banner } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   CardioToday (F3.9, "01 · Cardio de hoy" del handoff)

   Sustituye al bloque idle/ready que vivía suelto dentro de CardioScreen: la
   tarjeta primaria del día con la prescripción, las dos tarjetas pequeñas
   (pasos, minutos de la semana) y el pie de tres acciones. La conexión BLE
   real (connect → ready → start) es la misma máquina de estados de siempre —
   esta pieza es la capa visual encima, no reemplaza el motor de CardioScreen.

   Jerarquía dura del handoff: el cardio nunca es lo primero que ve el
   atleta (eso lo decide HomeScreen en F3.11) y "Mover a mañana" es una
   salida legítima, no un fallo — por eso está al mismo nivel que "Empezar".
   ═══════════════════════════════════════════════════════════════════════════ */

type ConnState = 'idle' | 'connecting' | 'ready';

interface Props {
  connState: ConnState;
  bpm: number | null;
  deviceStatus: HeartRateStatus;
  error: string | null;

  zona2Assignment?: CardioAssignment;
  intervalAssignment?: CardioAssignment;
  sessionType: CardioSessionType;
  onChangeSessionType: (t: CardioSessionType) => void;

  skippedToday: boolean;
  onConnect: () => void;
  onCancelReady: () => void;
  onStart: () => void;
  onManualAdd: () => void;
  onSkipToday: () => void;

  weeklyMinutesGoal: number;
  weeklyMinutesDone: number;
  sessionsGoal?: number;
  sessionsDone: number;
  dailyMinutes: number[]; // 7 valores, lunes→domingo

  todaysSteps: number | null;
  stepGoal?: number;
}

function fmtMin(sec?: number): string {
  if (!sec) return '—';
  return `${Math.round(sec / 60)} min`;
}

const TYPE_LABEL: Record<CardioSessionType, string> = { zona2: 'LISS · ZONA 2', intervalos: 'HIIT · INTERVALOS', libre: 'CARDIO LIBRE' };

export default function CardioToday({
  connState, bpm, deviceStatus, error,
  zona2Assignment, intervalAssignment, sessionType, onChangeSessionType,
  skippedToday, onConnect, onCancelReady, onStart, onManualAdd, onSkipToday,
  weeklyMinutesGoal, weeklyMinutesDone, sessionsGoal, sessionsDone, dailyMinutes,
  todaysSteps, stepGoal,
}: Props) {
  const activeAssignment = sessionType === 'zona2' ? zona2Assignment : sessionType === 'intervalos' ? intervalAssignment : undefined;
  const targetZone = zona2Assignment?.targetZone;

  return (
    <section className="space-y-4">
      <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Chip>{TYPE_LABEL[sessionType]}</Chip>
          {sessionsGoal !== undefined && (
            <p className="text-caption font-mono uppercase text-ink-2">{sessionsDone} de {sessionsGoal} esta semana</p>
          )}
        </div>

        {activeAssignment ? (
          <p className="font-display text-feature font-black uppercase tracking-tight text-ink">
            {sessionType === 'zona2' ? `Zona 2${targetZone ? ` · ${ZONE_LABEL[targetZone]}` : ''}` : 'Intervalos'}
          </p>
        ) : (
          <p className="font-display text-feature font-black uppercase tracking-tight text-ink">Cardio libre</p>
        )}

        <div className="grid grid-cols-3 gap-2 font-mono text-caption text-ink-2 uppercase">
          <div><p className="text-ink-3">Duración</p><p className="text-ink tabular-nums">{fmtMin(activeAssignment?.targetDurationSec)}</p></div>
          <div><p className="text-ink-3">Zona FC</p><p className="text-ink tabular-nums">{targetZone ? ZONE_LABEL[targetZone] : '—'}</p></div>
          <div><p className="text-ink-3">Tipo</p><p className="text-ink">{sessionType === 'intervalos' ? `${intervalAssignment?.intervals?.length ?? 0} bloques` : '—'}</p></div>
        </div>

        {skippedToday && <Banner tone="info">Movido a mañana. Puedes empezarlo igualmente si cambias de idea.</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}

        {connState === 'idle' && (
          <div className="space-y-2">
            <Button onClick={onConnect} fullWidth size="l">Empezar cardio</Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="m" onClick={onManualAdd} className="flex-1">Ya lo hice</Button>
              {!skippedToday && <Button variant="ghost" size="m" onClick={onSkipToday} className="flex-1">Mover a mañana</Button>}
            </div>
          </div>
        )}

        {connState === 'connecting' && <p className="text-label text-ink-2 font-sans text-center py-3">Conectando con la banda…</p>}

        {connState === 'ready' && (
          <div className="space-y-3">
            <DeviceChip status="ready" bpm={bpm} />
            {(zona2Assignment || intervalAssignment) && (
              <div className="flex gap-2">
                {zona2Assignment && (
                  <button onClick={() => onChangeSessionType('zona2')}
                    className={`flex-1 rounded-control border py-2 text-body-s font-sans font-bold transition-colors ${sessionType === 'zona2' ? 'border-accent-line bg-accent/16 text-accent' : 'border-hairline text-ink-2'}`}>
                    Zona 2
                  </button>
                )}
                {intervalAssignment && (
                  <button onClick={() => onChangeSessionType('intervalos')}
                    className={`flex-1 rounded-control border py-2 text-body-s font-sans font-bold transition-colors ${sessionType === 'intervalos' ? 'border-accent-line bg-accent/16 text-accent' : 'border-hairline text-ink-2'}`}>
                    Intervalos
                  </button>
                )}
                <button onClick={() => onChangeSessionType('libre')}
                  className={`flex-1 rounded-control border py-2 text-body-s font-sans font-bold transition-colors ${sessionType === 'libre' ? 'border-accent-line bg-accent/16 text-accent' : 'border-hairline text-ink-2'}`}>
                  Libre
                </button>
              </div>
            )}
            <Button onClick={onStart} fullWidth size="l">Empezar entrenamiento</Button>
            <Button variant="ghost" size="s" onClick={onCancelReady} fullWidth>Desconectar</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-hairline rounded-surface p-3 space-y-2">
          <p className="text-caption font-mono uppercase text-ink-2">Pasos</p>
          <p className="font-display text-title-l font-black text-ink tabular-nums">{todaysSteps !== null ? todaysSteps.toLocaleString('es-ES') : '—'}</p>
          {stepGoal ? (
            <ProgressBar value={todaysSteps !== null ? (todaysSteps / stepGoal) * 100 : 0} label={`Pasos, ${todaysSteps ?? 0} de ${stepGoal}`} />
          ) : (
            <p className="text-caption font-sans text-ink-3">Sin objetivo</p>
          )}
        </div>
        <div className="bg-surface border border-hairline rounded-surface p-3 space-y-2">
          <p className="text-caption font-mono uppercase text-ink-2">Minutos de la semana</p>
          <p className="font-display text-title-l font-black text-ink tabular-nums">{weeklyMinutesDone}<span className="text-ink-3 text-body-s">/{weeklyMinutesGoal}</span></p>
          <Sparkline values={dailyMinutes} label={`Minutos de cardio por día, ${weeklyMinutesDone} de ${weeklyMinutesGoal} esta semana`} />
        </div>
      </div>
    </section>
  );
}
