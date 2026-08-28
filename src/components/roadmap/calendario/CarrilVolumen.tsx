import React from 'react';
import { MUSCLE_LABELS } from '../../../types';
import { CarrilVolumen as DatosCarril } from '../../../utils/accionesCalendario';
import { heatmapBg, heatmapText, zoneLabel, VOLUME_ZONE_LEGEND } from '../../../utils/volumeZones';
import { VOLUME_LANDMARKS_DEFAULT } from '../../../data/volumeLandmarks';
import { Icon } from '../../ui';

interface Props {
  carril: DatosCarril;
  /** Cuántos grupos se listan; el resto se resume al pie en vez de esconderse. */
  tope?: number;
}

/**
 * Series planificadas por grupo muscular, semana a semana del mes que se está
 * mirando. Es lo que faltaba para que la progresión de volumen se VIERA: hasta
 * ahora el calendario marcaba los días de subida con un icono, pero no había
 * forma de ver si la rampa sube, se estanca o se pasa de MRV.
 *
 * Los colores son los mismos de `volumeZones` que usa el resto del entrenador
 * (MEV/Productivo/MAV/MRV), con los landmarks reales de cada grupo — un 14 en
 * pecho y un 14 en antebrazo no significan lo mismo.
 */
export default function CarrilVolumen({ carril, tope = 8 }: Props) {
  if (carril.porGrupo.length === 0) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-4">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-3 mb-2">Volumen planificado</p>
        <p className="text-label text-ink-4 font-sans">Sin entrenos programados este mes.</p>
      </div>
    );
  }

  const visibles = carril.porGrupo.slice(0, tope);
  const resto = carril.porGrupo.slice(tope);

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 overflow-x-auto">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Volumen planificado · series por semana</p>
        <div className="flex items-center gap-3 flex-wrap">
          {VOLUME_ZONE_LEGEND.map(z => (
            <span key={z.label} className="flex items-center gap-1.5 font-mono text-caption text-ink-3">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: z.bg, border: '1px solid var(--color-hairline)' }} />{z.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ minWidth: 120 + carril.semanas.length * 78 }}>
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `120px repeat(${carril.semanas.length}, 1fr)` }}>
          <div />
          {carril.semanas.map(s => (
            <div key={s.inicio} className="font-mono text-caption text-ink-4 text-center">{s.etiqueta}</div>
          ))}
        </div>

        {visibles.map(fila => {
          const landmark = VOLUME_LANDMARKS_DEFAULT[fila.grupo];
          // La tendencia mira la primera semana CON volumen contra la última:
          // arrancar el mes a mitad de bloque deja ceros por delante que no son
          // una bajada, son "aquí no había nada programado".
          const conVolumen = fila.series.filter(s => s > 0);
          const delta = conVolumen.length >= 2 ? conVolumen[conVolumen.length - 1] - conVolumen[0] : 0;
          return (
            <div key={fila.grupo} className="grid gap-1 mb-1 items-center" style={{ gridTemplateColumns: `120px repeat(${carril.semanas.length}, 1fr)` }}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-sans text-label text-ink-2 truncate">{MUSCLE_LABELS[fila.grupo]}</span>
                {delta !== 0 && (
                  <Icon
                    name={delta > 0 ? 'trending_up' : 'trending_down'}
                    style={{ fontSize: 13, color: delta > 0 ? 'var(--color-phase-fuerza)' : 'var(--color-ink-4)', flexShrink: 0 }}
                    label={`${delta > 0 ? '+' : ''}${delta} series en el mes`}
                  />
                )}
              </div>
              {fila.series.map((s, i) => (
                <div
                  key={i}
                  title={`${MUSCLE_LABELS[fila.grupo]} · ${carril.semanas[i].etiqueta} · ${s} series · ${zoneLabel(s, landmark)}`}
                  className="flex items-center justify-center rounded-[7px] font-mono text-label"
                  style={{ height: 26, background: heatmapBg(s, landmark), color: heatmapText(s, landmark), border: '1px solid var(--color-hairline)' }}
                >
                  {s > 0 ? s : '·'}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {resto.length > 0 && (
        <p className="text-caption text-ink-4 font-sans mt-2.5">
          Y {resto.length} grupo{resto.length !== 1 ? 's' : ''} más con menos volumen: {resto.map(f => MUSCLE_LABELS[f.grupo].toLowerCase()).join(', ')}.
        </p>
      )}
    </div>
  );
}
