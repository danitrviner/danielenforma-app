import React from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { PuntoHistorial, TramoHistorial } from '../../utils/historialObjetivos';
import { colorFaseNutricion } from '../../utils/roadmapCalendar';
import {
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA,
} from '../ui';

/* Gráfica compartida por la tarjeta del coach y la del atleta: fases de fondo
   con su color, franja del objetivo de cada fase, tendencia y las lecturas de
   7 días como puntos. Las fechas ISO son el eje (únicas, a diferencia de
   «3 jun»), y se formatean solo al pintarlas. */

// recharts no declara `key` en sus hijos (mismo apaño que NutritionPerformanceDashboard).
const ReferenceLineAny = ReferenceLine as unknown as React.FC<Record<string, unknown>>;
const AreaAny = Area as unknown as React.FC<Record<string, unknown>>;

function fmtFecha(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function fmtKg(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function GraficaObjetivos({ puntos, tramos }: { puntos: PuntoHistorial[]; tramos: TramoHistorial[] }) {
  if (puntos.filter(p => p.real != null).length < 2) return null;
  const valores = puntos.flatMap(p => [p.real, p.tendencia, ...(p.franja ?? [])]).filter((n): n is number => n != null);
  const dominio: [number, number] = [Math.floor(Math.min(...valores) - 0.5), Math.ceil(Math.max(...valores) + 0.5)];
  const varias = tramos.length > 1;

  return (
    <div className="space-y-2">
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
                dataKey={(p: PuntoHistorial) => (p.faseIdx === t.faseIdx ? p.franja : null)}
                name={`Rango · ${t.nombre}`} isAnimationActive={false}
                stroke="none" fill={colorFaseNutricion(t.tipoColor)} fillOpacity={0.28}
              />
            ))}
            <Line
              dataKey="tendencia" name="Tendencia" type="monotone" connectNulls isAnimationActive={false}
              stroke="var(--color-accent)" strokeWidth={2.5} dot={false}
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
