import React from 'react';
import { CardioSession, CardioZones } from '../../types';
import ZoneBars from './ZoneBars';
import { Button, RingSeal } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   CardioSessionSummary (F3.9, "05 · Resumen y semana cerrada" del handoff)

   Se muestra una sola vez, justo tras guardar la sesión (confirmEffort),
   antes de volver a 'idle'. El anillo se cierra siempre con el progreso de
   la semana; `weekJustClosed` decide si además lleva el sello y dispara el
   titular de cierre — el haptic success ya se disparó en CardioScreen al
   guardar, no aquí, para que sea un evento único y no dependa de que esta
   pantalla llegue a montarse.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  session: CardioSession;
  weeklyMinutesGoal: number;
  weeklyMinutesDone: number;
  weekJustClosed: boolean;
  onClose: () => void;
}

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

const TYPE_LABEL: Record<CardioSession['type'], string> = { zona2: 'Zona 2', intervalos: 'Intervalos', libre: 'Libre' };

export default function CardioSessionSummary({ session, weeklyMinutesGoal, weeklyMinutesDone, weekJustClosed, onClose }: Props) {
  const pct = weeklyMinutesGoal > 0 ? Math.min(100, Math.round((weeklyMinutesDone / weeklyMinutesGoal) * 100)) : 0;
  const zoneSec = session.timeInZoneSec;
  const inZoneSec = (zoneSec.z2 ?? 0) + (zoneSec.z3 ?? 0) + (zoneSec.z4 ?? 0);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg px-6 py-8 overflow-y-auto">
      <div className="w-full max-w-sm space-y-6 text-center">
        <RingSeal
          percent={pct}
          complete={weekJustClosed}
          label={`Semana de cardio, ${weeklyMinutesDone} de ${weeklyMinutesGoal} minutos`}
          className="mx-auto"
        >
          <div className="text-center">
            <p className="font-display text-title-l font-black text-ink tabular-nums">{weeklyMinutesDone}</p>
            <p className="text-caption font-mono uppercase text-ink-3">de {weeklyMinutesGoal} min</p>
          </div>
        </RingSeal>

        <div>
          <p className="font-display text-title-l font-black uppercase text-ink">
            {weekJustClosed ? 'Semana de cardio completa' : 'Sesión guardada'}
          </p>
          <p className="text-body-s font-sans text-ink-2 mt-1">
            {weekJustClosed ? 'Has llegado a tu objetivo de esta semana.' : `${fmtClock(session.durationSec)} de ${TYPE_LABEL[session.type]}.`}
          </p>
        </div>

        <div className="bg-surface border border-hairline rounded-surface p-4 grid grid-cols-2 gap-3 text-left">
          <div><p className="text-caption font-mono uppercase text-ink-3">Tipo</p><p className="text-body-s font-sans font-bold text-ink">{TYPE_LABEL[session.type]}</p></div>
          <div><p className="text-caption font-mono uppercase text-ink-3">En zona</p><p className="text-body-s font-sans font-bold text-success">{fmtClock(inZoneSec)}</p></div>
          <div><p className="text-caption font-mono uppercase text-ink-3">FC media</p><p className="text-body-s font-sans font-bold text-ink tabular-nums">{session.avgHR ?? '—'}</p></div>
          <div><p className="text-caption font-mono uppercase text-ink-3">FC máx.</p><p className="text-body-s font-sans font-bold text-ink tabular-nums">{session.maxHR ?? '—'}</p></div>
        </div>

        <ZoneBars timeInZone={zoneSec} belowZoneSec={0} elapsedSec={session.durationSec} />

        <Button onClick={onClose} fullWidth size="l">Continuar</Button>
      </div>
    </div>
  );
}
