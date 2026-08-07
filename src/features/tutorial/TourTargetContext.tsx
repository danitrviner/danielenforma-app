import { useEffect, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   TourTargetRegistry (F3.12)

   Registro de objetivos del tour: cada pantalla real que participa en un
   paso llama `useTourTarget(id)` y engancha el ref devuelto al elemento que
   hay que recortar. El overlay lee `getBoundingClientRect()` del elemento
   real en tiempo de ejecución — nunca coordenadas fijas, tal y como pide el
   handoff ("en producción, un ref por objetivo").

   Singleton de módulo, no React Context: `App.tsx` es quien monta
   `TutorialEngine` (y con él, el overlay que LEE este registro), pero
   también necesita REGISTRAR el objetivo "nav-tabs" de su propia barra de
   pestañas — que vive en el mismo componente que monta el proveedor, no por
   debajo de él en el árbol. Un Context normal no llega ahí (un componente no
   puede leer un Provider que él mismo declara en su propio JSX). El mismo
   patrón module-level que ya usan `services/haptics.ts` y
   `services/cardioVoice.ts` en este código evita el problema sin inventar
   uno nuevo.
   ═══════════════════════════════════════════════════════════════════════════ */

const targets = new Map<string, HTMLElement>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach(l => l());
}

/**
 * Registro directo, sin hook — para los sitios donde el objetivo se registra
 * dentro de un `.map()` (varias pestañas de la misma barra, por ejemplo) y
 * llamar a un hook ahí violaría las reglas de hooks.
 */
export function registerTourTarget(id: string, el: HTMLElement | null): void {
  if (el) targets.set(id, el);
  else targets.delete(id);
  notify();
}

export function getTourTargetRect(id: string): DOMRect | null {
  const el = targets.get(id);
  return el ? el.getBoundingClientRect() : null;
}

/** Engancha `ref` al elemento real que representa el objetivo `id` de un paso del tour. */
export function useTourTarget(id: string) {
  return (el: HTMLElement | null) => registerTourTarget(id, el);
}

/** Re-renderiza al montarse/desmontarse cualquier objetivo — el overlay lo usa para re-medir. */
export function useTourTargetVersion(): number {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force(v => v + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return version;
}
