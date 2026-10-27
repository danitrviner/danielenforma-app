/* ═══════════════════════════════════════════════════════════════════════════
   Transiciones de vista (lista → detalle).

   `view-transition-name` tiene que ser un identificador CSS y ÚNICO en la
   página: un email o un UID con puntos y arrobas no vale tal cual. Esto lo
   limpia y lo prefija, para que la fila de la lista y la cabecera del
   detalle lleven el MISMO nombre y el navegador «vuele» el título de una a
   otra (`navigate(…, { viewTransition: true })`). Donde no hay soporte
   (Firefox) no pasa nada: la navegación es la de siempre.
   ═══════════════════════════════════════════════════════════════════════════ */
export function nombreDeTransicion(prefijo: string, id: string): string {
  return `${prefijo}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
