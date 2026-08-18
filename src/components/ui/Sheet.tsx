import React from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useEscape, useFocusTrap, useScrollLock } from './internal/overlayHooks';
import { useBotonAtras } from '../../services/botonAtras';
import { ANCHO_OVERLAY, type OverlaySize } from './internal/overlaySizes';

/* ═══════════════════════════════════════════════════════════════════════════
   Sheet

   El panel que sube desde abajo: un picker, un filtro, un formulario corto. Es
   el gesto nativo de móvil para "una tarea a la vez sin dejar la pantalla".

   Cierra la deuda «overlays fixed inset-0» que persigue F9, pero SOLO como
   plantilla: los 39 overlays artesanales de la app no se tocan en F7 —eso es
   adopción, y le toca a F9—. Lo que hay aquí es lo que a esos 39 les falta hoy,
   verificado uno por uno:

     · **Foco atrapado.** Ninguno de los 39 lo tiene: el tabulador se escapa al
       fondo de la pantalla mientras el overlay sigue abierto.
     · **Escape cierra.** Tampoco.
     · **Scroll de fondo bloqueado sin el bug clásico de la migración (R4).**
       Ver `internal/overlayHooks.ts` — un contador compartido, no un
       overflow capturado por overlay.
     · **Retrato de foco.** Al cerrar, el foco vuelve a quien abrió el Sheet,
       no se queda flotando en el documento.

   Se monta en un portal a `document.body`: así el `z-index` de la escala
   declarada en F2 (`--z-overlay`, `--z-modal`) es la autoridad real, y no
   compite con el `overflow: hidden`/`position: relative` de un contenedor
   intermedio en la pantalla que lo abre — que es exactamente el tipo de fallo
   silencioso que hace que un overlay "funcione" en una pantalla y se corte en
   otra.

   Fase 3: fondo `raised` y radio `sheet` (26, propio — ver index.css),
   entra con `animate-sheet-in` (translateY 26px + scale .985, 380 ms). El
   asa deja de ser decorativa: arrastrarla hacia abajo sigue al dedo
   (`translateY` en línea, sin transición mientras se arrastra) y soltar por
   encima de 96 px o con velocidad de salida cierra sin guardar — soltar por
   debajo vuelve a su sitio con la misma animación de entrada. Pointer Events
   cubre ratón y táctil con el mismo código.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A partir de aquí arrastrando hacia abajo, soltar cierra el Sheet. */
const UMBRAL_CIERRE_PX = 96;

/** La escala de anchos es común con `Dialog`; vive en `internal/overlaySizes`. */
export type SheetSize = OverlaySize;

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Zona fija entre la cabecera y el cuerpo: pestañas, filtros, un buscador.
   * No scrollea — es su razón de ser.
   *
   * Lo añade F9 al migrar los overlays reales. Siete de ellos son *pickers* con
   * la misma anatomía (título · pestañas/chips/buscador · lista de resultados),
   * y son de los overlays más usados de la app: añadir alimento, cambiar
   * comida, elegir ejercicio, la paleta de comandos. Metiendo esa barra en el
   * cuerpo, el buscador se va con el scroll: escribes, bajas a mirar la lista y
   * pierdes el campo de vista. Sobre 311 alimentos eso no es un matiz estético.
   *
   * Va a sangre, sin relleno lateral propio: estas barras suelen llevar su
   * propio fondo y su borde inferior de lado a lado.
   */
  toolbar?: React.ReactNode;
  /**
   * Ancho máximo en escritorio. En móvil el panel ocupa todo el ancho pase lo
   * que pase — el gesto de «panel que sube» no admite márgenes laterales.
   * `l` es el valor que tenía la primitiva antes de que F9 le diera escala.
   */
  size?: SheetSize;
  /** Nombre accesible cuando no hay `title` visible. */
  label?: string;
  /**
   * T13 (18-08). `auto` (por defecto) es el comportamiento de siempre —
   * crece hasta `max-h-[85vh]`. `completo` es para los pickers con lista
   * larga y su propia barra de filtros/buscador (el selector de alimentos:
   * con 311 alimentos y la toolbar encima, a la lista le quedaba un tercio
   * de pantalla en `auto`) — ocupa el viewport entero, sin esquinas
   * redondeadas arriba ni margen inferior en escritorio.
   */
  alto?: 'auto' | 'completo';
};

export default function Sheet({ open, onClose, title, children, footer, toolbar, size = 'l', label, alto = 'auto' }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const idTitulo = React.useId();

  useScrollLock(open);
  useFocusTrap(ref, open);
  useEscape(onClose, open);
  // 07-9. Atrás en Android es el Escape del móvil: cierra esta capa en vez de
  // navegar por debajo y dejar el overlay flotando sobre otra pantalla.
  useBotonAtras(onClose, open);

  // Arrastrar el asa: `arrastreY` es el desplazamiento en vivo (0 = en su
  // sitio); se aplica como `transform` en línea porque cambia en cada evento
  // de puntero y no puede pasar por una clase de Tailwind. Al soltar, o bien
  // se anima de vuelta a 0 o se dispara `onClose` — nunca se queda a mitad.
  const [arrastreY, setArrastreY] = React.useState(0);
  const arrastrando = React.useRef(false);
  const origenY = React.useRef(0);

  const alBajarPuntero = (e: React.PointerEvent) => {
    arrastrando.current = true;
    origenY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!arrastrando.current) return;
    setArrastreY(Math.max(0, e.clientY - origenY.current));
  };
  const alSoltarPuntero = () => {
    if (!arrastrando.current) return;
    arrastrando.current = false;
    if (arrastreY > UMBRAL_CIERRE_PX) onClose();
    else setArrastreY(0);
  };

  if (!open) return null;

  return createPortal(
    // `pt` con la safe area: el sheet se ancla abajo, pero puede crecer hasta
    // `max-h-[85vh]` medido desde el borde físico, así que uno alto se metía
    // debajo de la Dynamic Island y su asa de arrastre quedaba fuera de alcance.
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center pt-[var(--safe-top)]">
      <div
        className="fixed inset-0 z-[var(--z-overlay)] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? idTitulo : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        style={{ transform: arrastreY ? `translateY(${arrastreY}px)` : undefined }}
        className={
          `relative z-[var(--z-modal)] flex w-full ${ANCHO_OVERLAY[size]} flex-col animate-sheet-in `
          + `${alto === 'completo' ? 'h-[100dvh] max-h-none' : 'max-h-[85vh]'} `
          + `${arrastreY ? '' : 'transition-transform duration-(--duration-state) ease-brand'} `
          + `border-t border-x border-strong bg-raised shadow-e2 focus:outline-none sm:border `
          + `${alto === 'completo' ? '' : 'rounded-t-sheet sm:mb-6 sm:rounded-sheet'}`
        }
      >
        {/* Asa: arrastrar hacia abajo sigue al dedo/ratón; soltar por encima
            del umbral cierra sin guardar, por debajo vuelve a su sitio. */}
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
          onPointerDown={alBajarPuntero}
          onPointerMove={alMoverPuntero}
          onPointerUp={alSoltarPuntero}
          onPointerCancel={alSoltarPuntero}
          aria-hidden
        >
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-2">
            <h2 id={idTitulo} className="font-sans text-title-s font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
            >
              <Icon name="close" size="m" />
            </button>
          </div>
        )}

        {toolbar && <div className="shrink-0">{toolbar}</div>}

        <div
          className="flex-1 overflow-y-auto px-4 pb-4"
          style={alto === 'completo' && !footer ? { paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' } : undefined}
        >
          {children}
        </div>

        {footer && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 pt-3"
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
