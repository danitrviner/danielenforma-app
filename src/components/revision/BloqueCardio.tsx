import React from 'react';
import { CardioDeLaVentana } from '../../utils/cardioDeLaVentana';
import { TrainingLoadState } from '../../utils/cardioMetrics';
import { MONTHS_ES } from '../../utils/trainingWeek';
import { HubTab } from '../ClientHub';
import { Sparkline, Badge, Button, Collapsible } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Bloque — El cardio.

   Todos estos números los calculaba ya `cardioMetrics`, y los veía SOLO el
   atleta: su sesión en directo y su historial. Para saber si alguien estaba
   acumulando más carga de la que asimila, el coach tenía que abrir la pestaña
   de Cardio y sumar sesiones a ojo.

   Lo que de verdad decide aquí es el cociente de carga (ATL ÷ CTL): lo de esta
   semana contra la base de las últimas seis. Por debajo de 0,8 se está
   desentrenando; por encima de 1,5 está en la zona en la que aparecen las
   lesiones. Es el dato que explica por qué alguien que «entrena igual que
   siempre» ha dejado de progresar en la sala.
   ═══════════════════════════════════════════════════════════════════════════ */

// El estado no es bueno-malo en línea recta: «óptimo» es lo que se busca, pero
// «pico» es lo que toca antes de una competición y solo preocupa si se queda.
const TONO_ESTADO: Record<TrainingLoadState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  undertraining: 'neutral',
  optimal: 'success',
  peaking: 'warning',
  overreaching: 'warning',
  at_risk: 'danger',
};

const TEXTO_ESTADO: Record<TrainingLoadState, string> = {
  undertraining: 'Está haciendo menos de lo que su base aguanta: hay sitio para subir.',
  optimal: 'La carga de esta semana va con su base. Es donde se progresa.',
  peaking: 'Ha apretado por encima de su base. Bien si es a propósito y por poco tiempo.',
  overreaching: 'Lleva bastante más carga de la que tiene asimilada. Conviene una semana suave.',
  at_risk: 'Muy por encima de su base: es el rango donde aparecen las lesiones y el estancamiento.',
};

interface Props {
  cardio: CardioDeLaVentana;
  onGoToTab: (tab: HubTab) => void;
  todoAbierto?: boolean;
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MONTHS_ES[parseInt(m, 10) - 1]}`;
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              <span className="flex items-baseline gap-2">
                <span className="font-sans font-bold text-title-l text-ink tabular-nums">
                  {carga.tlr.toFixed(2).replace('.', ',')}
                </span>
                <Badge tone={TONO_ESTADO[carga.estado]}>{carga.estadoLabel}</Badge>
              </span>
            </div>
            {carga.serieTlr.length > 1 && (
              <Sparkline values={carga.serieTlr} label="Evolución de la carga de entrenamiento" />
            )}
          </div>
          <p className="font-sans text-label text-ink-2 leading-relaxed">{TEXTO_ESTADO[carga.estado]}</p>
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
