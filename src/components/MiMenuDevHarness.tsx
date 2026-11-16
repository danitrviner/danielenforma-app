import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserProfile, WeeklyMenu, MenuDay, MenuMeal, MenuComplement, Recipe, WeekDay, Macros } from '../types';
import type { AlimentoCatalogo } from '../utils/catalogoAlimentos';
import { reglasDeRecetaKey, accesoGlobalKey } from '../hooks/useReglasDeReceta';
import { CAPRICHOS_SUGERIDOS, alimentoDeCapricho } from '../utils/caprichos';
import { macrosDeLaComida } from '../utils/menuMacros';
import { sumarMacros, redondearMacros } from '../utils/macros';
import MyMenuScreen from './MyMenuScreen';
import LibertadDelMenu from './LibertadDelMenu';
import { TarjetaDeArranque } from './nutrition/TusGustos';

/* ═══════════════════════════════════════════════════════════════════════════
   Banco de pruebas de «Mi menú» del ATLETA — ruta `/dev/mi-menu`, solo en
   desarrollo. Para ver la ración ajustable, los caprichos y el cambio de
   plato con reajuste del día.

   Todo vive en la caché de react-query, sembrada a mano. Guardar no escribe
   en ningún sitio (sin sesión, la escritura falla y se queda en la caché).
   ═══════════════════════════════════════════════════════════════════════════ */

const EMAIL = 'dev.atleta@example.com';
const PERFIL = { userId: 'dev', email: EMAIL, displayName: 'Marcos Dev', role: 'client' } as UserProfile;
const DIAS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const pad = (n: number) => String(n).padStart(2, '0');
const hoy = new Date();
const HOY = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
const HOY_WD = DIAS[(hoy.getDay() + 6) % 7];

/** Valores por 100 g de un ingrediente y qué macro mueve: con esto la receta
 *  queda «vinculada al catálogo» y sus gramos se pueden subir y bajar. */
type PorCien = [kcal: number, p: number, hc: number, g: number, palanca?: 'proteina' | 'hc' | 'grasa'];
const receta = (id: string, name: string, kcal: number, p: number, hc: number, g: number, minutos: number, ingredientes: [string, number][], pasos: string[], porCien?: PorCien[]): Recipe => ({
  id, ownerId: 'dev', name, categories: [], ingredients: [], extras: [], steps: [], kcal, cookingTime: minutos,
  macros: { carb: hc, prot: p, fat: g },
  ...(porCien ? {
    vinculo: {
      calculadoEn: '2026-11-16',
      ingredientes: ingredientes.map(([, q], n) => ({
        n, alimentoId: `dev_${id}_${n}`, gramos: q, min: Math.round(q * 0.5), max: q * 2,
        porCien: { kcal: porCien[n][0], p: porCien[n][1], hc: porCien[n][2], g: porCien[n][3] },
        ...(porCien[n][4] ? { palanca: porCien[n][4] } : {}),
      })),
    },
  } : {}),
  ingredientsText: ingredientes.map(([n, q]) => ({ name: n, quantity: q })),
  stepsText: pasos.map((description, i) => ({ position: i + 1, description })),
} as unknown as Recipe);

const RECETAS: Recipe[] = [
  receta('r_des', 'Tostadas con huevo revuelto y aguacate', 430, 24, 38, 20, 10,
    [['Pan integral', 80], ['Huevo', 120], ['Aguacate', 50], ['Aceite de oliva', 5]],
    ['Tuesta el pan.', 'Haz el revuelto a fuego suave con el aceite.', 'Monta la tostada con el aguacate chafado y el huevo encima.']),
  receta('r_com', 'Arroz con pollo y verduras', 690, 52, 82, 16, 25,
    [['Arroz basmati', 90], ['Pechuga de pollo', 180], ['Pimiento rojo', 80], ['Calabacín', 100], ['Aceite de oliva', 10]],
    ['Cuece el arroz.', 'Saltea el pollo en dados con las verduras.', 'Mézclalo todo y sirve.'],
    [[350, 8, 77, 1, 'hc'], [110, 23, 0, 2, 'proteina'], [30, 1, 6, 0.3], [17, 1.2, 3, 0.3], [900, 0, 0, 100, 'grasa']]),
  receta('r_mer', 'Yogur griego con nueces', 250, 20, 14, 13, 2,
    [['Yogur griego natural', 250], ['Nueces', 15]],
    ['Sirve el yogur con las nueces por encima.'],
    [[62, 7, 4, 2, 'proteina'], [650, 15, 4, 65, 'grasa']]),
  receta('r_cen', 'Salmón con patata y brócoli', 610, 40, 45, 30, 25,
    [['Salmón', 160], ['Patata', 250], ['Brócoli', 150], ['Aceite de oliva', 5]],
    ['Cuece la patata y el brócoli.', 'Marca el salmón a la plancha, tres minutos por lado.', 'Sirve con un hilo de aceite.'],
    [[200, 20, 0, 13, 'proteina'], [80, 2, 17, 0.1, 'hc'], [34, 2.8, 4, 0.4], [900, 0, 0, 100, 'grasa']]),
];

// Alternativas para «Intercambiar» la comida: una que encaja y dos que no.
const ALTERNATIVAS: Recipe[] = [
  receta('r_alt1', 'Pasta con atún y tomate', 700, 50, 82, 18, 15, [['Pasta', 100], ['Atún al natural', 160], ['Tomate triturado', 150], ['Aceite de oliva', 10]], ['Cuece la pasta.', 'Mezcla con el atún y el tomate.']),
  receta('r_alt2', 'Hamburguesa completa con patatas', 980, 48, 95, 44, 20, [['Pan de hamburguesa', 90], ['Carne picada', 180], ['Queso', 30], ['Patata', 250], ['Aceite de oliva', 15]], ['Haz la hamburguesa a la plancha.', 'Hornea las patatas.']),
  receta('r_alt3', 'Ensalada de pollo y quinoa', 470, 42, 40, 15, 15, [['Quinoa', 60], ['Pechuga de pollo', 150], ['Tomate', 150], ['Aceite de oliva', 10]], ['Cuece la quinoa.', 'Mezcla con el pollo a la plancha y el tomate.']),
].map(r => ({ ...r, intakeTypes: [3] } as Recipe));

/* Recetario de mentira para el arranque de gustos: nombre e ingredientes
   principales por franja; kcal y tiempo se reparten para que haya de todo. */
const plato = (slot: number) => ([name, ...ings]: string[], i: number): Recipe => ({
  ...receta(`q${slot}_${i}`, name, 320 + (i % 5) * 70, 22 + (i % 4) * 8, 30 + (i % 6) * 9, 9 + (i % 3) * 6, [10, 15, 20, 25, 35, 45][i % 6],
    ings.map(n => [n, 100] as [string, number]), ['Prepara los ingredientes.', 'Cocina y sirve.']),
  intakeTypes: [slot],
} as Recipe);
const DESAYUNOS = [
  ['Tostadas con huevo revuelto y aguacate', 'Pan integral', 'Huevo', 'Aguacate'], ['Gachas de avena con plátano', 'Avena', 'Leche', 'Plátano'],
  ['Tortitas de avena y claras', 'Avena', 'Claras', 'Plátano'], ['Yogur griego con frutos rojos', 'Yogur griego', 'Fresa', 'Arándano'],
  ['Tostada de jamón y tomate', 'Pan', 'Jamón serrano', 'Tomate'], ['Batido de plátano y cacao', 'Leche', 'Plátano', 'Cacao'],
  ['Tortilla francesa con pan', 'Huevo', 'Pan'], ['Bowl de yogur con avena y nueces', 'Yogur', 'Avena', 'Nueces'],
  ['Tostada de queso fresco y pavo', 'Pan', 'Queso fresco', 'Pavo'], ['Porridge de chocolate', 'Avena', 'Cacao', 'Leche'],
  ['Revuelto de huevo con champiñones', 'Huevo', 'Champiñones'], ['Bizcocho de avena y plátano', 'Avena', 'Plátano', 'Huevo'],
  ['Tostada con crema de cacahuete', 'Pan', 'Crema de cacahuete', 'Plátano'], ['Batido de frutos rojos y yogur', 'Yogur', 'Fresa', 'Arándano'],
].map(plato(1));
const COMIDAS = [
  ['Lentejas estofadas con verduras', 'Lentejas', 'Zanahoria'], ['Salmón al horno con patata', 'Salmón', 'Patata'],
  ['Merluza en salsa verde', 'Merluza', 'Guisantes'], ['Garbanzos con espinacas', 'Garbanzos', 'Espinacas'],
  ['Pasta boloñesa', 'Pasta', 'Ternera picada', 'Tomate'], ['Wok de pollo con arroz', 'Pollo', 'Arroz', 'Pimiento'],
  ['Crema de calabaza con huevo', 'Calabaza', 'Huevo'], ['Arroz con gambas', 'Arroz', 'Gambas'],
  ['Pollo al curry con arroz', 'Pollo', 'Arroz', 'Leche de coco'], ['Ensalada de atún y patata', 'Atún', 'Patata', 'Lechuga'],
  ['Dorada a la sal con ensalada', 'Dorada', 'Lechuga'], ['Fajitas de pollo', 'Pollo', 'Tortilla de trigo', 'Pimiento'],
].map(plato(3));
const CENAS = [
  ['Tortilla de calabacín con ensalada', 'Huevo', 'Calabacín'], ['Merluza al vapor con verduras', 'Merluza', 'Brócoli'],
  ['Pechuga de pollo con boniato', 'Pechuga de pollo', 'Boniato'], ['Revuelto de gambas y espárragos', 'Huevo', 'Gambas', 'Espárragos'],
  ['Crema de verduras con pollo', 'Calabacín', 'Pollo'], ['Ensalada templada de garbanzos', 'Garbanzos', 'Tomate'],
  ['Sopa de fideos con huevo', 'Fideos', 'Huevo'], ['Dorada al horno con patata', 'Dorada', 'Patata'],
  ['Tortilla de patata con ensalada', 'Huevo', 'Patata'], ['Wok de tofu y verduras', 'Tofu', 'Pimiento'],
  ['Pavo a la plancha con arroz', 'Pavo', 'Arroz'], ['Berenjena rellena de carne', 'Berenjena', 'Ternera picada'],
  ['Bacalao con tomate', 'Bacalao', 'Tomate'], ['Salmón a la plancha con espinacas', 'Salmón', 'Espinacas'],
].map(plato(5));
const SNACKS = [
  ['Tostada de pavo y queso', 'Pan', 'Pavo', 'Queso'], ['Batido de proteínas con plátano', 'Proteína en polvo', 'Plátano', 'Leche'],
  ['Fruta con queso fresco', 'Manzana', 'Queso fresco'], ['Sándwich de atún', 'Pan de molde', 'Atún'],
  ['Yogur con avena y chocolate', 'Yogur', 'Avena', 'Chocolate negro'], ['Hummus con zanahoria', 'Garbanzos', 'Zanahoria'],
  ['Tortitas de arroz con crema de cacahuete', 'Tortitas de arroz', 'Crema de cacahuete'], ['Requesón con frutos rojos', 'Requesón', 'Fresa'],
  ['Mini bocadillo de jamón', 'Pan', 'Jamón serrano'], ['Bowl de fruta y yogur', 'Yogur', 'Plátano', 'Fresa'],
  ['Almendras con plátano', 'Almendras', 'Plátano'], ['Huevo duro con tostada', 'Huevo', 'Pan'],
].map(plato(2));

const PLATANO: MenuComplement = { foodLabel: 'Plátano', category: 'HC', quantity: 0, alimentoId: 'platano', gramos: 120, piezas: 1, unidad: 'unidad', macros: { kcal: 107, p: 1.3, hc: 24, g: 0.4 } };

function comida(dia: WeekDay, n: number, slot: number, name: string, r: Recipe, complements: MenuComplement[] = []): MenuMeal {
  const macros: Macros = { kcal: r.kcal!, p: r.macros!.prot, hc: r.macros!.carb, g: r.macros!.fat };
  const meal: MenuMeal = {
    id: `${dia}_m${n}`, slot, name, recipeId: r.id, recipeName: r.name, scale: 1,
    macros, exch: { HC: 0, PROT: 0, GRASA: 0 }, kcal: 0, complements,
  };
  const total = redondearMacros(macrosDeLaComida(meal));
  return { ...meal, kcal: total.kcal, objetivoMacros: total };
}

function diaDe(dia: WeekDay): MenuDay {
  const meals = [
    comida(dia, 1, 1, 'Desayuno', RECETAS[0]),
    comida(dia, 2, 3, 'Comida', RECETAS[1]),
    comida(dia, 3, 4, 'Merienda', RECETAS[2], [PLATANO]),
    comida(dia, 4, 5, 'Cena', RECETAS[3]),
  ];
  return { day: dia, dietId: 'dieta_dev', dietName: 'Definición', target: { HC: 0, PROT: 0, GRASA: 0 }, objetivo: redondearMacros(sumarMacros(...meals.map(macrosDeLaComida))), meals };
}

const MENU: WeeklyMenu = {
  id: 'menu_dev', athleteId: EMAIL, status: 'published', name: 'Semana de ejemplo', createdAt: HOY, publishedAt: HOY,
  varietyLevel: 1, days: DIAS.map(diaDe), swapHistory: [],
};

const alimento = (id: string, nombre: string, kcal: number, p: number, hc: number, g: number, unidad?: [string, number]): AlimentoCatalogo => ({
  id, nombre, estado: 'listo', porCien: { kcal, p, hc, g }, ...(unidad ? { unidad: { nombre: unidad[0], gramos: unidad[1] } } : {}),
});
const CATALOGO: AlimentoCatalogo[] = [
  alimento('platano', 'Plátano', 89, 1.1, 20, 0.3, ['unidad', 120]),
  alimento('manzana', 'Manzana', 52, 0.3, 12, 0.2, ['unidad', 180]),
  alimento('yogur', 'Yogur natural', 61, 3.5, 4.7, 3.3, ['yogur', 125]),
  alimento('pan', 'Pan integral', 250, 9, 45, 3, ['rebanada', 30]),
  alimento('nueces', 'Nueces', 654, 15, 7, 65, ['puñado', 20]),
];

const PRODUCTOS_DEV: Record<string, unknown> = {
  '8410000000016': { c: '8410000000016', n: 'Cono de nata y chocolate', b: 'Heladería Dev', q: '4 x 120 ml', k: 300, p: 4, h: 36, g: 15 },
  '8410000000023': { c: '8410000000023', n: 'Helado de vainilla', b: 'Heladería Dev', q: '500 ml', s: 60, k: 200, p: 3.5, h: 24, g: 10 },
};
const c2Producto = (c: string) => PRODUCTOS_DEV[c];

function sembrar(qc: QueryClient) {
  const fijo = (key: readonly unknown[], data: unknown) => qc.setQueryData(key, data);
  fijo(['publishedMenu', EMAIL], MENU);
  fijo(['onboarding', EMAIL], {
    allergies: [], dislikedFoods: ['champiñones'], likedFoods: ['plátano', 'huevo', 'pollo'], meals: [],
    caprichos: [CAPRICHOS_SUGERIDOS.find(c => c.grupo === 'helado') ?? CAPRICHOS_SUGERIDOS[0]].map((a, i) => ({
      id: `c${i}`, nombre: a.nombre, nota: 'el viernes con la peli', alimento: alimentoDeCapricho(a), creadoEn: HOY,
    })),
  });
  fijo(['athleteNutritionConfig', EMAIL], { athleteId: EMAIL, enabledModes: ['OMNIVORO'] });
  // El desayuno de hoy ya está comido: el reajuste no lo toca.
  fijo(['menuCompletionLog', EMAIL, HOY], { id: `${EMAIL}_${HOY}`, athleteId: EMAIL, date: HOY, menuId: MENU.id, doneMealKeys: [`${HOY_WD}_${HOY_WD}_m1`] });
  fijo(['recipeFavorites', EMAIL], { athleteId: EMAIL, recipeIds: [] });
  fijo(['catalogoAlimentos'], CATALOGO);
  fijo(['foodItems'], []);
  fijo(reglasDeRecetaKey(EMAIL), { athleteId: EMAIL, reglas: [] });
  fijo(accesoGlobalKey, null);
  for (const r of [...RECETAS, ...ALTERNATIVAS]) fijo(['receta', r.id], r);
  const porFranja: Record<number, Recipe[]> = { 1: DESAYUNOS, 2: SNACKS, 3: [...ALTERNATIVAS, ...COMIDAS], 4: [], 5: CENAS };
  for (const slot of [1, 2, 3, 4, 5]) fijo(['recetasDeFranja', slot], porFranja[slot]);
  fijo(['recipes', PERFIL.userId], []);
  // Dos productos «escaneables» para el capricho por código de barras (escribe
  // el código a mano en el escáner): un cono de caja de cuatro y una tarrina.
  for (const c of Object.keys(PRODUCTOS_DEV)) { fijo(['offPorCodigo', c], c2Producto(c)); fijo(['offProducto', c], c2Producto(c)); }
}

/** `?falla=1`: el guardado del reajuste falla, como cuando Firestore lo rechaza. */
const FALLA = new URLSearchParams(window.location.search).has('falla');

export default function MiMenuDevHarness() {
  const qc = useMemo(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    sembrar(c);
    return c;
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <div className="mx-auto min-h-screen max-w-xl space-y-4 bg-bg px-4 py-4 text-ink">
        <p className="font-mono text-caption text-ink-3 uppercase tracking-widest">/dev/mi-menu — datos de mentira · guardar no escribe</p>
        <MyMenuScreen profile={PERFIL} guardarArranque={async () => {}} guardarMenu={FALLA ? async () => { throw new Error('sin permiso'); } : async () => {}} />
        <p className="font-mono text-caption text-ink-3 uppercase tracking-widest pt-6">Perfil › Preferencias · arranque de gustos</p>
        <TarjetaDeArranque email={EMAIL} guardar={async () => {}} />
        <p className="font-mono text-caption text-ink-3 uppercase tracking-widest pt-6">Coach · Cliente › Dietas › Información</p>
        <div className="bg-surface border border-hairline rounded-surface p-5">
          <LibertadDelMenu athleteEmail={EMAIL} guardar={async () => {}} />
        </div>
      </div>
    </QueryClientProvider>
  );
}
