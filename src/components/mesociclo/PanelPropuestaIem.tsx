import React from 'react';
import { Button, Icon, Select } from '../ui';
import { UMBRALES_PROTOCOLO, SENSIBILIDADES } from '../../utils/cdg/agujetas';
import type { usePropuestaIem } from './usePropuestaIem';

/* Panel «Reglas de esta progresión» (13-d), a la derecha de la tabla en
   escritorio y debajo en móvil. Una fila por zona: modo, % de la semana (el
   sugerido por el freno/acelerador o el que ponga el coach), por qué, lo que
   lleva subido desde el inicio del bloque y los avisos. Debajo, las palancas y
   el botón que programa los cambios marcados en la tabla. */

type Propuesta = ReturnType<typeof usePropuestaIem>;

const PCTS = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 40, 50];
const signo = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })}`;
const TONO: Record<string, string> = { freno: 'text-danger', vigilar: 'text-warning', acelerar: 'text-success', objetivo: 'text-ink', mantener: 'text-ink-2', 'sin-dato': 'text-warning' };

export default function PanelPropuestaIem({ pr, onProgramar, onCerrar, onGuardarModo }: {
  pr: Propuesta;
  onProgramar: () => void;
  onCerrar: () => void;
  /** Guarda el modo de la zona en el mesociclo (`cdgModoPorZona`). */
  onGuardarModo?: (zona: string, modo: 'estatico' | 'dinamico') => void;
}) {
  const c = pr.calculo;
  const n = c?.marcados.length ?? 0;
  return (
    <aside className="bg-surface border border-hairline rounded-surface p-3 space-y-4 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:sticky lg:top-3 lg:self-start" aria-label="Reglas de esta progresión">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-caption font-bold uppercase tracking-wider text-ink-3">Reglas de esta progresión</p>
        <button type="button" onClick={onCerrar} aria-label="Cerrar la propuesta" className="text-ink-3 hover:text-ink"><Icon name="close" size="s" /></button>
      </div>

      <div className="grid grid-cols-2 gap-2 items-end">
        <Select label="Semana a programar" value={String(pr.semana)} onChange={v => pr.setSemana(Number(v))}
          options={pr.destinos.map(s => ({ value: String(s), label: `S${s}` }))} />
        <p className="font-sans text-caption text-ink-2 pb-2">Sobre lo programado en S{pr.semana - 1}. Las siguientes, en gris: borrador.</p>
      </div>

      {!pr.motor && <p className="font-sans text-caption text-ink-3">Cargando el catálogo CDG…</p>}

      {c && (
        <div className="space-y-2">
          <p className="font-sans font-bold text-label text-ink">Zonas</p>
          {c.zonas.length === 0 && <p className="font-sans text-caption text-ink-3">Los ejercicios elegidos no trabajan ninguna zona con IEM.</p>}
          {c.zonas.map(z => (
            <div key={z.zona} className="rounded-control border border-hairline p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-sans font-bold text-label text-ink">{z.nombre}</p>
                <button type="button"
                  onClick={() => { const m = z.modo === 'dinamico' ? 'estatico' : 'dinamico'; pr.setModo(z.zona, m); onGuardarModo?.(z.zona, m); }}
                  title={SENSIBILIDADES.find(s => s.value === z.modo)?.ayuda}
                  className={`rounded-chip border px-2 py-0.5 font-sans text-caption ${z.modo === 'dinamico' ? 'border-accent-line text-accent-ink' : 'border-hairline text-ink-2'}`}>
                  {z.modo === 'dinamico' ? 'Dinámico' : 'Estático'}
                </button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <Select label="Esta semana" value={String(z.pct)} onChange={v => pr.setPct(z.zona, Number(v))}
                  options={[...new Set([...PCTS, z.pct])].sort((a, b) => a - b).map(v => ({ value: String(v), label: v === 0 ? 'Mantener' : `${signo(v)} %` }))} />
                {z.resumen && (
                  <p className={`pb-2 font-mono text-caption tabular-nums ${z.resumen.alcanzado ? 'text-success' : 'text-warning'}`} title={`IEM de la zona: S${pr.semana - 1} programada → S${pr.semana} con los cambios`}>
                    {z.resumen.base.toLocaleString('es-ES')} → {z.resumen.despues.toLocaleString('es-ES')}
                  </p>
                )}
              </div>
              <p className={`font-sans text-caption ${TONO[z.propuesta.tono] ?? 'text-ink-2'}`}>
                {z.manual ? `Lo has puesto tú (sugerido: ${z.sugerido === 0 ? 'mantener' : `${signo(z.sugerido)} %`}). ` : ''}{z.propuesta.texto}
              </p>
              {z.acumulado != null && (
                <p className="font-sans text-caption text-ink-3">Desde S{z.semanaDePartida}: <b className="text-ink-2">{signo(Math.round(z.acumulado * 100))} %</b>{z.objetivo != null ? ` · objetivo ${z.objetivo.toLocaleString('es-ES')}` : ''}</p>
              )}
              {z.semanasSinMejorar >= 2 && (
                <p className={`flex items-start gap-1 font-sans text-caption ${z.semanasSinMejorar >= 3 ? 'text-danger' : 'text-warning'}`}><Icon name="warning" size="s" />
                  {z.semanasSinMejorar >= 3
                    ? `El tonelaje lleva ${z.semanasSinMejorar} semanas sin mejorar mientras sube la carga: plantéate bajar carga o descargar, sobre todo si hay fatiga alta.`
                    : 'El tonelaje lleva 2 semanas sin mejorar mientras sube la carga: vigílalo junto con fatiga y recuperación.'}
                </p>
              )}
              {z.resumen?.nota && <p className="font-sans text-caption text-warning">{z.resumen.nota}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="font-sans font-bold text-label text-ink">Palancas</p>
        {([
          ['series', c?.tiempo ? `Añadir series (+1/sem, si cabe en ${Math.round(c.tiempo.limiteSeg / 60)} min)` : 'Añadir series (+1/sem)'],
          ['rir', 'Bajar RIR (mín. 0)'],
          ['tecnica', 'Sugerir drop set si no cabe la serie (aislamiento)'],
        ] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 font-sans text-caption text-ink">
            <input type="checkbox" checked={pr.palancas[k]} onChange={e => pr.setPalancas(k, e.target.checked)} className="accent-[var(--color-accent)]" />
            {label}
          </label>
        ))}
        {!c?.tiempo && <p className="font-sans text-caption text-ink-3">Sin minutos por sesión en su alta: no se mira si la serie cabe.</p>}
      </div>

      {!UMBRALES_PROTOCOLO.validados && (
        <p className="rounded-control bg-raised px-2.5 py-2 font-sans text-caption text-ink-2">
          <b className="text-warning">Pendiente de validar:</b> umbrales de contexto (estrés ≥ {UMBRALES_PROTOCOLO.estresMalo}, sueño &lt; {UMBRALES_PROTOCOLO.sueñoMaloHoras} h, motivación ≤ {UMBRALES_PROTOCOLO.motivacionMala}).
        </p>
      )}

      <div className="space-y-1.5">
        <Button fullWidth icon="done" disabled={n === 0} onClick={onProgramar}>
          {n === 0 ? 'Nada que programar' : `Programar ${n} cambio${n === 1 ? '' : 's'} en S${pr.semana}`}
        </Button>
        <p className="font-sans text-caption text-ink-3">Toca una casilla con borde discontinuo para quitar o volver a poner sus cambios. Nada se guarda hasta «Aceptar cambios».</p>
      </div>
    </aside>
  );
}
