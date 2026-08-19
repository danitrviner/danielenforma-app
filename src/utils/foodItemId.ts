import { slugify } from './maquinaId';
import { DietMode, FoodCategory } from '../types';

// T14 (18-08). Mismo problema y misma cura que maquinaId.ts: `foodItems` se
// sembraba con `addDoc` (ID automático) tras una guarda que solo mira "¿está
// vacía la colección?", sin transacción. Dos cargas concurrentes (dos
// pantallas abriendo Nutrición a la vez, o un recargar a mitad de las 310
// escrituras) leen ambas "vacía" y siembran las dos → 620 documentos
// duplicados. Con un ID determinista, la segunda siembra sobreescribe en vez
// de duplicar — sembrar pasa a ser idempotente.
export function idDeFoodItem(f: { mode: DietMode; category: FoodCategory; label: string }): string {
  return `sys_${f.mode}_${f.category}_${slugify(f.label)}`;
}
