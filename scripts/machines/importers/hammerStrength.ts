import type { Importador, MaquinaCruda } from '../tipos';

// Life Fitness publica Hammer Strength dentro de su catálogo de Plate Loaded.
// La página de la familia está renderizada en servidor y trae las 41 máquinas de
// una vez, en carruseles: no hay "cargar más" ni paginación que recorrer, cosa
// que verifiqué comparando esta página con la categoría padre /plate-loaded
// (que además incluye modelos de la marca Life Fitness, no de Hammer Strength).
const LISTADO = 'https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded/hammer-strength';
const BASE = 'https://www.lifefitness.com';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function desescapar(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export const hammerStrength: Importador = {
  marca: 'hammerStrength',
  familia: 'Plate Loaded',

  async obtener(): Promise<MaquinaCruda[]> {
    const res = await fetch(LISTADO, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} en el listado de Hammer Strength`);
    const html = await res.text();

    // Cada tarjeta es un <a title="..."> con el nombre en .list-carousel--item-name
    // y la imagen en data-handler, con un {width} que se sustituye por el ancho
    // que se quiera servir.
    const tarjeta = /<a\b[^>]*?title="([^"]+)"[^>]*?href="(\/en-us\/catalog\/strength-training\/plate-loaded\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const porUrl = new Map<string, MaquinaCruda>();

    for (const m of html.matchAll(tarjeta)) {
      const [, , href, interior] = m;
      const nombre = /item-name[^>]*>\s*([^<]+?)\s*</.exec(interior)?.[1];
      const imagen = /data-handler="([^"]+)"/.exec(interior)?.[1];
      // El enlace a la propia familia no lleva nombre ni imagen: así se descarta solo.
      if (!nombre || !imagen) continue;
      porUrl.set(href, {
        nombreOriginal: desescapar(nombre),
        // El CDN de Life Fitness solo sirve un puñado de anchos concretos: pedir
        // 640 devuelve 404. 960 es el siguiente por encima del tamaño final, así
        // que sharp reduce en vez de ampliar y la foto no queda blanda.
        imagenUrl: imagen.replace('{width}', '960'),
        urlProducto: BASE + href,
      });
    }

    return [...porUrl.values()];
  },

  // El chip de la tarjeta ya dice "Hammer Strength · Plate Loaded", así que las
  // traducciones no repiten "de discos" en cada nombre: sería ruido en 16 de 41.
  // "Convergente" es como se conoce en gimnasio la tecnología Iso-Lateral (cada
  // brazo trabaja independiente) y distingue máquinas que si no colisionarían:
  // "Iso-Lateral Row" y "T-Bar Row" son dos aparatos distintos.
  traducciones: {
    'Abdominal / Oblique Crunch': 'Crunch abdominal y oblicuo',
    'Glute Ham / Reverse Hyper': 'Banco de femoral e hiperextensión inversa',
    'Ground Base® Combo Twist': 'Giro combinado de pie',
    'Ground Base® Jammer': 'Jammer de empuje de pie',
    'Ground Base® Multi-Squat': 'Multisentadilla de pie',
    'Ground Base® Squat / High Pull': 'Sentadilla y tirón alto de pie',
    'Iso-Lateral Bench Press': 'Press de banca convergente',
    'Iso-Lateral Chest / Back': 'Pecho y espalda convergente',
    'Iso-Lateral D.Y. Row': 'Remo D.Y. convergente',
    'Iso-Lateral Decline Chest Press': 'Press declinado convergente',
    'Iso-Lateral Front Lat Pulldown': 'Jalón al pecho convergente',
    'Iso-Lateral High Row': 'Remo alto convergente',
    'Iso-Lateral Horizontal Bench Press': 'Press de banca horizontal convergente',
    'Iso-Lateral Incline Press': 'Press inclinado convergente',
    'Iso-Lateral Kneeling Leg Curl': 'Curl femoral arrodillado convergente',
    'Iso-Lateral Leg Curl': 'Curl femoral convergente',
    'Iso-Lateral Leg Extension': 'Extensión de cuádriceps convergente',
    'Iso-Lateral Low Row': 'Remo bajo convergente',
    'Iso-Lateral Row': 'Remo convergente',
    'Iso-Lateral Shoulder Press': 'Press de hombro convergente',
    'Iso-Lateral Super Incline Press': 'Press superinclinado convergente',
    'Iso-Lateral Wide Chest': 'Press de pecho abierto convergente',
    'Iso-Lateral Wide Pulldown': 'Jalón abierto convergente',
    'Plate Loaded 4-Way Neck': 'Cuello en 4 direcciones',
    'Plate Loaded Assisted Nordic Ham': 'Nórdico asistido',
    'Plate Loaded Belt Squat': 'Sentadilla con cinturón',
    'Plate Loaded Glute Drive': 'Empuje de cadera',
    'Plate Loaded Gripper': 'Agarre de mano',
    'Plate Loaded Hack Squat': 'Hack squat',
    'Plate Loaded Lateral Raise': 'Elevaciones laterales',
    'Plate Loaded Linear Leg Press': 'Prensa lineal',
    'Plate Loaded Pendulum-X Squat': 'Sentadilla pendular',
    'Plate Loaded Pullover': 'Pullover',
    'Plate Loaded Seated Biceps': 'Curl de bíceps sentado',
    'Plate Loaded Seated Calf Raise': 'Elevación de gemelo sentado',
    'Plate Loaded Seated Dip': 'Fondos sentado',
    'Plate Loaded Super Fly': 'Aperturas de pecho',
    'Plate Loaded Super Squat Press': 'Prensa de sentadilla',
    'Plate Loaded Tibia Dorsi-Flexion': 'Flexión dorsal de tibial',
    'Seated / Standing Shrug': 'Encogimientos sentado o de pie',
    'T-Bar Row': 'Remo en T',
  },

  categorias: {
    // El Jammer es un empuje explosivo de pie: el heurístico lo lee como
    // sentadilla por la palabra "jammer" en la regla de pierna, pero el gesto
    // dominante es de hombro.
    'Ground Base® Jammer': 'deltoide_ant',
  },
};
