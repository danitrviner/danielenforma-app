/* Qué cambió Dani después de aprobar.
 *
 * Al aprobar una propuesta, la app crea la entidad tal cual la propuso la IA.
 * Los retoques de Dani vienen DESPUÉS, en el editor de mesociclos o de dietas
 * — así que preguntarle "¿qué has cambiado?" en el momento de aprobar no sirve
 * de nada: todavía no ha cambiado nada.
 *
 * Por eso la deriva se calcula mirando: se compara lo que la propuesta decía
 * con lo que hoy tiene la entidad que salió de ella (`resultEntityId`). No hace
 * falta que Dani escriba nada para que quede constancia de lo que tocó.
 */
import { AiProposal, Diet, Mesocycle, MuscleGroup, MUSCLE_LABELS, MuscleGroupConfig } from '../types';

export interface Deriva {
  proposalId: string;
  fecha: string;        // ISO de la aprobación
  que: string;          // "Mesociclo #4", "Dieta Volumen 2400"
  cambios: string[];    // en lenguaje de coach, no un diff de JSON
}

function derivaDeMesociclo(p: AiProposal, actual: Mesocycle): string[] {
  const propuesto = p.payload as Omit<Mesocycle, 'id'>;
  const cambios: string[] = [];
  if (propuesto.weeks !== actual.weeks) cambios.push(`semanas ${propuesto.weeks} → ${actual.weeks}`);
  if (propuesto.daysPerWeek !== actual.daysPerWeek) cambios.push(`días/semana ${propuesto.daysPerWeek} → ${actual.daysPerWeek}`);

  for (const grupo of Object.keys(MUSCLE_LABELS) as MuscleGroup[]) {
    const antes = (propuesto.groups?.[grupo] as MuscleGroupConfig | undefined)?.series ?? 0;
    const ahora = (actual.groups?.[grupo] as MuscleGroupConfig | undefined)?.series ?? 0;
    if (antes !== ahora) cambios.push(`${grupo} ${antes} → ${ahora} series`);
  }
  return cambios;
}

function derivaDeDieta(p: AiProposal, actual: Diet): string[] {
  const propuesta = p.payload as Omit<Diet, 'id'>;
  const cambios: string[] = [];
  for (const cat of ['HC', 'PROT', 'GRASA'] as const) {
    const antes = propuesta.budget?.[cat] ?? 0;
    const ahora = actual.budget?.[cat] ?? 0;
    if (antes !== ahora) cambios.push(`${cat} ${antes} → ${ahora} intercambios`);
  }
  const comidasAntes = propuesta.meals?.length ?? 0;
  const comidasAhora = actual.meals?.length ?? 0;
  if (comidasAntes !== comidasAhora) cambios.push(`comidas ${comidasAntes} → ${comidasAhora}`);
  return cambios;
}

/**
 * Compara cada propuesta aprobada con la entidad que sigue viva hoy.
 * Solo devuelve las que han cambiado: una propuesta aplicada tal cual no
 * aporta nada al historial.
 */
export function calcularDerivas(
  proposals: AiProposal[], mesocycles: Mesocycle[], diets: Diet[],
): Deriva[] {
  const derivas: Deriva[] = [];
  for (const p of proposals) {
    if (p.status !== 'approved' || !p.resultEntityId) continue;

    if (p.kind === 'mesocycle' || p.kind === 'periodizationBlock') {
      const actual = mesocycles.find(m => m.id === p.resultEntityId);
      if (!actual) continue;
      // El bloque periodizado guarda el mesociclo dentro del payload.
      const comparable: AiProposal = p.kind === 'periodizationBlock'
        ? { ...p, payload: (p.payload as { mesocycle: Omit<Mesocycle, 'id'> }).mesocycle }
        : p;
      const cambios = derivaDeMesociclo(comparable, actual);
      if (cambios.length) derivas.push({ proposalId: p.id, fecha: p.reviewedAt ?? p.createdAt, que: `Mesociclo #${actual.number}`, cambios });
    }

    if (p.kind === 'diet') {
      const actual = diets.find(d => d.id === p.resultEntityId);
      if (!actual) continue;
      const cambios = derivaDeDieta(p, actual);
      if (cambios.length) derivas.push({ proposalId: p.id, fecha: p.reviewedAt ?? p.createdAt, que: `Dieta "${actual.name}"`, cambios });
    }
  }
  return derivas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
