import React from 'react';
import { Sheet, Button } from '../../../components/ui';

interface Props {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Modal base del CRM — hoy una envoltura fina sobre la primitiva `Sheet`.
 *
 * Antes tenía su propia implementación, y era la única del repo con intento de
 * bloqueo de scroll: guardaba el `overflow` del body y lo restauraba al
 * desmontar. Correcto con UN overlay, roto con dos, porque el primero en
 * cerrarse devolvía el scroll aunque el otro siguiera abierto — ese es el
 * riesgo R4 de esta migración, y `internal/overlayHooks` lo resuelve con un
 * contador compartido a nivel de módulo. Delegar es lo que lo cierra de verdad,
 * en vez de arreglar la misma lógica dos veces.
 *
 * También le faltaba el foco atrapado: solo movía el foco al primer campo al
 * abrir, así que el tabulador se escapaba al fondo de la página.
 *
 * La API (`titulo` / `onCerrar`) no cambia: las pantallas del CRM que lo usan no
 * se tocan.
 */
export default function Modal({ titulo, onCerrar, children, footer }: Props) {
  return (
    <Sheet open onClose={onCerrar} title={titulo} footer={footer}>
      {children}
    </Sheet>
  );
}

// ── Piezas de formulario compartidas ─────────────────────────────────────────

export function Campo({ label, children, hint, error }: {
  label: string; children: React.ReactNode; hint?: string; error?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-sans text-caption uppercase tracking-widest text-ink-2">{label}</span>
      {children}
      {error
        ? <span className="block font-sans text-caption text-danger">{error}</span>
        : hint ? <span className="block font-sans text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

/**
 * F11: `text-caption` (11 px) → `text-title-s` (16 px).
 *
 * Los ~40 campos del CRM comparten esta constante, así que eran R8 en bloque —
 * y el contador del inventario no los veía, porque mide la clase escrita en la
 * etiqueta y aquí llega por variable. Un solo cambio los arregla todos.
 */
export const inputClass =
  'w-full px-3 py-2 rounded-surface bg-field border border-hairline text-title-s text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/40';

/**
 * Los dos botones del CRM — hoy envoltura fina sobre `Button` del DS.
 *
 * Ganan lo que un `<button>` a mano no tenía: `focus-visible`, altura mínima
 * táctil de 44 px y el mismo tratamiento de `disabled` que el resto de la app.
 * Se ven algo más altos que antes (medían ~34 px), que es exactamente el motivo
 * por el que la primitiva fija ese suelo.
 *
 * La API no cambia: sus 36 usos en el CRM no se tocan.
 */
export function BotonPrimario({ children, disabled, onClick, type = 'button' }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit';
}) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled} size="s">
      {children}
    </Button>
  );
}

export function BotonSecundario({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick} size="s">
      {children}
    </Button>
  );
}
