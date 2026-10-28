import React from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { PuntoHistorial, TramoHistorial } from '../../utils/historialObjetivos';
import { colorFaseNutricion } from '../../utils/roadmapCalendar';
import {
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA,
} from '../ui';

/* Gráfica compartida por la tarjeta del coach y la del atleta: fases de fondo
   con su color, franja del objetivo de cada fase, tendencia y las lecturas de
   7 días como puntos.

   28-10-2026 (maqueta D): la franja que se pinta es el PLAN FIJO de la fase
   (`franjaPlan`), del peso con el que empezó al objetivo. Antes era la del
   veredicto, que se re-ancla cada semana en la tendencia de hace cuatro: iba
   persiguiendo al peso, subía en plena definición y no decía nada a simple
   vista (Dani: «está totalmente desvirtuada»). Las fechas ISO son el eje (únicas, a diferencia de
   «3 jun»), y se formatean solo al pintarlas. */

// recharts no declara `key` en sus hijos (mismo apaño que NutritionPerformanceDashboard).
const ReferenceLineAny = ReferenceLine as unknown as React.FC<Record<string, unknown>>;
const AreaAny = Area as unknown as React.FC<Record<string, unknown>>;
const ReferenceDotAny = ReferenceDot as unknown as React.FC<Record<string, unknown>>;

function fmtFecha(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function fmtKg(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function GraficaObjetivos({ puntos, tramos }: { puntos: PuntoHistorial[]; tramos: TramoHistorial[] }) {
  if (puntos.filter(p => p.real != null).length < 2) return null;
  const valores = puntos.flatMap(p => [p.real, p.tendencia, ...(p.franjaPlan ?? [])]).filter((n): n is number => n != null);
  const dominio: [number, number] = [Math.floor(Math.min(...valores) - 0.5), Math.ceil(Math.max(...valores) + 0.5)];
  const varias = tramos.length > 1;

  // Dónde está hoy respecto al plan de la fase en curso.
  const actual = tramos.find(t => t.enCurso);
  const ultimo = [...puntos].reverse().find(p => p.tendencia != null && p.plan != null && (!actual || p.faseIdx === actual.faseIdx));
  const desvio = ultimo && ultimo.plan != null && ultimo.tendencia != null ? ultimo.tendencia - ultimo.plan : null;
  const dentro = !!ultimo?.franjaPlan && ultimo.tendencia != null
    && ultimo.tendencia >= ultimo.franjaPlan[0] && ultimo.tendencia <= ultimo.franjaPlan[1];
  const hoy = [...puntos].reverse().find(p => p.real != null)?.fecha;
  const semana = actual && hoy
    ? Math.min(actual.semanas, Math.floor((Date.parse(hoy + 'T12:00:00Z') - Date.parse(actual.inicioFase + 'T12:00:00Z')) / 86_400_000 / 7) + 1)
    : null;
  const finActual = actual ? puntos.filter(p => p.faseIdx === actual.faseIdx).at(-1) : undefined;

  return (
    <div className="space-y-2">
      {actual && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-caption text-ink-2 uppercase">
              {actual.nombre}{semana ? ` · semana ${semana} de ${actual.semanas}` : ''}
            </p>
            {actual.pesoObjetivo != null && (
              <p className="font-sans font-bold text-body-s text-ink">Objetivo: {fmtKg(actual.pesoObjetivo)} kg</p>
            )}
          </div>
          {desvio != null && (
            <span className={`flex-shrink-0 rounded-control border px-2 py-1 font-mono text-caption font-bold ${dentro ? 'border-success/40 text-success' : 'border-danger/40 text-danger'}`}>
              {dentro ? 'Dentro del plan' : `${desvio > 0 ? '+' : '−'}${fmtKg(Math.abs(desvio))} kg ${desvio > 0 ? 'por encima' : 'por debajo'}`}
            </span>
          )}
        </div>
      )}
      <div style={{ height: ALTURA_GRAFICA.l }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={puntos} margin={MARGEN_GRAFICA}>
            <CartesianGrid {...REJILLA_GRAFICA} />
            <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={TICK_GRAFICA} {...EJE_GRAFICA} minTickGap={24} />
            <YAxis domain={dominio} width={ANCHO_EJE_Y} tick={TICK_GRAFICA} {...EJE_GRAFICA} />
            {/* Cambio de fase: una línea discontinua donde empieza cada una. */}
            {tramos.slice(1).map(t => (
              <ReferenceLineAny key={`ini-${t.faseIdx}`} x={t.desde} stroke="var(--color-ink-3)" strokeDasharray="3 3" />
            ))}
            <Tooltip
              {...TOOLTIP_GRAFICA}
              labelFormatter={(f: unknown) => {
                const tramo = tramos.find(t => String(f) >= t.desde && String(f) <= t.hasta);
                return `${fmtFecha(String(f))}${tramo ? ` · ${tramo.nombre}` : ''}`;
              }}
              formatter={(valor: unknown, nombre: unknown) => {
                if (Array.isArray(valor)) return [`${fmtKg(valor[0])}–${fmtKg(valor[1])} kg`, 'Rango'];
                return [typeof valor === 'number' ? `${fmtKg(valor)} kg` : '—', String(nombre)];
              }}
            />
            {/* Una franja por fase, en el color de su objetivo: un volumen sube, un
                déficit baja, un mantenimiento es plano. */}
            {tramos.map(t => (
              <AreaAny
                key={`franja-${t.faseIdx}`}
                dataKey={(p: PuntoHistorial) => (p.faseIdx === t.faseIdx ? p.franjaPlan : null)}
                name={`Rango · ${t.nombre}`} isAnimationActive={false}
                stroke="none" fill={colorFaseNutricion(t.tipoColor)} fillOpacity={0.28}
              />
            ))}
            <Line
              dataKey="plan" name="Plan" type="linear" connectNulls={false} isAnimationActive={false}
              stroke="var(--color-ink-3)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false}
            />
            {hoy && (
              <ReferenceLineAny x={hoy} stroke="var(--color-ink-3)" strokeDasharray="2 3"
                label={{ value: 'hoy', position: 'insideTopRight', fill: 'var(--color-ink-3)', fontSize: 10 }} />
            )}
            {finActual?.plan != null && (
              <ReferenceDotAny x={finActual.fecha} y={finActual.plan} r={4} fill="var(--color-accent-ink)" stroke="none"
                label={{ value: 'objetivo', position: 'left', fill: 'var(--color-accent-ink)', fontSize: 10 }} />
            )}
            <Line
              dataKey="tendencia" name="Tendencia" type="monotone" connectNulls isAnimationActive={false}
              stroke="var(--color-accent-ink)" strokeWidth={2.5} dot={false}
            />
            <Line
              dataKey="real" name="Últimos 7 días" isAnimationActive={false}
              stroke="none" dot={{ r: 3, fill: 'var(--color-ink-3)', stroke: 'none' }} activeDot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {varias && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {tramos.map(t => (
            <span key={t.faseIdx} className="inline-flex items-center gap-1.5 font-sans text-caption text-ink-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colorFaseNutricion(t.tipoColor) }} />
              {t.nombre}{t.enCurso ? ' · ahora' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
