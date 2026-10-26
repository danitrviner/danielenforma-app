import type { DietMode, FoodCategory, Macros, MealItem } from '../types';
import { parseBaseGrams } from './conversionNutricional';
import { foodNameWithoutGrams } from './exchangeHelpers';
import { macrosDeIntercambios } from './macrosLegado';
import { escalarMacros, redondearMacros } from './macros';

/* ═══════════════════════════════════════════════════════════════════════════
   «Alimentos generales»: el banco de 310 alimentos en kcal y gramos (10-2026)

   El banco (`SYSTEM_FOODS`, nutricion_seed_en_forma.ts) se escribió como
   raciones de UN intercambio: «30g arroz, pasta, couscous o quinoa». Aquí cada
   entrada se lee como un alimento normal: su nombre, su ración por defecto (esos
   30 g, o «1 patata mediana» en «sin pesar») y sus kcal y macros, por ración y
   por 100 g. Las cifras salen de las equivalencias de siempre (macrosLegado),
   así que un día apuntado antes y ahora suma lo mismo.

   No se reescribe el banco en Firestore: esto es una lectura, y vale también
   para las copias ya guardadas en `foodItems`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type GrupoGeneral = 'hidratos' | 'proteinas' | 'grasas' | 'mixtos';

export const GRUPOS_GENERALES: { id: GrupoGeneral; titulo: string }[] = [
  { id: 'hidratos', titulo: 'Hidratos' },
  { id: 'proteinas', titulo: 'Proteínas' },
  { id: 'grasas', titulo: 'Grasas' },
  { id: 'mixtos', titulo: 'Mixtos' },
];

const GRUPO_DE: Record<FoodCategory, GrupoGeneral> = {
  HC: 'hidratos', PROT: 'proteinas', GRASA: 'grasas', MIX_HC: 'mixtos', MIX_GRASA: 'mixtos',
};

export interface AlimentoGeneral {
  food: MealItem;
  nombre: string;
  grupo: GrupoGeneral;
  /** Gramos de la ración por defecto; null en «sin pesar» (medidas caseras). */
  gramosRacion: number | null;
  /** Cómo se dice la ración: «30 g» o «1 patata mediana del tamaño de un puño». */
  racion: string;
  /** kcal y macros de esa ración. */
  porRacion: Macros;
  /** kcal y macros por 100 g; null si la ración no va en gramos. */
  porCien: Macros | null;
}

/** «Patata → 1 patata mediana…»: nombre y medida casera de «sin pesar». */
function partirMedidaCasera(label: string): { nombre: string; medida: string } | null {
  const i = label.indexOf('→');
  if (i < 0) return null;
  return { nombre: label.slice(0, i).trim(), medida: label.slice(i + 1).trim() };
}

const conMayuscula = (t: string) => t.charAt(0).toLocaleUpperCase('es-ES') + t.slice(1);

export function alimentoGeneral(food: MealItem): AlimentoGeneral {
  const porRacion = redondearMacros(macrosDeIntercambios({ [food.category]: 1 }));
  const casera = partirMedidaCasera(food.label);
  const gramos = food.gramosPorIntercambio && food.gramosPorIntercambio > 0
    ? food.gramosPorIntercambio
    : (casera ? null : parseBaseGrams(food.label));
  // «10g (1 cuchara) aceite de oliva»: la medida entre paréntesis del principio
  // es parte de la ración, no del nombre.
  let nombre = casera ? casera.nombre : foodNameWithoutGrams(food.label);
  let medida: string | null = null;
  const parentesis = nombre.match(/^\(([^)]+)\)\s*(.+)$/);
  if (parentesis) { medida = parentesis[1]; nombre = parentesis[2]; }
  nombre = conMayuscula(nombre);
  const enGramos = gramos ? `${Math.round(gramos)} g` : null;
  return {
    food,
    nombre,
    grupo: GRUPO_DE[food.category],
    gramosRacion: gramos,
    racion: casera ? casera.medida : [enGramos, medida].filter(Boolean).join(' · ') || '1 ración',
    porRacion,
    porCien: gramos ? redondearMacros(escalarMacros(porRacion, 100 / gramos)) : null,
  };
}

/** Los alimentos generales de un modo de dieta, por grupo y en orden alfabético. */
export function alimentosGeneralesPorGrupo(
  foods: MealItem[],
  modo: DietMode,
): { grupo: GrupoGeneral; titulo: string; alimentos: AlimentoGeneral[] }[] {
  const delModo = foods.filter(f => !f.personal && f.mode === modo).map(alimentoGeneral);
  return GRUPOS_GENERALES
    .map(g => ({
      grupo: g.id,
      titulo: g.titulo,
      alimentos: delModo.filter(a => a.grupo === g.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .filter(g => g.alimentos.length > 0);
}
