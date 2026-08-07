import React from 'react';
import Button from './Button';

/* ═══════════════════════════════════════════════════════════════════════════
   PageHeader

   La cabecera de pantalla: título grande, ceja opcional arriba, acción
   opcional a la derecha. `TrainingCoachScreen`, `ClientsScreen`,
   `ReviewsScreen` y `NutritionCoachScreen` la reescriben cada una a mano —es
   la sesión del 2026-07-03 la que dejó constancia de que
   `TrainingCoachScreen` fue la única pantalla de coach que se olvidó por
   completo del patrón hasta que alguien se dio cuenta.

   La ceja («Consola de Entrenador») usa `bg-raised` + borde `accent/30`, no
   `bg-accent`: es contexto, no la acción de la pantalla. El oro sólido está
   reservado para el botón que sí hace algo.

   No incluye navegación de vuelta atrás automática: `onBack` es explícito
   porque la pantalla es quien sabe si "atrás" significa `navigate(-1)`, una
   ruta concreta o cerrar un modal.

   Corrige P0-3 de la auditoría visual (docs/auditoria-visual/hallazgos.md):
   a 375 px la fila título/acción no llevaba `flex-wrap` y la zona `action`
   iba `shrink-0`, así que un botón con etiqueta larga se comía 307 de 343 px
   y el título —de verdad "Revisiones"— quedaba en "R." Ahora el título es
   quien tiene prioridad (`flex-1 min-w-0`, se trunca él primero) y la fila
   entera puede pasar a dos líneas antes de recortar la acción.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  title: string;
  /** Texto corto sobre el título: «Consola de Entrenador», «Cliente». */
  eyebrow?: string;
  subtitle?: string;
  /** Icono de flecha a la izquierda del título. */
  onBack?: () => void;
  /** Botón de la acción principal de la pantalla, a la derecha. */
  action?: React.ReactNode;
  className?: string;
};

export default function PageHeader({ title, eyebrow, subtitle, onBack, action, className = '' }: Props) {
  return (
    <header className={`flex flex-col gap-3 border-b border-hairline pb-4 ${className}`}>
      {eyebrow && (
        <span className="inline-flex w-fit items-center rounded-control border border-accent-line bg-raised px-2 py-1 font-sans text-caption font-bold uppercase tracking-widest text-accent">
          {eyebrow}
        </span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onBack && (
            // 36 px — el retroceso de cabecera del handoff, más pequeño que
            // el botón de icono estándar (48, Button `m`) porque comparte
            // renglón con un título de 46 px y no debe competir con él.
            <Button variant="ghost" size="s" icon="arrow_back" onClick={onBack} label="Volver" className="-ml-1 shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="truncate font-display text-hero font-black uppercase tracking-tight text-ink">
              {title}
            </h1>
            {subtitle && <p className="font-sans text-body-s text-ink-2">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
