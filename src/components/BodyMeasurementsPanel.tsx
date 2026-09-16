import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BodyMetricKey, BODY_METRIC_LABELS, BODY_METRIC_UNITS } from '../types';
import { agruparMedicionesPorMetrica, metricasOrdenadas } from '../utils/medicionesPorMetrica';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';
import { computeAnthropometricIndices, ANTHROPOMETRIC_INDEX_LABELS } from '../utils/anthropometricIndices';
import { pctGrasaUSNavy, masaMagraEstimadaKg, computeIRC } from '../utils/bodyFatUSNavy';
import { estadoMDC } from '../utils/mdc';
import { Sexo } from '../utils/athleteProfileSignals';
import {
  Skeleton, EmptyState, ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y,
  REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA, colorSerie,
} from './ui';

// Ficha de mediciones: última medida de cada perímetro + delta desde el
// primer registro + curva completa. Alimentada por bodyMeasurements
// (escrita desde preguntas 'metric' de un cuestionario, o manualmente).
// El peso corporal vive aparte en BodyweightPanel — esta ficha es solo
// perímetros (no incluye 'bodyweight').
//
// Este panel se quedó fuera de la migración al DS y llevaba 29 colores
// escritos a mano (#1e1e1e, #c6c9ab, #fbcb1a…), radios de 2xl/3xl que ya no
// existen en la escala y textos a 9 y 10 px, por debajo del suelo tipográfico
// de 11. Ninguna de esas cosas la ve `tsc` ni el build: un hex se pinta igual
// de bien aunque el tema cambie debajo, solo que se queda clavado en el tema
// viejo. Desde que la Revisión lo monta dentro de «El cuerpo», eso se notaba
// en la misma pantalla —tarjetas de dos grises distintos, una al lado de la
// otra—, que es el peor sitio para verlo porque es la que se graba.

interface Props {
  athleteEmail: string;
  sexo: Sexo | null;    // de la anamnesis (perfil.sexo_biologico) — para %grasa US Navy
  pesoKg: number | null; // último peso conocido del atleta — idem
  /**
   * Quién está mirando. Solo cambia el estado vacío: el texto de siempre le
   * dice a QUIEN MIRA que asigne el cuestionario "Mediciones", y eso solo lo
   * puede hacer el coach. Desde que este panel también se pinta en la pantalla
   * de Revisión del atleta, ese texto le mandaba hacer algo que no está en su
   * mano. Por defecto 'coach', para no cambiar la pantalla del cliente.
   */
  audiencia?: 'coach' | 'atleta';
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function BodyMeasurementsPanel({ athleteEmail, sexo, pesoKg, audiencia = 'coach' }: Props) {
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

  // Agrupar y ordenar viven en utils/medicionesPorMetrica para poder probarlos:
  // una metricKey sin etiqueta tumbaba la pantalla entera (Sentry, 29-08).
  const byMetric = useMemo(() => agruparMedicionesPorMetrica(all), [all]);
  const metricKeys = metricasOrdenadas(byMetric);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Skeleton className="h-20 rounded-surface" />
        <Skeleton className="h-20 rounded-surface" />
        <Skeleton className="h-20 rounded-surface" />
      </div>
    );
  }

  if (metricKeys.length === 0) {
    return (
      <div className="border border-dashed border-hairline rounded-surface">
        <EmptyState
          icon="straighten"
          title="Sin medidas todavía"
          description={audiencia === 'atleta'
            ? 'En cuanto respondas el cuestionario de mediciones, aquí verás tus centímetros y cómo van cambiando.'
            : 'Asigna el cuestionario «Mediciones» para empezar a registrar perímetros.'}
        />
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
              className={`text-left bg-raised border rounded-surface p-3 space-y-1 transition-all ${isOpen ? 'border-accent/50' : 'border-hairline hover:border-ink-2/40'}`}
            >
              <p className="font-mono text-caption uppercase tracking-[.08em] text-ink-3 truncate">{BODY_METRIC_LABELS[key]}</p>
              <p className="font-sans font-bold text-title-s text-ink leading-none tabular-nums">
                {last.value} <span className="text-label font-normal text-ink-3">{unit}</span>
              </p>
              {pts.length > 1 && (() => {
                const estado = estadoMDC(delta, key);
                if (estado === 'estable') {
                  return <p className="font-mono text-caption text-ink-3">Estable desde {fmtDate(first.date)}</p>;
                }
                return (
                  <p className={`font-mono text-caption ${estado === 'sube' ? 'text-warning' : 'text-success'}`}>
                    {delta > 0 ? '+' : ''}{delta} {unit} desde {fmtDate(first.date)}
                  </p>
                );
              })()}
            </button>
          );
        })}
      </div>

      {hayIndices && (
        <div className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
          <p className="font-sans font-bold text-label text-ink">Índices antropométricos</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(indices) as [keyof typeof indices, number | null][])
              .filter(([, v]) => v != null)
              .map(([key, v]) => (
                <div key={key} className="bg-raised border border-hairline rounded-surface p-3">
                  <p className="font-mono text-caption uppercase tracking-[.08em] text-ink-3 truncate">
                    {ANTHROPOMETRIC_INDEX_LABELS[key]}
                  </p>
                  <p className="font-sans font-bold text-title-s text-ink leading-none tabular-nums">{v}</p>
                </div>
              ))}
          </div>
          <p className="font-mono text-caption text-ink-3 leading-relaxed">
            Calculados con la última medida de cada perímetro. Requieren el protocolo completo
            (relajado/contraído por lado) — las medidas antiguas de un solo valor no los alimentan.
          </p>
        </div>
      )}

      {composicion && (
        <div className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
          <p className="font-sans font-bold text-label text-ink">Composición corporal (US Navy)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-raised border border-hairline rounded-surface p-3">
              <p className="font-mono text-caption uppercase tracking-[.08em] text-ink-3 truncate">% Grasa estimado</p>
              <p className="font-sans font-bold text-title-s text-ink leading-none tabular-nums">{composicion.pctGrasa}%</p>
            </div>
            {composicion.masaMagraKg != null && (
              <div className="bg-raised border border-hairline rounded-surface p-3">
                <p className="font-mono text-caption uppercase tracking-[.08em] text-ink-3 truncate">Masa magra est.</p>
                <p className="font-sans font-bold text-title-s text-ink leading-none tabular-nums">{composicion.masaMagraKg} kg</p>
              </div>
            )}
            {composicion.irc != null && (
              <div className="bg-raised border border-hairline rounded-surface p-3">
                <p className="font-mono text-caption uppercase tracking-[.08em] text-ink-3 truncate">IRC</p>
                <p className="font-sans font-bold text-title-s text-ink leading-none tabular-nums">{composicion.irc}</p>
              </div>
            )}
          </div>
          <p className="font-mono text-caption text-ink-3 leading-relaxed">
            Estimado solo con cinta métrica (cuello, cintura{sexo === 'mujer' ? ', cadera' : ''}, altura) — sin calibre.
            IRC = Masa magra estimada / WHtR, índice propio para ver la recomposición, no una referencia clínica.
          </p>
        </div>
      )}

      {expanded && byMetric.get(expanded)!.length > 1 && (
        <div className="bg-surface border border-hairline rounded-surface p-4">
          <p className="font-sans font-bold text-label text-ink mb-2">{BODY_METRIC_LABELS[expanded]}</p>
          <ResponsiveContainer width="100%" height={ALTURA_GRAFICA.s}>
            <LineChart data={byMetric.get(expanded)} margin={MARGEN_GRAFICA}>
              <CartesianGrid {...REJILLA_GRAFICA} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={TICK_GRAFICA}
                {...EJE_GRAFICA}
                minTickGap={40}
              />
              <YAxis
                tick={TICK_GRAFICA}
                {...EJE_GRAFICA}
                width={ANCHO_EJE_Y}
                domain={['auto', 'auto']}
              />
              <Tooltip
                {...TOOLTIP_GRAFICA}
                labelFormatter={(label) => fmtDate(String(label))}
                formatter={(value: number) => [`${value} ${BODY_METRIC_UNITS[expanded]}`, BODY_METRIC_LABELS[expanded]]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={colorSerie(0)}
                strokeWidth={2}
                dot={{ fill: colorSerie(0), stroke: 'var(--color-bg)', strokeWidth: 2, r: 3 }}
                activeDot={{ fill: colorSerie(0), stroke: 'var(--color-bg)', strokeWidth: 2, r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
