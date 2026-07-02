export interface FoodGroup {
  id: string;
  name: string;
  icon: string; // material symbol name
  foods: string[];
}

export const FOOD_GROUPS: FoodGroup[] = [
  {
    id: 'carnes',
    name: 'Carnes',
    icon: 'dining',
    foods: [
      'Pollo', 'Pechuga de pollo', 'Muslo de pollo', 'Pavo',
      'Jamón cocido', 'Jamón serrano', 'Lomo ibérico', 'Lomo embuchado', 'Chorizo',
      'Ternera', 'Carne picada', 'Filete de ternera',
      'Cerdo', 'Lomo de cerdo', 'Costilla', 'Conejo', 'Cordero',
    ],
  },
  {
    id: 'pescados',
    name: 'Pescados y mariscos',
    icon: 'set_meal',
    foods: [
      'Salmón', 'Atún', 'Merluza', 'Bacalao', 'Sardina',
      'Caballa', 'Boquerones', 'Anchoa', 'Trucha', 'Dorada', 'Lubina',
      'Gamba', 'Langostino', 'Mejillón', 'Calamar', 'Pulpo', 'Sepia',
    ],
  },
  {
    id: 'huevos',
    name: 'Huevos',
    icon: 'egg',
    foods: [
      'Huevo', 'Clara de huevo', 'Yema de huevo',
      'Huevo de codorniz', 'Tortilla',
    ],
  },
  {
    id: 'lacteos',
    name: 'Lácteos',
    icon: 'local_cafe',
    foods: [
      'Leche', 'Yogur natural', 'Yogur griego', 'Kéfir',
      'Queso fresco', 'Requesón', 'Mozzarella', 'Queso cottage',
      'Queso parmesano', 'Queso manchego', 'Queso feta',
      'Nata', 'Mantequilla',
    ],
  },
  {
    id: 'cereales',
    name: 'Cereales y pan',
    icon: 'bakery_dining',
    foods: [
      'Avena', 'Arroz blanco', 'Arroz integral', 'Quinoa',
      'Pan integral', 'Pan blanco', 'Pan de centeno', 'Pan de molde', 'Pan pita',
      'Pasta', 'Espagueti', 'Macarrones', 'Cuscús', 'Bulgur',
      'Harina de avena', 'Tortita de arroz', 'Farro',
    ],
  },
  {
    id: 'tuberculos',
    name: 'Tubérculos',
    icon: 'energy_savings_leaf',
    foods: ['Patata', 'Boniato', 'Yuca', 'Remolacha', 'Ñame'],
  },
  {
    id: 'legumbres',
    name: 'Legumbres y proteína vegetal',
    icon: 'eco',
    foods: [
      'Lentejas', 'Garbanzos', 'Alubias', 'Judías blancas', 'Alubias rojas',
      'Guisantes', 'Habas', 'Edamame',
      'Tofu', 'Tempeh', 'Soja', 'Proteína de soja', 'Hummus',
    ],
  },
  {
    id: 'verduras',
    name: 'Verduras',
    icon: 'grass',
    foods: [
      'Lechuga', 'Espinaca', 'Rúcula', 'Kale', 'Acelga', 'Col',
      'Tomate', 'Pepino', 'Zanahoria', 'Apio', 'Rábano',
      'Cebolla', 'Cebolleta', 'Ajo', 'Puerro',
      'Pimiento rojo', 'Pimiento verde', 'Pimiento amarillo',
      'Brócoli', 'Coliflor', 'Calabacín', 'Berenjena',
      'Champiñón', 'Seta', 'Alcachofa', 'Espárrago',
      'Judía verde', 'Calabaza', 'Nabo',
    ],
  },
  {
    id: 'frutas',
    name: 'Frutas',
    icon: 'nutrition',
    foods: [
      'Manzana', 'Naranja', 'Plátano', 'Fresa', 'Uva',
      'Pera', 'Melocotón', 'Nectarina', 'Albaricoque',
      'Kiwi', 'Piña', 'Mango', 'Papaya',
      'Sandía', 'Melón', 'Cereza', 'Ciruela',
      'Arándano', 'Frambuesa', 'Mora', 'Higo',
      'Limón', 'Pomelo', 'Mandarina',
    ],
  },
  {
    id: 'frutos_secos',
    name: 'Frutos secos y semillas',
    icon: 'grain',
    foods: [
      'Almendra', 'Nuez', 'Anacardo', 'Avellana', 'Pistachos',
      'Cacahuetes', 'Piñones',
      'Semillas de chía', 'Semillas de lino', 'Semillas de girasol',
      'Semillas de calabaza', 'Semillas de sésamo',
      'Tahini', 'Mantequilla de cacahuete', 'Mantequilla de almendras',
    ],
  },
  {
    id: 'grasas',
    name: 'Grasas y aceites',
    icon: 'water_drop',
    foods: [
      'Aceite de oliva', 'Aceite de coco', 'Aceite de girasol',
      'Aguacate', 'Aceitunas', 'Mayonesa', 'Ghee',
    ],
  },
  {
    id: 'suplementos',
    name: 'Suplementos',
    icon: 'science',
    foods: [
      'Proteína whey', 'Proteína de suero', 'Caseína', 'Proteína vegana',
      'Proteína en polvo', 'Creatina', 'Colágeno', 'BCAA',
      'Omega-3', 'Vitamina D', 'Magnesio',
    ],
  },
];

export const ALL_FOODS: string[] = FOOD_GROUPS.flatMap(g => g.foods);
