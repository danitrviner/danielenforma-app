/**
 * Documento de Firestore de una receta del recetario a partir de su JSON de
 * `public/recetas/`. Lo comparten `importRecetas.mjs` (las 8.850) e
 * `importarBasicas.mjs` (solo las básicas), para que un mismo JSON produzca
 * siempre el mismo documento lo importe quien lo importe.
 */
import { exchangesFromMacros } from './redondeoIntercambios.mjs';

// ── Exchange calculation ──────────────────────────────────────────────────────

// Antes esto solo redondeaba a cuartos, y salían 1.210 desgloses HC/PROT/GRASA
// distintos para solo 44 totales: dos recetas de las mismas calorías casi nunca
// coincidían en reparto, así que el buscador de alternativas las trataba como
// recetas distintas. Ahora `exchangesFromMacros` redondea además a enteros
// manteniendo el total dentro de ±0,25 intercambios (≈25 kcal), que es lo único
// que el atleta nota. Ver scripts/lib/redondeoIntercambios.mjs.
export function computeExchanges(macros) {
  return exchangesFromMacros(macros ? {
    carb: macros.carbohydrate?.grams ?? 0,
    prot: macros.protein?.grams      ?? 0,
    fat:  macros.fat?.grams          ?? 0,
  } : null);
}

// ── Recetas recipe → Firestore doc ─────────────────────────────────────────────

export function mapRecipe(r) {
  const data = {
    ownerId:         'recetas',
    name:            r.name,
    // Legacy required arrays kept empty so existing RecipesScreen code doesn't break
    categories:      r.categoria ? [r.categoria] : [],
    ingredients:     [],
    extras:          [],
    steps:           [],
    // Recetas-specific fields
    image:           r.image           ?? null,
    ingredientsText: (r.ingredients    ?? []).map(i => ({ name: i.name, quantity: i.quantity })),
    // `items` es la lista que cuelga de cada paso ("Coloca en un bol y mezcla
    // bien:" → "El queso batido", "El cacao en polvo"). Se perdía aquí: 32.408
    // líneas de instrucciones en 6.308 recetas quedaban en un enunciado suelto.
    stepsText:       (r.steps          ?? []).map(s => ({
      position: s.position,
      description: s.description,
      items: (s.items ?? []).map(i => ({ position: i.position, description: i.description })),
    })),
    macros: r.macros ? {
      carb: r.macros.carbohydrate?.grams ?? 0,
      prot: r.macros.protein?.grams      ?? 0,
      fat:  r.macros.fat?.grams          ?? 0,
    } : null,
    kcal:        r.kcal        ?? null,
    weight:      r.weight      ?? null,
    cookingTime: r.cookingTime ?? null,
    difficulty:  r.difficulty  ?? null,
    tupper:      r.tupper      ?? null,
    intakeTypes: r.intakeTypes ?? [],
    categoria:   r.categoria   ?? null,
    exchanges:   computeExchanges(r.macros),
    // Códigos de régimen/patología para los que la receta NO es apta (vegano,
    // celiaquía, embarazo…). El script original los descartaba; ver
    // src/utils/dietaryRestrictions.ts para la leyenda y cómo se usan.
    restrictions: r.forbiddenFor ?? [],
    // Plato de «supervivencia»: rápido, pocos ingredientes, de supermercado.
    // Lo marca la pestaña Básicas del recetario (ver public/recetas/basicas_existentes.json
    // para las del recetario original que también lo son).
    basica:      r.basica === true ? true : null,
  };

  // Strip nulls for clean Firestore docs
  for (const key of Object.keys(data)) {
    if (data[key] === null) delete data[key];
  }

  return data;
}

