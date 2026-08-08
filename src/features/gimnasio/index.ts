/**
 * Catálogo de máquinas y gimnasio del atleta.
 *
 * Punto de entrada único del módulo: fuera de esta carpeta nadie importa un
 * fichero suelto. Ver docs/catalogo-maquinas.md para el modelo de datos y el
 * diseño de la futura relación máquina→ejercicio.
 */

export { default as CatalogoSwipe } from './CatalogoSwipe';
export { default as MachineCard } from './MachineCard';
export { default as MiGimnasioPanel, gimnasioQueryKey } from './MiGimnasioPanel';
export { default as AddOwnMachineSheet } from './AddOwnMachineSheet';
export { default as RecordatorioGimnasioCard, useGimnasioPendiente } from './RecordatorioGimnasioCard';
export { default as EquipoClienteCard } from './EquipoClienteCard';
export { useCatalogoSwipe, ORDEN_CATEGORIAS } from './useCatalogoSwipe';
export type { EstadoSwipe, FaseSwipe, ResumenCategoria } from './useCatalogoSwipe';
