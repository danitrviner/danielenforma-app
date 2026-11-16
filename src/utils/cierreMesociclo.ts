import {
  Mesocycle, WorkoutLog, WorkoutAssignment, Exercise, MuscleGroup,
  MUSCLE_LABELS, MUSCLE_ORDER,
} from '../types.js';
import { buildTrainingReport, TrainingReport } from './trainingReport.js';
import { buildMovementPatternReport, PatternPerf } from './movementPatterns.js';
import { addDays, hoyIsoLocal, diasEntreFechas } from './trainingWeek.js';
import { adherenciaDeMesociclo } from './adherence.js';
import { seriesRealizadasPorGrupo } from './programacion.js';
import { buildProgresionDelBloque, ProgresionDelBloque, ProgresionEjercicio } from './progresionDelBloque.js';

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
  /** Variación de 1RM/tonelaje por patrón de movimiento — bloque "Rendimiento" del protocolo de mediciones. */
  patrones: PatternPerf[];
  /** Progresión DENTRO del bloque (semana 1 → final) — responde aunque no haya mesociclo anterior. */
  progresion: ProgresionDelBloque;
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

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

function conSigno(n: number): string {
  return n > 0 ? `+${num(n)}` : num(n);
}

export function buildCierreMesociclo(params: {
  meso: Mesocycle;
  mesocycles: Mesocycle[];
  logs: WorkoutLog[];
  assignments: WorkoutAssignment[];
  exercises: Exercise[];
  athleteName?: string;
  hoy?: string;
  /** Peso del atleta: suma a las series de dominadas, fondos… */
  pesoCorporalKg?: number | null;
}): CierreMesociclo {
  const { meso, mesocycles, logs, assignments, exercises } = params;
  const hoy = params.hoy ?? hoyIsoLocal();
  const nombre = (params.athleteName ?? '').trim().split(/\s+/)[0] || 'Crack';

  const inicio = meso.startDate;
  const fin = addDays(meso.startDate, meso.weeks * 7 - 1);
  const enCurso = hoy <= fin;

  // Mesociclo anterior = el de número inmediatamente inferior que ya empezó.
  const anterior = [...mesocycles]
    .filter(m => m.id !== meso.id && m.number < meso.number)
    .sort((a, b) => b.number - a.number)[0] ?? null;

  const comparison = { mode: 'mesocycle' as const, currentId: meso.id, previousId: anterior?.id ?? null };
  const informe = buildTrainingReport({
    logs, exercises, mesocycles,
    periodStart: inicio, periodEnd: fin,
    comparison,
  });
  const patrones = buildMovementPatternReport({
    logs, exercises, mesocycles,
    periodStart: inicio, periodEnd: fin,
    comparison,
  }).patterns;

  // Tonelaje contra el bloque anterior, POR SEMANA: los bloques no duran lo
  // mismo, y comparar el total de 6 semanas con uno de 1 daba «+512 %».
  const tonelajeVsAnteriorPct = (() => {
    const prev = informe.tonnage.previous;
    if (!anterior || prev == null || prev <= 0) return null;
    const semanasActual = Math.max(1, Math.min(meso.weeks, Math.ceil((diasEntreFechas(inicio, hoy < fin ? hoy : fin) + 1) / 7)));
    const porSemana = informe.tonnage.current / semanasActual;
    const porSemanaPrev = prev / Math.max(1, anterior.weeks);
    return Math.round(((porSemana - porSemanaPrev) / porSemanaPrev) * 1000) / 10;
  })();

  // ── Adherencia ──────────────────────────────────────────────────────────
  const asigMeso = assignments.filter(a => a.mesocycleId === meso.id);
  const completadas = asigMeso.filter(a => a.status === 'completed').length;
  // Por `mesocycleId` cuando el registro lo trae; por fechas para los antiguos.
  const logsMeso = logs.filter(l => l.mesocycleId ? l.mesocycleId === meso.id : (l.date >= inicio && l.date <= fin));
  // En curso, lo programado es lo que ya ha pasado del bloque: en la semana 2
  // de 8 antes salía «hizo el 25 % del volumen» (M5, 26-10-2026).
  const semanasVividas = enCurso ? Math.max(1, Math.ceil((diasEntreFechas(inicio, hoy) + 1) / 7)) : meso.weeks;
  const semanasProgramadas = Math.min(meso.weeks, semanasVividas);
  const registradas = new Set(logsMeso.map(l => l.date)).size;

  // ── Progresión dentro del bloque ────────────────────────────────────────
  // Las semanas de descarga solo se pueden traducir a semanas de 7 días
  // cuando el microciclo ES la semana; con ciclos de otra longitud no se
  // excluyen (el «final» ya toma la mejor de las dos últimas semanas).
  const cicloSemanal = !meso.cycleDays || meso.cycleDays === 7;
  const semanasDescarga = cicloSemanal
    ? [...new Set([...(meso.semanasDescarga ?? []), ...(meso.deloadWeek ? [meso.deloadWeek] : [])])]
    : [];
  const progresion = buildProgresionDelBloque({
    logs: logsMeso, exercises, inicio, fin, semanas: meso.weeks, semanasDescarga,
    assignments: asigMeso, pesoCorporalKg: params.pesoCorporalKg, hoy,
  });
  const res = progresion.resumen;
  const destacados = progresion.ejercicios.filter(e => e.estado === 'mejora').slice(0, 3);
  const flojos = progresion.ejercicios
    .filter(e => e.estado === 'baja' || (e.estado === 'estable' && e.semanasConDatos >= 3))
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
  const mejorPatron = progresion.porPatron.find(p => (p.deltaMedioPct ?? 0) >= 2);
  const fraseEj = (e: ProgresionEjercicio) => `${e.nombre} ${e.lectura} (${conSigno(e.deltaPct!)}%)`;

  // ── Volumen programado vs realizado ─────────────────────────────────────
  const realizadasPorGrupo = seriesRealizadasPorGrupo(logsMeso, exercises);
  const filas: FilaVolumenGrupo[] = MUSCLE_ORDER
    .map(group => {
      const semanales = meso.groups[group]?.series ?? 0;
      const programadas = semanales * semanasProgramadas;
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

  // 1. Fuerza dentro del bloque — lo primero que pregunta el cliente.
  if (res.comparables > 0 && res.medianaPct != null) {
    titulares.push(
      `Mejora en ${res.mejoran} de ${res.comparables} ejercicios del inicio al final del bloque` +
      ` (mediana ${conSigno(res.medianaPct)}% de 1RM estimado).`
    );
  }
  if (destacados.length > 0) {
    titulares.push(`Lo mejor: ${destacados.map(fraseEj).join('; ')}.`);
  }
  if (mejorPatron) {
    titulares.push(`Donde más progresa: ${mejorPatron.label.toLowerCase()} (${conSigno(mejorPatron.deltaMedioPct!)}% de media${mejorPatron.mejor ? `, tirando de ${mejorPatron.mejor.nombre}` : ''}).`);
  }

  // 2. Lo hizo — adherencia y volumen.
  if (adherenciaPct !== null) {
    titulares.push(`Completó ${completadas} de ${asigMeso.length} sesiones programadas (${adherenciaPct}%).`);
  } else if (registradas > 0) {
    titulares.push(`${registradas} sesiones registradas en el bloque.`);
  }

  const pctVolumen = pct(totalRealizadas, totalProgramadas);
  if (pctVolumen !== null) {
    titulares.push(`Hizo el ${pctVolumen}% del volumen programado (${totalRealizadas} de ${totalProgramadas} series).`);
  }

  // 3. Carga de trabajo y esfuerzo semana a semana.
  if (res.tonelajeSemanal?.deltaPct != null && Math.abs(res.tonelajeSemanal.deltaPct) >= 3) {
    const t = res.tonelajeSemanal;
    titulares.push(
      `Mueve ${t.deltaPct! > 0 ? 'más' : 'menos'} kg por semana que al empezar: ${num(Math.round(t.inicio))} → ${num(Math.round(t.final))} kg (${conSigno(t.deltaPct!)}%).`
    );
  }
  if (res.rir && Math.abs(res.rir.final - res.rir.inicio) >= 0.5) {
    titulares.push(res.rir.final < res.rir.inicio
      ? `Entrena más cerca del fallo: RIR medio ${num(res.rir.inicio)} → ${num(res.rir.final)}.`
      : `Entrena más lejos del fallo: RIR medio ${num(res.rir.inicio)} → ${num(res.rir.final)}. Revisar si es buscado.`);
  }

  // 4. Contra el bloque anterior, cuando lo hay.
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
  if (tonelajeVsAnteriorPct != null) {
    const d = tonelajeVsAnteriorPct;
    titulares.push(
      `Kg movidos por semana: ${d >= 0 ? 'suben' : 'bajan'} un ${conSigno(d)}% vs ${comparacion} (${num(informe.tonnage.current)} kg en el bloque).`
    );
  }

  const mejorGrupo = [...informe.muscleGroups].filter(g => g.ormDeltaPct != null)
    .sort((a, b) => (b.ormDeltaPct ?? 0) - (a.ormDeltaPct ?? 0))[0];
  if (mejorGrupo && (mejorGrupo.ormDeltaPct ?? 0) > 2) {
    titulares.push(`${mejorGrupo.label} es donde más ha ganado fuerza vs ${comparacion} (${conSigno(mejorGrupo.ormDeltaPct!)}% de 1RM estimado).`);
  }

  // 5. Lo que hay que corregir en el bloque siguiente.
  if (flojos.length > 0) {
    titulares.push(
      `Se estancan o bajan: ${flojos.slice(0, 4).map(e => `${e.nombre} (${conSigno(e.deltaPct!)}%)`).join(', ')}.`
    );
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
  // En líneas, para pegarlo tal cual en WhatsApp.
  const lineas: string[] = [];
  lineas.push(`${nombre}, cerramos el bloque ${meso.number}${meso.objective ? ` (${meso.objective})` : ''}: ${meso.weeks} semanas, del ${fechaCorta(inicio)} al ${fechaCorta(fin)}.`);
  if (adherenciaPct !== null) {
    lineas.push(adherenciaPct >= 85
      ? `Has completado ${completadas} de ${asigMeso.length} sesiones (${adherenciaPct}%). Ese es el motivo de casi todo lo que viene después.`
      : `Has completado ${completadas} de ${asigMeso.length} sesiones (${adherenciaPct}%). Subir esa cifra es la palanca más grande que tenemos para el bloque siguiente.`);
  }
  if (res.comparables > 0 && res.medianaPct != null) {
    lineas.push(res.medianaPct >= 2
      ? `Del principio al final del bloque has mejorado en ${res.mejoran} de ${res.comparables} ejercicios, y de media eres un ${conSigno(res.medianaPct)}% más fuerte.`
      : `Del principio al final del bloque has mejorado en ${res.mejoran} de ${res.comparables} ejercicios.`);
  }
  if (destacados.length > 0) {
    lineas.push('Lo más destacado:');
    for (const e of destacados) lineas.push(`· ${e.nombre}: ${e.lectura} (${conSigno(e.deltaPct!)}%)`);
  }
  if (mejorPatron) {
    lineas.push(`Donde más has avanzado es en ${mejorPatron.label.toLowerCase()}.`);
  }
  if (res.tonelajeSemanal?.deltaPct != null && res.tonelajeSemanal.deltaPct >= 5) {
    lineas.push(`Además, ahora mueves un ${conSigno(res.tonelajeSemanal.deltaPct)}% más de kilos por semana que cuando empezamos.`);
  }
  if (tonelajeVsAnteriorPct != null) {
    lineas.push(tonelajeVsAnteriorPct >= 0
      ? `En total has movido ${num(Math.round(informe.tonnage.current))} kg: por semana, un ${conSigno(tonelajeVsAnteriorPct)}% más que en el bloque anterior.`
      : `En total has movido ${num(Math.round(informe.tonnage.current))} kg: por semana, un ${num(tonelajeVsAnteriorPct)}% respecto al bloque anterior — tocaba, el trabajo de este bloque no iba de acumular tonelaje.`);
  }
  if (prs.length > 0) {
    lineas.push(`Récords personales en ${prs.slice(0, 3).map(e => e.name).join(', ')}${prs.length > 3 ? ` y ${prs.length - 3} más` : ''}.`);
  }
  if (flojos.length > 0) {
    lineas.push(`${flojos.slice(0, 2).map(e => e.nombre).join(' y ')} ${flojos.length === 1 ? 'se ha quedado' : 'se han quedado'} más parado${flojos.length === 1 ? '' : 's'}: es lo primero que ajusto para el siguiente bloque.`);
  }
  lineas.push('Con esto monto el siguiente bloque.');

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
    patrones,
    progresion,
    titulares,
    resumenParaCliente: lineas.join('\n'),
  };
}
