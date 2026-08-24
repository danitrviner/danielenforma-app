import {
  Mesocycle, WorkoutLog, WorkoutAssignment, Exercise, MuscleGroup,
  MUSCLE_LABELS, MUSCLE_ORDER,
} from '../types';
import { buildTrainingReport, TrainingReport } from './trainingReport';
import { addDays } from './trainingWeek';
import { adherenciaDeMesociclo } from './adherence';

// ═══════════════════════════════════════════════════════════════════════════
// CIERRE DE MESOCICLO — qué pasó de verdad en el bloque que acaba de terminar.
//
// Determinista y local, sin IA (decisión de Dani): son cuentas sobre los logs
// del atleta, y una cuenta no debe cambiar de una ejecución a otra ni depender
// de que una API responda. Solo lo ve el entrenador; el objetivo es que tenga
// delante los números con los que contarle al cliente cómo ha ido, sin
// reconstruirlos a mano ejercicio por ejercicio.
//
// Se apoya en `trainingReport.ts` para lo que ya sabía calcular (tonelaje, 1RM
// estimado, récords, progresión por grupo contra el mesociclo anterior) y añade
// lo que es propio del cierre de un bloque: adherencia y —lo que no existía en
// ningún sitio— volumen PROGRAMADO frente a volumen REALIZADO.
// ═══════════════════════════════════════════════════════════════════════════

export interface FilaVolumenGrupo {
  group: MuscleGroup;
  label: string;
  /** Series semanales configuradas en el mesociclo × sus semanas. */
  programadas: number;
  /** Series efectivas registradas por el atleta dentro de la ventana del meso. */
  realizadas: number;
  /** realizadas / programadas, en %. `null` si no se programó nada de ese grupo. */
  pct: number | null;
  /** Series semanales del mismo grupo en el mesociclo anterior, si lo hay. */
  semanalesPrevias: number | null;
  /** Series semanales de este mesociclo — el número que el coach tocó al programar. */
  semanales: number;
}

export interface CierreMesociclo {
  mesoId: string;
  numero: number;
  objetivo: string;
  inicio: string;
  fin: string;
  semanas: number;
  diasSemana: number;
  /** Cerrado del todo, o todavía en curso a día de hoy. */
  enCurso: boolean;
  comparacion: string;
  sesiones: {
    registradas: number;
    programadas: number;
    completadas: number;
    adherenciaPct: number | null;
  };
  volumen: {
    filas: FilaVolumenGrupo[];
    totalProgramadas: number;
    totalRealizadas: number;
    pct: number | null;
  };
  /** Tonelaje, 1RM estimado, récords y progresión por grupo (trainingReport). */
  informe: TrainingReport;
  /** Frases para el coach, ya masticadas. */
  titulares: string[];
  /** Borrador copiable para mandarle al cliente. El coach lo edita antes. */
  resumenParaCliente: string;
}

function pct(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((parte / total) * 100);
}

function num(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

function conSigno(n: number): string {
  return n > 0 ? `+${num(n)}` : num(n);
}

/**
 * Series efectivas registradas por grupo muscular dentro de una ventana.
 *
 * Cuenta solo el grupo PRINCIPAL del ejercicio, a propósito: es la misma
 * unidad con la que se programó el mesociclo (`Mesocycle.groups`), así que
 * «12 programadas / 10 realizadas» compara dos cosas medidas igual. El reparto
 * ponderado con secundarios a 0.5 de `trainingReport` vive en el bloque de
 * tonelaje, que responde a otra pregunta.
 */
function seriesRealizadasPorGrupo(logs: WorkoutLog[], exercises: Exercise[]): Map<MuscleGroup, number> {
  const porId = new Map(exercises.map(e => [e.id, e]));
  const acc = new Map<MuscleGroup, number>();
  for (const log of logs) {
    for (const entry of log.entries) {
      const g = porId.get(entry.exerciseId)?.muscleGroup;
      if (!g) continue;
      acc.set(g, (acc.get(g) ?? 0) + entry.sets.length);
    }
  }
  return acc;
}

export function buildCierreMesociclo(params: {
  meso: Mesocycle;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  assignments: WorkoutAssignment[];
  exercises: Exercise[];
  athleteName?: string;
  hoy?: string;
}): CierreMesociclo {
  const { meso, mesocycles, logs, assignments, exercises } = params;
  const hoy = params.hoy ?? new Date().toISOString().split('T')[0];
  const nombre = (params.athleteName ?? '').trim().split(/\s+/)[0] || 'Crack';

  const inicio = meso.startDate;
  const fin = addDays(meso.startDate, meso.weeks * 7 - 1);
  const enCurso = hoy <= fin;

  // Mesociclo anterior = el de número inmediatamente inferior que ya empezó.
  const anterior = [...mesocycles]
    .filter(m => m.id !== meso.id && m.number < meso.number)
    .sort((a, b) => b.number - a.number)[0] ?? null;

  const informe = buildTrainingReport({
    logs, exercises, mesocycles,
    periodStart: inicio, periodEnd: fin,
    comparison: { mode: 'mesocycle', currentId: meso.id, previousId: anterior?.id ?? null },
  });

  // ── Adherencia ──────────────────────────────────────────────────────────
  const asigMeso = assignments.filter(a => a.mesocycleId === meso.id);
  const completadas = asigMeso.filter(a => a.status === 'completed').length;
  const logsMeso = logs.filter(l => l.date >= inicio && l.date <= fin);
  const registradas = new Set(logsMeso.map(l => l.date)).size;

  // ── Volumen programado vs realizado ─────────────────────────────────────
  const realizadasPorGrupo = seriesRealizadasPorGrupo(logsMeso, exercises);
  const filas: FilaVolumenGrupo[] = MUSCLE_ORDER
    .map(group => {
      const semanales = meso.groups[group]?.series ?? 0;
      const programadas = semanales * meso.weeks;
      const realizadas = realizadasPorGrupo.get(group) ?? 0;
      return {
        group,
        label: MUSCLE_LABELS[group],
        semanales,
        programadas,
        realizadas,
        pct: pct(realizadas, programadas),
        semanalesPrevias: anterior ? (anterior.groups[group]?.series ?? 0) : null,
      };
    })
    // Un grupo sin volumen programado y sin nada registrado no aporta nada al cierre.
    .filter(f => f.programadas > 0 || f.realizadas > 0)
    .sort((a, b) => b.programadas - a.programadas);

  const totalProgramadas = filas.reduce((s, f) => s + f.programadas, 0);
  const totalRealizadas = filas.reduce((s, f) => s + f.realizadas, 0);

  // ── Titulares ───────────────────────────────────────────────────────────
  const titulares: string[] = [];
  const adherenciaPct = adherenciaDeMesociclo(assignments, meso.id);

  if (adherenciaPct !== null) {
    titulares.push(`Completó ${completadas} de ${asigMeso.length} sesiones programadas (${adherenciaPct}%).`);
  } else if (registradas > 0) {
    titulares.push(`${registradas} sesiones registradas en el bloque.`);
  }

  const pctVolumen = pct(totalRealizadas, totalProgramadas);
  if (pctVolumen !== null) {
    titulares.push(`Hizo el ${pctVolumen}% del volumen programado (${totalRealizadas} de ${totalProgramadas} series).`);
  }

  const prs = informe.perExercise.filter(e => e.isPR);
  if (prs.length > 0) {
    const top = prs.slice(0, 3).map(e => {
      const gana = e.prevBestOrm != null ? Math.round((e.bestOrm - e.prevBestOrm) * 10) / 10 : null;
      return `${e.name} ${num(e.bestOrm)}kg${gana != null && gana > 0 ? ` (${conSigno(gana)}kg)` : ''}`;
    });
    titulares.push(
      `${prs.length} récord${prs.length > 1 ? 's' : ''} de fuerza estimada: ${top.join(', ')}${prs.length > 3 ? '…' : ''}.`
    );
  }

  const comparacion = anterior ? `Meso #${anterior.number}` : 'sin mesociclo previo';
  if (informe.tonnage.deltaPct != null) {
    const d = informe.tonnage.deltaPct;
    titulares.push(
      `Tonelaje total ${d >= 0 ? 'sube' : 'baja'} un ${conSigno(d)}% vs ${comparacion} (${num(informe.tonnage.current)} kg movidos).`
    );
  }

  const mejorGrupo = [...informe.muscleGroups].filter(g => g.ormDeltaPct != null)
    .sort((a, b) => (b.ormDeltaPct ?? 0) - (a.ormDeltaPct ?? 0))[0];
  if (mejorGrupo && (mejorGrupo.ormDeltaPct ?? 0) > 2) {
    titulares.push(`${mejorGrupo.label} es donde más ha ganado fuerza (${conSigno(mejorGrupo.ormDeltaPct!)}% de 1RM estimado).`);
  }

  // Los grupos que se quedaron muy por debajo de lo previsto: es lo que hay
  // que corregir al montar el bloque siguiente, y lo que un vistazo rápido a
  // la tabla no canta.
  const cojos = filas.filter(f => f.pct != null && f.pct < 80 && f.programadas >= 6);
  if (cojos.length > 0) {
    titulares.push(
      `Por debajo de lo previsto: ${cojos.slice(0, 4).map(f => `${f.label} (${f.pct}%)`).join(', ')}.`
    );
  }

  // ── Borrador para el cliente ────────────────────────────────────────────
  const frases: string[] = [];
  frases.push(`${nombre}, cerramos el bloque ${meso.number}${meso.objective ? ` (${meso.objective})` : ''}: ${meso.weeks} semanas del ${inicio} al ${fin}.`);
  if (adherenciaPct !== null) {
    frases.push(adherenciaPct >= 85
      ? `Has completado ${completadas} de ${asigMeso.length} sesiones (${adherenciaPct}%). Ese es el motivo de casi todo lo que viene después.`
      : `Has completado ${completadas} de ${asigMeso.length} sesiones (${adherenciaPct}%). Subir esa cifra es la palanca más grande que tenemos para el bloque siguiente.`);
  }
  if (informe.tonnage.deltaPct != null) {
    frases.push(informe.tonnage.deltaPct >= 0
      ? `Has movido ${num(informe.tonnage.current)} kg en total, un ${conSigno(informe.tonnage.deltaPct)}% más que en el bloque anterior.`
      : `Has movido ${num(informe.tonnage.current)} kg en total, un ${num(informe.tonnage.deltaPct)}% respecto al bloque anterior — tocaba, el trabajo de este bloque no iba de acumular tonelaje.`);
  } else if (informe.tonnage.current > 0) {
    frases.push(`Has movido ${num(informe.tonnage.current)} kg en total durante el bloque.`);
  }
  if (prs.length > 0) {
    frases.push(`Récords personales en ${prs.slice(0, 3).map(e => e.name).join(', ')}${prs.length > 3 ? ` y ${prs.length - 3} más` : ''}.`);
  }
  if (mejorGrupo && (mejorGrupo.ormDeltaPct ?? 0) > 2) {
    frases.push(`Donde más fuerza has ganado es en ${mejorGrupo.label.toLowerCase()}.`);
  }
  frases.push('Con esto monto el siguiente bloque.');

  return {
    mesoId: meso.id,
    numero: meso.number,
    objetivo: meso.objective,
    inicio, fin,
    semanas: meso.weeks,
    diasSemana: meso.daysPerWeek,
    enCurso,
    comparacion,
    sesiones: { registradas, programadas: asigMeso.length, completadas, adherenciaPct },
    volumen: { filas, totalProgramadas, totalRealizadas, pct: pctVolumen },
    informe,
    titulares,
    resumenParaCliente: frases.join(' '),
  };
}
