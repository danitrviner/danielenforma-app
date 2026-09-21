import { normalizarTexto } from './busqueda';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que el atleta escribe vs. cómo se llama en el banco

   El banco de intercambios está escrito en CATEGORÍAS, porque un intercambio
   es una categoría: "100g legumbre cocida" cubre lentejas, garbanzos y alubias
   a la vez, y "100g carne blanca sin piel (pollo, pavo...)" cubre el pollo y
   el fiambre de pavo. Eso es correcto nutricionalmente y es ilegible para
   quien busca.

   Un atleta no escribe "legumbre cocida" en un buscador. Escribe "lentejas".
   Y hasta hoy le salían cero resultados, que no se lee como "búscalo de otra
   forma" sino como "esto no se puede comer". El salto de "lentejas" a
   "legumbre" es justo el conocimiento que tiene el coach y no tiene él.

   Este módulo escribe ese salto, que es la única forma de que esté en algún
   sitio. Dos cosas, no una:

     1. La BÚSQUEDA encuentra el alimento aunque se llame de otra forma.
     2. La pantalla DICE por qué, con una frase ("Las lentejas cuentan como
        legumbre cocida"). Sin la frase, el atleta ve aparecer "legumbre
        cocida" al escribir "lentejas" y no sabe si le vale o si es un fallo
        del buscador.

   Las verduras son el caso extremo: no están en el banco porque son LIBRES y
   no cuentan intercambios. Quien busca "brócoli" y no ve nada da por hecho lo
   contrario de lo que pasa. Por eso hay entradas sin alimento, solo con nota.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Equivalencia {
  /** Lo que la gente teclea de verdad. */
  busca: string[];
  /** Fragmentos que identifican en el banco los alimentos que lo cubren.
   *  Vacío cuando el alimento no está en el banco porque es libre. */
  cubiertoPor?: string[];
  /** La frase que se enseña encima de los resultados. Se escribe a mano
   *  porque es texto que lee un atleta, no una plantilla rellenada. */
  explica: string;
}

export const EQUIVALENCIAS: Equivalencia[] = [
  // ── Legumbres ────────────────────────────────────────────────────────────
  {
    busca: ['lentejas', 'lenteja', 'garbanzos', 'garbanzo', 'alubias', 'alubia',
            'judias blancas', 'judia blanca', 'fabes', 'frijoles', 'frijol',
            'azukis', 'habas', 'potaje', 'fabada', 'hummus',
            'lentejas rojas', 'soja cocida'],
    cubiertoPor: ['legumbre cocida', 'legumbre en seco'],
    explica: 'Las legumbres —lentejas, garbanzos, alubias— van todas en «legumbre cocida» (o «en seco» si aún no lo has cocido).',
  },
  {
    busca: ['pasta de lentejas', 'pasta de garbanzo', 'espaguetis de legumbre',
            'macarrones de legumbre', 'harina de garbanzo'],
    cubiertoPor: ['pasta de legumbre'],
    explica: 'La pasta hecha de legumbre no cuenta como pasta normal: va en «pasta de legumbre».',
  },

  // ── Carnes ───────────────────────────────────────────────────────────────
  {
    busca: ['pollo', 'pechuga', 'pechuga de pollo', 'pavo', 'pechuga de pavo',
            'conejo', 'fiambre de pavo', 'fiambre de pollo', 'pavo en lonchas'],
    cubiertoPor: ['carne blanca sin piel'],
    explica: 'Pollo, pavo y conejo son «carne blanca sin piel». El fiambre de pavo también, si es de los magros.',
  },
  {
    busca: ['ternera', 'vacuno', 'buey', 'solomillo', 'caballo',
            'carne picada', 'hamburguesa de ternera', 'cerdo', 'lomo de cerdo',
            'redondo', 'cadera'],
    cubiertoPor: ['carne roja magra'],
    explica: 'Ternera, cerdo magro y demás cortes sin grasa visible van en «carne roja magra».',
  },
  {
    busca: ['cordero', 'chuletas', 'chuletillas', 'costillar', 'entrecot', 'carne grasa'],
    cubiertoPor: ['carne roja grasa'],
    explica: 'Los cortes grasos (cordero, entrecot, chuletillas) van en «carne roja grasa»: llevan media grasa además de la proteína.',
  },
  {
    busca: ['jamon serrano', 'jamon iberico', 'serrano', 'iberico', 'cecina',
            'lomo curado', 'embutido'],
    cubiertoPor: ['jamón serrano', 'embutido de calidad'],
    explica: 'El jamón serrano y los embutidos curados llevan grasa: van en el mixto de proteína y grasa, no en proteína sola.',
  },
  {
    busca: ['jamon york', 'jamon cocido', 'york', 'lomo embuchado', 'fiambre magro'],
    cubiertoPor: ['lomo embuchado'],
    explica: 'Los fiambres magros (york, lomo embuchado) van en «lomo embuchado».',
  },

  // ── Pescado y marisco ────────────────────────────────────────────────────
  {
    busca: ['merluza', 'bacalao', 'lubina', 'dorada', 'rape', 'gallo', 'panga',
            'tilapia', 'abadejo', 'pescadilla', 'mero', 'corvina', 'lenguado',
            'pescado', 'perca'],
    cubiertoPor: ['pescado blanco'],
    explica: 'Merluza, bacalao, lubina, dorada y compañía son «pescado blanco».',
  },
  {
    busca: ['salmon', 'caballa', 'sardina', 'sardinas', 'boqueron', 'boquerones',
            'trucha', 'pez espada', 'bonito', 'jurel', 'atun fresco', 'verdel'],
    cubiertoPor: ['pescado azul', 'sardinas en aceite', 'salmón ahumado'],
    explica: 'El pescado azul (salmón, sardina, caballa, trucha) lleva su propia grasa: va en el mixto de proteína y grasa.',
  },
  {
    busca: ['pulpo', 'calamar', 'calamares', 'sepia', 'chipirones', 'chopitos', 'cefalopodos'],
    cubiertoPor: ['cefalópodos'],
    explica: 'Pulpo, calamar y sepia van en «cefalópodos».',
  },
  {
    busca: ['gambas', 'langostinos', 'almejas', 'berberechos', 'cigalas',
            'marisco', 'mejillones', 'mejillon'],
    cubiertoPor: ['mejillones al natural', 'cefalópodos'],
    explica: 'El marisco al natural cuenta como proteína magra: lo más parecido del banco son los mejillones al natural.',
  },
  {
    busca: ['atun', 'atun de lata', 'atun al natural'],
    cubiertoPor: ['atún claro al natural', 'atún en escabeche', 'atún o sardinas en aceite'],
    explica: 'El atún cambia de grupo según la lata: al natural es proteína, en aceite lleva además la grasa.',
  },

  // ── Cereales, pan y harinas ──────────────────────────────────────────────
  {
    busca: ['espaguetis', 'macarrones', 'fideos', 'tallarines', 'penne', 'pasta',
            'cuscus', 'bulgur', 'mijo', 'noodles', 'quinoa', 'arroz'],
    cubiertoPor: ['arroz, pasta, couscous o quinoa', 'vasito de arroz'],
    explica: 'Toda la pasta, el arroz, el cuscús y la quinoa se pesan igual: van en la misma línea del banco.',
  },
  {
    busca: ['avena', 'copos de avena', 'muesli', 'granola', 'corn flakes',
            'cereales de desayuno', 'crunchy'],
    cubiertoPor: ['cereales (corn flakes, muesli, copos'],
    explica: 'La avena, el muesli y la granola van en «cereales».',
  },
  {
    busca: ['baguette', 'chapata', 'barra de pan', 'molde', 'tostadas', 'biscotes',
            'pan de pueblo', 'pan integral', 'picos', 'regañas'],
    cubiertoPor: ['pan (de molde'],
    explica: 'Todos los panes se pesan igual, sea barra, molde o tostada.',
  },
  {
    busca: ['harina de trigo', 'harina', 'espelta', 'maicena', 'harina de avena'],
    cubiertoPor: ['harinas (excepto de almendra)'],
    explica: 'Las harinas van juntas — menos la de almendra, que es grasa.',
  },
  {
    busca: ['ñoquis', 'noquis', 'gnocchis'],
    cubiertoPor: ['gnocchi'],
    explica: 'Los ñoquis están en el banco como «gnocchi».',
  },

  // ── Patata y tubérculos ──────────────────────────────────────────────────
  {
    busca: ['papa', 'papas', 'patatas', 'puré de patata', 'pure de patata'],
    cubiertoPor: ['patata (cruda o cocida)'],
    explica: 'La patata se pesa igual cruda que cocida.',
  },
  {
    busca: ['batata', 'camote', 'boniatos'],
    cubiertoPor: ['boniato'],
    explica: 'La batata o camote es el boniato.',
  },

  // ── Lácteos y huevo ──────────────────────────────────────────────────────
  {
    busca: ['manchego', 'parmesano', 'emmental', 'gouda', 'edam', 'cheddar',
            'brie', 'queso en lonchas', 'queso tierno', 'queso de cabra', 'mozzarella'],
    cubiertoPor: ['queso (curado, semicurado'],
    explica: 'Los quesos curados y semicurados van juntos: llevan media proteína y media grasa.',
  },
  {
    busca: ['quark', 'skyr', 'queso batido'],
    cubiertoPor: ['queso fresco batido 0%'],
    explica: 'El quark y el skyr cuentan como queso fresco batido 0%.',
  },
  {
    busca: ['clara', 'claras', 'huevina', 'clara de huevo'],
    cubiertoPor: ['claras de huevo'],
    explica: 'Las claras solas son proteína pura. El huevo entero va aparte, porque lleva la grasa de la yema.',
  },
  {
    busca: ['huevo entero', 'huevos', 'tortilla francesa', 'yema', 'huevo cocido', 'huevo frito'],
    cubiertoPor: ['huevo grande'],
    explica: 'El huevo entero lleva media proteína y media grasa: no es lo mismo que las claras.',
  },
  {
    busca: ['leche'],
    cubiertoPor: ['leche desnatada', 'leche semidesnatada', 'leche entera'],
    explica: 'La leche cambia de grupo según la grasa: la desnatada y la semi son proteína + hidrato; la entera lleva además grasa.',
  },

  // ── Grasas ───────────────────────────────────────────────────────────────
  {
    busca: ['almendras', 'almendra', 'nueces', 'nuez', 'anacardos', 'anacardo',
            'pistachos', 'pistacho', 'avellanas', 'avellana', 'cacahuetes',
            'cacahuete', 'macadamia', 'piñones', 'pinones', 'nueces de brasil'],
    cubiertoPor: ['frutos secos sin freír'],
    explica: 'Todos los frutos secos se pesan igual: van en «frutos secos sin freír».',
  },
  {
    busca: ['crema de cacahuete', 'mantequilla de cacahuete', 'peanut butter',
            'tahini', 'crema de almendras', 'crema de pistacho'],
    cubiertoPor: ['crema de frutos secos'],
    explica: 'Las cremas de frutos secos van juntas, tahini incluido.',
  },
  {
    busca: ['aove', 'aceite de oliva', 'aceite de girasol', 'aceite de coco', 'oliva'],
    cubiertoPor: ['aceite (preferible AOVE)'],
    explica: 'Cualquier aceite cuenta igual: una cucharada es un intercambio de grasa.',
  },
  {
    busca: ['olivas', 'aceituna'],
    cubiertoPor: ['aceitunas'],
    explica: 'Las olivas son las aceitunas.',
  },
  {
    busca: ['palta', 'guacamole'],
    cubiertoPor: ['aguacate o guacamole'],
    explica: 'La palta es el aguacate.',
  },
  {
    busca: ['chocolate negro', 'onza', 'onzas', 'chocolate puro', 'cacao en polvo',
            'chocolate'],
    cubiertoPor: ['chocolate +72%', 'cacao puro desgrasado'],
    explica: 'El chocolate negro y el cacao puro cuentan como grasa.',
  },
  {
    busca: ['pipas', 'semillas', 'chia', 'lino', 'sesamo', 'girasol'],
    cubiertoPor: ['pipas o semillas'],
    explica: 'Todas las semillas van juntas: chía, lino, sésamo, calabaza, girasol.',
  },

  // ── Fruta ────────────────────────────────────────────────────────────────
  {
    busca: ['fresas', 'fresa', 'arandanos', 'frambuesas', 'moras', 'cerezas',
            'frutos del bosque'],
    cubiertoPor: ['frutos rojos'],
    explica: 'Fresas, arándanos, frambuesas y moras van en «frutos rojos».',
  },
  {
    busca: ['pasas', 'orejones', 'ciruelas pasas', 'higos secos', 'fruta deshidratada',
            'arandanos secos'],
    cubiertoPor: ['frutas deshidratadas'],
    explica: 'La fruta seca concentra mucho azúcar: va aparte de la fruta fresca.',
  },

  /* ── Verduras que SÍ cuentan ────────────────────────────────────────────
     Estas tres son la trampa del sistema: la verdura es libre, pero en bote,
     frita o en la línea de los 400 g deja de serlo. Van ANTES de la entrada de
     "libres" porque lo que hay que dejar claro es justo la excepción — decirle
     a alguien que el tomate es libre mientras le sale "tomate frito" en la
     lista es peor que no decirle nada. */
  {
    busca: ['tomate frito', 'sofrito', 'salsa de tomate', 'tomate en conserva'],
    cubiertoPor: ['tomate frito'],
    explica: 'El tomate natural es libre, pero el frito lleva aceite: ese sí cuenta, y cuenta como grasa.',
  },
  {
    busca: ['pimientos en bote', 'pimiento asado', 'pimientos del piquillo', 'pimiento en conserva'],
    cubiertoPor: ['pimientos en bote'],
    explica: 'El pimiento fresco es libre; en bote va concentrado y sí cuenta, como hidrato.',
  },
  {
    busca: ['judia verde', 'judias verdes', 'vainas', 'alcachofa', 'alcachofas',
            'menestra', 'esparragos', 'esparrago'],
    cubiertoPor: ['judía verde, alcachofa, menestra'],
    explica: 'Estas cuatro no van con el resto de verduras: judía verde, alcachofa, menestra y espárragos sí cuentan, a 400 g por intercambio.',
  },

  // ── Vegetales: LIBRES, por eso no están en el banco ──────────────────────
  {
    busca: ['brocoli', 'lechuga', 'tomate', 'calabacin', 'berenjena', 'pepino',
            'espinacas', 'acelgas', 'coliflor', 'cebolla', 'zanahoria',
            'champinones', 'setas', 'canonigos', 'rucula', 'repollo',
            'apio', 'puerro', 'verdura', 'verduras', 'ensalada',
            'calabaza', 'berza', 'endivias', 'rabanos', 'pimiento'],
    explica: 'Las verduras frescas son LIBRES: no cuentan intercambios y no hace falta pesarlas ni apuntarlas. Come toda la que quieras.',
  },
  {
    busca: ['agua', 'cafe', 'infusion', 'te verde', 'especias', 'sal', 'pimienta',
            'vinagre', 'limon', 'mostaza', 'salsa de soja', 'edulcorante',
            'stevia', 'sacarina', 'refresco zero', 'caldo'],
    explica: 'Esto no cuenta intercambios: agua, café, infusiones, especias, vinagre y edulcorantes son libres.',
  },
];

/** Palabras de un texto, sin tildes, en singular aproximado.
 *  El plural español se quita a lo bruto a propósito: "lentejas" y "lenteja"
 *  tienen que ser la misma palabra, y nadie va a escribir las dos. */
function palabrasClave(texto: string): string[] {
  return normalizarTexto(texto)
    .split(/[\s,()]+/)
    .filter(p => p.length > 2)
    .map(p => {
      if (p.length > 4 && p.endsWith('es')) return p.slice(0, -2);
      if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);
      return p;
    });
}

/** ¿Lo tecleado y esta entrada del diccionario hablan de lo mismo?
 *
 *  Vale en las dos direcciones: escribir "pavo" tiene que encontrar la entrada
 *  "fiambre de pavo", y escribir "fiambre de pavo desnatado" también. Lo que
 *  no vale es que una sola palabra suelta arrastre entradas enteras, así que
 *  se exige que TODAS las palabras del lado corto estén en el largo. */
function hablanDeLoMismo(termino: string, frase: string): boolean {
  const t = palabrasClave(termino);
  const f = palabrasClave(frase);
  if (t.length === 0 || f.length === 0) return false;
  const contenidoEn = (corto: string[], largo: string[]) =>
    corto.every(p => largo.includes(p));
  return contenidoEn(t, f) || contenidoEn(f, t);
}

/** Las entradas del diccionario que responden a lo que se ha escrito. */
export function equivalenciasPara(termino: string): Equivalencia[] {
  if (!termino.trim()) return [];
  return EQUIVALENCIAS.filter(eq => eq.busca.some(b => hablanDeLoMismo(termino, b)));
}

/**
 * ¿Este alimento del banco responde a lo que se ha buscado, aunque no se
 * llame así? Devuelve solo el salto por equivalencia; la coincidencia literal
 * la sigue resolviendo `coincideBusqueda`, que es quien manda.
 */
export function coincidePorEquivalencia(label: string, termino: string): boolean {
  const eqs = equivalenciasPara(termino);
  if (eqs.length === 0) return false;
  const n = normalizarTexto(label);
  return eqs.some(eq => (eq.cubiertoPor ?? []).some(frag => n.includes(normalizarTexto(frag))));
}

/**
 * Las frases que explican por qué sale lo que sale. Es la mitad del trabajo:
 * encontrar el alimento sin decir por qué deja al atleta sin saber si le
 * vale. Se devuelven todas las que apliquen —"atún" toca dos grupos— porque
 * justo ahí es donde importa el matiz.
 */
export function explicacionesPara(termino: string): string[] {
  return equivalenciasPara(termino).map(eq => eq.explica);
}

/** ¿Lo buscado es algo LIBRE, que por eso no aparece en ninguna lista? */
export function esAlimentoLibre(termino: string): boolean {
  const eqs = equivalenciasPara(termino);
  return eqs.length > 0 && eqs.every(eq => !eq.cubiertoPor?.length);
}
