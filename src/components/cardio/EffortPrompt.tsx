import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, EffortScale } from '../ui';
import { useScrollLock } from '../ui/internal/overlayHooks';

// Paso previo a guardar: Esfuerzo Percibido 1–10 (§5.4 del análisis, "04 ·
// registro en dos toques" del handoff de Fase 3) — la única carga de
// entrenamiento válida también para fuerza, y lo que alimenta Effort
// Minutes. FITIV lo autoestima desde la FC; aquí se sugiere por zona
// dominante (suggestedPerceivedEffort) y el atleta lo ajusta antes de
// guardar con la misma `EffortScale` que usa el cardio sin pulsómetro — el
// campo se llama ESFUERZO, distinto de RIR.

interface Props {
  suggested: number;
  onConfirm: (pe: number) => void;
  saving: boolean;
}

export default function EffortPrompt({ suggested, onConfirm, saving }: Props) {
  const [pe, setPe] = useState(suggested);
  useScrollLock(true);

  return createPortal(
    /* No es un modal: es una vista a pantalla completa. Fondo opaco, sin telón
       y sin caja — ocupa la ventana entera durante la sesión. F9 lo clasificó y
       lo dejó fuera a propósito: convertirlo en `Dialog` sería un rediseño, no
       una migración. Cuenta en la métrica `Overlays artesanales` del inventario
       porque esa métrica mide la utilidad de posición, que aquí no significa
       overlay sino pantalla.
       Portal a document.body (22-08): venía montada en su sitio normal dentro
       de `<main>`, como LiveSession antes de su fix del 17-08 — mismo fallo,
       aparecía cortada/desplazada hacia arriba justo después de deslizar para
       guardar. Mismo remedio: portal + useScrollLock. */
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-caption font-mono uppercase text-ink-2 tracking-wider">Esfuerzo</p>
          <p className="font-display text-hero font-black text-accent tabular-nums mt-1">{pe}</p>
        </div>

        <EffortScale value={pe} onChange={setPe} label="Esfuerzo percibido, de 1 a 10" />

        <Button onClick={() => onConfirm(pe)} disabled={saving} loading={saving} loadingLabel="Guardando" fullWidth size="l">
          Guardar sesión
        </Button>
      </div>
    </div>,
    document.body
  );
}
