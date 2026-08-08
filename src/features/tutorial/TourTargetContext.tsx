import { useCallback, useEffect, useState } from 'react';

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

/**
 * Engancha `ref` al elemento real que representa el objetivo `id` de un paso del
 * tour.
 *
 * El `useCallback` NO es una optimización, es lo que impide un bucle infinito de
 * renders. Sin él esta función es nueva en cada render, así que React trata el
 * ref como distinto: llama al viejo con `null` y al nuevo con el elemento, en
 * CADA render. Cada una de esas llamadas pasa por `registerTourTarget`, que
 * llama a `notify()`, que despierta a `useTourTargetVersion` en el overlay del
 * tutorial, que re-renderiza el subárbol... y vuelta a empezar.
 *
 * Reventaba en `ProfileScreen`, que es la única pantalla con DOS objetivos
 * (`profile-progress-row` y `profile-settings-action`): «Maximum update depth
 * exceeded» y la pantalla entera caída en el error boundary — con ella, el panel
 * de Ajustes del coach. Con la referencia estable, el ref solo se engancha al
 * montar y se suelta al desmontar, que es lo que el registro espera.
 */
export function useTourTarget(id: string) {
  return useCallback((el: HTMLElement | null) => registerTourTarget(id, el), [id]);
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
