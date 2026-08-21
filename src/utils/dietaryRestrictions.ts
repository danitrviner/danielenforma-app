// Leyenda de `Recipe.restrictions` — los códigos `forbiddenFor` del recetario
// original (INDYA/GET). El importador los descartaba sin querer al meter las
// 8.850 recetas en Firestore (ver importRecetas.mjs); esta es la traducción a
// texto, sacada de la documentación de su API que Dani ya tenía descargada
// (indya_clients_planifications_api.json → catalogs.forbiddenFor).
//
// Un código en `restrictions` significa "esta receta NO es apta para alguien
// con esta condición" — no es una lista de alérgenos por ingrediente, es de
// régimen/patología. Por eso no sustituye al filtro de alergias (que sigue
// leyendo el texto de los ingredientes): son dos cosas distintas.

export type DietaryRestrictionCode =
  | 55 | 56 | 59 | 60 | 66 | 67 | 68 | 86 | 87 | 89 | 92 | 109 | 110 | 112 | 113 | 114;

export const DIETARY_RESTRICTIONS: Record<DietaryRestrictionCode, string> = {
  55:  'Vegano estricto',
  56:  'Ovovegetariano',
  59:  'Anti-ultraprocesados',
  60:  'Musulmán',
  66:  'Celiaquía',
  67:  'Ovolactovegetariano',
  68:  'Lactovegetariano',
  86:  'Intolerancia total a la fructosa',
  87:  'Intolerancia total a la lactosa',
  89:  'Intolerancia a la histamina',
  92:  'Hipercolesterolemia',
  109: 'Embarazo',
  110: 'Lactancia',
  112: 'Sin carne',
  113: 'Intolerancia leve a la lactosa',
  114: 'Intolerancia leve a la fructosa',
};

export function restrictionLabel(code: number): string {
  return DIETARY_RESTRICTIONS[code as DietaryRestrictionCode] ?? `Restricción ${code}`;
}

// El único cruce que la app ya puede hacer hoy: `dietType` del atleta (que sí
// se recoge en el onboarding) contra el código de régimen equivalente del
// recetario. El resto de códigos (celiaquía, embarazo, intolerancias...) no
// tiene todavía un campo de onboarding que los recoja — quedan guardados en la
// receta, listos para usarse en cuanto exista ese campo, pero hoy no filtran
// nada por sí solos.
const DIET_TYPE_RESTRICTION: Partial<Record<string, DietaryRestrictionCode>> = {
  vegano: 55,
  vegetariano: 67,
};

/**
 * True si el `dietType` del atleta choca con el código de restricción
 * explícito del proveedor del recetario. Más fiable que adivinar por palabras
 * clave en el texto del ingrediente (ver `violatesDietType`), pero solo existe
 * para las recetas re-importadas después de que se recuperara este campo —
 * las anteriores no tienen `restrictions` y esta función no dice nada sobre
 * ellas (devuelve false).
 */
export function violatesRestrictions(restrictions: number[] | undefined, dietType: string | undefined): boolean {
  if (!restrictions || restrictions.length === 0 || !dietType) return false;
  const code = DIET_TYPE_RESTRICTION[dietType];
  return code != null && restrictions.includes(code);
}
