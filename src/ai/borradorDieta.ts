/* El puente entre la propuesta de dieta y el editor de dietas de verdad.
 *
 * Cuadrar intercambios no se hace en una tarjeta: hace falta el buscador de
 * alimentos, las recetas y el balance en vivo de colocado vs presupuesto — o
 * sea, el editor que ya existe. Así que la propuesta no se edita a mano ahí:
 * se manda al editor tal cual, y allí se toca como cualquier otra dieta.
 *
 * El buzón es de memoria a propósito. La navegación es dentro de la misma SPA
 * (panel del asistente → /clients/:email/dietas) y no queremos que un borrador
 * abandonado reaparezca dentro de tres días desde localStorage.
 */
import type { Diet } from '../types';

export interface BorradorDePropuesta {
  proposalId: string;
  athleteEmail: string;
  /** La dieta propuesta, sin id: al guardarla el editor crea la de verdad. */
  diet: Omit<Diet, 'id'>;
}

let pendiente: (BorradorDePropuesta & { dejadoEn: number }) | null = null;

/* Caduca a los cinco minutos. El viaje que tiene que hacer es de un clic:
   panel → pestaña de dietas del mismo atleta. Si en cinco minutos no ha
   llegado, es que no llegó (se fue por otro lado, dio atrás, se recargó), y un
   borrador vivo indefinidamente acaba abriendo solo el editor con una
   propuesta vieja cuando Dani entra a Dietas por cualquier otro motivo. */
const CADUCIDAD_MS = 5 * 60 * 1000;

function vigente(): BorradorDePropuesta | null {
  if (!pendiente) return null;
  if (Date.now() - pendiente.dejadoEn > CADUCIDAD_MS) { pendiente = null; return null; }
  return pendiente;
}

export function dejarBorradorDeDieta(borrador: BorradorDePropuesta): void {
  pendiente = { ...borrador, dejadoEn: Date.now() };
}

/** Lo recoge quien lo va a abrir. El buzón se vacía SIEMPRE, coincida o no el
 *  atleta: si el borrador no era para quien está mirando, ya no es para nadie
 *  — dejarlo puesto es lo que hace que reaparezca solo media hora después. */
export function recogerBorradorDeDieta(athleteEmail: string): BorradorDePropuesta | null {
  const borrador = vigente();
  pendiente = null;
  if (!borrador || borrador.athleteEmail !== athleteEmail) return null;
  return borrador;
}

export function hayBorradorDeDieta(athleteEmail: string): boolean {
  return vigente()?.athleteEmail === athleteEmail;
}
