import React from 'react';
import { BloqueConEstado, PasoConEstado } from '../../utils/implantacion';
import { SetupStatus } from '../../utils/clientSetup';
import { Icon, ProgressBar } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El índice del recorrido — la columna izquierda.

   Siempre visible, con los seis bloques y sus pasos. Es lo que resuelve la
   queja original: antes, pulsar un ítem te sacaba de la pestaña y perdías el
   hilo; aquí el índice no se mueve, así que en todo momento se ve dónde estás,
   qué llevas y qué falta.

   El orden no se puede reordenar ni filtrar a propósito: cada paso necesita que
   exista el anterior (las sesiones necesitan el mesociclo, el calendario de
   dietas necesita las dietas), y un índice que deja saltártelos invita a
   montar el plan en un orden que no funciona.
   ═══════════════════════════════════════════════════════════════════════════ */

const ICONO: Record<SetupStatus, string> = {
  done: 'check_circle',
  attention: 'warning',
  pending: 'radio_button_unchecked',
  na: 'remove',
};

const COLOR: Record<SetupStatus, string> = {
  done: 'var(--color-success)',
  attention: 'var(--color-warning)',
  pending: 'var(--color-ink-3)',
  na: 'var(--color-ink-3)',
};

interface Props {
  bloques: BloqueConEstado[];
  activo: string | null;
  onElegir: (numero: string) => void;
  /** Avisos vencidos o de hoy, por número de paso. */
  avisosUrgentes?: Set<string>;
}

export default function IndiceRecorrido({ bloques, activo, onElegir, avisosUrgentes }: Props) {
  return (
    <nav className="space-y-4" aria-label="Pasos del montaje">
      {bloques.map(b => (
        <div key={b.id}>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <h4 className="font-mono text-caption text-ink-2 uppercase tracking-[.1em]">
              {b.meta.letra}. {b.meta.titulo.split(' — ')[0]}
            </h4>
            <span className="font-mono text-caption text-ink-3 tabular-nums">{b.donePct}%</span>
          </div>
          <ProgressBar value={b.donePct} label={`Progreso del bloque ${b.meta.titulo}`} />

          <ul className="mt-1.5 space-y-0.5">
            {b.pasos.map(p => (
              <li key={p.paso.numero}>
                <BotonPaso
                  paso={p}
                  activo={activo === p.paso.numero}
                  urgente={avisosUrgentes?.has(p.paso.numero) ?? false}
                  onClick={() => onElegir(p.paso.numero)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BotonPaso({ paso, activo, urgente, onClick }: {
  paso: PasoConEstado; activo: boolean; urgente: boolean; onClick: () => void;
}) {
  const { estado } = paso;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo ? 'step' : undefined}
      className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-control transition-colors
        ${activo ? 'bg-raised' : 'hover:bg-raised/60'}`}
    >
      <Icon name={ICONO[estado]} size="s" style={{ color: COLOR[estado] }} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className={`font-sans text-label block truncate ${estado === 'done' ? 'text-ink-2' : 'text-ink'}`}>
          {tituloCorto(paso)}
        </span>
        {paso.detalle && (
          <span className="font-mono text-caption text-ink-3 block truncate">{paso.detalle}</span>
        )}
      </span>
      {urgente && (
        <Icon name="notifications_active" size="s" style={{ color: 'var(--color-warning)' }}
          label="Tiene un aviso vencido" className="shrink-0 mt-0.5" />
      )}
    </button>
  );
}

/** El nombre del paso en la pantalla. Ver `PasoDelRecorrido.titulo`. */
export function tituloCorto(p: PasoConEstado): string {
  return p.paso.titulo;
}
