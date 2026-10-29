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
 * ¿Tiene una cuenta con la que entrar a la app? Si sí, archivarlo o borrarlo
 * pasa por el servidor (api/gestionar-acceso.ts), que le quita el acceso: un
 * flag en Firestore no basta, la persona seguiría teniendo su sesión y su
 * contraseña. Un contacto sin cuenta, o el perfil anonimizado de una cuenta ya
 * borrada, no tiene nada que bloquear.
 */
export function tieneCuentaActiva(cliente: Cliente): boolean {
  return !!cliente.userId && !!cliente.email && !cliente.anonimizado;
}
