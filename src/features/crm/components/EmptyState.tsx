import React from 'react';
import { EmptyState as EmptyStateDS } from '../../../components/ui';

interface Props {
  icon: string;
  titulo: string;
  descripcion?: string;
  cta?: { label: string; onClick: () => void };
}

/**
 * Estado vacío del CRM — hoy una envoltura fina sobre la primitiva del DS.
 *
 * El CRM arranca sin un solo dato de ejemplo, así que esto es lo primero que se
 * ve en cada tabla; lleva su CTA para que la pantalla vacía sea accionable y no
 * un callejón sin salida. Eso no cambia: la primitiva tiene el mismo hueco de
 * acción (`actionLabel` / `onAction`).
 *
 * Lo que aporta delegar: el CTA deja de ser un `<button>` a mano —sin
 * `focus-visible` y sin altura mínima táctil— y pasa a `Button`.
 *
 * La API en español (`titulo` / `descripcion` / `cta`) no cambia: las pantallas
 * del CRM que lo usan no se tocan.
 */
export default function EmptyState({ icon, titulo, descripcion, cta }: Props) {
  return (
    <EmptyStateDS
      icon={icon}
      title={titulo}
      description={descripcion}
      actionLabel={cta?.label}
      onAction={cta?.onClick}
    />
  );
}
