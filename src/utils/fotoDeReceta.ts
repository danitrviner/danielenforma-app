// Las 8.850 recetas importadas guardan su foto en un bucket S3 de terceros
// (`storage.get.com`) que ya no existe: cada URL responde NoSuchBucket. Pedirlas
// es una petición fallida por tarjeta —hasta 48 por página— y un hueco roto en
// pantalla. Se descartan aquí, antes de montar el <img>, para no gastar la
// petición siquiera.
const HOSTS_MUERTOS = ['storage.get.com'];

export function esFotoViva(url?: string | null): boolean {
  if (!url) return false;
  return !HOSTS_MUERTOS.some(host => url.includes(host));
}

interface ConFoto {
  image?: string;
  photoUrl?: string;
}

/** Foto utilizable de una receta, o `undefined` si no tiene o apunta a un host muerto. */
export function fotoDeReceta(receta: ConFoto | null | undefined): string | undefined {
  // Si `image` está muerta se prueba `photoUrl`: son campos distintos y una
  // receta reimportada puede tener una viva y otra no.
  return [receta?.image, receta?.photoUrl].find(esFotoViva);
}
