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

/**
 * ¿El término buscado aparece en el texto?
 *
 * Casa PALABRA A PALABRA y en cualquier orden, no la frase entera. Buscando
 * "queso batido cacao granola" tiene que salir "Queso batido con cacao 0%,
 * plátano, granola y chocolate": pidiendo la frase literal no salía, porque
 * entre medias hay un "0%," y un "plátano" que nadie va a teclear en el mismo
 * sitio (Dani, 07-09-2026). Nadie recuerda el nombre exacto de una receta; se
 * acuerda de tres ingredientes.
 *
 * Un término vacío casa con todo, que es lo que espera un buscador cuando aún
 * no has escrito nada.
 */
export function coincideBusqueda(texto: string, termino: string): boolean {
  const t = normalizarTexto(termino);
  if (t === '') return true;
  const n = normalizarTexto(texto);
  // El camino corto —la frase tal cual— primero: es lo más común y así una
  // búsqueda de una sola palabra no paga el reparto.
  if (n.includes(t)) return true;
  return t.split(' ').every(palabra => n.includes(palabra));
}

/**
 * Cuánto se ajusta un texto a lo buscado: MENOS es mejor. Sirve para ordenar
 * lo que ya casa con `coincideBusqueda` (Dani, 25-11: «si busco huevo, que
 * salgan primero unos huevos con jamón, no un bocadillo de jamón cocido con
 * rúcula, guisantes y medio huevo revuelto»). Lo que se busca manda cuando va
 * al principio del nombre y como palabra entera; los nombres cortos, que van
 * al grano, ganan a los largos.
 */
export function relevanciaDeBusqueda(texto: string, termino: string): number {
  const t = normalizarTexto(termino);
  const n = normalizarTexto(texto);
  if (t === '') return 0;
  let puntos = n.length * 0.3;
  for (const palabra of t.split(' ')) {
    const aInicioDePalabra = new RegExp(`(^|[^a-z0-9ñ])${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(n);
    if (aInicioDePalabra) puntos += aInicioDePalabra.index + (aInicioDePalabra[1] ? 1 : 0);
    else {
      const dentro = n.indexOf(palabra);
      puntos += dentro >= 0 ? dentro + 50 : 200;
    }
  }
  return puntos;
}
