import React, { useState } from 'react';
import { CoachClientTask } from '../../types';
import { SetupItem, SetupPhaseGroup } from '../../utils/clientSetup';
import { HubTab } from '../ClientHub';
import { Button, Icon, Input, ListRow, Badge, ProgressBar } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   El carril de acompañamiento.

   Lo que NO es montar el programa: contacto diario la primera semana, resolver
   dudas de dieta, la primera revisión, repasar objetivos, y más adelante la
   renovación anticipada, la reseña, los referidos y la decisión de renovar.

   Antes vivía mezclado con el montaje en el mismo acordeón, y eso hacía que
   dar de alta a un cliente empezara con «contacto diario semana 1» —una tarea
   de dentro de siete días— metida entre el mesociclo y las dietas. Son dos
   ritmos distintos: el montaje se hace de una sentada, esto se hace durante
   semanas.

   Aquí también viven las tareas sueltas que el coach se apunta, que ahora
   admiten fecha.
   ═══════════════════════════════════════════════════════════════════════════ */

const ICONO = {
  done: 'check_circle', attention: 'warning', pending: 'radio_button_unchecked', na: 'remove',
} as const;
const COLOR = {
  done: 'var(--color-success)', attention: 'var(--color-warning)',
  pending: 'var(--color-ink-3)', na: 'var(--color-ink-3)',
} as const;

interface Props {
  fases: SetupPhaseGroup[];
  extras: CoachClientTask[];
  hoy: string;
  onMarcarItem: (item: SetupItem) => void;
  onIrA: (tab: HubTab) => void;
  onCrearExtra: (titulo: string, fecha?: string) => void;
  onCambiarExtra: (task: CoachClientTask, cambios: Partial<CoachClientTask>) => void;
  onBorrarExtra: (task: CoachClientTask) => void;
}

/** «Vencía ayer» dice más que una fecha suelta cuando lo que importa es si se pasó. */
function textoDeAviso(fecha: string, hoy: string): { texto: string; vencido: boolean } {
  if (fecha === hoy) return { texto: 'Hoy', vencido: true };
  if (fecha < hoy) return { texto: `Se pasó el ${fecha}`, vencido: true };
  return { texto: `Para el ${fecha}`, vencido: false };
}

export default function CarrilSeguimiento({
  fases, extras, hoy, onMarcarItem, onIrA, onCrearExtra, onCambiarExtra, onBorrarExtra,
}: Props) {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState('');

  const anadir = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    onCrearExtra(titulo.trim(), fecha || undefined);
    setTitulo('');
    setFecha('');
  };

  return (
    <div className="space-y-5">
      {fases.map(fase => (
        <section key={fase.id} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-sans font-bold text-label text-ink">
              {fase.title}
              {fase.subtitle && <span className="font-mono text-caption text-ink-3"> · {fase.subtitle}</span>}
            </h4>
            <span className="font-mono text-caption text-ink-3 tabular-nums">{fase.donePct}%</span>
          </div>
          <ProgressBar value={fase.donePct} label={`Progreso de ${fase.title}`} />

          <ul className="space-y-1">
            {fase.items.map(item => (
              <li key={item.id}>
                <ListRow
                  title={item.title}
                  subtitle={item.detail}
                  disabled={item.status === 'na'}
                  leading={<Icon name={ICONO[item.status]} size="s" style={{ color: COLOR[item.status] }} />}
                  onClick={
                    item.status === 'na' ? undefined
                      : item.manual ? () => onMarcarItem(item)
                        : item.link ? () => onIrA(item.link!.tab) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* ── Tareas sueltas ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h4 className="font-sans font-bold text-label text-ink">Tus tareas con este cliente</h4>

        {extras.length > 0 && (
          <ul className="space-y-1">
            {extras.map(t => {
              const aviso = t.dueDate ? textoDeAviso(t.dueDate, hoy) : null;
              return (
                <li key={t.id}>
                  <ListRow
                    title={t.title}
                    leading={
                      <Icon
                        name={t.done ? 'check_circle' : 'radio_button_unchecked'}
                        size="s"
                        style={{ color: t.done ? 'var(--color-success)' : 'var(--color-ink-3)' }}
                      />
                    }
                    onClick={() => onCambiarExtra(t, {
                      done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined,
                    })}
                    trailing={
                      <span className="flex items-center gap-2">
                        {aviso && !t.done && (
                          <Badge tone={aviso.vencido ? 'danger' : 'neutral'}>{aviso.texto}</Badge>
                        )}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onBorrarExtra(t); }}
                          aria-label={`Eliminar «${t.title}»`}
                          className="text-ink-3 hover:text-danger transition-colors"
                        >
                          <Icon name="delete" size="s" />
                        </button>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={anadir} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Input label="Nueva tarea" value={titulo} onChange={setTitulo}
              placeholder="Llamarle para repasar la dieta" />
          </div>
          <div className="min-w-[160px]">
            <Input label="Recordármelo el" type="date" value={fecha} onChange={setFecha} />
          </div>
          <Button type="submit" disabled={!titulo.trim()}>Añadir</Button>
        </form>
      </section>
    </div>
  );
}
