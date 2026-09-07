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

// ─── Condiciones de salud del atleta ────────────────────────────────────────
//
// El agujero que cierra esto (07-09-2026): un atleta celíaco recibía recetas
// con seitán. El dato estaba bien —las 46 recetas con seitán llevan el código
// 66— pero NADIE lo cruzaba: el único filtro por comida era la lista de
// alergias en texto libre del alta, comparada como subcadena contra el nombre
// de cada ingrediente. "gluten" no aparece en el nombre "Seitán", así que la
// receta pasaba el filtro. Lo mismo valía para lactosa, fructosa e histamina.
//
// Las condiciones se guardan como códigos en `OnboardingData.healthConditions`
// y filtran DURO en el generador de menús, en el buscador de alternativas y en
// el recetario.

/** Condiciones que el atleta puede marcar en el alta, con su código de recetario.
 *  Solo las que tienen un significado clínico o religioso claro: los códigos de
 *  régimen alimentario (vegano, vegetariano, sin carne…) ya los cubre `dietType`
 *  y duplicarlos aquí solo crearía dos fuentes de verdad que se contradicen. */
export const HEALTH_CONDITIONS: { code: DietaryRestrictionCode; label: string; help?: string }[] = [
  { code: 66,  label: 'Celiaquía',                 help: 'Sin gluten: fuera trigo, cebada, centeno y seitán.' },
  { code: 87,  label: 'Intolerancia a la lactosa' },
  { code: 113, label: 'Intolerancia leve a la lactosa', help: 'Tolera pequeñas cantidades.' },
  { code: 86,  label: 'Intolerancia a la fructosa',     help: 'Deja muy pocas recetas disponibles.' },
  { code: 114, label: 'Intolerancia leve a la fructosa' },
  { code: 89,  label: 'Intolerancia a la histamina' },
  { code: 92,  label: 'Colesterol alto' },
  { code: 109, label: 'Embarazo' },
  { code: 110, label: 'Lactancia' },
  { code: 60,  label: 'Sin cerdo ni alcohol',      help: 'Dieta halal.' },
];

const HEALTH_CONDITION_CODES = new Set<number>(HEALTH_CONDITIONS.map(c => c.code));

/** True si `code` es una de las condiciones que el atleta puede marcar. */
export function isHealthCondition(code: number): code is DietaryRestrictionCode {
  return HEALTH_CONDITION_CODES.has(code);
}

// Lo que los atletas ya dados de alta escribieron a mano en "Alergias o
// intolerancias". Ninguno de ellos va a volver a rellenar el alta, así que sin
// esta traducción el arreglo solo serviría para los que entren a partir de hoy.
// Se busca la palabra dentro del texto normalizado, así que "soy celíaco" o
// "intolerancia a la lactosa" también casan.
const TEXTO_A_CONDICION: { needles: string[]; code: DietaryRestrictionCode; leve?: DietaryRestrictionCode }[] = [
  { needles: ['celiac', 'celiaqu', 'gluten', 'seitan', 'trigo'], code: 66 },
  { needles: ['lactosa', 'lacteo', 'lacteos'],                   code: 87,  leve: 113 },
  { needles: ['fructosa'],                                       code: 86,  leve: 114 },
  { needles: ['histamina'],                                      code: 89 },
];

/**
 * Códigos de condición deducidos del texto libre de alergias del alta.
 *
 * Solo AÑADE seguridad: lo que se deduce se suma a lo que el atleta marcó
 * explícitamente, nunca lo sustituye. Ante la duda tira por la versión estricta
 * (lactosa total, no leve) salvo que el propio texto diga "leve".
 */
export function conditionCodesFromText(textos: readonly string[] | undefined): DietaryRestrictionCode[] {
  if (!textos || textos.length === 0) return [];
  const out = new Set<DietaryRestrictionCode>();
  // Entrada por entrada, no sobre el texto entero: "intolerancia leve a la
  // fructosa, lactosa" son dos cosas distintas y el "leve" es solo de la
  // primera. Uniendo el texto, ese "leve" suavizaba también la lactosa.
  for (const texto of textos) {
    const norm = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const leveAqui = norm.includes('leve');
    for (const { needles, code, leve } of TEXTO_A_CONDICION) {
      if (!needles.some(n => norm.includes(n))) continue;
      out.add(leve && leveAqui ? leve : code);
    }
  }
  return [...out];
}

/** Forma mínima de receta que necesita el filtro. Evita importar el tipo
 *  completo (y con él media app) en un módulo que es solo una tabla. */
interface RecetaConRestricciones {
  restrictions?: number[];
}

/**
 * Filtro DURO por condición de salud: ¿esta receta es incompatible con alguna
 * de las condiciones del atleta?
 *
 * Una receta SIN el campo `restrictions` se considera incompatible en cuanto el
 * atleta tiene alguna condición. No es un dato que falte y ya: es un dato que
 * nadie ha verificado, y con una celiaquía de por medio "no lo sé" y "no es
 * apta" tienen que tratarse igual. Son 149 de las 8.850 recetas importadas, más
 * las que construya el coach a mano — que el coach puede seguir poniendo él
 * mismo en el plan, esto solo decide lo que la app propone sola.
 */
export function violatesHealthConditions(
  recipe: RecetaConRestricciones,
  conditions: readonly number[] | undefined,
): boolean {
  if (!conditions || conditions.length === 0) return false;
  const r = recipe.restrictions;
  if (!r || r.length === 0) return true;
  return conditions.some(c => r.includes(c));
}

/**
 * Las condiciones que hay que aplicarle a un atleta: las que marcó en el alta
 * MÁS las que se deducen de lo que escribió en "Alergias o intolerancias".
 *
 * Un único sitio donde se decide esto, porque hay cuatro pantallas que arman
 * las preferencias por su cuenta (menú semanal, nutrición, editor del coach y
 * recetario) y en la anterior ronda de filtros ya pasó que cada una aplicara un
 * subconjunto distinto.
 */
export function athleteConditions(onboarding: {
  healthConditions?: readonly number[];
  allergies?: readonly string[];
} | null | undefined): DietaryRestrictionCode[] {
  if (!onboarding) return [];
  const out = new Set<DietaryRestrictionCode>();
  for (const c of onboarding.healthConditions ?? []) {
    if (isHealthCondition(c)) out.add(c);
  }
  for (const c of conditionCodesFromText(onboarding.allergies)) out.add(c);
  return [...out];
}
