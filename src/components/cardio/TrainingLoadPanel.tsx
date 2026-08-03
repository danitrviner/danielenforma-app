import React from 'react';
import { CardioSession } from '../../types';
import { dailyLoadFromSessions, computeTrainingLoad, classifyTlr, TLR_LABEL, trainingFocus } from '../../utils/cardioMetrics';

// "Resumen del entrenamiento (TRIMP)" de la pestaña Hoy de FITIV (§4bis.5):
// slider Bajo·Óptimo·Alto·Riesgo con los cortes 0.8/1.1/1.3/1.5, más el
// reparto por bloques de zona del §5.7. Agregado puro sobre el historial que
// ya se pedía a Firestore — no dispara ninguna lectura nueva.

const TLR_STATE_COLOR: Record<string, string> = {
  undertraining: 'var(--color-info)', optimal: 'var(--color-success)', peaking: 'var(--color-accent)', overreaching: 'var(--color-warning)', at_risk: 'var(--color-danger)',
};

const RECENT_DAYS = 30;

interface Props {
  sessions: CardioSession[];
}

export default function TrainingLoadPanel({ sessions }: Props) {
  if (sessions.length === 0) return null;

  const dailyLoads = dailyLoadFromSessions(sessions);
  if (dailyLoads.length === 0) return null; // ninguna sesión con TRIMP calculado todavía

  const loadPoints = computeTrainingLoad(dailyLoads);
  const today = loadPoints[loadPoints.length - 1];
  const tlrState = classifyTlr(today.tlr);

  const cutoffDate = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recentZoneTotals = sessions
    .filter(s => s.date >= cutoffDate)
    .reduce((acc, s) => {
      acc.z1 += s.timeInZoneSec.z1; acc.z2 += s.timeInZoneSec.z2; acc.z3 += s.timeInZoneSec.z3;
      acc.z4 += s.timeInZoneSec.z4; acc.z5 += s.timeInZoneSec.z5;
      return acc;
    }, { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 });
  const focus = trainingFocus(recentZoneTotals);

  return (
    <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-5 space-y-4">
      <h3 className="text-caption font-mono uppercase text-data tracking-wider">Carga de entrenamiento</h3>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-caption font-mono text-ink-2">ATL {today.atl.toFixed(1)} · CTL {today.ctl.toFixed(1)}</p>
          <p className="text-label font-sans font-bold" style={{ color: TLR_STATE_COLOR[tlrState] }}>{TLR_LABEL[tlrState]} · TLR {today.tlr.toFixed(2)}</p>
        </div>
        {/* Escala fija 0–2.0 con los 5 estados en franjas iguales (§5.4) y un
            marcador en la posición real del TLR de hoy — no una escala a
            proporción exacta de los cortes, que con "at_risk" sin techo no
            tiene un 100% natural. */}
        <div className="relative h-2 rounded-full overflow-hidden flex">
          {(['undertraining', 'optimal', 'peaking', 'overreaching', 'at_risk'] as const).map(s => (
            <div key={s} className="h-full flex-1" style={{ backgroundColor: TLR_STATE_COLOR[s] }} />
          ))}
          <div className="absolute top-[-2px] w-1 h-3 bg-white rounded-full transition-all duration-500"
            style={{ left: `${Math.min(Math.max(today.tlr / 2, 0), 1) * 100}%` }} />
        </div>
      </div>

      {(focus.lowAerobicPct + focus.highAerobicPct + focus.anaerobicPct) > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption font-sans uppercase text-ink-2">Reparto últimos {RECENT_DAYS} días · objetivo Z2-Z3 70-80%</p>
          <div className="flex h-2 rounded-full overflow-hidden bg-bg">
            <div className="h-full bg-data" style={{ width: `${focus.lowAerobicPct}%` }} title="Aeróbico bajo (Z2-Z3)" />
            <div className="h-full bg-warning" style={{ width: `${focus.highAerobicPct}%` }} title="Aeróbico alto (Z4)" />
            <div className="h-full bg-danger" style={{ width: `${focus.anaerobicPct}%` }} title="Anaeróbico (Z5)" />
          </div>
          <div className="flex gap-3 text-caption font-mono text-ink-2">
            <span className="text-data">Z2-Z3 {focus.lowAerobicPct}%</span>
            <span className="text-warning">Z4 {focus.highAerobicPct}%</span>
            <span className="text-danger">Z5 {focus.anaerobicPct}%</span>
          </div>
        </div>
      )}
    </section>
  );
}
