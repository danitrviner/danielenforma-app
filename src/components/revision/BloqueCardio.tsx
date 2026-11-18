import React from 'react';
import { CardioDeLaVentana } from '../../utils/cardioDeLaVentana';
import { fechaCorta } from '../../utils/trainingWeek';
import { HubTab } from '../ClientHub';
import { Sparkline, Button, Collapsible } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque — El cardio.

   Todos estos números los calculaba ya `cardioMetrics`, y los veía SOLO el
   atleta: su sesión en directo y su historial. Para saber si alguien estaba
   acumulando más carga de la que asimila, el coach tenía que abrir la pestaña
   de Cardio y sumar sesiones a ojo.

   El dato central es el cociente de carga (ATL ÷ CTL): lo de esta semana
   contra la base de las últimas seis. 1 es lo de siempre; por encima, más de
   lo que tiene asimilado; por debajo, menos. Sin diagnóstico: el dato se
   enseña y el coach lo lee con el resto de la semana.
   ═══════════════════════════════════════════════════════════════════════════ */

// 18-11-2026 (Dani): fuera la etiqueta de diagnóstico («OVERREACHING»,
// «ÓPTIMO»…) y la frase que la acompañaba. Se queda el dato con su cuenta y
// una línea neutra para leerlo: qué hacer con él lo decide el coach.

interface Props {
  cardio: CardioDeLaVentana;
  onGoToTab: (tab: HubTab) => void;
  todoAbierto?: boolean;
}

export default function BloqueCardio({ cardio, onGoToTab, todoAbierto = false }: Props) {
  const { sesiones, minutos, kcal, fcMedia, foco, carga, hrr1Min, ultimaSesion } = cardio;

  return (
    <div className="space-y-4">
      {sesiones === 0 ? (
        <p className="font-sans text-label text-ink-3">
          Ninguna sesión de cardio en esta ventana
          {ultimaSesion ? `. La última fue el ${fechaCorta(ultimaSesion)}.` : '.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Dato label="Sesiones" valor={`${sesiones}`} sub="en la ventana" />
          <Dato label="Tiempo" valor={`${minutos} min`} sub={`≈ ${Math.round(minutos / sesiones)} por sesión`} />
          <Dato label="FC media" valor={fcMedia != null ? `${fcMedia} ppm` : '—'} sub={fcMedia != null ? '' : 'sin banda'} />
          <Dato label="Gasto" valor={kcal > 0 ? `${kcal.toLocaleString('es-ES')} kcal` : '—'} sub={kcal > 0 ? 'estimado' : 'sin datos'} />
        </div>
      )}

      {/* ── La carga acumulada ───────────────────────────────────────────── */}
      {carga ? (
        <div className="bg-raised border border-hairline rounded-surface p-4 space-y-2">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block">
                Carga aguda frente a su base
              </span>
              <span className="font-sans font-bold text-title-l text-ink tabular-nums">
                {carga.tlr.toFixed(2).replace('.', ',')}
              </span>
            </div>
            {carga.serieTlr.length > 1 && (
              <Sparkline values={carga.serieTlr} label="Evolución de la carga de entrenamiento" />
            )}
          </div>
          <p className="font-sans text-label text-ink-2 leading-relaxed">
            1 es lo de siempre: por encima, más carga de la que tiene asimilada; por debajo, menos.
          </p>
          <p className="font-mono text-caption text-ink-3">
            {carga.atl.toFixed(1).replace('.', ',')} de los últimos 7 días ÷{' '}
            {carga.ctl.toFixed(1).replace('.', ',')} de las últimas 6 semanas
          </p>
        </div>
      ) : sesiones > 0 && (
        <p className="font-mono text-caption text-ink-3 leading-relaxed">
          Sin carga que calcular: hace falta la frecuencia cardiaca de las sesiones, y estas se
          registraron sin banda.
        </p>
      )}

      {/* ── En qué intensidad se le va el tiempo ─────────────────────────── */}
      {foco && (
        <div>
          <span className="font-mono text-caption text-ink-3 uppercase tracking-[.08em] block mb-2">
            Dónde pasa el tiempo
          </span>
          <div className="grid grid-cols-3 gap-3">
            <Dato label="Suave" valor={`${foco.lowAerobicPct} %`} sub="zonas 2-3" />
            <Dato label="Fuerte" valor={`${foco.highAerobicPct} %`} sub="zona 4" />
            <Dato label="Máximo" valor={`${foco.anaerobicPct} %`} sub="zona 5" />
          </div>
          {/* Los tres no suman 100 y no es un fallo: la zona 1 —calentar y
              volver a la calma— no entra en ninguna de las tres porque no es
              trabajo, y decirlo evita la primera reacción de «aquí faltan
              minutos». */}
          <p className="font-mono text-caption text-ink-3 mt-2 leading-relaxed">
            No suman 100 %: el tiempo en zona 1 —calentamiento y vuelta a la calma— queda fuera
            porque no es trabajo.
          </p>
        </div>
      )}

      {(hrr1Min != null || ultimaSesion) && (
        <Collapsible
          key={`cardio-detalle-${todoAbierto}`}
          defaultOpen={todoAbierto}
          trigger={<span className="font-sans font-bold text-label text-ink">Más detalle</span>}
        >
          <ul className="space-y-1 list-none font-sans text-label text-ink-2">
            {ultimaSesion && <li>Última sesión registrada: {fechaCorta(ultimaSesion)}.</li>}
            {hrr1Min != null && (
              <li>
                Recuperación de FC al minuto: {hrr1Min} ppm. Cuanto más cae, mejor está el sistema
                cardiovascular; por debajo de 12 se considera pobre.
              </li>
            )}
          </ul>
        </Collapsible>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => onGoToTab('cardio')}>
          Ver sus sesiones
        </Button>
      </div>
    </div>
  );
}

function Dato({ label, valor, sub }: { label: string; valor: string; sub: string }) {
  return (
    <div className="bg-raised border border-hairline rounded-surface p-3 text-center">
      <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{label}</span>
      <span className="block font-sans font-bold text-title-s text-ink mt-0.5 tabular-nums">{valor}</span>
      {sub && <span className="block font-mono text-caption text-ink-3">{sub}</span>}
    </div>
  );
}
