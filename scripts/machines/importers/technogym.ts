import type { Importador, MaquinaCruda } from '../tipos';

// Technogym es una SPA de Salesforce Commerce, pero la categoría se sirve
// renderizada en servidor con el resultado de búsqueda embebido en el HTML.
// La paginación NO va por `offset` (el SSR lo ignora y devuelve siempre la
// primera página, lo comprobé): va por `limit`. Se pide un lote, se lee el
// `total` que viene en la respuesta y se vuelve a pedir con el límite subido
// hasta traerlo todo — así el importador sigue siendo correcto si mañana
// Technogym añade máquinas a la familia.
const CATEGORIA = 'https://www.technogym.com/en-GB/category/pure-strength/';
const LOTE_INICIAL = 48;
const LOTE_MAXIMO = 500; // tope de seguridad, muy por encima de la familia real

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Pagina {
  productos: MaquinaCruda[];
  total: number;
}

function desescapar(s: string): string {
  return s.replace(/\\u002F/g, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

async function pedir(limite: number): Promise<Pagina> {
  const res = await fetch(`${CATEGORIA}?limit=${limite}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en la categoría de Technogym`);
  const html = await res.text();

  const total = Number(/"productSearchResult":\{[^]*?"total":(\d+)/.exec(html)?.[1] ?? 0);

  // Cada hit trae la imagen justo antes del par productId/productName.
  const hit = /"disBaseLink":"([^"]+)"[^]*?"productId":"([^"]+)","productName":"([^"]+)"/g;
  const porId = new Map<string, MaquinaCruda>();
  for (const m of html.matchAll(hit)) {
    const [, imagen, id, nombre] = m;
    porId.set(id, {
      nombreOriginal: desescapar(nombre),
      // sw/sh/sm son los parámetros de escalado de Demandware: se pide ya
      // recortada al tamaño que se va a guardar, en vez de bajar el original.
      imagenUrl: `${desescapar(imagen)}?sw=640&sh=480&sm=fit`,
      urlProducto: `https://www.technogym.com/en-GB/product/${id}.html`,
    });
  }

  return { productos: [...porId.values()], total };
}

export const technogym: Importador = {
  marca: 'technogym',
  familia: 'Pure Strength',

  async obtener(): Promise<MaquinaCruda[]> {
    let limite = LOTE_INICIAL;
    let pagina = await pedir(limite);
    while (pagina.total > pagina.productos.length && limite < LOTE_MAXIMO) {
      limite = Math.min(Math.max(pagina.total, limite * 2), LOTE_MAXIMO);
      pagina = await pedir(limite);
    }
    if (pagina.total > pagina.productos.length) {
      throw new Error(
        `Technogym declara ${pagina.total} productos y solo se han recuperado ${pagina.productos.length}. ` +
        'Ha cambiado la paginación: revisa el importador antes de publicar nada.'
      );
    }

    // La categoría "Pure Strength" mezcla las máquinas con los bancos y racks
    // libres (Olympic Flat Bench, Scott Bench, T Bar Row...). Aquí solo entran
    // las máquinas: son lo que define el equipamiento de un gimnasio, y un banco
    // plano no aporta información útil sobre qué puede entrenar el atleta.
    const soloMaquinas = pagina.productos.filter(p => /^Pure Strength /.test(p.nombreOriginal));
    console.log(`   technogym: ${soloMaquinas.length} máquinas de ${pagina.total} productos (el resto son bancos libres)`);
    return soloMaquinas;
  },

  // El chip ya dice "Technogym · Pure Strength": el prefijo no se repite.
  traducciones: {
    'Pure Strength Belt Squat': 'Sentadilla con cinturón',
    'Pure Strength Biceps': 'Curl de bíceps',
    'Pure Strength Calf': 'Elevación de gemelo de pie',
    'Pure Strength Chest Press': 'Press de pecho',
    'Pure Strength Deadlift': 'Peso muerto',
    'Pure Strength Hack Squat': 'Hack squat',
    'Pure Strength Hip Thrust': 'Hip thrust',
    'Pure Strength Incline Chest Press': 'Press inclinado',
    'Pure Strength Leg Extension': 'Extensión de cuádriceps',
    'Pure Strength Leg Press': 'Prensa de piernas',
    'Pure Strength Linear Leg Press': 'Prensa lineal',
    'Pure Strength Low Row': 'Remo bajo',
    'Pure Strength Pulldown': 'Jalón al pecho',
    'Pure Strength Pullover': 'Pullover',
    'Pure Strength Rear Kick': 'Patada de glúteo',
    'Pure Strength Row': 'Remo',
    'Pure Strength Seated Calf': 'Elevación de gemelo sentado',
    'Pure Strength Seated Dip': 'Fondos sentado',
    'Pure Strength Shoulder Press': 'Press de hombro',
    'Pure Strength Standing Abductor': 'Abductor de pie',
    'Pure Strength Standing Leg Curl': 'Curl femoral de pie',
    'Pure Strength Wide Chest Press': 'Press de pecho abierto',
  },
};
