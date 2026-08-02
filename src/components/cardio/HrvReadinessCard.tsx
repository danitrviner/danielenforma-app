import React from 'react';
import { HrvReading } from '../../types';
import { classifyReadiness, READINESS_LABEL, ReadinessBand } from '../../utils/cardioMetrics';

// "Preparación para el entrenamiento" de la pestaña Hoy de FITIV (§4bis.5),
// recortada a lo que una banda de pecho puede medir de verdad: HRV matinal
// puntual + su comparación con la línea base del propio atleta (§7 del
// análisis — Sleep/Stress/Battery no son alcanzables, no se simulan).

const READINESS_COLOR: Record<ReadinessBand, string> = {
  poor: '#ff4d4d', low: '#ff8c42', moderate: '#fbcb1a', high: '#00eefc', prime: '#22c55e',
};

interface Props {
  readings: HrvReading[];
  onMeasure: () => void;
}

export default function HrvReadinessCard({ readings, onMeasure }: Props) {
  const latest = [...readings].sort((a, b) => b.date.localeCompare(a.date))[0];
  const band = latest?.readinessScore !== undefined ? classifyReadiness(latest.readinessScore) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const measuredToday = latest?.date === today;

  return (
    <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-5 space-y-3">
      <h3 className="text-[10px] font-mono uppercase text-[#00eefc] tracking-wider">HRV matinal</h3>

      {latest ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-[#c6c9ab]">{latest.date}{measuredToday ? ' · hoy' : ''}</p>
            <p className="font-sans font-black text-3xl text-white tabular-nums">{latest.rmssd.toFixed(1)} <span className="text-xs font-mono text-[#c6c9ab]">ms</span></p>
          </div>
          {band && (
            <div className="text-center px-3 py-2 rounded-xl" style={{ backgroundColor: `${READINESS_COLOR[band]}1a`, border: `1px solid ${READINESS_COLOR[band]}40` }}>
              <p className="text-[9px] font-mono uppercase" style={{ color: READINESS_COLOR[band] }}>Preparación</p>
              <p className="font-sans font-bold text-sm" style={{ color: READINESS_COLOR[band] }}>{READINESS_LABEL[band]}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[#c6c9ab] font-mono">Mide 3 min al despertar para ver tu preparación diaria.</p>
      )}

      <button onClick={onMeasure} className="w-full py-2.5 bg-[#0e0e0e] border border-[#00eefc]/30 text-[#00eefc] font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#00eefc]/10 active:scale-95 transition-all">
        {measuredToday ? 'Medir de nuevo' : 'Medir ahora'}
      </button>
    </section>
  );
}
