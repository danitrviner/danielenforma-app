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
  if (propuesto.startDate !== actual.startDate) cambios.push(`inicio ${propuesto.startDate} → ${actual.startDate}`);
  if ((propuesto.objective ?? '') !== (actual.objective ?? '')) cambios.push(`objetivo "${propuesto.objective ?? ''}" → "${actual.objective ?? ''}"`);
  if (propuesto.deloadWeek !== actual.deloadWeek) {
    cambios.push(propuesto.deloadWeek === undefined
      ? `añadió descarga en la semana ${actual.deloadWeek}`
      : actual.deloadWeek === undefined
        ? `quitó la semana de descarga (proponías la ${propuesto.deloadWeek})`
        : `descarga semana ${propuesto.deloadWeek} → ${actual.deloadWeek}`);
  }
  if (propuesto.cycleDays !== actual.cycleDays) {
    cambios.push(`duración del ciclo ${propuesto.cycleDays ?? 7} → ${actual.cycleDays ?? 7} días`);
  }

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

  // Qué alimentos concretos quitó o metió. Es lo que más dice de su criterio:
  // el presupuesto se respeta casi siempre, los alimentos no.
  const alimentos = (d: { meals?: { items?: { foodLabel: string }[] }[] }): Set<string> =>
    new Set((d.meals ?? []).flatMap(m => (m.items ?? []).map(i => i.foodLabel)));
  const antes = alimentos(propuesta);
  const ahora = alimentos(actual);
  const quitados = [...antes].filter(f => !ahora.has(f));
  const metidos = [...ahora].filter(f => !antes.has(f));
  if (quitados.length) cambios.push(`quitó ${quitados.slice(0, 6).join(', ')}`);
  if (metidos.length) cambios.push(`metió ${metidos.slice(0, 6).join(', ')}`);
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

/**
 * Los mismos retoques, vistos de golpe. Una deriva suelta es una anécdota; que
 * el mismo cambio salga en cinco bloques seguidos es el criterio de Dani, y es
 * lo que la IA tiene que dejar de hacerle corregir cada vez.
 */
export function resumirPatrones(derivas: Deriva[]): string[] {
  const cuenta = new Map<string, number>();
  for (const d of derivas) {
    for (const c of d.cambios) {
      // "dorsal 14 → 16 series" → "dorsal: sube series". Interesa la dirección
      // repetida, no la cifra exacta de un bloque concreto.
      const m = c.match(/^(\S+) (\d+(?:\.\d+)?) → (\d+(?:\.\d+)?) series$/);
      if (m) {
        const clave = `${m[1]}: ${Number(m[3]) > Number(m[2]) ? 'sube' : 'baja'} series sobre lo propuesto`;
        cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
        continue;
      }
      const cat = c.match(/^(HC|PROT|GRASA) (\d+(?:\.\d+)?) → (\d+(?:\.\d+)?) intercambios$/);
      if (cat) {
        const clave = `${cat[1]}: ${Number(cat[3]) > Number(cat[2]) ? 'sube' : 'baja'} intercambios sobre lo propuesto`;
        cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
        continue;
      }
      const gen = c.split(' ')[0];
      cuenta.set(`toca ${gen}`, (cuenta.get(`toca ${gen}`) ?? 0) + 1);
    }
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([clave, n]) => `${clave} (${n} veces)`);
}
