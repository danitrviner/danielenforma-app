/**
 * Primitivas del Design System.
 *
 * Punto de entrada único: las pantallas importan de `components/ui`, nunca del
 * archivo suelto. Eso es lo que permitirá mover, renombrar o partir una
 * primitiva sin tocar quien la usa.
 *
 * En F7 nadie importa de aquí todavía salvo el escaparate: la fase construye
 * las piezas y las deja probadas: la adopción en pantallas reales es F8, y la
 * de los 39 overlays artesanales, F9.
 */

export { default as Skeleton, ScreenSkeleton } from './Skeleton';

export { default as Icon } from './Icon';
export type { IconSize } from './Icon';

export { default as Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';

export { default as Input, Campo } from './Input';
export type { InputType } from './Input';

export { default as Select } from './Select';
export type { SelectOption } from './Select';

export { default as Card } from './Card';
export type { CardVariant, CardPadding } from './Card';

export { default as Badge } from './Badge';
export type { BadgeTone } from './Badge';

export { default as Tabs } from './Tabs';
export type { TabItem } from './Tabs';

export { default as Pager } from './Pager';

export { default as Chip } from './Chip';

export { default as ListRow } from './ListRow';

export { default as PageHeader } from './PageHeader';

export { default as Sheet } from './Sheet';
export type { SheetSize } from './Sheet';

export { default as Dialog } from './Dialog';
export type { DialogSize } from './Dialog';

export { default as EmptyState } from './EmptyState';

export { default as ProgressBar } from './ProgressBar';

export { default as Banner } from './Banner';
export type { BannerTone } from './Banner';

export { default as Stepper } from './Stepper';

export { default as SegmentedControl } from './SegmentedControl';
export type { SegmentedOption } from './SegmentedControl';

export { default as RirScale } from './RirScale';
export type { RirValue } from './RirScale';

export { default as EffortScale } from './EffortScale';

export { default as Sparkline } from './Sparkline';

export { default as RingSeal } from './RingSeal';

export { default as SwipeRow } from './SwipeRow';

export { default as SearchField } from './SearchField';

export { default as CollapsingHeader } from './CollapsingHeader';

export { default as Collapsible } from './Collapsible';

export {
  ALTURA_GRAFICA, MARGEN_GRAFICA, ANCHO_EJE_Y, REJILLA_GRAFICA, TICK_GRAFICA,
  EJE_GRAFICA, TOOLTIP_GRAFICA, LEYENDA_GRAFICA, SERIES_GRAFICA, colorSerie,
} from './chart';
export type { AlturaGrafica } from './chart';
