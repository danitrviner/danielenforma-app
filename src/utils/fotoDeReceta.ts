// El importador antiguo del recetario guardó las fotos con el host
// `storage.get.com`, que responde 404 (NoSuchBucket). El bucket bueno es
// `storage.getindya.com` y sirve EXACTAMENTE las mismas rutas — así que la URL
// no está perdida, solo mal escrita, y se puede reparar cambiando el host.
//
// Esto NO se puede hacer solo en el JSON del recetario: los menús semanales ya
// publicados guardan `recipeImage` denormalizada, y muchos la tienen con el
// host viejo (se generaron antes de arreglar el dump). Reparando aquí, en el
// punto donde se monta el <img>, se curan todos —recetario, menús, favoritos—
// sin migrar datos, en web y en nativo.
const HOST_MUERTO = 'storage.get.com';
const HOST_VIVO = 'storage.getindya.com';

/** Repara una URL de foto de receta con el host muerto conocido. Idempotente. */
export function sanearFoto(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url.includes(`/${HOST_MUERTO}/`) ? url.replace(`/${HOST_MUERTO}/`, `/${HOST_VIVO}/`) : url;
}

/**
 * `true` si la URL sirve para montar un <img>. Una URL con el host muerto
 * cuenta como viva porque `sanearFoto` la arregla — solo se descarta lo que no
 * hay forma de recuperar (vacío / nulo).
 */
export function esFotoViva(url?: string | null): boolean {
  return !!url;
}

interface ConFoto {
  image?: string;
  photoUrl?: string;
}

/** Foto utilizable (ya reparada) de una receta, o `undefined` si no tiene. */
export function fotoDeReceta(receta: ConFoto | null | undefined): string | undefined {
  return sanearFoto(receta?.image) ?? sanearFoto(receta?.photoUrl);
}
