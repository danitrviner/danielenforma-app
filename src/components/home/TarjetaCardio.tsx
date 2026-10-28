import type { CardioAssignment } from '../../types';
import { Icon } from '../ui';

interface Props {
  cardio: CardioAssignment;
  /** Sesiones de cardio hechas esta semana (lunes a hoy). */
  hechasSemana: number;
  hechoHoy: boolean;
  onAbrir: () => void;
}

const minutos = (seg: number) => Math.round(seg / 60);

/** «30 min en zona 2», «6 bloques · ~24 min». Nada inventado si falta el dato. */
function detalleDe(c: CardioAssignment): string {
  if (c.type === 'intervalos' && c.intervals?.length) {
    const total = c.intervals.reduce((t, b) => t + (b.durationSec || 0), 0);
    const bloques = `${c.intervals.length} ${c.intervals.length === 1 ? 'bloque' : 'bloques'}`;
    return total > 0 ? `${bloques} · ~${minutos(total)} min` : bloques;
  }
  if (c.targetDurationSec) {
    const zona = c.targetZone ? ` en zona ${c.targetZone.replace('z', '')}` : '';
    return `${minutos(c.targetDurationSec)} min${zona}`;
  }
  return c.type === 'zona2' ? 'Zona 2' : 'A tu ritmo';
}

const TITULO: Record<string, string> = { zona2: 'Zona 2', intervalos: 'Intervalos', libre: 'Cardio libre' };

/* ═══════════════════════════════════════════════════════════════════════════
   Cardio de hoy en Inicio (28-10-2026)

   Antes era una fila con «Cardio · Zona 2» y una flecha (Dani: «está un poco
   pocha»). Ahora dice qué toca en concreto —minutos o bloques— y cómo vas en
   la semana si el coach pauta un número de sesiones. Hecho hoy se confirma en
   verde, igual que el entreno de fuerza.
   ═══════════════════════════════════════════════════════════════════════════ */
export default function TarjetaCardio({ cardio, hechasSemana, hechoHoy, onAbrir }: Props) {
  const objetivo = cardio.timesPerWeek ?? 0;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`w-full text-left rounded-control border p-4 flex items-center gap-3.5 transition-colors hover:border-strong ${hechoHoy ? 'bg-success/8 border-success/25' : 'bg-surface border-hairline'}`}
    >
      <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-field ${hechoHoy ? 'bg-success/14 text-success' : 'bg-accent-bg text-accent-ink'}`}>
        <Icon name={hechoHoy ? 'check_circle' : 'favorite'} size="m" filled />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-caption font-mono uppercase text-ink-2">Cardio de hoy</span>
        <span className="block font-sans font-bold text-body text-ink">{TITULO[cardio.type] ?? 'Cardio'}</span>
        <span className="block font-sans text-label text-ink-2">{hechoHoy ? 'Hecho' : detalleDe(cardio)}</span>
      </span>
      {objetivo > 0 && (
        <span className="flex-shrink-0 text-right">
          <span className="flex justify-end gap-1" role="img" aria-label={`${Math.min(hechasSemana, objetivo)} de ${objetivo} esta semana`}>
            {Array.from({ length: objetivo }, (_, i) => (
              <span key={i} className={`h-2 w-2 rounded-full ${i < hechasSemana ? 'bg-accent' : 'bg-track'}`} />
            ))}
          </span>
          <span className="block font-mono text-caption text-ink-3 mt-1 tabular-nums">{Math.min(hechasSemana, objetivo)}/{objetivo} semana</span>
        </span>
      )}
      <Icon name="chevron_right" size="m" className="text-ink-3 flex-shrink-0" />
    </button>
  );
}
