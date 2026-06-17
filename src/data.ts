import { Recipe, MealItem } from './types';

export const RECIPES: Recipe[] = [
  {
    id: 'salmon-power-bowl',
    title: 'Volt Salmon Power Bowl',
    time: '15 min',
    difficulty: 'HARD',
    category: 'high-protein',
    calories: 520,
    macros: { pro: '42g', carb: '62g', fat: '18g' },
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDzOfgBSLY_uIcmHKSNJs6zCJLE5xxSeOekR9HB9A444qRGLVTrnPvRqHcKEA4fdn-PWLwUqxn9TwFpjgBKE5Ku16hsRS3A1UhU2JFpvUG8ky_wX7VHBLIt3CeJvSzVG7ZhgsdSIlakUfsg-BmojM-liFqjETIoHx4QK6qcAGJzQ1CFNKjQ4p-pwfy3aBexwrJTbdpzqPZW2Jjz65rHQz4qH_qC_k2fIN8EWbNABE6nuqqEcEekw7Ijggs4cX0_iPQDxZzM7rUK-sym',
    ingredients: [
      'Filete de salmón fresco - 150g',
      'Aguacate maduro - 1/2 ud',
      'Espinacas tiernas frescas - 2 tazas',
      'Quinoa roja o blanca - 60g',
      'Aceite de coco - 1 cucharada'
    ],
    protocol: [
      'Lava bien la quinoa bajo agua fría y cuécela a fuego lento (2 partes agua por 1 de quinoa) durante 15 minutos.',
      'Sella el salmón en una sartén con aceite de coco muy caliente durante 3-4 minutos por el lado de la piel hasta que esté crujiente. Voltéalo y cocina por 2 minutos más.',
      'Corta el aguacate en láminas uniformes de alta precisión energética.',
      'Monta el tazón colocando la base de espinacas frescas, la quinoa templada, el salmón crujiente y corona con las láminas de aguacate. Adereza con gotas de limón.'
    ]
  },
  {
    id: 'en-forma-chicken-greens',
    title: 'En Forma Chicken Greens',
    time: '10 min',
    difficulty: 'EASY',
    category: 'fast-prep',
    calories: 430,
    macros: { pro: '38g', carb: '12g', fat: '10g' },
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB3eiup-kochoGovRXFHVSP8M8d6bKWxcgE4unaur0SbURLO1vZ_CypfobC2fyi361F49uDcy_cT9HorSXoA3scJAQ20vZ9MZ4775A0_HiYMF1ayS1BEpE1NjyCqnm_xIjfHYFFZuE4JMaR-fHkYbZ7eCPWrqCmYyohwN_11ilvu7umZnb3Ij1gifl52xYej2gUJtIMh4bRJBB1qfLiZpJoSnN8vAzhdlHXuU5ci7W27vmvtuvhhqm0kCtAWMQ4JhZZu6uyoZ8aZQ4C',
    ingredients: [
      'Pechuga de pollo fileteada - 180g',
      'Tomates cherry - 1 taza',
      'Lechugas finas selectas - 2 tazas',
      'Aceite de oliva virgen extra - 1 cucharada',
      'Sal del Himalaya y pimienta negra'
    ],
    protocol: [
      'Calienta una parrilla o plancha y añade el aceite de oliva.',
      'Sazona el filete de pollo y ásalo por ambos lados durante 4 minutos hasta obtener rayas doradas brutas de cocción.',
      'Corta los tomates cherry por la mitad y mézclalos en un bol amplio con las lechugas frescas.',
      'Trocea la pechuga a tiras diagonales y colócala encima de las verduras. Adereza con el aceite de oliva restante.'
    ]
  },
  {
    id: 'oats-berry-charge',
    title: 'Oats & Berry Charge',
    time: '5 min',
    difficulty: 'EASY',
    category: 'pre-workout',
    calories: 380,
    macros: { pro: '14g', carb: '45g', fat: '8g' },
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCrqylXXj133lw9qfBjzxSHw40q7n_db6QeSwuor5dPeFONOq_fv2uaU_jBtZPlWBJqB7dZrPhSLGzKukXPZP7rLT52I4XLPcf7KhxiQbRZCZp5GgMdileRLGPxZPhdoHxhoXNhOf8P13mvLZtjwKh4AMZJU9noav9a5vFQebYZ4EkhhbnNiM9mwsQNbE_hjjC9QEGKI0NVmZ17XKzM7WPCl-U1MdwndChR3k_svIYsW4PPghTWbeoZrt_Bwpjc6wHLPcHvmLbxXDVA',
    ingredients: [
      'Avena integral en hojuelas - 60g',
      'Frambuesas y arándanos frescos - 1/2 taza',
      'Nueces pecanas picadas - 15g',
      'Leche de almendras sin azúcar - 150ml',
      'Miel natural de abeja - 1 cucharadita'
    ],
    protocol: [
      'Coloca la avena y la leche de almendras en un cazo a fuego medio-bajo durante 4 minutos, removiendo de forma continua.',
      'Vuelca la avena cremosa en un bol de pizarra oscura reflectante.',
      'Añade las frambuesas, los arándanos, las nueces pecanas crujientes encima.',
      'Termina con un hilo de miel pura para conseguir una recarga óptima de glucógeno muscular previo al entrenamiento.'
    ]
  },
  {
    id: 'dark-matter-shake',
    title: 'Dark Matter Protein Shake',
    time: '2 min',
    difficulty: 'EASY',
    category: 'recovery',
    calories: 310,
    macros: { pro: '50g', carb: '8g', fat: '2g' },
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA6sJzp1VH7fouLSvVax8lxm4mIwfnGKJ4sZstKQsT9QUaf8oZLBATmTFSy0l17AyXt9e2jb4HtCmch8mltNFDpnQfUNHaLDUh-5i8m-OjufFe9EyNevoyr3QiF-SiO6ftW8ztMAs2kPrMERHEQxwO2BUz4AtWcT7O8cej56P1HmHcSdd7jgR9bE4IKP6iXO5VcZhJ68VAaqYI3yGtWUxkGD-VsXp5I6eRX8Dwwxxjd-dYQUM4MPiNM9DV9lcRlOvgsI5vI1wKv57vp',
    ingredients: [
      'Whey Isolate Double Rich Chocolate - 1.5 scoops (45g)',
      'Agua filtrada fría - 300ml',
      'Semillas de chía - 5g',
      'L-Glutamina pura en polvo - 5g'
    ],
    protocol: [
      'Vierte el agua helada en tu shaker térmico En Forma.',
      'Suma la Whey Isola, la glutamina para la óptima reparación celular y las semillas de chía.',
      'Agita con fuerza extrema durante 25 segundos para romper cada micela proteica y oxigenar el batido.',
      'Bebe dentro de los 30 minutos posteriores al entreno de piernas para activar la vía anabólica mTOR.'
    ]
  },
  {
    id: 'steak-veggie-wrap',
    title: 'Steak & Veggie Wrap',
    time: '20 min',
    difficulty: 'MEDIUM',
    category: 'high-protein',
    calories: 510,
    macros: { pro: '35g', carb: '40g', fat: '14g' },
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBmbs1m270329JZYRw2wh6-KVzupnhNu_dUPDD2fqHZ0e51b3rF7Ek2coxYscGpNE2LLJj5HRo0EW2_KbQud3wjLScTnml7eTVeqMEPolGNCismkHnarW5Tql4wEhIoTzbCVYQ0NZ5LlN7Qs2KaK_9qoLK7m6M24Klu_bNNaafPlPlglIkpqkRBsh41UzPq22uan0HhJrPW9aHd12LeZTHw9FZtOtpBKmKKetsts-WHnv12OBnlOhcJR0Uesr995q1aVI8HPB--1JeC',
    ingredients: [
      'Solomillo o bistec de ternera magra - 150g',
      'Pimiento rojo y cebolla en juliana - 1 taza',
      'Tortilla de trigo integral grande - 1 ud',
      'Salsa de yogur y mostaza fit - 1 cucharada',
      'Pimienta de cayena'
    ],
    protocol: [
      'Saltea el pimiento y la cebolla en una sartén con spray de oliva hasta que se caramelicen ligeramente.',
      'Cocina el solomillo a fuego alto, 2 minutos por lado para un punto tierno, y córtalo en tiras.',
      'Calienta la tortilla de trigo integral en una plancha caliente por 15 segundos.',
      'Sacea la base de la tortilla, acomoda el filete de ternera y las verduras salteadas, y rólalo bien apretado para cortarlo transversalmente.'
    ]
  }
];

export const FOOD_ITEMS: MealItem[] = [
  // CARBOHIDRATOS
  { id: 'avena-integral', name: 'Avena en hojuelas', category: 'carbs', portionSize: '100g', exchangeInfo: '1 Intercambio (HC)' },
  { id: 'arroz-integral', name: 'Arroz integral', category: 'carbs', portionSize: '120g', exchangeInfo: '1 Intercambio (HC)' },
  { id: 'patata-cocida', name: 'Patata cocida', category: 'carbs', portionSize: '150g', exchangeInfo: '1 Intercambio (HC)' },
  { id: 'boniato-horno', name: 'Boniato al horno', category: 'carbs', portionSize: '130g', exchangeInfo: '1 Intercambio (HC)' },
  { id: 'pan-integral', name: 'Pan integral', category: 'carbs', portionSize: '40g', exchangeInfo: '1 Intercambio (HC)' },
  { id: 'pasta-integral', name: 'Pasta integral cocida', category: 'carbs', portionSize: '100g', exchangeInfo: '1 Intercambio (HC)' },

  // PROTEINAS
  { id: 'pechuga-pollo', name: 'Pechuga de Pollo', category: 'protein', portionSize: '200g', exchangeInfo: '2 Intercambios (Prot)' },
  { id: 'claras-huevo', name: 'Claras de huevo', category: 'protein', portionSize: '200g', exchangeInfo: '1 Intercambio (Prot)' },
  { id: 'tilapia-blanca', name: 'Filete de Tilapia', category: 'protein', portionSize: '120g', exchangeInfo: '1 Intercambio (Prot)' },
  { id: 'whey-protein', name: 'Whey Protein Isolate', category: 'protein', portionSize: '30g', exchangeInfo: '1 Intercambio (Prot)' },
  { id: 'lomo-cerdo', name: 'Lomo de cerdo magro', category: 'protein', portionSize: '110g', exchangeInfo: '1 Intercambio (Prot)' },
  { id: 'atun-lata', name: 'Atún al natural', category: 'protein', portionSize: '100g', exchangeInfo: '1 Intercambio (Prot)' },

  // GRASAS
  { id: 'almendras-raw', name: 'Almendras enteras', category: 'fat', portionSize: '15g', exchangeInfo: '1 Intercambio (Grasa)' },
  { id: 'aceite-oliva', name: 'Aceite de oliva extra', category: 'fat', portionSize: '10g', exchangeInfo: '1 Intercambio (Grasa)' },
  { id: 'aguacate-grasa', name: 'Aguacate fresco', category: 'fat', portionSize: '50g', exchangeInfo: '1 Intercambio (Grasa)' },
  { id: 'nueces-grasa', name: 'Nueces de nogal', category: 'fat', portionSize: '15g', exchangeInfo: '1 Intercambio (Grasa)' },

  // VEGETALES
  { id: 'espinaca-veg', name: 'Espinacas frescas', category: 'veg', portionSize: '150g', exchangeInfo: '1 Intercambio (Veg)' },
  { id: 'brocoli-veg', name: 'Brócoli al vapor', category: 'veg', portionSize: '120g', exchangeInfo: '1 Intercambio (Veg)' },
  { id: 'tomate-veg', name: 'Tomate de ensalada', category: 'veg', portionSize: '150g', exchangeInfo: '1 Intercambio (Veg)' }
];
