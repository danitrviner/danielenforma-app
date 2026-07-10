import React from 'react';
import { WeeklyChallenge } from '../../types';
import { ChallengeProgress } from '../../utils/weeklyChallenge';

interface Props {
  challenge: WeeklyChallenge;
  progress: ChallengeProgress;
}

function fmtMetric(value: number, unit: string): string {
  if (unit === 'pasos') return `${Math.round(value).toLocaleString('es-ES')} pasos`;
  if (unit.includes('kg')) return `${value.toFixed(1)} ${unit}`;
  if (unit === '%') return `${Math.round(value)}%`;
  return `${Math.round(value)} ${unit}`;
}

function daysLeft(weekEnd: string): number {
  const today = new Date().toISOString().split('T')[0];
  const diff = Math.ceil((new Date(weekEnd + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
  return Math.max(0, diff);
}

// Card destacada del reto activo de la semana — siempre hay uno (auto-generado
// si el coach no asignó ninguno). Barra de progreso derivada de los datos
// registrados por el atleta, sin input manual.
export default function WeeklyChallengeCard({ challenge, progress }: Props) {
  const achieved = challenge.status === 'conseguido';
  const remaining = daysLeft(challenge.weekEnd);
  const accent = achieved ? '#8ac926' : '#fbcb1a';

  return (
    <div
      className="rounded-3xl border p-5 flex flex-col gap-3"
      style={{ backgroundColor: '#121212', borderColor: `${accent}33`, boxShadow: `0 0 24px ${accent}14` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg" style={{ color: accent }}>
            {achieved ? 'emoji_events' : 'flag'}
          </span>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab]">
            Reto de la semana · de tu entrenador
          </p>
        </div>
        {!achieved && (
          <span className="font-mono text-[9px] text-[#c6c9ab]">
            {remaining === 0 ? 'último día' : `${remaining}d restantes`}
          </span>
        )}
      </div>

      <h3 className="font-sans font-black text-lg text-white leading-tight">{challenge.title}</h3>
      <p className="text-[#c6c9ab] text-xs font-mono leading-relaxed">{challenge.description}</p>

      <div className="mt-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[10px] text-white font-bold">
            {fmtMetric(progress.progressValue, challenge.metric.unit)}
          </span>
          <span className="font-mono text-[10px] text-[#c6c9ab]">
            objetivo {fmtMetric(challenge.metric.target, challenge.metric.unit)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-[#1e1e1b] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(4, progress.pct)}%`, backgroundColor: accent, boxShadow: `0 0 8px ${accent}99` }}
          />
        </div>
      </div>

      {achieved && (
        <p className="text-sm font-sans font-bold" style={{ color: accent }}>
          ¡Reto conseguido! 🏆
        </p>
      )}
    </div>
  );
}

// Se muestra en vez de la card normal cuando aún no hay reto para esta semana
// (lunes: margen del coach para elegir una opción). Misma carcasa visual, sin
// progreso ni objetivo — nunca delata que el reto se genera automáticamente.
export function ChallengePendingCard() {
  return (
    <div
      className="rounded-3xl border p-5 flex flex-col gap-2"
      style={{ backgroundColor: '#121212', borderColor: '#fbcb1a33', boxShadow: '0 0 24px #fbcb1a14' }}
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-lg animate-pulse" style={{ color: '#fbcb1a' }}>
          hourglass_top
        </span>
        <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab]">Reto de la semana</p>
      </div>
      <h3 className="font-sans font-black text-lg text-white leading-tight">Tu entrenador está preparando tu reto</h3>
      <p className="text-[#c6c9ab] text-xs font-mono leading-relaxed">
        Mientras tanto: entrena, camina y registra. El reto llega en breve.
      </p>
    </div>
  );
}
