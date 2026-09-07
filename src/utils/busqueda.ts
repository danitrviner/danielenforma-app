// Buscar por texto en la app: sin tildes y sin distinguir mayúsculas.
//
// El fallo que cierra esto (07-09-2026): Javier buscaba en el recetario el
// "sandwich de jamón serrano" que le había salido en el menú y no aparecía
// NINGUNO. Las ocho recetas del catálogo que lo son se llaman "Sándwich…", con
// tilde, y el buscador comparaba `name.toLowerCase().includes(termino)` — que
// exige la tilde escrita. Lo mismo valía para plátano, atún, brócoli, limón o
// puré, en el recetario, en los intercambios y en la biblioteca de ejercicios.
//
// Nadie escribe las tildes en un buscador. Y quien no las escribe no ve una
// lista más corta: ve cero resultados y da por hecho que la receta no existe.

/** Minúsculas, sin tildes ni diacríticos y con los espacios de sobra fuera.
 *  Los nombres del recetario importado traen espacios y saltos de línea
 *  colados ("Sándwich de jamón serrano y tomate\n"), así que el colapso de
 *  espacios no es cosmético: sin él, buscar dos palabras seguidas falla. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El término buscado aparece en el texto? Un término vacío casa con todo,
 *  que es lo que espera un buscador cuando aún no has escrito nada. */
export function coincideBusqueda(texto: string, termino: string): boolean {
  const t = normalizarTexto(termino);
  return t === '' || normalizarTexto(texto).includes(t);
}
