// ============================================================================
// EN FORMA — Estimación de micronutrientes para el sistema de intercambios
// ----------------------------------------------------------------------------
// El banco de alimentos sólo guarda etiquetas de texto ("150g patata…") y la
// dieta se mide en INTERCAMBIOS, no en gramos reales. Aquí modelamos un
// ESTIMADO de micronutrientes:
//
//   • CANONICAL_FOODS: ~60 alimentos canónicos con gramos por 1 intercambio y
//     los micronutrientes por 100 g de los que ese alimento es fuente relevante
//     (valores de referencia estilo BEDCA / USDA FoodData Central; sólo se
//     especifican los micros notables — el resto se considera despreciable).
//   • matchCanonical(label): mapea una etiqueta del banco a un alimento canónico.
//
// Es una ESTIMACIÓN (porciones tipo + asunción de verduras libres), pensada como
// semáforo de posibles déficits/excesos, no como analítica de laboratorio.
// ============================================================================

export type MicroKey =
  | 'fibra' | 'sodio' | 'potasio' | 'calcio' | 'hierro' | 'magnesio' | 'zinc'
  | 'vitA' | 'vitC' | 'vitD' | 'vitB12' | 'folato' | 'omega3';

export const MICRO_KEYS: MicroKey[] = [
  'fibra', 'sodio', 'potasio', 'calcio', 'hierro', 'magnesio', 'zinc',
  'vitA', 'vitC', 'vitD', 'vitB12', 'folato', 'omega3',
];

export interface MicroMeta {
  label: string;
  unit: string;
  rdaMale: number;    // ingesta de referencia diaria (adulto), EFSA/España aprox.
  rdaFemale: number;
  limit?: boolean;    // true = nutriente a LIMITAR (sodio): el objetivo es no pasarse
}

export const MICRO_META: Record<MicroKey, MicroMeta> = {
  fibra:   { label: 'Fibra',        unit: 'g',  rdaMale: 30,   rdaFemale: 25 },
  sodio:   { label: 'Sodio',        unit: 'mg', rdaMale: 2000, rdaFemale: 2000, limit: true },
  potasio: { label: 'Potasio',      unit: 'mg', rdaMale: 3500, rdaFemale: 3500 },
  calcio:  { label: 'Calcio',       unit: 'mg', rdaMale: 1000, rdaFemale: 1000 },
  hierro:  { label: 'Hierro',       unit: 'mg', rdaMale: 9,    rdaFemale: 18 },
  magnesio:{ label: 'Magnesio',     unit: 'mg', rdaMale: 350,  rdaFemale: 300 },
  zinc:    { label: 'Zinc',         unit: 'mg', rdaMale: 11,   rdaFemale: 8 },
  vitA:    { label: 'Vitamina A',   unit: 'µg', rdaMale: 900,  rdaFemale: 700 },
  vitC:    { label: 'Vitamina C',   unit: 'mg', rdaMale: 90,   rdaFemale: 80 },
  vitD:    { label: 'Vitamina D',   unit: 'µg', rdaMale: 15,   rdaFemale: 15 },
  vitB12:  { label: 'Vitamina B12', unit: 'µg', rdaMale: 4,    rdaFemale: 4 },
  folato:  { label: 'Folato',       unit: 'µg', rdaMale: 330,  rdaFemale: 330 },
  omega3:  { label: 'Omega-3',      unit: 'g',  rdaMale: 1.6,  rdaFemale: 1.1 },
};

export interface CanonicalFood {
  id: string;
  keywords: string[];       // matched against the normalized label (first match wins)
  gramsPerExchange: number; // grams (or ml) that make up 1 exchange of this food
  per100g: Partial<Record<MicroKey, number>>; // only the micros this food meaningfully provides
}

// Perfil de 1 ración de verdura mixta (~100 g) — usado como línea base porque las
// verduras son "libres" en intercambios y no se registran, pero aportan casi todos
// los micros. Valores por 100 g de verdura mixta cocida/fresca.
export const VEG_SERVING_PER100: Partial<Record<MicroKey, number>> = {
  fibra: 2.6, potasio: 260, calcio: 45, hierro: 1.0, magnesio: 22,
  zinc: 0.4, vitA: 210, vitC: 32, folato: 55, sodio: 25, omega3: 0.05,
};
export const VEG_SERVING_GRAMS = 100;

// ── Verduras concretas ─────────────────────────────────────────────────────────
// Perfiles por 100 g de las verduras más habituales (BEDCA/USDA aprox.). Cuando
// el atleta marca cuáles suele comer, la línea base de verdura usa la MEDIA de
// sus perfiles en lugar del perfil mixto genérico de arriba — así la estimación
// refleja, p. ej., que quien vive de espinacas va sobrado de folato/hierro y
// quien solo come pepino no.
export interface VegetableProfile {
  id: string;
  label: string;
  per100g: Partial<Record<MicroKey, number>>;
}

export const VEGETABLES: VegetableProfile[] = [
  { id: 'brocoli',      label: 'Brócoli',       per100g: { fibra: 2.6, potasio: 316, calcio: 47,  hierro: 0.7, magnesio: 21, zinc: 0.4, vitA: 31,  vitC: 89, folato: 63,  sodio: 33 } },
  { id: 'espinacas',    label: 'Espinacas',     per100g: { fibra: 2.2, potasio: 558, calcio: 99,  hierro: 2.7, magnesio: 79, zinc: 0.5, vitA: 469, vitC: 28, folato: 194, sodio: 79, omega3: 0.14 } },
  { id: 'acelgas',      label: 'Acelgas',       per100g: { fibra: 1.6, potasio: 379, calcio: 51,  hierro: 1.8, magnesio: 81, zinc: 0.4, vitA: 306, vitC: 30, folato: 14,  sodio: 213 } },
  { id: 'kale',         label: 'Kale',          per100g: { fibra: 4.1, potasio: 348, calcio: 254, hierro: 1.6, magnesio: 33, zinc: 0.4, vitA: 241, vitC: 93, folato: 62,  sodio: 53 } },
  { id: 'pimiento',     label: 'Pimiento',      per100g: { fibra: 2.1, potasio: 211, calcio: 7,   hierro: 0.4, magnesio: 12, zinc: 0.3, vitA: 157, vitC: 128, folato: 46, sodio: 4 } },
  { id: 'tomate',       label: 'Tomate',        per100g: { fibra: 1.2, potasio: 237, calcio: 10,  hierro: 0.3, magnesio: 11, zinc: 0.2, vitA: 42,  vitC: 14, folato: 15,  sodio: 5 } },
  { id: 'zanahoria',    label: 'Zanahoria',     per100g: { fibra: 2.8, potasio: 320, calcio: 33,  hierro: 0.3, magnesio: 12, zinc: 0.2, vitA: 835, vitC: 6,  folato: 19,  sodio: 69 } },
  { id: 'calabacin',    label: 'Calabacín',     per100g: { fibra: 1.0, potasio: 261, calcio: 16,  hierro: 0.4, magnesio: 18, zinc: 0.3, vitA: 10,  vitC: 18, folato: 24,  sodio: 8 } },
  { id: 'coliflor',     label: 'Coliflor',      per100g: { fibra: 2.0, potasio: 299, calcio: 22,  hierro: 0.4, magnesio: 15, zinc: 0.3, vitC: 48, folato: 57,  sodio: 30 } },
  { id: 'judias_verdes',label: 'Judías verdes', per100g: { fibra: 2.7, potasio: 211, calcio: 37,  hierro: 1.0, magnesio: 25, zinc: 0.2, vitA: 35,  vitC: 12, folato: 33,  sodio: 6 } },
  { id: 'lechuga',      label: 'Lechuga',       per100g: { fibra: 1.3, potasio: 194, calcio: 36,  hierro: 0.9, magnesio: 13, zinc: 0.2, vitA: 370, vitC: 9,  folato: 38,  sodio: 28 } },
  { id: 'cebolla',      label: 'Cebolla',       per100g: { fibra: 1.7, potasio: 146, calcio: 23,  hierro: 0.2, magnesio: 10, zinc: 0.2, vitC: 7,  folato: 19,  sodio: 4 } },
  { id: 'champinones',  label: 'Champiñones',   per100g: { fibra: 1.0, potasio: 318, calcio: 3,   hierro: 0.5, magnesio: 9,  zinc: 0.5, vitC: 2,  folato: 17,  sodio: 5, vitD: 0.2 } },
  { id: 'berenjena',    label: 'Berenjena',     per100g: { fibra: 3.0, potasio: 229, calcio: 9,   hierro: 0.2, magnesio: 14, zinc: 0.2, vitA: 1,   vitC: 2,  folato: 22,  sodio: 2 } },
  { id: 'esparragos',   label: 'Espárragos',    per100g: { fibra: 2.1, potasio: 202, calcio: 24,  hierro: 2.1, magnesio: 14, zinc: 0.5, vitA: 38,  vitC: 6,  folato: 52,  sodio: 2 } },
  { id: 'col',          label: 'Col / repollo', per100g: { fibra: 2.5, potasio: 170, calcio: 40,  hierro: 0.5, magnesio: 12, zinc: 0.2, vitA: 5,   vitC: 37, folato: 43,  sodio: 18 } },
  { id: 'pepino',       label: 'Pepino',        per100g: { fibra: 0.5, potasio: 147, calcio: 16,  hierro: 0.3, magnesio: 13, zinc: 0.2, vitA: 5,   vitC: 3,  folato: 7,   sodio: 2 } },
];

// ── Canonical foods ────────────────────────────────────────────────────────────
// per100g: valores aproximados de referencia (BEDCA/USDA). Sólo micros notables.
export const CANONICAL_FOODS: CanonicalFood[] = [
  // ── Hidratos ──
  { id: 'patata',        keywords: ['patata'],                       gramsPerExchange: 150, per100g: { potasio: 420, vitC: 13, fibra: 1.8, magnesio: 23 } },
  { id: 'boniato',       keywords: ['boniato'],                      gramsPerExchange: 120, per100g: { potasio: 340, vitA: 700, fibra: 3.0, vitC: 12 } },
  { id: 'yuca',          keywords: ['yuca'],                         gramsPerExchange: 60,  per100g: { potasio: 270, vitC: 20, fibra: 1.8 } },
  { id: 'arroz_pasta',   keywords: ['arroz', 'pasta', 'couscous', 'cuscus', 'quinoa', 'vasito de arroz'], gramsPerExchange: 30, per100g: { fibra: 1.4, magnesio: 25, potasio: 90, hierro: 1.2 } },
  { id: 'harina',        keywords: ['harinas', 'papilla de cereales'], gramsPerExchange: 30, per100g: { fibra: 2.7, hierro: 1.2, magnesio: 22 } },
  { id: 'cereales',      keywords: ['cereales', 'corn flakes', 'muesli', 'copos'], gramsPerExchange: 30, per100g: { fibra: 7, hierro: 8, folato: 150, magnesio: 60 } },
  { id: 'pan',           keywords: ['pan'],                          gramsPerExchange: 40,  per100g: { fibra: 4, sodio: 450, hierro: 2.5, magnesio: 40 } },
  { id: 'gnocchi',       keywords: ['gnocchi'],                      gramsPerExchange: 60,  per100g: { fibra: 1.2, sodio: 300, potasio: 90 } },
  { id: 'tortitas_arroz',keywords: ['tortitas de arroz', 'tortitas'], gramsPerExchange: 25, per100g: { fibra: 4.2, magnesio: 30 } },
  { id: 'tortilla_trigo',keywords: ['tortillas para fajitas', 'tortillas tipo wrap', 'base para pizza'], gramsPerExchange: 38, per100g: { fibra: 3, sodio: 500, hierro: 2 } },
  { id: 'azucar',        keywords: ['azúcar', 'dextrosa', 'amilopectina', 'ciclodextrina'], gramsPerExchange: 25, per100g: {} },
  { id: 'mermelada',     keywords: ['mermelada'],                    gramsPerExchange: 40,  per100g: { vitC: 3 } },
  { id: 'miel',          keywords: ['miel'],                         gramsPerExchange: 30,  per100g: { potasio: 52 } },
  { id: 'fruta_deshidratada', keywords: ['frutas deshidratadas', 'pasas', 'ciruelas'], gramsPerExchange: 30, per100g: { fibra: 6, potasio: 700, hierro: 2, magnesio: 40 } },
  { id: 'datiles',       keywords: ['dátiles'],                      gramsPerExchange: 35,  per100g: { fibra: 7, potasio: 660, magnesio: 43 } },
  { id: 'castanas',      keywords: ['castañas'],                     gramsPerExchange: 50,  per100g: { fibra: 5, potasio: 500, vitC: 26, magnesio: 30 } },
  { id: 'maiz_palomitas',keywords: ['maíz para palomitas', 'palomitas'], gramsPerExchange: 30, per100g: { fibra: 7, magnesio: 90 } },
  { id: 'maiz_lata',     keywords: ['maíz en lata'],                 gramsPerExchange: 130, per100g: { fibra: 2.4, sodio: 250, potasio: 180 } },
  { id: 'guisantes',     keywords: ['guisantes'],                    gramsPerExchange: 130, per100g: { fibra: 5, vitC: 12, folato: 65, potasio: 240 } },
  { id: 'legumbre_cocida',keywords: ['legumbre cocida'],             gramsPerExchange: 100, per100g: { fibra: 7, hierro: 2.5, potasio: 360, magnesio: 45, folato: 120, zinc: 1.3 } },
  { id: 'legumbre_seca', keywords: ['legumbre en seco', 'pasta de legumbre'], gramsPerExchange: 30, per100g: { fibra: 16, hierro: 6, potasio: 900, magnesio: 110, folato: 300, zinc: 3.5 } },

  // ── Frutas (HC) ──
  { id: 'melon_sandia',  keywords: ['melón', 'sandía'],              gramsPerExchange: 300, per100g: { vitC: 15, potasio: 160, vitA: 90 } },
  { id: 'melocoton',     keywords: ['paraguayo', 'melocotón'],       gramsPerExchange: 230, per100g: { vitC: 6, potasio: 190, fibra: 1.5 } },
  { id: 'frutos_rojos',  keywords: ['frutos rojos', 'arándanos', 'fresas', 'cerezas'], gramsPerExchange: 200, per100g: { vitC: 30, fibra: 2.5, potasio: 120 } },
  { id: 'ciruela',       keywords: ['ciruela'],                      gramsPerExchange: 200, per100g: { vitC: 9, fibra: 1.4, potasio: 157 } },
  { id: 'pina',          keywords: ['piña'],                         gramsPerExchange: 200, per100g: { vitC: 48, potasio: 110, fibra: 1.4 } },
  { id: 'platano',       keywords: ['plátano'],                      gramsPerExchange: 100, per100g: { potasio: 360, vitC: 9, fibra: 2.6, magnesio: 27 } },
  { id: 'manzana_pera',  keywords: ['manzana', 'pera'],              gramsPerExchange: 150, per100g: { fibra: 2.4, vitC: 5, potasio: 110 } },
  { id: 'citrico',       keywords: ['mandarina', 'kiwi', 'naranja'], gramsPerExchange: 130, per100g: { vitC: 50, potasio: 180, folato: 30 } },
  { id: 'uvas',          keywords: ['uvas'],                         gramsPerExchange: 150, per100g: { vitC: 4, potasio: 190, fibra: 0.9 } },
  { id: 'caqui',         keywords: ['caquis', 'caqui'],              gramsPerExchange: 150, per100g: { vitC: 16, vitA: 80, fibra: 3.6, potasio: 160 } },
  { id: 'mango',         keywords: ['mango'],                        gramsPerExchange: 150, per100g: { vitC: 36, vitA: 54, fibra: 1.6 } },
  { id: 'zumo',          keywords: ['zumo'],                         gramsPerExchange: 200, per100g: { vitC: 30, potasio: 150 } },

  // ── Proteínas ──
  { id: 'proteina_polvo',keywords: ['proteína en polvo'],            gramsPerExchange: 30,  per100g: { calcio: 300, potasio: 400, sodio: 250 } },
  { id: 'pescado_blanco',keywords: ['pescado blanco', 'merluza', 'bacalao', 'lubina'], gramsPerExchange: 120, per100g: { vitB12: 1.5, potasio: 400, magnesio: 30, sodio: 80, vitD: 1 } },
  { id: 'cefalopodo',    keywords: ['cefalópodos', 'pulpo', 'calamar', 'sepia'], gramsPerExchange: 120, per100g: { vitB12: 2, hierro: 1, sodio: 230, zinc: 1.5 } },
  { id: 'mejillones',    keywords: ['mejillones'],                   gramsPerExchange: 120, per100g: { vitB12: 12, hierro: 4, zinc: 1.6, sodio: 290, vitD: 1.5 } },
  { id: 'atun_natural',  keywords: ['atún claro al natural', 'atún en escabeche', 'atún al natural'], gramsPerExchange: 100, per100g: { vitB12: 4, vitD: 2, potasio: 250, sodio: 300, magnesio: 30 } },
  { id: 'pollo_pavo',    keywords: ['carne blanca', 'pollo', 'pavo'], gramsPerExchange: 100, per100g: { vitB12: 0.3, potasio: 330, magnesio: 25, zinc: 1, sodio: 70 } },
  { id: 'carne_roja_magra', keywords: ['carne roja magra'],         gramsPerExchange: 80,  per100g: { vitB12: 2.5, hierro: 2.6, zinc: 4.5, potasio: 330, sodio: 60 } },
  { id: 'higado',        keywords: ['hígado'],                       gramsPerExchange: 80,  per100g: { vitA: 6500, vitB12: 60, hierro: 6.5, folato: 290, zinc: 4, vitD: 1 } },
  { id: 'embutido',      keywords: ['lomo embuchado', 'jamón serrano'], gramsPerExchange: 50, per100g: { sodio: 1600, vitB12: 1, zinc: 2.5, hierro: 1.5 } },
  { id: 'soja_texturizada', keywords: ['soja texturizada'],         gramsPerExchange: 30,  per100g: { fibra: 18, hierro: 9, potasio: 2000, magnesio: 280, folato: 300, zinc: 4 } },
  { id: 'claras_huevo',  keywords: ['claras de huevo', 'claras'],    gramsPerExchange: 200, per100g: { potasio: 160, sodio: 170, vitB12: 0.1 } },
  { id: 'seitan',        keywords: ['seitán'],                       gramsPerExchange: 80,  per100g: { hierro: 1.5, sodio: 380, calcio: 40 } },
  { id: 'tofu',          keywords: ['tofu'],                         gramsPerExchange: 90,  per100g: { calcio: 200, hierro: 2.7, magnesio: 58, zinc: 0.8 } },
  { id: 'tempeh',        keywords: ['tempeh'],                       gramsPerExchange: 55,  per100g: { fibra: 5, hierro: 2.7, magnesio: 70, calcio: 110, zinc: 1.1 } },
  { id: 'heura_veg',     keywords: ['heura', 'beyond burger'],       gramsPerExchange: 65,  per100g: { hierro: 3, sodio: 400, fibra: 2, zinc: 2 } },
  { id: 'queso_batido',  keywords: ['queso fresco batido', 'queso cottage', 'requesón'], gramsPerExchange: 200, per100g: { calcio: 90, sodio: 300, vitB12: 0.6, potasio: 110 } },
  { id: 'queso_burgos',  keywords: ['queso fresco tipo burgos', 'burgos'], gramsPerExchange: 150, per100g: { calcio: 180, sodio: 320, vitB12: 0.7 } },
  { id: 'queso_curado',  keywords: ['queso (curado', 'curado, semicurado', 'semicurado'], gramsPerExchange: 30, per100g: { calcio: 700, sodio: 700, vitB12: 1.5, vitA: 270, zinc: 3 } },
  { id: 'mozzarella',    keywords: ['mozzarella light', 'feta light', 'mozzarella'], gramsPerExchange: 60, per100g: { calcio: 350, sodio: 380, vitB12: 0.7, zinc: 2 } },
  { id: 'carne_roja_grasa', keywords: ['carne roja grasa', 'cordero'], gramsPerExchange: 70, per100g: { vitB12: 2.5, hierro: 1.8, zinc: 4, potasio: 300, sodio: 70 } },
  { id: 'yogur_proteico',keywords: ['+proteínas', 'alto en proteínas', 'yopro', 'pastoret'], gramsPerExchange: 150, per100g: { calcio: 120, vitB12: 0.5, potasio: 180, sodio: 60 } },

  // ── Grasas ──
  { id: 'aceite',        keywords: ['aceite'],                       gramsPerExchange: 10,  per100g: { vitA: 0, omega3: 0.7 } },
  { id: 'aceitunas',     keywords: ['aceitunas'],                    gramsPerExchange: 60,  per100g: { sodio: 1500, fibra: 3, hierro: 3 } },
  { id: 'aguacate',      keywords: ['aguacate', 'guacamole'],        gramsPerExchange: 60,  per100g: { potasio: 485, fibra: 6.7, magnesio: 29, folato: 80, vitC: 10 } },
  { id: 'semillas',      keywords: ['pipas', 'semillas', 'girasol', 'lino', 'calabaza', 'chía', 'chia'], gramsPerExchange: 18, per100g: { fibra: 25, magnesio: 350, hierro: 6, zinc: 5, calcio: 250, omega3: 9 } },
  { id: 'frutos_secos',  keywords: ['frutos secos', 'crema de frutos secos', 'cacahuete', 'pistacho', 'almendra'], gramsPerExchange: 15, per100g: { fibra: 9, magnesio: 250, potasio: 700, calcio: 200, hierro: 3.5, zinc: 3, vitC: 0 } },
  { id: 'coco',          keywords: ['coco'],                         gramsPerExchange: 20,  per100g: { fibra: 9, potasio: 350, hierro: 2.4, magnesio: 32 } },
  { id: 'cacao',         keywords: ['cacao puro'],                   gramsPerExchange: 30,  per100g: { fibra: 33, magnesio: 500, hierro: 14, potasio: 1500, zinc: 6 } },
  { id: 'chocolate',     keywords: ['chocolate'],                    gramsPerExchange: 20,  per100g: { fibra: 11, magnesio: 230, hierro: 8, potasio: 700 } },
  { id: 'mantequilla',   keywords: ['mantequilla'],                  gramsPerExchange: 15,  per100g: { vitA: 680, vitD: 1.3 } },
  { id: 'margarina',     keywords: ['margarina'],                    gramsPerExchange: 20,  per100g: { vitA: 800, vitD: 7, sodio: 700 } },
  { id: 'nata',          keywords: ['nata'],                         gramsPerExchange: 40,  per100g: { calcio: 65, vitA: 350, sodio: 40 } },
  { id: 'mayonesa',      keywords: ['mayonesa'],                     gramsPerExchange: 15,  per100g: { sodio: 700, vitA: 40 } },
  { id: 'gazpacho_tomate',keywords: ['gazpacho', 'tomate frito'],    gramsPerExchange: 100, per100g: { vitC: 15, potasio: 230, sodio: 400, vitA: 40, fibra: 1.5 } },
  { id: 'pescado_azul',  keywords: ['pescado azul', 'salmón ahumado', 'sardinas en aceite', 'atún o sardinas', 'anchoas'], gramsPerExchange: 62, per100g: { omega3: 2.5, vitD: 10, vitB12: 8, potasio: 350, calcio: 50, sodio: 400 } },
  { id: 'calamar_tinta', keywords: ['calamares en su tinta'],        gramsPerExchange: 100, per100g: { vitB12: 2, hierro: 3, sodio: 500, zinc: 1.5 } },

  // ── Mixtos / lácteos / bebidas ──
  { id: 'huevo',         keywords: ['huevo grande', 'huevo'],        gramsPerExchange: 60,  per100g: { vitB12: 1.1, vitD: 2, vitA: 160, folato: 47, zinc: 1.3, hierro: 1.2, sodio: 140 } },
  { id: 'leche',         keywords: ['leche desnatada', 'leche semidesnatada', 'leche entera', 'leche'], gramsPerExchange: 250, per100g: { calcio: 120, vitB12: 0.5, potasio: 150, vitD: 0.5, magnesio: 11 } },
  { id: 'yogur_natural', keywords: ['yogur natural', 'yogurt natural', 'yogures naturales', 'yogur griego', 'yogurt griego', 'yogur natural azucarado', 'kéfir', 'kefir'], gramsPerExchange: 150, per100g: { calcio: 120, vitB12: 0.4, potasio: 155, magnesio: 12 } },
  { id: 'yogur_soja',    keywords: ['yogur de soja', 'yogurt de soja', 'yogurt mango'], gramsPerExchange: 175, per100g: { calcio: 120, potasio: 120, magnesio: 12 } },
  { id: 'bebida_vegetal',keywords: ['bebida de almendras', 'bebida de avena', 'bebida de arroz', 'bebida de soja', 'bebida de avellana', 'bebida vegetal'], gramsPerExchange: 250, per100g: { calcio: 120, vitD: 0.75, vitB12: 0.4 } },
  { id: 'levadura',      keywords: ['levadura de cerveza'],          gramsPerExchange: 30,  per100g: { fibra: 22, folato: 250, hierro: 5, zinc: 8, magnesio: 230, vitB12: 0.5 } },
];

// ── Matching ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const NORMALIZED = CANONICAL_FOODS.map(f => ({ food: f, keys: f.keywords.map(normalize) }));

// Labels follow "<qty><unit> <primary food name> (<descriptors...>)" or
// "<Primary food name> → <portion>" — the primary food name always leads.
// So the EARLIEST-occurring keyword wins (longest only breaks ties at the same
// position); this keeps "harina de almendra" → frutos_secos (via "almendra",
// the only match) while stopping a later descriptor from outranking the leading
// food name, e.g. "40g pan (...con o sin semillas...)" must resolve via "pan"
// (position ~4) rather than "semillas" (later, but longer).
export function matchCanonical(label: string): CanonicalFood | null {
  const n = normalize(label);
  let best: { food: CanonicalFood; pos: number; len: number } | null = null;
  for (const { food, keys } of NORMALIZED) {
    for (const k of keys) {
      const pos = n.indexOf(k);
      if (pos === -1) continue;
      if (!best || pos < best.pos || (pos === best.pos && k.length > best.len)) {
        best = { food, pos, len: k.length };
      }
    }
  }
  return best?.food ?? null;
}
