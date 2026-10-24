import type { DietCompletionLog, DietItem } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Recientes y frecuentes del Diario (D-03)

   En «Calorías y macros» el buscador abre con lo que el atleta ya apunta. Sale
   del registro de los últimos días (una consulta acotada a SU email, nunca un
   barrido). Solo cuenta lo que se marcó como comido, y deja fuera:
     · las recetas (tienen su propio camino),
     · las líneas de continuación de un producto repartido en varias categorías
       (el producto entero ya cuenta por su primera línea).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AlimentoUsado {
  /** Con qué se vuelve a buscar en el banco: id del alimento o, si no hay, su etiqueta. */
  clave: string;
  label: string;
  veces: number;
  /** Último día (YYYY-MM-DD) en que se apuntó. */
  ultimo: string;
  /** Gramos de la última vez, si se sabe. */
  gramos?: number;
  /** De dónde viene: el banco de intercambios (por defecto), un producto de
   *  supermercado (`off`) o un alimento del catálogo por 100 g (`catalogo`). */
  tipo?: 'off' | 'catalogo';
  /** Código de barras, solo en `off`. */
  codigo?: string;
  marca?: string;
}

export const claveDeProducto = (codigo: string) => `off:${codigo}`;
export const claveDeCatalogo = (id: string) => `cat:${id}`;

/** Qué es una línea del registro. El banco y el catálogo por 100 g comparten
 *  `origen.tipo: 'catalogo'`; los distingue que el catálogo congela `nutrientes`
 *  y el banco no. «Añadido rápido» (`personal/rapido`) no tiene a qué volver. */
function claveYTipo(item: DietItem): Pick<AlimentoUsado, 'clave' | 'tipo' | 'codigo'> | null {
  const o = item.origen;
  if (o?.tipo === 'off' && o.codigo) return { clave: claveDeProducto(o.codigo), tipo: 'off', codigo: o.codigo };
  if (o?.tipo === 'personal' && o.id === 'rapido') return null;
  if (o?.tipo === 'catalogo' && o.id && item.nutrientes !== undefined) return { clave: claveDeCatalogo(o.id), tipo: 'catalogo' };
  return { clave: o?.id ?? item.foodLabel };
}

export interface UsadosDelAtleta {
  recientes: AlimentoUsado[];
  frecuentes: AlimentoUsado[];
}

const LIMITE = 8;

/** Gramos que comió en esta línea, si el registro los guarda o se pueden derivar. */
function gramosDe(item: DietItem): number | undefined {
  if (item.gramos && item.gramos > 0) return Math.round(item.gramos);
  if (item.baseGrams && item.baseGrams > 0 && item.quantity > 0) return Math.round(item.baseGrams * item.quantity);
  return undefined;
}

export function alimentosUsados(logs: DietCompletionLog[]): UsadosDelAtleta {
  const porClave = new Map<string, AlimentoUsado>();

  for (const log of logs) {
    const hechos = new Set(log.doneItemIds ?? []);
    for (const meal of log.meals ?? []) {
      (meal.items ?? []).forEach((item, idx) => {
        if (!hechos.has(`${meal.id}_${idx}`)) return;
        if (item.originRecipeId || item.origen?.tipo === 'receta') return;
        // Continuación de un producto: sin `gramos` y enlazada a otra línea.
        if (item.lineaId && item.gramos == null && item.nutrientes === undefined) return;
        const que = claveYTipo(item);
        if (!que) return;
        const { clave } = que;
        const actual = porClave.get(clave);
        const gramos = gramosDe(item);
        if (!actual) {
          porClave.set(clave, {
            ...que, label: item.foodLabel, veces: 1, ultimo: log.date,
            ...(gramos ? { gramos } : {}), ...(item.marca ? { marca: item.marca } : {}),
          });
          return;
        }
        actual.veces++;
        if (log.date >= actual.ultimo) {
          actual.ultimo = log.date;
          actual.label = item.foodLabel;
          if (item.marca) actual.marca = item.marca;
          if (gramos) actual.gramos = gramos;
        }
      });
    }
  }

  const todos = [...porClave.values()];
  const recientes = [...todos]
    .sort((a, b) => b.ultimo.localeCompare(a.ultimo) || b.veces - a.veces)
    .slice(0, LIMITE);
  // Frecuente = lo repetido en 2 o más días distintos... aquí basta con 2 veces.
  const frecuentes = todos
    .filter(a => a.veces >= 2)
    .sort((a, b) => b.veces - a.veces || b.ultimo.localeCompare(a.ultimo))
    .slice(0, LIMITE)
    .filter(a => !recientes.some(r => r.clave === a.clave));
  return { recientes, frecuentes };
}
