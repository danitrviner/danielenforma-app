import React from 'react';
import SlideAction from '../SlideAction';
import { Icon } from '../../ui';

/* Cajón colapsable con los dos deslizadores de confirmación (§4bis.1 del
   análisis: "Desliza para guardar" / "Deslizar para descartar", en vez de un
   botón "Terminar" que se pulsa sin querer con las manos sudadas), y la fila
   fija de candado + ajustes que en F4 se dejó pendiente hasta que el
   auto-lock y la hoja de ajustes existieran de verdad (F8). */

interface Props {
  expanded: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onLock: () => void;
  onOpenSettings: () => void;
}

export default function ActionDrawer({ expanded, saving, onSave, onDiscard, onLock, onOpenSettings }: Props) {
  return (
    <div
      className="overflow-hidden bg-raised transition-[max-height] duration-(--duration-state)"
      style={{ maxHeight: expanded ? 260 : 0 }}
    >
      <div className="px-5 pb-5 pt-2 space-y-3">
        <SlideAction label="Desliza para guardar" icon="fiber_manual_record" color="var(--color-danger)" onConfirm={onSave} disabled={saving} />
        <SlideAction label="Deslizar para descartar" icon="delete" color="var(--color-ink)" onConfirm={onDiscard} disabled={saving} />
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onLock}
            aria-label="Bloquear controles"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
          >
            <Icon name="lock" size="m" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Ajustes del entrenamiento"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
          >
            <Icon name="settings" size="m" />
          </button>
        </div>
      </div>
    </div>
  );
}
