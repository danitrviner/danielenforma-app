/**
 * Catálogo de alimentos por 100 g SACADO DE LOS INTERCAMBIOS (decisión de Dani, 24-10).
 *
 * Cada intercambio son 100 kcal. Según la categoría, ese intercambio aporta:
 *   HC 25 g de hidratos · PROT 25 g de proteína · GRASA 11 g de grasa
 *   MIX_HC ½ y ½ (12,5 g proteína + 12,5 g hidratos) · MIX_GRASA 12,5 g proteína + 5,5 g grasa
 * Así que 100 g de un alimento = esos valores × 100 / gramos del intercambio.
 * Son cifras APROXIMADAS: un alimento de hidratos se queda sin proteína ni grasa,
 * igual que en el reparto por intercambios. Fibra, azúcares y sal no se saben.
 *
 * Solo lee la tabla de alimentos del código (`SYSTEM_FOODS`, modos con peso:
 * omnívoro y vegano); no toca Firestore. Escribe el CSV que luego carga
 * `importarCatalogoAlimentos.ts` (en seco primero, `--aplicar` con permiso).
 *
 *   npx tsx scripts/catalogoDesdeIntercambios.ts [salida.csv]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SYSTEM_FOODS, type FoodCategory } from '../src/nutricion_seed_en_forma';
import { validarCsv, COLUMNAS_CSV } from '../src/utils/catalogoAlimentos';

type Estado = 'crudo' | 'cocido' | 'seco' | 'escurrido' | 'listo';
/** nombre · estado · [medida casera, gramos] */
type Alimento = [string, Estado, ([string, number] | null)?];
/** Gramos (o ml) de un intercambio y los alimentos que salen de esa línea. */
type Entrada = { gramos: number; alimentos: Alimento[] };

const POR_INTERCAMBIO: Record<FoodCategory, { p: number; hc: number; g: number }> = {
  HC: { p: 0, hc: 25, g: 0 },
  PROT: { p: 25, hc: 0, g: 0 },
  GRASA: { p: 0, hc: 0, g: 11 },
  MIX_HC: { p: 12.5, hc: 12.5, g: 0 },
  MIX_GRASA: { p: 12.5, hc: 0, g: 5.5 },
};

const e = (gramos: number, ...alimentos: Alimento[]): Entrada => ({ gramos, alimentos });

/** Una línea de intercambios → sus alimentos. Revisada a mano: las líneas con
 *  varios alimentos se separan para que el Diario y las recetas encuentren cada uno. */
const TABLA: Record<string, Entrada | null> = {
  // ── Hidratos ──
  '150g patata (cruda o cocida)': e(150, ['Patata', 'crudo'], ['Patata', 'cocido']),
  '120g boniato': e(120, ['Boniato', 'crudo']),
  '60g yuca': e(60, ['Yuca', 'crudo']),
  '30g arroz, pasta, couscous o quinoa': e(30, ['Arroz', 'seco'], ['Pasta', 'seco'], ['Cuscús', 'seco'], ['Quinoa', 'seco']),
  '63g vasito de arroz o quinoa (medio vasito de 125g)': e(63, ['Arroz en vasito', 'cocido', ['vasito', 125]], ['Quinoa en vasito', 'cocido', ['vasito', 125]]),
  '30g harinas (excepto de almendra)': e(30, ['Harina de trigo', 'listo'], ['Harina de avena', 'listo'], ['Harina de maíz', 'listo'], ['Harina de arroz', 'listo']),
  '30g papilla de cereales sin azúcares añadidos': e(30, ['Papilla de cereales sin azúcar', 'listo']),
  '30g cereales (corn flakes, muesli, copos...)': e(30, ['Copos de avena', 'listo'], ['Corn flakes', 'listo'], ['Muesli', 'listo']),
  '30g maíz para palomitas': e(30, ['Maíz para palomitas', 'seco']),
  '40g pan (de molde, tostado, con o sin semillas...)': e(40, ['Pan', 'listo', ['rebanada', 30]], ['Pan de molde', 'listo', ['rebanada', 25]], ['Pan tostado', 'listo']),
  '60g gnocchi': e(60, ['Gnocchi', 'listo']),
  '25g tortitas de arroz o maíz (tres tortitas)': e(25, ['Tortitas de arroz', 'listo', ['tortita', 8]], ['Tortitas de maíz', 'listo', ['tortita', 8]]),
  '35g tortillas para fajitas pequeñas (1 tortilla)': e(35, ['Tortilla para fajitas', 'listo', ['tortilla', 35]]),
  '40g tortillas tipo wrap grandes (media tortilla)': e(40, ['Tortilla tipo wrap', 'listo', ['tortilla', 80]]),
  '35g base para pizza (un cuarto de base)': e(35, ['Base de pizza', 'listo']),
  '25g azúcar, dextrosa, amilopectina, ciclodextrina...': e(25, ['Azúcar', 'listo'], ['Dextrosa', 'listo'], ['Amilopectina', 'listo'], ['Ciclodextrina', 'listo']),
  '40g mermelada (la que sea)': e(40, ['Mermelada', 'listo']),
  '30g miel': e(30, ['Miel', 'listo']),
  '30g frutas deshidratadas (pasas, ciruelas...)': e(30, ['Pasas', 'listo'], ['Ciruelas pasas', 'listo'], ['Fruta deshidratada', 'listo']),
  '35g dátiles': e(35, ['Dátiles', 'listo', ['dátil', 8]]),
  '50g castañas ya peladas': e(50, ['Castañas peladas', 'listo']),
  '300g melón o sandía': e(300, ['Melón', 'listo'], ['Sandía', 'listo']),
  '230g paraguayo o melocotón': e(230, ['Paraguayo', 'listo'], ['Melocotón', 'listo', ['unidad', 150]]),
  '200g frutos rojos (frescos o congelados)': e(200, ['Frutos rojos', 'listo'], ['Fresas', 'listo'], ['Arándanos', 'listo'], ['Frambuesas', 'listo']),
  '200g ciruela': e(200, ['Ciruela', 'listo', ['unidad', 60]]),
  '200g piña en su jugo': e(200, ['Piña en su jugo', 'escurrido'], ['Piña', 'listo']),
  '150g uvas': e(150, ['Uvas', 'listo']),
  '150g caquis': e(150, ['Caqui', 'listo', ['unidad', 200]]),
  '100g plátano (uno pequeño)': e(100, ['Plátano', 'listo', ['unidad pequeña', 100]]),
  '1 manzana o 1 pera': e(180, ['Manzana', 'listo', ['unidad', 180]], ['Pera', 'listo', ['unidad', 180]]),
  '2 mandarinas o 2 kiwis': e(170, ['Mandarina', 'listo', ['unidad', 85]], ['Kiwi', 'listo', ['unidad', 85]]),
  '130g guisantes frescos o en lata': e(130, ['Guisantes', 'listo']),
  '130g maíz en lata': e(130, ['Maíz dulce en lata', 'escurrido']),
  '400g judía verde, alcachofa, menestra, espárragos...': e(400, ['Judía verde', 'cocido'], ['Alcachofa', 'cocido'], ['Menestra de verduras', 'cocido'], ['Espárragos', 'cocido']),
  '300g pimientos en bote': e(300, ['Pimientos en bote', 'escurrido']),
  '125g yogurt natural azucarado (1 yogurt)': e(125, ['Yogur natural azucarado', 'listo', ['yogur', 125]]),
  '200ml bebida de arroz, avena, arroz y coco...': e(200, ['Bebida de arroz', 'listo'], ['Bebida de avena', 'listo'], ['Bebida de arroz y coco', 'listo']),
  '250ml bebida de arroz sin azúcares añadidos Hacendado': e(250, ['Bebida de arroz sin azúcar (Hacendado)', 'listo']),
  '200ml bebida de avena sin azúcares añadidos Hacendado': e(200, ['Bebida de avena sin azúcar (Hacendado)', 'listo']),
  '140ml bebida de soja sabor chocolate NO Hacendado': e(140, ['Bebida de soja sabor chocolate', 'listo']),
  '200ml zumo comercial': e(200, ['Zumo comercial', 'listo']),
  '500ml zumo comercial sin azúcares añadidos': e(500, ['Zumo sin azúcares añadidos', 'listo']),
  // ── Proteína ──
  '30g proteína en polvo (whey, iso, vegetal, caseína)': e(30, ['Proteína en polvo', 'listo', ['cacito', 30]]),
  '120g pescado blanco (merluza, bacalao, lubina...)': e(120, ['Pescado blanco', 'crudo'], ['Merluza', 'crudo'], ['Bacalao', 'crudo'], ['Lubina', 'crudo']),
  '120g cefalópodos (pulpo, calamar, sepia...)': e(120, ['Pulpo', 'crudo'], ['Calamar', 'crudo'], ['Sepia', 'crudo']),
  '120g mejillones al natural (2 latas)': e(120, ['Mejillones al natural', 'escurrido']),
  '100g atún claro al natural (2 latas)': e(100, ['Atún al natural', 'escurrido', ['lata', 52]]),
  '100g atún en escabeche blanco (2 latas)': e(100, ['Atún en escabeche', 'escurrido', ['lata', 52]]),
  '100g carne blanca sin piel (pollo, pavo...)': e(100, ['Pechuga de pollo', 'crudo'], ['Pechuga de pavo', 'crudo'], ['Carne blanca sin piel', 'crudo']),
  '80g carne roja magra (sin grasa)': e(80, ['Ternera magra', 'crudo'], ['Carne roja magra', 'crudo']),
  '80g hígado': e(80, ['Hígado', 'crudo']),
  '50g lomo embuchado': e(50, ['Lomo embuchado', 'listo']),
  '30g soja texturizada': e(30, ['Soja texturizada', 'seco']),
  '200ml claras de huevo (6-7 claras)': e(200, ['Claras de huevo', 'crudo', ['clara', 30]]),
  '80g seitán': e(80, ['Seitán', 'listo']),
  '220g queso fresco batido 0%': e(220, ['Queso fresco batido 0%', 'listo']),
  '150g queso fresco tipo Burgos (2 tarrinas pequeñas)': e(150, ['Queso fresco tipo Burgos', 'listo', ['tarrina pequeña', 75]]),
  '140g requesón 0%': e(140, ['Requesón 0%', 'listo']),
  '120g queso cottage light': e(120, ['Queso cottage light', 'listo']),
  '1 yogurt YoPro Danone (no choco)': e(160, ['Yogur YoPro (Danone)', 'listo', ['yogur', 160]]),
  '180g (1 y medio) yogurt +proteínas (no choco no vainilla)': e(180, ['Yogur alto en proteínas', 'listo', ['yogur', 120]]),
  // ── Grasa ──
  '10ml (1 cuchara) aceite (preferible AOVE)': e(10, ['Aceite de oliva', 'listo', ['cucharada', 10]], ['Aceite de girasol', 'listo', ['cucharada', 10]]),
  '60g aceitunas (verdes, negras o rellenas)': e(60, ['Aceitunas', 'escurrido']),
  '60g aguacate o guacamole': e(60, ['Aguacate', 'listo'], ['Guacamole', 'listo']),
  '18g pipas o semillas (girasol, lino, calabaza, chía)': e(18, ['Pipas de girasol', 'listo'], ['Semillas de lino', 'listo'], ['Pipas de calabaza', 'listo'], ['Semillas de chía', 'listo']),
  '15g frutos secos sin freír (cualquier fruto seco)': e(15, ['Frutos secos', 'listo'], ['Almendras', 'listo'], ['Nueces', 'listo'], ['Avellanas', 'listo'], ['Anacardos', 'listo'], ['Pistachos', 'listo'], ['Cacahuetes', 'listo']),
  '15g de crema de frutos secos (cacahuete, pistacho, almendras...)': e(15, ['Crema de cacahuete', 'listo'], ['Crema de almendras', 'listo'], ['Crema de pistacho', 'listo']),
  '15g harina de almendra': e(15, ['Harina de almendra', 'listo']),
  '15g coco rallado (o harina)': e(15, ['Coco rallado', 'listo'], ['Harina de coco', 'listo']),
  '30g coco natural': e(30, ['Coco natural', 'listo']),
  '30g cacao puro desgrasado en polvo': e(30, ['Cacao puro desgrasado', 'listo']),
  '20g chocolate +72% (2 onzas)': e(20, ['Chocolate negro +72%', 'listo', ['onza', 10]]),
  '15g mantequilla': e(15, ['Mantequilla', 'listo']),
  '25g mantequilla ligera': e(25, ['Mantequilla ligera', 'listo']),
  '20g margarina': e(20, ['Margarina', 'listo']),
  '30g margarina ligera': e(30, ['Margarina ligera', 'listo']),
  '50g nata para cocinar': e(50, ['Nata para cocinar', 'listo']),
  '30g nata para montar': e(30, ['Nata para montar', 'listo']),
  '15g mayonesa': e(15, ['Mayonesa', 'listo']),
  '30g mayonesa ligera': e(30, ['Mayonesa ligera', 'listo']),
  '200ml gazpacho': e(200, ['Gazpacho', 'listo']),
  '50g tomate frito receta artesana Hacendado': e(50, ['Tomate frito receta artesana (Hacendado)', 'listo']),
  '130g tomate frito comercial': e(130, ['Tomate frito', 'listo']),
  '100g tomate frito estilo casero': e(100, ['Tomate frito estilo casero', 'listo']),
  '80g yogurt griego natural': e(80, ['Yogur griego natural', 'listo', ['yogur', 125]]),
  '600ml bebida de almendras sin azúcar': e(600, ['Bebida de almendras sin azúcar', 'listo']),
  '400ml bebida de almendras Eco-Cesta': e(400, ['Bebida de almendras (Eco-Cesta)', 'listo']),
  '350ml bebida de almendras Alpro o Hacendado': e(350, ['Bebida de almendras (Alpro o Hacendado)', 'listo']),
  '250ml bebida de avellana': e(250, ['Bebida de avellana', 'listo']),
  '200ml bebida de avellana y arroz Hacendado': e(200, ['Bebida de avellana y arroz (Hacendado)', 'listo']),
  // ── ½ proteína + ½ hidratos ──
  '100g legumbre cocida': e(100, ['Garbanzos', 'cocido'], ['Lentejas', 'cocido'], ['Alubias', 'cocido'], ['Legumbre', 'cocido']),
  '30g legumbre en seco': e(30, ['Garbanzos', 'seco'], ['Lentejas', 'seco'], ['Alubias', 'seco'], ['Legumbre', 'seco']),
  '30g pasta de legumbre': e(30, ['Pasta de legumbre', 'seco']),
  '300ml leche desnatada': e(300, ['Leche desnatada', 'listo', ['vaso', 250]]),
  '230ml leche desnatada +proteínas Hacendado': e(230, ['Leche desnatada +proteínas (Hacendado)', 'listo', ['vaso', 250]]),
  '250ml leche semidesnatada': e(250, ['Leche semidesnatada', 'listo', ['vaso', 250]]),
  '180ml leche semidesnatada +proteínas Hacendado': e(180, ['Leche semidesnatada +proteínas (Hacendado)', 'listo', ['vaso', 250]]),
  '250g kéfir sin grasa': e(250, ['Kéfir sin grasa', 'listo']),
  '170g yogurt griego desnatado 0%': e(170, ['Yogur griego 0%', 'listo', ['yogur', 125]]),
  '1 yogurt natural (125-140g)': e(130, ['Yogur natural', 'listo', ['yogur', 125]]),
  '2 yogures naturales desnatados 0% (2 de 125g)': e(250, ['Yogur natural desnatado 0%', 'listo', ['yogur', 125]]),
  '1 yogurt +proteínas chocolate o vainilla (120g)': e(120, ['Yogur +proteínas chocolate o vainilla', 'listo', ['yogur', 120]]),
  '160g yogurt alto en proteínas Pastoret': e(160, ['Yogur alto en proteínas (Pastoret)', 'listo', ['yogur', 160]]),
  '1 yogurt YoPro chocolate Danone': e(160, ['Yogur YoPro chocolate (Danone)', 'listo', ['yogur', 160]]),
  '150g yogurt mango sin azúcares añadidos Alpro': e(150, ['Yogur de mango sin azúcar (Alpro)', 'listo']),
  '30g levadura de cerveza': e(30, ['Levadura de cerveza', 'listo']),
  // ── ½ proteína + ½ grasa ──
  '30g queso (curado, semicurado, cabra, mozzarella...)': e(30, ['Queso curado', 'listo'], ['Queso semicurado', 'listo'], ['Queso de cabra', 'listo'], ['Mozzarella', 'listo']),
  '60g mozzarella light o feta light': e(60, ['Mozzarella light', 'listo'], ['Feta light', 'listo']),
  '1 huevo grande o 2 pequeños': e(60, ['Huevo', 'crudo', ['unidad', 60]]),
  '70g carne roja grasa (cordero)': e(70, ['Cordero', 'crudo'], ['Carne roja grasa', 'crudo']),
  '50g jamón serrano': e(50, ['Jamón serrano', 'listo']),
  '65g pescado azul': e(65, ['Pescado azul', 'crudo'], ['Salmón', 'crudo'], ['Sardina', 'crudo'], ['Caballa', 'crudo']),
  '60g salmón ahumado': e(60, ['Salmón ahumado', 'listo']),
  '50g anchoas en conserva': e(50, ['Anchoas en conserva', 'escurrido']),
  '60g (1 lata) atún o sardinas en aceite': e(60, ['Atún en aceite', 'escurrido', ['lata', 60]], ['Sardinas en aceite', 'escurrido', ['lata', 60]]),
  // Sin gramos fiables por lata: se dejan fuera antes que inventar el peso.
  '1 lata grande o 2 pequeñas de mejillones en escabeche': null,
  '1 lata de calamares en su tinta o salsa americana': null,
  '55g tempeh': e(55, ['Tempeh', 'listo']),
  '100g tofu magro (menos de 115kcal a los 100g)': e(100, ['Tofu magro', 'listo']),
  '65g tofu graso (más de 115kcal a los 100g)': e(65, ['Tofu', 'listo']),
  '70g heura (bocados, picada, merluza)': e(70, ['Heura bocados', 'listo'], ['Heura picada', 'listo']),
  '50g heura (albóndigas, nuggets)': e(50, ['Heura albóndigas', 'listo'], ['Heura nuggets', 'listo']),
  '300ml bebida de soja sin azúcares añadidos': e(300, ['Bebida de soja sin azúcar', 'listo', ['vaso', 250]]),
  '200g yogurt de soja natural': e(200, ['Yogur de soja natural', 'listo', ['yogur', 125]]),
  '80g Beyond Burger': e(80, ['Beyond Burger', 'crudo']),
};

/** Alimentos de las recetas que NO están en los intercambios (salsas, fiambres,
 *  carnes procesadas…). Valores reales: mediana de los productos españoles de
 *  Open Food Facts que ya tiene la app (`public/off`, 24-10; n = productos).
 *  [nombre, estado, kcal, proteína, hidratos, grasa, fibra, azúcares, saturada, sal, medida?] */
type Medio = [string, Estado, number, number, number, number, number | '', number, number, number, ([string, number] | null)?];
const MEDIOS: Medio[] = [
  ['Ketchup', 'listo', 100, 1.3, 22, 0.1, 1, 18.5, 0, 2, ['cucharada', 15]],           // n=285
  ['Ketchup sin azúcar', 'listo', 38, 1.5, 6.2, 0, 1.3, 4.2, 0, 1.5, ['cucharada', 15]], // n=21
  ['Salsa de soja', 'listo', 66, 7.5, 6.9, 0, 0, 2, 0, 12.8, ['cucharada', 15]],          // n=99
  ['Pesto', 'listo', 431, 4.5, 6.2, 42, 1.9, 2, 5.8, 2.2, ['cucharada', 15]],             // n=140
  ['Mostaza', 'listo', 104, 3.6, 8, 4.5, 1.5, 3, 0.4, 3.3, ['cucharadita', 5]],           // n=160
  ['Salsa barbacoa', 'listo', 121, 1.2, 28, 0.3, 0.9, 23, 0, 2, ['cucharada', 15]],       // n=91
  ['Gambas peladas', 'crudo', 56, 12, 0, 0.8, '', 0, 0.2, 1],                             // n=114 (congeladas)
  ['Langostinos cocidos', 'listo', 97, 21.3, 0, 1.1, '', 0, 0.3, 1.3],                    // n=200
  ['Jamón cocido extra', 'listo', 106, 19, 1, 3, '', 0.6, 1.2, 1.9, ['loncha', 15]],      // n=573
  ['Fiambre de pechuga de pavo', 'listo', 89, 18, 1.1, 1, '', 0.5, 0.4, 1.8, ['loncha', 15]], // n=731
  ['Queso crema light', 'listo', 172, 8, 3.8, 14, '', 3.6, 10, 1],                        // n=10
  ['Queso crema', 'listo', 243, 5.8, 3.8, 22, '', 3.3, 15, 1],                            // n=68
  ['Queso en lonchas light', 'listo', 287, 28, 1.4, 19, '', 0.5, 12.8, 1.5, ['loncha', 20]], // n=38
  ['Queso cheddar', 'listo', 387, 25, 0.6, 32, '', 0.5, 21, 1.7, ['loncha', 20]],         // n=26
  ['Queso rallado', 'listo', 341, 24, 2, 26, '', 0.5, 17.1, 1.8],                         // n=185
  ['Salchichas de pavo', 'listo', 170, 13.1, 2.3, 12, '', 0.5, 3.8, 2, ['salchicha', 40]], // n=42
  ['Hamburguesa de pollo', 'crudo', 137, 16, 1.8, 7, 0, 0.5, 2, 1.6, ['hamburguesa', 100]], // n=158
  ['Carne picada de ternera', 'crudo', 193, 18, 1, 13, '', 0.5, 5.8, 0.3],                // n=36
  ['Carne picada de pavo', 'crudo', 110, 18.6, 1, 3.5, '', 0.5, 1.1, 1.2],                // n=7
  ['Contramuslo de pollo', 'crudo', 130, 20, 0, 5.6, '', 0, 1.9, 0.2],                    // n=410
  ['Lomo de cerdo', 'crudo', 134, 20.4, 0.8, 4.5, '', 0.5, 1.8, 1.7],                     // n=119
];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Valores por 100 g. Si pasan de 100 g de nutrientes (el aceite: 10 ml son
 *  ~9 g y el intercambio cuenta 11 g de grasa), se recortan a lo posible. */
function porCien(cat: FoodCategory, gramos: number) {
  const base = POR_INTERCAMBIO[cat];
  let f = 100 / gramos;
  const suma = (base.p + base.hc + base.g) * f;
  if (suma > 100) f *= 100 / suma;
  const p = r1(base.p * f), hc = r1(base.hc * f), g = r1(base.g * f);
  return { kcal: Math.round(4 * p + 4 * hc + 9 * g), p, hc, g };
}

// Modos con peso (el «sin pesar» repite los mismos alimentos en medidas caseras).
const conPeso = SYSTEM_FOODS.filter(f => f.mode !== 'SIN_PESAR');
const vistos = new Set<string>();
const filas: string[][] = [];
const faltan: string[] = [];
const yaEsta = new Set<string>();

for (const f of conPeso) {
  if (vistos.has(f.label)) continue;
  vistos.add(f.label);
  if (!(f.label in TABLA)) { faltan.push(f.label); continue; }
  const entrada = TABLA[f.label];
  if (!entrada) continue;
  const v = porCien(f.category, entrada.gramos);
  for (const [nombre, estado, medida] of entrada.alimentos) {
    const clave = `${nombre}|${estado}`;
    if (yaEsta.has(clave)) continue; // mismo alimento en dos líneas: manda la primera
    yaEsta.add(clave);
    filas.push([
      '', nombre, estado, String(v.kcal), String(v.p), String(v.hc), String(v.g),
      '', '', '', '', medida?.[0] ?? '', medida ? String(medida[1]) : '', 'intercambios',
    ]);
  }
}

for (const [nombre, estado, kcal, p, hc, g, fibra, az, sat, sal, medida] of MEDIOS) {
  const clave = `${nombre}|${estado}`;
  if (yaEsta.has(clave)) continue;
  yaEsta.add(clave);
  filas.push([
    '', nombre, estado, String(kcal), String(p), String(hc), String(g),
    String(fibra), String(az), String(sat), String(sal), medida?.[0] ?? '', medida ? String(medida[1]) : '',
    'Open Food Facts (mediana España)',
  ]);
}

if (faltan.length) {
  console.error(`Líneas de intercambios sin pasar a la tabla (${faltan.length}):\n  ${faltan.join('\n  ')}`);
  process.exit(1);
}

const coma = (c: string) => c.replace('.', ',');
const csv = [COLUMNAS_CSV.join(';'), ...filas.map(f => f.map((c, i) => (i >= 3 && i <= 10 ? coma(c) : c)).join(';'))].join('\n') + '\n';
const { filas: validadas, alimentos, erroresGenerales } = validarCsv(csv);
const conError = validadas.filter(x => x.errores.length);
const conAviso = validadas.filter(x => x.avisos.length);
if (erroresGenerales.length || conError.length) {
  console.error([...erroresGenerales, ...conError.map(x => `fila ${x.fila}: ${x.errores.join(' ')}`)].join('\n'));
  process.exit(1);
}

const salida = resolve(process.argv[2] ?? 'scripts/out/catalogo-desde-intercambios.csv');
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, '﻿' + csv);
console.log(`OK · ${alimentos.length} alimentos (${vistos.size} líneas de intercambios) → ${salida}`);
if (conAviso.length) console.log(`Avisos: ${conAviso.length}\n  ${conAviso.map(x => `fila ${x.fila}: ${x.avisos.join(' ')}`).join('\n  ')}`);
