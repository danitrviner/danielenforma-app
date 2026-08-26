import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BodyMetricKey, BODY_METRIC_LABELS, BODY_METRIC_UNITS } from '../types';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';
import { computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS } from '../utils/anthropometricIndices';
import { pctGrasaUSNavy, masaMagraEstimadaKg, computeIRC } from '../utils/bodyFatUSNavy';
import { estadoMDC } from '../utils/mdc';
import { Sexo } from '../utils/athleteProfileSignals';
import { Skeleton } from './ui';

// Ficha de mediciones: última medida de cada perímetro + delta desde el
// primer registro + curva completa. Alimentada por bodyMeasurements
// (escrita desde preguntas 'metric' de un cuestionario, o manualmente).
// El peso corporal vive aparte en BodyweightPanel — esta ficha es solo
// perímetros (no incluye 'bodyweight').

interface Props {
  athleteEmail: string;
  sexo: Sexo | null;    // de la anamnesis (perfil.sexo_biologico) — para %grasa US Navy
  pesoKg: number | null; // último peso conocido del atleta — idem
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function BodyMeasurementsPanel({ athleteEmail, sexo, pesoKg }: Props) {
  const { all, latest, loading } = useBodyMeasurements(athleteEmail);
  const [expanded, setExpanded] = useState<BodyMetricKey | null>(null);

  const indices = useMemo(() => computeAnthropometricIndices(latest), [latest]);
  const hayIndices = Object.values(indices).some(v => v != null);

  const composicion = useMemo(() => {
    if (!sexo || pesoKg == null) return null;
    const cuelloCm = latest.cuello?.value;
    const cinturaCm = latest.cintura?.value;
    const alturaCm = latest.altura?.value;
    const caderaCm = latest.cadera?.value;
    if (cuelloCm == null || cinturaCm == null || alturaCm == null) return null;
    if (sexo === 'mujer' && caderaCm == null) return null;
    const pctGrasa = pctGrasaUSNavy({ sexo, cuelloCm, cinturaCm, caderaCm, alturaCm });
    if (pctGrasa == null) return null;
    const masaMagraKg = masaMagraEstimadaKg(pesoKg, pctGrasa);
    const whtr = indices.whtr;
    const irc = masaMagraKg != null && whtr != null ? computeIRC(masaMagraKg, whtr) : null;
    return { pctGrasa, masaMagraKg, irc };
  }, [sexo, pesoKg, latest, indices.whtr]);

  const byMetric = useMemo(() => {
    const map = new Map<BodyMetricKey, { date: string; value: number }[]>();
    for (const m of all) {
      if (m.metricKey === 'bodyweight') continue; // vive en BodyweightPanel
      // Altura no es un perímetro que se siga en el tiempo (no cambia en
      // adultos, mdc.ts la excluye del umbral de cambio a propósito) — es un
      // dato único de la anamnesis que solo alimenta %grasa US Navy y WHtR
      // más abajo. Mostrarla aquí sería una tarjeta más diciendo "Estable"
      // para siempre, sin aportar nada al coach.
      if (m.metricKey === 'altura') continue;
      if (!map.has(m.metricKey)) map.set(m.metricKey, []);
      map.get(m.metricKey)!.push({ date: m.date, value: m.value });
    }
    for (const pts of map.values()) pts.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [all]);

  const metricKeys = [...byMetric.keys()].sort((a, b) => BODY_METRIC_LABELS[a].localeCompare(BODY_METRIC_LABELS[b]));

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }

  if (metricKeys.length === 0) {
    return (
      <div className="py-10 text-center border border-dashed border-white/7 rounded-2xl px-6">
        <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">straighten</span>
        <p className="font-sans font-bold text-white text-sm mb-1">Sin mediciones todavía</p>
        <p className="text-[#c6c9ab] text-xs font-mono max-w-xs mx-auto">
          Asigna el cuestionario "Mediciones" para empezar a registrar perímetros.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {metricKeys.map(key => {
          const pts = byMetric.get(key)!;
          const first = pts[0];
          const last = pts[pts.length - 1];
          const delta = Math.round((last.value - first.value) * 10) / 10;
          const unit = BODY_METRIC_UNITS[key];
          const isOpen = expanded === key;
          return (
            <button
              key={key}
              onClick={() => setExpanded(isOpen ? null : key)}
              className={`text-left bg-[#1e1e1e] border rounded-2xl p-3 space-y-1 transition-all ${isOpen ? 'border-[#fbcb1a]/50' : 'border-white/7 hover:border-white/60'}`}
            >
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] truncate">{BODY_METRIC_LABELS[key]}</p>
              <p className="font-sans font-black text-lg text-white leading-none">
                {last.value} <span className="text-xs font-normal text-[#c6c9ab]">{unit}</span>
              </p>
              {pts.length > 1 && (() => {
                const estado = estadoMDC(delta, key);
                if (estado === 'estable') {
                  return <p className="font-mono text-[10px] text-[#c6c9ab]">Estable desde {fmtDate(first.date)}</p>;
                }
                return (
                  <p className={`font-mono text-[10px] ${estado === 'sube' ? 'text-[#fb923c]' : 'text-[#86efac]'}`}>
                    {delta > 0 ? '+' : ''}{delta} {unit} desde {fmtDate(first.date)}
                  </p>
                );
              })()}
            </button>
          );
        })}
      </div>

      {hayIndices && (
        <div className="bg-[#181816] border border-white/7 rounded-3xl p-4 space-y-2">
          <p className="font-sans font-semibold text-white text-sm">Índices antropométricos</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(indices) as [keyof typeof indices, number | null][])
              .filter(([, v]) => v != null)
              .map(([key, v]) => (
                <div key={key} className="bg-[#1e1e1e] border border-white/7 rounded-2xl p-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] truncate">
                    {ANTHROPOMETRIC_INDEX_LABELS[key]}
                  </p>
                  <p className="font-sans font-black text-lg text-white leading-none">{v}</p>
                </div>
              ))}
          </div>
          <p className="font-mono text-[10px] text-[#c6c9ab]">
            Calculados con la última medida de cada perímetro. Requieren el protocolo completo
            (relajado/contraído por lado) — las medidas antiguas de un solo valor no los alimentan.
          </p>
        </div>
      )}

      {composicion && (
        <div className="bg-[#181816] border border-white/7 rounded-3xl p-4 space-y-2">
          <p className="font-sans font-semibold text-white text-sm">Composición corporal (US Navy)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-[#1e1e1e] border border-white/7 rounded-2xl p-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] truncate">% Grasa estimado</p>
              <p className="font-sans font-black text-lg text-white leading-none">{composicion.pctGrasa}%</p>
            </div>
            {composicion.masaMagraKg != null && (
              <div className="bg-[#1e1e1e] border border-white/7 rounded-2xl p-3">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] truncate">Masa magra est.</p>
                <p className="font-sans font-black text-lg text-white leading-none">{composicion.masaMagraKg} kg</p>
              </div>
            )}
            {composicion.irc != null && (
              <div className="bg-[#1e1e1e] border border-white/7 rounded-2xl p-3">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] truncate">IRC</p>
                <p className="font-sans font-black text-lg text-white leading-none">{composicion.irc}</p>
              </div>
            )}
          </div>
          <p className="font-mono text-[10px] text-[#c6c9ab]">
            Estimado solo con cinta métrica (cuello, cintura{sexo === 'mujer' ? ', cadera' : ''}, altura) — sin calibre.
            IRC = Masa magra estimada / WHtR, índice propio para ver la recomposición, no una referencia clínica.
          </p>
        </div>
      )}

      {expanded && byMetric.get(expanded)!.length > 1 && (
        <div className="bg-[#181816] border border-white/7 rounded-3xl p-4">
          <p className="font-sans font-semibold text-white text-sm mb-2">{BODY_METRIC_LABELS[expanded]}</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={byMetric.get(expanded)} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={{ stroke: '#2a2a2a' }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: '#c6c9ab', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e1e1b', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, fontFamily: 'monospace', fontSize: 11 }}
                labelStyle={{ color: '#fbcb1a', marginBottom: 4 }}
                labelFormatter={(label) => fmtDate(String(label))}
                formatter={(value: number) => [`${value} ${BODY_METRIC_UNITS[expanded]}`, BODY_METRIC_LABELS[expanded]]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#fbcb1a"
                strokeWidth={2}
                dot={{ fill: '#fbcb1a', stroke: '#121212', strokeWidth: 2, r: 3 }}
                activeDot={{ fill: '#fbcb1a', stroke: '#121212', strokeWidth: 2, r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
