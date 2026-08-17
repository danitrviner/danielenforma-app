import React from 'react';
import SlideAction from '../SlideAction';

/* Cajón colapsable con los dos deslizadores de confirmación (§4bis.1 del
   análisis: "Desliza para guardar" / "Deslizar para descartar", en vez de un
   botón "Terminar" que se pulsa sin querer con las manos sudadas). FITIV
   añade aquí una fila fija de candado (auto-lock) y ajustes — eso es F8 de
   este plan (auto-lock + hoja de ajustes), se conecta cuando exista de
   verdad; no se simulan botones que no hacen nada. */

interface Props {
  expanded: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export default function ActionDrawer({ expanded, saving, onSave, onDiscard }: Props) {
  return (
    <div
      className="overflow-hidden bg-raised transition-[max-height] duration-(--duration-state)"
      style={{ maxHeight: expanded ? 200 : 0 }}
    >
      <div className="px-5 pb-5 pt-2 space-y-3">
        <SlideAction label="Desliza para guardar" icon="fiber_manual_record" color="var(--color-danger)" onConfirm={onSave} disabled={saving} />
        <SlideAction label="Deslizar para descartar" icon="delete" color="var(--color-ink)" onConfirm={onDiscard} disabled={saving} />
      </div>
    </div>
  );
}
