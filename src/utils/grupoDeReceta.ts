import type { Recipe } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
   Grupo de una receta, para filtrar (Dani, 26-10-2026)

   El recetario importado solo trae cuatro categorías («Platos salados /
   principales», «Bebidas», «Desayuno y dulces», «Suplementos deportivos») y en
   «Platos salados» caían batidos, fruta, frutos secos o salsas. Aquí cada
   receta se lee por su PLATO PRINCIPAL: lo que va antes de la primera «/» (los
   menús «Pollo a la plancha / Ensalada») y antes del primer «con» o «y». Dentro
   de eso, la primera palabra clave que aparece decide («Berenjena rellena de
   quinoa» es verdura; «Albóndigas de lentejas», legumbre). Palabras enteras y
   con plural («alubias», «raviolis»).

   No se guarda nada: se calcula al leer, igual para el índice y para las
   recetas del constructor.
   ═══════════════════════════════════════════════════════════════════════════ */

export const GRUPOS_DE_RECETA = [
  'Desayunos: avena, tortitas y cereales',
  'Yogures, lácteos y bowls',
  'Batidos y smoothies',
  'Bebidas',
  'Fruta',
  'Frutos secos y snacks',
  'Dulces y postres',
  'Tostadas y bocadillos',
  'Wraps, tacos y burritos',
  'Hamburguesas',
  'Huevos y tortillas',
  'Ensaladas',
  'Sopas, cremas y purés',
  'Arroces y granos',
  'Pastas',
  'Legumbres',
  'Pescados y marisco',
  'Carnes y aves',
  'Verduras',
  'Pizzas y masas',
  'Salsas y acompañamientos',
  'Alimentos sueltos',
  'Suplementos',
  'Otros',
] as const;

export type GrupoDeReceta = typeof GRUPOS_DE_RECETA[number];

/** Por orden de prioridad cuando dos palabras empiezan en el mismo sitio. */
const PALABRAS: [GrupoDeReceta, string[]][] = [
  ['Batidos y smoothies', ['batido', 'smoothie', 'shake', 'licuado', 'frappe', 'frape']],
  ['Bebidas', ['cafe', 'te', 'infusion', 'zumo', 'limonada', 'horchata', 'chocolate caliente', 'colacao', 'cola cao', 'coctel', 'cocktail', 'mojito', 'latte', 'capuccino', 'cappuccino', 'matcha', 'granizado', 'bebida', 'refresco', 'tisana', 'kombucha', 'leche', 'kefir']],
  ['Dulces y postres', ['banana bread', 'bizcocho', 'tarta', 'galleta', 'muffin', 'magdalena', 'brownie', 'postre', 'mousse', 'natilla', 'flan', 'helado', 'polo', 'donut', 'cookie', 'cheesecake', 'tiramisu', 'trufa', 'bombon', 'pastel', 'churro', 'coulant', 'arroz con leche', 'crumble', 'cupcake', 'sorbete', 'mug cake', 'bollo', 'turron', 'plum cake', 'membrillo', 'gofio']],
  ['Desayunos: avena, tortitas y cereales', ['avena', 'porridge', 'oatmeal', 'tortita', 'pancake', 'crepe', 'gofre', 'waffle', 'muesli', 'granola', 'cereal', 'overnight', 'papilla', 'french toast', 'torrija']],
  ['Yogures, lácteos y bowls', ['yogur', 'yogurt', 'skyr', 'pudding', 'pudin', 'acai', 'queso batido', 'queso fresco', 'requeson', 'cottage', 'quark', 'kefir con', 'cuajada']],
  ['Ensaladas', ['ensalada', 'salad', 'tabule', 'poke', 'ensaladilla']],
  ['Sopas, cremas y purés', ['sopa', 'crema de', 'pure', 'gazpacho', 'salmorejo', 'caldo', 'consome', 'vichyssoise', 'potaje', 'guiso', 'estofado', 'cocido', 'hervido', 'marmitako', 'fabada', 'olla']],
  ['Pizzas y masas', ['pizza', 'empanada', 'empanadilla', 'quiche', 'focaccia', 'coca', 'hojaldre', 'calzone', 'lasana']],
  ['Hamburguesas', ['hamburguesa', 'burger']],
  ['Wraps, tacos y burritos', ['wrap', 'burrito', 'fajita', 'taco', 'quesadilla', 'kebab', 'shawarma', 'enchilada']],
  ['Tostadas y bocadillos', ['tostada', 'tosta', 'bocadillo', 'bocata', 'sandwich', 'montadito', 'pita', 'bagel', 'pan', 'arepa', 'molleta', 'pepito', 'perrito', 'mollete', 'brioche']],
  ['Arroces y granos', ['arroz', 'risotto', 'paella', 'sushi', 'quinoa', 'cuscus', 'couscous', 'bulgur', 'mijo', 'trigo sarraceno', 'trigo', 'espelta', 'cebada', 'amaranto']],
  ['Pastas', ['pasta', 'espagueti', 'spaghetti', 'macarron', 'tallarin', 'fideo', 'canelon', 'noqui', 'gnocchi', 'ravioli', 'bolonesa', 'fettuccine', 'penne', 'tortellini', 'noodle', 'lasagna', 'fideua', 'gyoza', 'helice', 'tagliatelle', 'linguine', 'udon', 'ramen']],
  ['Legumbres', ['lenteja', 'garbanzo', 'alubia', 'judias blancas', 'frijol', 'soja texturizada', 'edamame', 'tofu', 'tempeh', 'seitan', 'falafel', 'hummus', 'humus', 'heura']],
  ['Huevos y tortillas', ['tortilla', 'revuelto', 'omelette', 'huevo', 'frittata', 'shakshuka', 'clara']],
  ['Pescados y marisco', ['salmon', 'atun', 'merluza', 'bacalao', 'pescado', 'gamba', 'marisco', 'lubina', 'dorada', 'sardina', 'trucha', 'langostino', 'calamar', 'pulpo', 'mejillon', 'almeja', 'berberecho', 'boqueron', 'rape', 'emperador', 'caballa', 'sepia', 'corvina', 'lenguado', 'bonito', 'anchoa', 'surimi', 'gula', 'pez espada', 'cigala', 'vieira', 'mero', 'rodaballo', 'perca', 'panga', 'tilapia', 'arenque', 'abadejo', 'gallo', 'jurel', 'chipiron', 'navaja', 'ceviche']],
  ['Carnes y aves', ['pollo', 'ternera', 'cerdo', 'pavo', 'carne', 'filete', 'lomo', 'solomillo', 'chuleta', 'costilla', 'conejo', 'cordero', 'jamon', 'chorizo', 'secreto', 'pechuga', 'muslo', 'contramuslo', 'buey', 'entrecot', 'salchicha', 'codorniz', 'pato', 'alita', 'fiambre', 'cecina', 'lacon', 'morcilla', 'steak', 'tartar', 'carpaccio', 'magret', 'cabrito', 'ciervo', 'jabali', 'hamburguesa de pollo']],
  ['Verduras', ['verdura', 'brocoli', 'coliflor', 'berenjena', 'calabacin', 'espinaca', 'esparrago', 'champinon', 'seta', 'alcachofa', 'pimiento', 'calabaza', 'judias verdes', 'acelga', 'puerro', 'patata', 'boniato', 'zanahoria', 'salteado', 'wok', 'pisto', 'parrillada', 'tomate', 'aguacate relleno', 'col', 'repollo', 'pepino', 'menestra', 'ratatouille', 'escalivada', 'caponata', 'yuca', 'mazorca', 'maiz', 'pepinillo', 'remolacha', 'cebolla', 'guisante', 'habas', 'lechuga']],
  ['Salsas y acompañamientos', ['salsa', 'guacamole', 'alioli', 'mayonesa', 'vinagreta', 'alino', 'dip', 'pesto', 'chimichurri', 'tzatziki', 'mermelada', 'crema de cacahuete', 'pate', 'tahini', 'ketchup', 'mostaza']],
  ['Frutos secos y snacks', ['barrita', 'frutos secos', 'nuez', 'nueces', 'almendra', 'anacardo', 'pistacho', 'avellana', 'cacahuete', 'crackers', 'palomitas', 'chips', 'snack', 'bolitas energeticas', 'energy balls', 'pipas', 'tortitas de arroz', 'tortitas de maiz', 'aceituna', 'nachos']],
];

const FRUTAS = ['manzana', 'pera', 'platano', 'banana', 'melon', 'sandia', 'pina', 'mango', 'kiwi', 'naranja', 'mandarina', 'uva', 'fresa', 'frambuesa', 'arandano', 'cereza', 'melocoton', 'albaricoque', 'ciruela', 'higo', 'granada', 'papaya', 'macedonia', 'fruta', 'frutos rojos', 'nectarina', 'paraguayo', 'caqui', 'chirimoya', 'pomelo', 'compota', 'moras', 'datil', 'nispero', 'orejon', 'castana', 'pasas', 'ciruela pasa', 'lichi', 'maracuya', 'guayaba'];

/** Lo que delata un suplemento entre los «alimentos sueltos». */
const SUPLEMENTO = ['gel', 'barrita', 'electrolito', 'isotonica', 'isotonico', 'proteina', 'whey', 'caseina', 'creatina', 'bcaa', 'aminoacido', 'maltodextrina', 'ciclodextrina', 'cafeina', 'recovery', 'drink', 'pre entreno', 'preentreno', 'beta alanina', 'glutamina', 'colageno', 'magnesio', 'vitamina', 'omega'];

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Una expresión por palabra: entera y con su plural (-s / -es). */
const patrones = new Map<string, RegExp>();
function patron(k: string): RegExp {
  let p = patrones.get(k);
  if (!p) { p = new RegExp(`(^|[^a-z])${escapar(k)}(s|es)?($|[^a-z])`); patrones.set(k, p); }
  return p;
}

/** Dónde empieza la primera de esas palabras en el texto, o null. */
function primeraPosicion(texto: string, palabras: string[]): number | null {
  let mejor: number | null = null;
  for (const k of palabras) {
    const m = patron(k).exec(texto);
    if (m && (mejor === null || m.index < mejor)) mejor = m.index;
  }
  return mejor;
}

function grupoDelTexto(texto: string): GrupoDeReceta | null {
  let mejor: { pos: number; orden: number; grupo: GrupoDeReceta } | null = null;
  PALABRAS.forEach(([grupo, palabras], orden) => {
    const pos = primeraPosicion(texto, palabras);
    if (pos !== null && (!mejor || pos < mejor.pos || (pos === mejor.pos && orden < mejor.orden))) mejor = { pos, orden, grupo };
  });
  // La fruta solo gana si va delante de cualquier otro plato («Manzana asada
  // con canela» sí; «Pollo con piña» no).
  const fruta = primeraPosicion(texto, FRUTAS);
  if (fruta !== null && (!mejor || fruta < (mejor as { pos: number }).pos)) return 'Fruta';
  return mejor ? (mejor as { grupo: GrupoDeReceta }).grupo : null;
}

const cache = new WeakMap<object, GrupoDeReceta>();

export function grupoDeReceta(r: Partial<Pick<Recipe, 'name' | 'categoria'>>): GrupoDeReceta {
  const guardado = cache.get(r);
  if (guardado) return guardado;
  let g: GrupoDeReceta;
  const cat = r.categoria ?? '';
  const nombre = ` ${quitarTildes(r.name ?? '').replace(/\(p\)/g, ' ').replace(/\s+/g, ' ')} `;
  const esSuplemento = primeraPosicion(nombre, SUPLEMENTO) !== null;
  if (cat === 'Alimentos y suplementos') g = esSuplemento ? 'Suplementos' : 'Alimentos sueltos';
  else if (cat === 'Suplementos deportivos' && esSuplemento) g = 'Suplementos';
  else {
    const principal = nombre.split('/')[0];
    const cabeza = principal.split(/\s(?:con|y)\s/)[0];
    g = grupoDelTexto(cabeza)
      ?? grupoDelTexto(principal)
      ?? (cat.includes('Bebida') ? 'Bebidas' : cat.includes('Desayuno') ? 'Desayunos: avena, tortitas y cereales' : 'Otros');
  }
  cache.set(r, g);
  return g;
}
