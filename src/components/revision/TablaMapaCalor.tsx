import React from 'react';
import { MuscleGroup } from '../../types';
import { CeldaMapaCalor } from '../../utils/mapaCalorCorporal';
import { VOLUME_ZONE_LEGEND } from '../../utils/volumeZones';
import { BarraCumplimiento, Badge } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   La tabla del mapa de calor.

   No es el "modo accesible" escondido detrás de un interruptor: va SIEMPRE al
   lado de la silueta. El mapa es el vistazo —dónde hay hueco, de un golpe de
   ojo— y la tabla es la verdad, con el número que el coach dice en voz alta.
   Un color no se puede leer en un vídeo comprimido ni con un daltonismo, y esta
   pantalla se ve sobre todo dentro del vídeo que Dani graba por fuera.
   ═══════════════════════════════════════════════════════════════════════════ */

const TONO_PRIORIDAD = { alta: 'accent', media: 'neutral', baja: 'neutral' } as const;

interface Props {
  celdas: CeldaMapaCalor[];
  /** Si hay mesociclo con volumen, se pintan las columnas de plan y cumplimiento. */
  hayPlan: boolean;
  grupoActivo?: MuscleGroup | null;
  onGrupoActivo?: (g: MuscleGroup | null) => void;
  /** Por defecto oculta los grupos sin series ni plan: 17 filas con ceros no informan. */
  mostrarTodos?: boolean;
}

export default function TablaMapaCalor({
  celdas, hayPlan, grupoActivo = null, onGrupoActivo, mostrarTodos = false,
}: Props) {
  const filas = mostrarTodos
    ? celdas
    : celdas.filter(c => c.realizadasSemana > 0 || c.planificadasSemana != null);

  if (filas.length === 0) {
    return <p className="font-sans text-caption text-ink-3">Sin series registradas en este periodo.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-surface border border-hairline">
        <table className="w-full border-collapse" style={{ minWidth: hayPlan ? '540px' : '360px' }}>
          <caption className="sr-only">
            Series por grupo muscular y semana, con la zona de volumen de cada grupo
            {hayPlan ? ' y su comparación con lo programado' : ''}.
          </caption>
          <thead>
            <tr className="bg-bg">
              <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Grupo</th>
              <th scope="col" className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Series/sem</th>
              <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Zona</th>
              {hayPlan && <>
                <th scope="col" className="text-right px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Plan</th>
                <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Cumplido</th>
                <th scope="col" className="text-left px-3 py-2.5 font-mono text-caption text-ink-2 uppercase tracking-wider border-b border-hairline">Prioridad</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {filas.map(c => {
              const activo = grupoActivo === c.group;
              return (
                <tr
                  key={c.group}
                  onMouseEnter={onGrupoActivo ? () => onGrupoActivo(c.group) : undefined}
                  onMouseLeave={onGrupoActivo ? () => onGrupoActivo(null) : undefined}
                  className={`border-b border-hairline last:border-b-0 ${activo ? 'bg-raised' : ''}`}
                >
                  <th scope="row" className="text-left px-3 py-2.5 font-sans font-normal text-label text-ink whitespace-nowrap">
                    {c.label}
                  </th>
                  <td className="px-3 py-2.5 text-right font-mono text-label tabular-nums" style={{ color: c.colorTexto }}>
                    {c.realizadasSemana}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-block px-2 py-0.5 rounded-control font-mono text-caption"
                      style={{ backgroundColor: c.fill, color: c.colorTexto }}
                    >{c.zonaLabel}</span>
                  </td>
                  {hayPlan && <>
                    <td className="px-3 py-2.5 text-right font-mono text-label text-ink-2 tabular-nums">
                      {c.planificadasSemana ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.cumplimientoPct != null ? (
                        <span className="flex items-center gap-2 min-w-[92px]">
                          <BarraCumplimiento pct={c.cumplimientoPct} />
                          <span className="font-mono text-caption text-ink-2 tabular-nums shrink-0">{c.cumplimientoPct}%</span>
                        </span>
                      ) : (
                        <span className="font-mono text-caption text-ink-3">sin plan</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.prioridad
                        ? <Badge tone={TONO_PRIORIDAD[c.prioridad]}>{c.prioridad}</Badge>
                        : <span className="font-mono text-caption text-ink-3">—</span>}
                    </td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 list-none">
        {VOLUME_ZONE_LEGEND.map(z => (
          <li key={z.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-[3px] border border-hairline"
              style={{ backgroundColor: z.bg }}
              aria-hidden="true"
            />
            <span className="font-mono text-caption text-ink-3">{z.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
