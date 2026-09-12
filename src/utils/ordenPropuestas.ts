/* En qué orden se aprueban las propuestas de un plan.
 *
 * La IA las crea en el orden en que las va pensando, y el panel las pintaba
 * en el orden en que llegaban de Firestore. Pero se aprueban en un orden
 * concreto: las sesiones necesitan que el mesociclo exista, la periodización
 * crea las dietas de cada fase, la ficha se cierra al final. Esto ordena la
 * bandeja por esa cadena, y dentro de cada tipo, por antigüedad.
 */
import { AiProposal, AiProposalKind } from '../types';

const ORDEN: Record<AiProposalKind, number> = {
  // El orden en el que se aprueban: cada una necesita que la anterior exista.
  mesocycle: 1,
  periodizationBlock: 1,
  workoutDays: 2,
  publishBlock: 3,        // las sesiones tienen que existir antes de volcarlas al calendario
  nutritionProgram: 4,
  diet: 5,
  setupConfig: 6,         // el calendario de dietas resuelve nombres: las dietas van antes
  levelLadder: 7,
  roadmap: 8,
  specialDay: 9,
  weeklyChallenge: 10,
  checkinFeedback: 11,
  dossier: 12,            // la ficha se cierra al final, con todo ya decidido
  workoutTemplate: 13,    // plantillas: no son del atleta, van al final
  mesocycleTemplate: 13,
};

export function ordenarPropuestasPorPlan(propuestas: AiProposal[]): AiProposal[] {
  return [...propuestas].sort((a, b) =>
    (ORDEN[a.kind] ?? 99) - (ORDEN[b.kind] ?? 99) || a.createdAt.localeCompare(b.createdAt));
}

/** Las pendientes agrupadas por atleta, con el cliente abierto primero.
 *
 *  El panel del asistente es global y el chat puede hablar de cualquier
 *  cliente, así que la bandeja enseña TODAS las pendientes y cada grupo dice
 *  de quién es. Antes se filtraban por el email de la URL y las de cualquier
 *  otro atleta no se veían en ninguna parte. */
export function agruparPropuestasPorAtleta(
  propuestas: AiProposal[], athleteActivo?: string,
): { email: string; lista: AiProposal[] }[] {
  const porAtleta = new Map<string, AiProposal[]>();
  for (const p of propuestas) {
    if (!porAtleta.has(p.athleteId)) porAtleta.set(p.athleteId, []);
    porAtleta.get(p.athleteId)!.push(p);
  }
  return [...porAtleta.entries()]
    .map(([email, lista]) => ({ email, lista: ordenarPropuestasPorPlan(lista) }))
    .sort((a, b) =>
      (a.email === athleteActivo ? -1 : 0) - (b.email === athleteActivo ? -1 : 0)
      || a.email.localeCompare(b.email));
}
