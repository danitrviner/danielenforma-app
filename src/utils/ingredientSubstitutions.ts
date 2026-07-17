import { normalizeStr } from './foodPrefs';

// Ingredient substitution for the menu viewer. The athlete can swap one
// ingredient of a recipe for a genuinely interchangeable one — same food type
// AND similar caloric density, so the meal's exchanges/kcal stay roughly the
// same. We deliberately use tight, curated clusters (NOT the broad anamnesis
// food groups): swapping whey protein → creatine, or water → oil, makes no
// sense and would blow up the calories, so those simply aren't offered.
//
// A food that isn't in any cluster has no substitutes (no swap button shown) —
// that's the safe default. Clusters are grouped so any swap within one keeps
// calories in a similar band; that's why oils, nut butters, cheeses, etc. each
// live in their own tight cluster rather than a catch-all "fats" bucket.

const SUBSTITUTION_CLUSTERS: string[][] = [
  // Bebidas de base (leches y bebidas vegetales)
  ['Leche', 'Leche entera', 'Leche semidesnatada', 'Leche desnatada', 'Bebida de soja', 'Bebida de avena', 'Bebida de almendras', 'Bebida de coco'],
  // Yogures y lácteos frescos (bajos en kcal)
  ['Yogur natural', 'Yogur griego', 'Yogur desnatado', 'Skyr', 'Kéfir', 'Queso batido', 'Queso fresco', 'Queso cottage', 'Requesón'],
  // Quesos curados / semicurados
  ['Mozzarella', 'Queso manchego', 'Queso parmesano', 'Queso feta', 'Queso curado'],
  // Copos y cereales de desayuno
  ['Avena', 'Copos de avena', 'Salvado de avena', 'Copos de espelta', 'Muesli', 'Corn flakes'],
  // Harinas
  ['Harina de avena', 'Harina de trigo', 'Harina integral', 'Harina de espelta'],
  // Arroces y granos
  ['Arroz blanco', 'Arroz integral', 'Quinoa', 'Cuscús', 'Bulgur', 'Farro', 'Mijo'],
  // Pastas
  ['Pasta', 'Espagueti', 'Macarrones', 'Fideos', 'Tallarines'],
  // Panes
  ['Pan integral', 'Pan blanco', 'Pan de centeno', 'Pan de molde', 'Pan pita', 'Tortita de arroz', 'Tortita de maíz'],
  // Tubérculos
  ['Patata', 'Boniato', 'Yuca', 'Ñame'],
  // Carnes magras y aves
  ['Pollo', 'Pechuga de pollo', 'Muslo de pollo', 'Pavo', 'Pechuga de pavo', 'Conejo', 'Lomo de cerdo', 'Solomillo', 'Filete de ternera', 'Ternera'],
  // Fiambres magros
  ['Jamón cocido', 'Jamón serrano', 'Lomo embuchado', 'Fiambre de pavo'],
  // Pescado blanco
  ['Merluza', 'Bacalao', 'Dorada', 'Lubina', 'Trucha', 'Lenguado', 'Rape', 'Gallo'],
  // Pescado azul
  ['Salmón', 'Atún', 'Caballa', 'Sardina', 'Boquerones', 'Anchoa'],
  // Marisco
  ['Gamba', 'Langostino', 'Mejillón', 'Calamar', 'Pulpo', 'Sepia'],
  // Huevos
  ['Huevo', 'Clara de huevo', 'Huevo de codorniz'],
  // Legumbres
  ['Lentejas', 'Garbanzos', 'Alubias', 'Judías blancas', 'Alubias rojas', 'Guisantes', 'Habas'],
  // Proteína vegetal
  ['Tofu', 'Tempeh', 'Soja texturizada', 'Seitán', 'Edamame'],
  // Frutas
  ['Manzana', 'Pera', 'Naranja', 'Mandarina', 'Plátano', 'Kiwi', 'Fresa', 'Uva', 'Melocotón', 'Nectarina', 'Albaricoque', 'Piña', 'Mango', 'Sandía', 'Melón', 'Cereza', 'Ciruela', 'Arándano', 'Frambuesa', 'Mora', 'Higo', 'Papaya', 'Pomelo'],
  // Frutos secos
  ['Almendra', 'Nueces', 'Nuez', 'Anacardo', 'Avellana', 'Pistacho', 'Cacahuete', 'Piñones'],
  // Semillas
  ['Semillas de chía', 'Semillas de lino', 'Semillas de girasol', 'Semillas de calabaza', 'Semillas de sésamo'],
  // Cremas de frutos secos
  ['Mantequilla de cacahuete', 'Mantequilla de almendras', 'Crema de cacahuete', 'Crema de almendras', 'Tahini'],
  // Aceites
  ['Aceite de oliva', 'Aceite de coco', 'Aceite de girasol'],
  // Grasas untables densas
  ['Mantequilla', 'Ghee'],
  // Proteína en polvo (NO incluye creatina/BCAA/colágeno: no son equivalentes)
  ['Proteína whey', 'Proteína de suero', 'Proteína vegana', 'Caseína', 'Proteína en polvo'],
  // Verduras (libres, intercambiables entre sí)
  ['Lechuga', 'Espinaca', 'Rúcula', 'Kale', 'Acelga', 'Col', 'Tomate', 'Pepino', 'Zanahoria', 'Apio', 'Cebolla', 'Puerro', 'Pimiento rojo', 'Pimiento verde', 'Pimiento amarillo', 'Brócoli', 'Coliflor', 'Calabacín', 'Berenjena', 'Champiñón', 'Seta', 'Alcachofa', 'Espárrago', 'Judía verde', 'Calabaza'],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word containment so "agua" doesn't match "aguacate" (substring), while
// "leche desnatada" still matches the "leche" entry and "copos de avena" the
// "avena" entry.
function hasWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(^|\\s)${escapeRegex(needle)}($|\\s)`).test(haystack);
}

// Same-cluster equivalents for an ingredient (excludes the matched food). Empty
// when the ingredient isn't recognized or isn't safely swappable. Uses the
// longest matching food name so "Harina de avena" resolves to the flours
// cluster, not the oat-flakes one.
export function substitutesFor(ingredientName: string, max = 8): string[] {
  const n = normalizeStr(ingredientName);
  if (!n) return [];

  let best: { cluster: string[]; food: string; len: number } | null = null;
  for (const cluster of SUBSTITUTION_CLUSTERS) {
    for (const food of cluster) {
      const nf = normalizeStr(food);
      if (hasWholeWord(n, nf) || hasWholeWord(nf, n)) {
        if (!best || nf.length > best.len) best = { cluster, food, len: nf.length };
      }
    }
  }
  if (!best) return [];
  const matchedNorm = normalizeStr(best.food);
  return best.cluster.filter(f => normalizeStr(f) !== matchedNorm).slice(0, max);
}
