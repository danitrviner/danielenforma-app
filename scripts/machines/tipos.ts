import type { MuscleGroup } from '../../src/types';

/**
 * Lo que devuelve un importador por cada máquina que encuentra en el catálogo
 * público de su marca. Deliberadamente mínimo: el núcleo del pipeline se encarga
 * del id estable, la categoría, la traducción, la imagen y el JSON final.
 */
export interface MaquinaCruda {
  /** Nombre tal cual lo publica el fabricante, en su idioma. Es la clave de traducción. */
  nombreOriginal: string;
  /** URL de la que descargar la foto de producto, ya en la resolución que se quiera. */
  imagenUrl: string;
  /** Ficha del producto. Solo para poder auditar de dónde salió cada máquina. */
  urlProducto?: string;
}

/**
 * Contrato que implementa cada marca. Añadir Panatta, Matrix, Prime, Atlantis,
 * Nautilus o Cybex es escribir uno de estos y registrarlo en run-import.ts:
 * el pipeline no se toca.
 */
export interface Importador {
  /** Clave estable de la marca, en camelCase. Entra en el id de cada máquina. */
  marca: string;
  /** Nombre de la familia dentro de la marca. También entra en el id. */
  familia: string;
  /** Recorre el catálogo público, incluida toda su paginación. */
  obtener(): Promise<MaquinaCruda[]>;
  /**
   * Traducciones al español, indexadas por `nombreOriginal`. El atleta solo ve
   * esto; el nombre original se conserva en el JSON para poder reconciliar
   * futuras reimportaciones aunque cambie la traducción.
   * Lo que falte se reporta al terminar — nunca se traduce a medias en silencio.
   */
  traducciones: Record<string, string>;
  /**
   * Clasificación manual a grupo muscular cuando el heurístico por nombre no
   * acierta. Opcional: lo normal es no necesitarlo.
   */
  categorias?: Record<string, MuscleGroup>;
}
