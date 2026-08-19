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

   Corrige P0-3 de la auditoría visual (docs/auditoria-visual/hallazgos.md),
   dos veces.

   El primer intento añadió `flex-wrap` a la fila y dejó el título con
   `flex-1 min-w-0` y la acción con `shrink-0`. No sirvió, y el motivo es que
   `min-w-0` es precisamente el permiso para encogerse hasta la nada: flexbox
   prefiere reducir el título a una columna de un carácter antes que envolver,
   así que el `flex-wrap` nunca llegaba a dispararse. Medido de nuevo a 375 px
   en `/reviews`: título 23 px, acción 343.

   La regla ahora no depende de que el wrap se dispare: en móvil la cabecera se
   apila —título arriba, acción debajo, cada uno con todo el ancho— y a partir
   de `sm` vuelve a la fila con la acción a la derecha. El título ya no compite
   con la acción por el espacio, porque a ese ancho no comparten renglón.
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
  /**
   * La acción se apila debajo del título en móvil por defecto (ver el
   * comentario de cabecera): correcto para una acción con TEXTO, que a 375 px
   * competía por espacio con el título. Pero una acción de solo icono no
   * necesita renglón propio en ningún ancho — con `actionInline` comparte la
   * fila del título en vez de apilarse, en móvil y en escritorio.
   */
  actionInline?: boolean;
  className?: string;
};

export default function PageHeader({ title, eyebrow, subtitle, onBack, action, actionInline = false, className = '' }: Props) {
  return (
    <header className={`flex flex-col gap-3 border-b border-hairline ${actionInline ? 'pb-3' : 'pb-4'} ${className}`}>
      {eyebrow && (
        <span className="inline-flex w-fit items-center rounded-control border border-accent-line bg-raised px-2 py-1 font-sans text-caption font-bold uppercase tracking-widest text-accent">
          {eyebrow}
        </span>
      )}
      <div className={actionInline ? 'flex items-center gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          {onBack && (
            // 36 px — el retroceso de cabecera del handoff, más pequeño que
            // el botón de icono estándar (48, Button `m`) porque comparte
            // renglón con un título de 46 px y no debe competir con él.
            <Button variant="ghost" size="s" icon="arrow_back" onClick={onBack} label="Volver" className="-ml-1 shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* `text-hero` son 46 px FIJOS, y con `truncate` eso significa que
                cualquier título de más de ~10 caracteres se corta en un móvil
                de 375 px: "TrainingLab" salía como "TRAININGLA…". El ancho
                útil ahí es de 343 px y a 46 px black uppercase no da.
                Los dos tamaños son tokens del Design System, así que la
                cabecera baja a `text-display` (32 px) en móvil y recupera los
                46 a partir de `sm`, donde sí caben. */}
            <h1 className="truncate font-display text-display sm:text-hero font-black uppercase tracking-tight text-ink">
              {title}
            </h1>
            {subtitle && <p className="font-sans text-body-s text-ink-2">{subtitle}</p>}
          </div>
        </div>
        {/* `flex-wrap` dentro de la acción: si trae insignia + botón y aun así
            no cabe a lo ancho, se parten entre ellos en vez de desbordar.
            actionInline: ml-auto shrink-0, comparte fila con el título en vez
            de apilarse — pensado para una acción de solo icono. */}
        {action && (
          <div className={actionInline ? 'flex flex-wrap items-center gap-3 ml-auto shrink-0' : 'flex flex-wrap items-center gap-3 sm:shrink-0'}>
            {action}
          </div>
        )}
      </div>
    </header>
  );
}
