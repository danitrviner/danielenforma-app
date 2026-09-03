// Archivar y borrar clientes: las dos decisiones, puras y en un solo sitio.
//
// Archivar es baja LÓGICA de la vista del coach — el cliente desaparece de
// listas, contadores y selectores hasta que se desarchiva, y vuelve entero.
// No es `estadoCrm: 'baja'`: una baja es un hecho comercial, con su fecha y su
// motivo, que sigue contando para el churn y hay que poder consultar. Archivar
// es «quítamelo de delante».
//
// Están aquí y no dentro de los hooks porque son las dos reglas que la lista y
// la ficha tienen que contar IGUAL, y porque así se pueden probar sin montar
// React (el repo no testea hooks, solo funciones puras).

import type { Cliente } from '../types';

/** Reparte la cartera en lo que se trabaja y lo que está guardado. */
export function partirPorArchivado(clientes: Cliente[]): { visibles: Cliente[]; archivados: Cliente[] } {
  const visibles: Cliente[] = [];
  const archivados: Cliente[] = [];
  for (const c of clientes) (c.archivado ? archivados : visibles).push(c);
  return { visibles, archivados };
}

/**
 * Por qué este cliente NO se puede borrar del todo, o null si sí se puede.
 *
 * El caso que importa es la cuenta viva: borrar su `user_profiles` desde el
 * CRM dejaría huérfanos sus entrenos, check-ins y fotos, y la app le crearía
 * un perfil nuevo y vacío en su siguiente arranque. Ese borrado tiene su
 * propio camino (api/delete-account.ts), que limpia además Auth y Storage y
 * deja el perfil anonimizado — y un perfil ya anonimizado sí se puede barrer
 * desde aquí, que es justo el «borrado_xxxx» que se queda en la lista.
 *
 * El otro bloqueo, tener cobros ya cobrados, NO se decide aquí: depende de los
 * pagos, que esta función no ve. Lo impone `eliminarClienteDelCrm`
 * (src/db/crm.ts) lanzando `ClienteConCobros`, y antes que él la propia regla
 * de Firestore.
 */
export function motivoNoBorrable(cliente: Cliente): string | null {
  if (cliente.userId && !cliente.anonimizado) {
    return 'Tiene cuenta activa en la app. Archívalo, o bórralo desde el borrado de cuenta (limpia también sus entrenos y su acceso).';
  }
  return null;
}
