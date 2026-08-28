import React from 'react';
import {
  DiaCalendario, BandaEntreno, adherenciaDelMes, hitosDelMes, diasDelIndiceEnMes, recortarAlMes,
} from '../../../utils/roadmapCalendar';
import { Icon } from '../../ui';
import { mezcla } from './paleta';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const LEYENDA_FASE: { label: string; color: string }[] = [
  { label: 'Fuerza', color: 'var(--color-phase-fuerza)' },
  { label: 'Hipertrofia', color: 'var(--color-phase-hiper)' },
  { label: 'Definición', color: 'var(--color-phase-defi)' },
  { label: 'Mantenimiento', color: 'var(--color-phase-mant)' },
  { label: 'Descarga', color: 'var(--color-phase-descarga)' },
];

function diaDelAnio(fecha: string, anio: number): number {
  const d = new Date(fecha + 'T00:00:00');
  return Math.round((d.getTime() - new Date(anio, 0, 1).getTime()) / 86400000);
}
function diasEnAnio(anio: number): number {
  return (new Date(anio, 1, 29).getMonth() === 1) ? 366 : 365;
}

interface Props {
  anio: number;
  hoy: string;
  bandasEntreno: BandaEntreno[];
  indice: Map<string, DiaCalendario>;
  onOpenMonth: (mes: number) => void;
}

export default function NivelAno({ anio, hoy, bandasEntreno, indice, onOpenMonth }: Props) {
  const totalDias = diasEnAnio(anio);
  const mesActual = new Date(hoy + 'T00:00:00').getFullYear() === anio ? new Date(hoy + 'T00:00:00').getMonth() : -1;
  const hoyPct = (diaDelAnio(hoy, anio) / totalDias) * 100;

  return (
    <div className="space-y-3.5" style={{ animation: 'fade-up 260ms cubic-bezier(0.2,0.8,0.2,1) both' }}>
      {/* Tarjeta de bandas de periodización */}
      <div className="bg-surface border border-hairline rounded-surface px-5 pt-[18px] pb-3.5">
        <div className="flex items-center justify-between mb-3.5 flex-wrap gap-3">
          <p className="font-mono text-caption uppercase tracking-wider text-ink-3">Bloques de periodización · {anio}</p>
          <div className="flex items-center gap-4 flex-wrap">
            {LEYENDA_FASE.map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-label text-ink-2 font-sans">
                <span className="w-[9px] h-[9px] rounded-[3px]" style={{ background: l.color }} />{l.label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative" style={{ height: 58 }}>
          {bandasEntreno.map(b => {
            const a = diaDelAnio(b.inicio, anio);
            const fin = diaDelAnio(b.fin, anio);
            const widthPct = ((fin - a + 1) / totalDias) * 100;
            const wide = widthPct > 8;
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => onOpenMonth(new Date(b.inicio + 'T00:00:00').getMonth())}
                title={`${b.nombre} · ${b.semanas} semanas`}
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: `${(a / totalDias) * 100}%`,
                  width: `calc(${widthPct}% - 4px)`, display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0 12px', borderRadius: 14, background: mezcla(b.color, 12), border: `1px solid ${mezcla(b.color, 24)}`,
                  color: 'var(--color-ink)', overflow: 'hidden', cursor: 'pointer',
                }}
              >
                <Icon name={b.icono} size="m" style={{ color: b.color, flexShrink: 0 }} />
                {wide && (
                  <span className="flex flex-col gap-0.5 min-w-0 items-start overflow-hidden">
                    <span className="font-sans font-bold text-body-s whitespace-nowrap" style={{ letterSpacing: '-0.01em' }}>{b.nombre}</span>
                    <span className="font-mono text-caption opacity-60 whitespace-nowrap">
                      {MESES_CORTO[new Date(b.inicio + 'T00:00:00').getMonth()]} — {MESES_CORTO[new Date(b.fin + 'T00:00:00').getMonth()]}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
          {hoyPct >= 0 && hoyPct <= 100 && (
            <div
              title="Hoy"
              style={{
                position: 'absolute', top: -6, bottom: -6, width: 2, left: `${hoyPct}%`,
                background: 'var(--color-accent)', boxShadow: '0 0 12px 1px rgba(255,199,44,0.6)', borderRadius: 1,
              }}
            />
          )}
        </div>

        <div className="grid mt-2" style={{ gridTemplateColumns: 'repeat(12,1fr)' }}>
          {MESES_CORTO.map(m => (
            <div key={m} className="font-mono text-caption tracking-wider text-ink-5 text-center">{m}</div>
          ))}
        </div>
      </div>

      {/* Rejilla de meses */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {MESES.map((nombre, mi) => {
          const dim = new Date(anio, mi + 1, 0).getDate();
          const primerDia = new Date(anio, mi, 1).getDay();
          const huecos = primerDia === 0 ? 6 : primerDia - 1;
          const esAhora = mi === mesActual;
          const esFuturo = mi > mesActual && mesActual !== -1;
          const adh = esFuturo ? null : adherenciaDelMes(indice, anio, mi);
          const hitos = hitosDelMes(indice, anio, mi, 3);
          const diasDelMesIdx = diasDelIndiceEnMes(indice, anio, mi);
          const segFases = recortarAlMes(bandasEntreno, anio, mi);

          return (
            <button
              type="button"
              key={nombre}
              data-mes={mi}
              onClick={() => onOpenMonth(mi)}
              className="text-left bg-surface border rounded-surface px-[18px] pt-4 pb-3.5 transition-colors hover:border-accent-line"
              style={{ borderColor: esAhora ? 'rgba(255,199,44,0.35)' : 'var(--color-hairline)', transitionDuration: '160ms' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-sans font-bold text-title-s text-white" style={{ letterSpacing: '-0.01em' }}>{nombre}</span>
                  {esAhora && (
                    <span className="font-mono text-[9px] tracking-wider text-accent px-1.5 py-0.5 rounded-[8px]" style={{ background: 'rgba(255,199,44,0.12)' }}>AHORA</span>
                  )}
                </div>
                <span className="font-mono text-label" style={{ color: adh === null ? 'var(--color-ink-5)' : adh >= 80 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                  {adh === null ? (esFuturo ? 'plan' : '—') : `${adh}%`}
                </span>
              </div>

              <div className="grid gap-[5px_4px]" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
                {Array.from({ length: huecos }).map((_, i) => <div key={`h${i}`} style={{ width: 7, height: 9 }} />)}
                {Array.from({ length: dim }, (_, i) => i + 1).map(d => {
                  const fecha = `${anio}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const dia = indice.get(fecha);
                  const estado = dia?.estado;
                  let bg = 'rgba(245,245,244,0.10)';
                  if (estado === 'done') bg = 'var(--color-success)';
                  else if (estado === 'partial') bg = 'var(--color-warning)';
                  else if (estado === 'skipped') bg = 'var(--color-danger)';
                  else if (estado === 'rest') bg = 'rgba(245,245,244,0.14)';
                  else if (dia?.faseEntreno) bg = mezcla(dia.faseEntreno.color, 24);
                  const esHoy = fecha === hoy;
                  return (
                    <div key={d} className="flex items-center justify-center" style={{ height: 9 }}>
                      <div
                        style={{
                          width: 7, height: 7, borderRadius: 2, background: bg,
                          boxShadow: esHoy ? '0 0 0 2.5px var(--color-accent)' : (dia && dia.hitos.length > 0 ? '0 0 0 2px rgba(255,199,44,0.55)' : undefined),
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {segFases.length > 0 && (
                <div className="flex gap-[2px] mt-3 rounded-[2px] overflow-hidden" style={{ height: 4 }}>
                  {segFases.map(s => (
                    <div key={s.banda.id} style={{ flex: `${diasDelMesIdx.filter(d => d.faseEntreno?.id === s.banda.id).length || 1}`, background: s.banda.color, opacity: 0.75 }} />
                  ))}
                </div>
              )}

              {hitos.length > 0 && (
                <div className="flex items-center gap-2.5 mt-2.5 flex-wrap" style={{ minHeight: 18 }}>
                  {hitos.map(({ fecha, hito }) => (
                    <div key={hito.id} className="flex items-center gap-1 font-mono text-caption text-ink-3">
                      <Icon name={hito.icono} size="s" style={{ color: 'var(--color-accent)', fontSize: 14 }} />
                      {Number(fecha.slice(8, 10))} {MESES_CORTO[mi]}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
