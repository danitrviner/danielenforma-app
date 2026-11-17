import {
  Mesocycle, WorkoutLog, WorkoutAssignment, Exercise, MuscleGroup,
  MUSCLE_LABELS, MUSCLE_ORDER,
} from '../types.js';
import { buildTrainingReport, TrainingReport } from './trainingReport.js';
import { buildMovementPatternReport, PatternPerf } from './movementPatterns.js';
import { hoyIsoLocal, diasEntreFechas } from './trainingWeek.js';
import { adherenciaDeMesociclo, asignacionesDeMesociclo } from './adherence.js';
import { seriesRealizadasPorGrupo } from './programacion.js';
import { buildProgresionDelBloque, notaDeSesionesSinMarca, ProgresionDelBloque, ProgresionEjercicio } from './progresionDelBloque.js';
import { finDeBloque } from './finDeBloque.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';
import { nombreDeMeso } from './nombresMeso.js';
import { RUIDO_RM_PCT, superaElRuido } from './ruidoDeMedida.js';

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
  /** Cómo se llama el bloque (`nombreDeMeso`): su nombre o «Meso #N». */
  nombre: string;
  objetivo: string;
  inicio: string;
  /** Último día REAL del bloque (vueltas × ciclo), no `weeks × 7`. */
  fin: string;
  semanas: number;
  /** Semanas de 7 días que ocupa de inicio a fin: las que pintan la progresión y la evolución. */
  semanasDeCalendario: number;
  diasSemana: number;
  /** Cerrado del todo, o todavía en curso a día de hoy. */
  enCurso: boolean;
  comparacion: string;
  sesiones: {
    registradas: number;
    /**
     * Sesiones que cuentan para la adherencia. Con el bloque en curso, solo las
     * que ya han tocado (más las completadas por adelantado), no todo el bloque.
     */
    programadas: number;
    /** Todas las sesiones asignadas del bloque, futuras incluidas. */
    programadasEnTotal: number;
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
  /** Progresión DENTRO del bloque (primeras semanas → últimas) — responde aunque no haya mesociclo anterior. */
  progresion: ProgresionDelBloque;
  /**
   * Con qué dato se ha decidido la fuerza del bloque (D4c, 17-11-2026): cuántas
   * veces un ejercicio se quedó sin marca por no tener series válidas y el
   * motivo más frecuente. `null` si todas dieron marca. Es para el coach: no
   * va en el mensaje al cliente.
   */
  notaDeDatos: string | null;
  /** Frases para el coach, ya masticadas. */
  titulares: string[];
  /**
   * La parte de RENDIMIENTO del mensaje al cliente, en líneas. No es el
   * mensaje: el mensaje (con el cuerpo y el bienestar) lo monta
   * `mensajeDeCierre` en `cierreCompleto.ts`, y es el único que se enseña,
   * se copia o se envía.
   */
  resumenParaCliente: string;
}

/**
 * Semanas de 7 días que caen en descarga, a partir de las VUELTAS de descarga
 * del bloque. `semanasDescarga` cuenta vueltas del ciclo; la progresión cuenta
 * semanas de calendario. Con ciclo de 7 son lo mismo; con otro ciclo, una
 * semana es de descarga si la mayoría de sus días caen en una vuelta de
 * descarga. Antes, con ciclo distinto de 7, la descarga no se excluía.
 */
export function semanasDeCalendarioEnDescarga(vueltasDescarga: number[], cicloDias: number, diasDelBloque: number): number[] {
  if (vueltasDescarga.length === 0) return [];
  // Sin ciclo conocido (fichas antiguas), la vuelta es la semana.
  const ciclo = cicloDias > 0 ? cicloDias : 7;
  const vueltas = new Set(vueltasDescarga);
  const out: number[] = [];
  for (let semana = 1; (semana - 1) * 7 < diasDelBloque; semana++) {
    let dias = 0, enDescarga = 0;
    for (let d = (semana - 1) * 7; d < semana * 7 && d < diasDelBloque; d++) {
      dias++;
      if (vueltas.has(Math.floor(d / ciclo) + 1)) enDescarga++;
    }
    // Mayoría de los días que la semana tiene dentro del bloque (la última
    // puede ser más corta).
    if (enDescarga * 2 > dias) out.push(semana);
  }
  return out;
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
  const fin = finDeBloque(meso);
  const enCurso = hoy <= fin;
  const diasDelBloque = diasEntreFechas(inicio, fin) + 1;
  const semanasDeCalendario = Math.max(1, Math.ceil(diasDelBloque / 7));

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
    // En curso, las semanas vividas con decimales: redondear hacia arriba
    // contaba la semana a medias como entera y el bloque «movía menos kg».
    const semanasActual = Math.max(1, (enCurso ? diasEntreFechas(inicio, hoy) + 1 : diasDelBloque) / 7);
    const porSemana = informe.tonnage.current / semanasActual;
    const porSemanaPrev = prev / Math.max(1, anterior.weeks);
    return Math.round(((porSemana - porSemanaPrev) / porSemanaPrev) * 1000) / 10;
  })();

  // ── Adherencia ──────────────────────────────────────────────────────────
  // Con el bloque sin terminar, solo las sesiones que ya han tocado: dividir
  // por todas daba un 19 % en la semana 2 de 8 con todo hecho (17-11-2026).
  const asigMeso = assignments.filter(a => a.mesocycleId === meso.id);
  const asigQueCuentan = asignacionesDeMesociclo(assignments, meso.id, enCurso ? hoy : undefined);
  const completadas = asigQueCuentan.filter(a => a.status === 'completed').length;
  // Por `mesocycleId` cuando el registro lo trae; por fechas para los antiguos.
  const logsMeso = logs.filter(l => l.mesocycleId ? l.mesocycleId === meso.id : (l.date >= inicio && l.date <= fin));
  // En curso, lo programado es lo que ya ha pasado del bloque: en la semana 2
  // de 8 antes salía «hizo el 25 % del volumen» (M5, 26-10-2026).
  const semanasVividas = enCurso ? Math.max(1, Math.ceil((diasEntreFechas(inicio, hoy) + 1) / 7)) : meso.weeks;
  const semanasProgramadas = Math.min(meso.weeks, semanasVividas);
  const registradas = new Set(logsMeso.map(l => l.date)).size;

  // ── Progresión dentro del bloque ────────────────────────────────────────
  // Las descargas se marcan por VUELTA del ciclo y la progresión va por
  // semanas de 7 días: se traducen (con ciclo de 7 es la misma semana). Lo
  // mismo con las demás semanas que no se comparan (D3): puente, test y la
  // primera vuelta cuando vuelve de un parón.
  const aSemanasDeCalendario = (vueltas: number[]) => semanasDeCalendarioEnDescarga(vueltas, cicloDiasDeMeso(meso), diasDelBloque);
  const semanasDescarga = aSemanasDeCalendario(
    [...new Set([...(meso.semanasDescarga ?? []), ...(meso.deloadWeek ? [meso.deloadWeek] : [])])],
  );
  const progresion = buildProgresionDelBloque({
    logs: logsMeso, exercises, inicio, fin, semanas: semanasDeCalendario, semanasDescarga,
    semanasPuente: aSemanasDeCalendario(meso.semanasPivot ?? []),
    semanasTest: aSemanasDeCalendario(meso.semanasTest ?? []),
    semanasVueltaDeParon: meso.vuelveDeParon ? aSemanasDeCalendario([1]) : [],
    assignments: asigMeso, pesoCorporalKg: params.pesoCorporalKg, hoy,
  });
  const res = progresion.resumen;
  const notaDeDatos = notaDeSesionesSinMarca(res.sinMarca);
  const destacados = progresion.ejercicios.filter(e => e.estado === 'mejora').slice(0, 3);
  const flojos = progresion.ejercicios
    .filter(e => e.estado === 'baja' || (e.estado === 'estable' && e.semanasConDatos >= 3))
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
  const mejorPatron = progresion.porPatron.find(p => (p.deltaMedioPct ?? 0) >= RUIDO_RM_PCT);
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
  const adherenciaPct = adherenciaDeMesociclo(assignments, meso.id, enCurso ? hoy : undefined);

  // 1. Fuerza dentro del bloque — lo primero que pregunta el cliente.
  if (res.comparables > 0 && res.medianaPct != null) {
    titulares.push(
      `Mejora en ${res.mejoran} de ${res.comparables} ejercicios del inicio al final del bloque` +
      ` (mediana ${conSigno(res.medianaPct)}% de 1RM estimado` +
      // Por debajo del ruido de medida la mediana no es una subida ni una bajada.
      `${superaElRuido(res.medianaPct) ? '' : `: dentro del ±${RUIDO_RM_PCT}% de error de medida, la fuerza se mantiene`}).`
    );
  }
  // Los que no cuentan (D4) se nombran, para que no parezca que faltan.
  if (res.pocasSemanas.length > 0) {
    titulares.push(
      `Pocas semanas para comparar (no cuentan a favor ni en contra): ${res.pocasSemanas.slice(0, 4).map(e => e.nombre).join(', ')}` +
      `${res.pocasSemanas.length > 4 ? ` y ${res.pocasSemanas.length - 4} más` : ''}.`
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
    titulares.push(enCurso
      ? `Lleva ${completadas} de las ${asigQueCuentan.length} sesiones que tocaban hasta hoy (${adherenciaPct}%); el bloque tiene ${asigMeso.length}.`
      : `Completó ${completadas} de ${asigQueCuentan.length} sesiones programadas (${adherenciaPct}%).`);
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

  const comparacion = anterior ? nombreDeMeso(anterior) : 'sin mesociclo previo';
  if (tonelajeVsAnteriorPct != null) {
    const d = tonelajeVsAnteriorPct;
    titulares.push(
      `Kg movidos por semana: ${d >= 0 ? 'suben' : 'bajan'} un ${conSigno(d)}% vs ${comparacion} (${num(informe.tonnage.current)} kg en el bloque).`
    );
  }

  const mejorGrupo = [...informe.muscleGroups].filter(g => g.ormDeltaPct != null)
    .sort((a, b) => (b.ormDeltaPct ?? 0) - (a.ormDeltaPct ?? 0))[0];
  if (mejorGrupo && (mejorGrupo.ormDeltaPct ?? 0) >= RUIDO_RM_PCT) {
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

  // ── Rendimiento, para el cliente ────────────────────────────────────────
  // En líneas, para pegarlo tal cual en WhatsApp. Cada frase dice lo que el
  // dato dice y nada más: sin causas que el cierre no puede saber.
  const lineas: string[] = [];
  const bloque = meso.name?.trim() ? `el bloque «${nombreDeMeso(meso)}»` : `el bloque ${meso.number}`;
  lineas.push(`${nombre}, cerramos ${bloque}${meso.objective ? ` (${meso.objective})` : ''}: ${meso.weeks} semanas, del ${fechaCorta(inicio)} al ${fechaCorta(fin)}.`);
  if (adherenciaPct !== null) {
    // El volumen solo con el bloque terminado: en curso su «programado» cuenta
    // la semana a medias como entera.
    const volumenHecho = !enCurso && pctVolumen !== null ? ` y el ${pctVolumen}% de las series programadas` : '';
    const hecho = enCurso
      ? `Llevas ${completadas} de las ${asigQueCuentan.length} sesiones que tocaban hasta hoy (${adherenciaPct}%).`
      : `Has completado ${completadas} de ${asigQueCuentan.length} sesiones (${adherenciaPct}%)${volumenHecho}.`;
    lineas.push(adherenciaPct >= 85 ? `${hecho} Esa constancia es la base de todo lo demás.`
      // «Subir esa cifra» solo tiene sentido con el bloque cerrado.
      : enCurso ? hecho
      : `${hecho} Subir esa cifra es la palanca más grande que tenemos para el bloque siguiente.`);
  }
  if (res.comparables > 0 && res.medianaPct != null) {
    const mejoras = `Del principio al final del bloque has mejorado en ${res.mejoran} de ${res.comparables} ejercicios`;
    // «Eres un X % más fuerte» solo cuando X supera el ruido de medida; por
    // debajo, la fuerza se mantiene, y una caída se dice como caída.
    lineas.push(res.medianaPct >= RUIDO_RM_PCT
      ? `${mejoras}, y de media eres un ${conSigno(res.medianaPct)}% más fuerte.`
      : res.medianaPct > -RUIDO_RM_PCT
        ? `${mejoras}. En conjunto, tu fuerza se mantiene.`
        : `${mejoras}. En conjunto, tu fuerza estimada baja un ${num(Math.abs(res.medianaPct))}%: lo miramos para el siguiente bloque.`);
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
    // Sin «tocaba, este bloque no iba de acumular tonelaje»: el cierre no sabe
    // si la bajada era buscada. Si lo era, lo añade el coach al editar.
    lineas.push(tonelajeVsAnteriorPct >= 0
      ? `En total has movido ${num(Math.round(informe.tonnage.current))} kg: por semana, un ${conSigno(tonelajeVsAnteriorPct)}% más que en el bloque anterior.`
      : `En total has movido ${num(Math.round(informe.tonnage.current))} kg: por semana, un ${num(tonelajeVsAnteriorPct)}% respecto al bloque anterior.`);
  }
  if (prs.length > 0) {
    lineas.push(`Récords personales en ${prs.slice(0, 3).map(e => e.name).join(', ')}${prs.length > 3 ? ` y ${prs.length - 3} más` : ''}.`);
  }
  if (flojos.length > 0) {
    lineas.push(`${flojos.slice(0, 2).map(e => e.nombre).join(' y ')} ${flojos.length === 1 ? 'se ha quedado' : 'se han quedado'} más parado${flojos.length === 1 ? '' : 's'}: es lo primero que ajusto para el siguiente bloque.`);
  }

  return {
    mesoId: meso.id,
    numero: meso.number,
    nombre: nombreDeMeso(meso),
    objetivo: meso.objective,
    inicio, fin,
    semanas: meso.weeks,
    semanasDeCalendario,
    diasSemana: meso.daysPerWeek,
    enCurso,
    comparacion,
    sesiones: { registradas, programadas: asigQueCuentan.length, programadasEnTotal: asigMeso.length, completadas, adherenciaPct },
    volumen: { filas, totalProgramadas, totalRealizadas, pct: pctVolumen },
    informe,
    patrones,
    progresion,
    notaDeDatos,
    titulares,
    resumenParaCliente: lineas.join('\n'),
  };
}
