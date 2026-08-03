import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Infraestructura compartida de Sheet y Dialog. No es una primitiva en sí —no
   se exporta desde `ui/index.ts`— es lo que evita que las dos primitivas de
   overlay dupliquen la misma lógica delicada dos veces.

   `useScrollLock` es la corrección directa de R4: «bloqueo de scroll mal
   desmontado, el bug clásico de esta migración». El patrón que ya existe en
   el CRM (`features/crm/components/Modal.tsx`) guarda el `overflow` previo del
   body y lo restaura al desmontar — funciona con UN overlay, pero con DOS
   independientes (no anidados, por ejemplo un toast y un diálogo) el primero
   en cerrarse restaura el scroll aunque el segundo siga abierto: cada uno
   captura y restaura por su cuenta, sin saber del otro. Aquí un contador a
   nivel de módulo hace que solo el ÚLTIMO overlay en cerrarse restaure el
   scroll, sin importar el orden de apertura o cierre.

   Límite conocido, anotado y no resuelto aquí a propósito: el foco atrapado
   de dos overlays abiertos A LA VEZ (un Dialog de confirmación dentro de un
   Sheet) no se coordina entre ambos — cada uno escucha Tab por su cuenta. Es
   el mismo caso que el panel de estado deja abierto en R3 para F9, cuando se
   migren los 39 overlays reales y aparezca composición de verdad.
   ═══════════════════════════════════════════════════════════════════════════ */

let bloqueosActivos = 0;
let overflowPrevioDelBody: string | null = null;

export function useScrollLock(activo: boolean) {
  React.useEffect(() => {
    if (!activo) return;
    if (bloqueosActivos === 0) {
      overflowPrevioDelBody = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    bloqueosActivos++;
    return () => {
      bloqueosActivos--;
      if (bloqueosActivos === 0) {
        document.body.style.overflow = overflowPrevioDelBody ?? '';
        overflowPrevioDelBody = null;
      }
    };
  }, [activo]);
}

export function useEscape(onEscape: () => void, activo: boolean) {
  React.useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [activo, onEscape]);
}

const SELECTOR_ENFOCABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Atrapa el tabulador dentro del contenedor mientras `activo` es true, mueve
 * el foco al primer elemento enfocable al abrir y lo devuelve a quien lo tenía
 * antes al cerrar — sin esto último, cerrar un overlay abierto desde un botón
 * deja el foco flotando en el documento, invisible para quien navega sin ratón.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, activo: boolean) {
  React.useEffect(() => {
    if (!activo) return;
    const enfocadoAntes = document.activeElement as HTMLElement | null;
    const contenedor = ref.current;

    const enfocables = () =>
      contenedor ? [...contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE)] : [];

    const primeros = enfocables();
    (primeros[0] ?? contenedor)?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = enfocables();
      if (items.length === 0) { e.preventDefault(); return; }
      const primero = items[0];
      const ultimo = items[items.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      enfocadoAntes?.focus();
    };
  }, [activo, ref]);
}
