import type { BodyweightLog, Diet, DietCompletionLog, NutritionPhase, NutritionProgram, StepLog } from '../types.js';
import { addDays } from './trainingWeek.js';
import { computePhaseStartDate } from './fasesNutricion.js';
import { objetivoDeFase } from './objetivoDeFase.js';
import { planDeFase } from './historialObjetivos.js';
import { pesoRepresentativo } from './verificacionObjetivo.js';
import { resolvePhaseTargetKcal } from './nutritionPeriodization.js';
import { objetivoDePasos, kcalPorSemana } from './semanasNutricion.js';
import { kcalDelDia as kcalRegistradasDelDia, calcularGastoReal, DIAS_MINIMOS_SEMANA, type GastoReal } from './gastoReal.js';
import { ritmoReal } from './ritmoDePeso.js';
import { proponerAjuste } from './ajusteDePeriodizacion.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Seguimiento del plan, semana a semana (28-10-2026)

   Lo que un entrenador necesita para planificar y evaluar sin hacer cuentas:
   por cada semana del programa, lo pautado (kcal, pasos, peso esperado con su
   margen) frente a lo que pasó (peso real, kcal registradas, adherencia,
   pasos). Encima, la evaluación de la semana en curso con dos salidas
   calculadas —alargar la fase o apretar las kcal— que NO se aplican solas:
   decide el coach (auditoría §19).

   El peso esperado es el mismo plan fijo que pinta la gráfica de objetivo
   (`planDeFase`): sale del peso con el que empezó cada fase y llega a su
   objetivo. Las fases futuras arrancan donde acaba la anterior.
   ═══════════════════════════════════════════════════════════════════════════ */

export type EstadoSemana = 'en-plan' | 'por-encima' | 'por-debajo';

export interface SemanaDelPlan {
  semana: number;          // 1 = la primera del programa
  desde: string;
  hasta: string;
  faseIdx: number;
  fase: NutritionPhase;
  kcalPlan: number | null;
  kcalRegistradas: number | null;
  /** Días con registro de la semana (solo los ya vividos). Con menos de
   *  `DIAS_MINIMOS_SEMANA` la media de kcal no es fiable (ver gastoReal.ts). */
  diasRegistrados: number;
  kcalFiables: boolean;
  /** % de días vividos con las kcal dentro de un ±10 % de lo pautado. */
  adherencia: number | null;
  pasosPlan: number | null;
  pasosReales: number | null;
  esperado: number | null;
  franja: [number, number] | null;
  real: number | null;
  estado: EstadoSemana | null;
  futura: boolean;
  enCurso: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000);

/** Margen de kcal para contar un día como cumplido. */
export const MARGEN_ADHERENCIA = 0.1;

export function semanasDelPlan(p: {
  program: NutritionProgram;
  diets: Diet[];
  pesos: readonly Pick<BodyweightLog, 'date' | 'weight'>[];
  registros: readonly DietCompletionLog[];
  pasos: readonly Pick<StepLog, 'date' | 'steps'>[];
  pasosBase: number;
  hoy: string;
}): SemanaDelPlan[] {
  const { program, diets, hoy } = p;
  if (!program.startDate || program.phases.length === 0) return [];

  // Mismo criterio que el gasto real: un día sin marcas es un día sin
  // registrar, no un día de ayuno.
  const kcalDelDia = new Map<string, number>();
  for (const log of p.registros) {
    const kcal = kcalRegistradasDelDia(log, diets);
    if (kcal != null && kcal > 0) kcalDelDia.set(log.date, kcal);
  }
  const pasosDelDia = new Map<string, number>();
  for (const s of p.pasos) if (s.steps > 0) pasosDelDia.set(s.date, s.steps);

  const out: SemanaDelPlan[] = [];
  let semana = 0;
  let refSiguiente: number | null = null;
  // kcal de cada semana con lo programado (escalones, ajustes): es lo que come de verdad.
  const kcalSemana = kcalPorSemana(program, diets);

  program.phases.forEach((fase, faseIdx) => {
    const inicioFase = computePhaseStartDate(program, faseIdx);
    const objetivo = objetivoDeFase(program, faseIdx)?.tipo ?? null;
    const pesosInicio = p.pesos.filter(w => w.date >= inicioFase && w.date <= addDays(inicioFase, 6)).map(w => w.weight);
    const ref = pesosInicio.length ? pesoRepresentativo(pesosInicio) : refSiguiente;
    const diet = diets.find(d => d.id === fase.dietId);
    const kcalFase = resolvePhaseTargetKcal(fase, diet).kcal;

    for (let i = 0; i < fase.weeks; i++) {
      semana++;
      const desde = addDays(inicioFase, i * 7);
      const hasta = addDays(desde, 6);
      const futura = desde > hoy;
      const enCurso = desde <= hoy && hoy <= hasta;
      // Una dieta sin cupo da 0: entonces manda el objetivo de la fase.
      const kcalPlan = kcalSemana[semana] || kcalFase;
      const plan = ref != null && objetivo
        ? planDeFase({ ref, objetivo, pesoObjetivo: fase.targetWeight, semanas: fase.weeks, desde: inicioFase, fecha: addDays(desde, 3) })
        : null;

      const pesosSemana = futura ? [] : p.pesos.filter(w => w.date >= desde && w.date <= hasta).map(w => w.weight);
      const real = pesosSemana.length ? r2(pesoRepresentativo(pesosSemana)) : null;

      const vividos = futura ? 0 : Math.min(7, diasEntre(desde, hoy) + 1);
      const dias = Array.from({ length: vividos }, (_, k) => addDays(desde, k));
      const kcals = dias.map(d => kcalDelDia.get(d)).filter((n): n is number => n != null);
      const cumplidos = kcalPlan ? kcals.filter(k => Math.abs(k - kcalPlan) <= kcalPlan * MARGEN_ADHERENCIA).length : 0;
      const pasosDias = dias.map(d => pasosDelDia.get(d)).filter((n): n is number => n != null);

      let estado: EstadoSemana | null = null;
      if (real != null && plan) {
        estado = real > plan.franja[1] ? 'por-encima' : real < plan.franja[0] ? 'por-debajo' : 'en-plan';
      }

      out.push({
        semana, desde, hasta, faseIdx, fase,
        kcalPlan,
        kcalRegistradas: kcals.length ? Math.round(media(kcals)!) : null,
        diasRegistrados: kcals.length,
        kcalFiables: kcals.length >= DIAS_MINIMOS_SEMANA,
        adherencia: kcalPlan && vividos > 0 ? Math.round((cumplidos / vividos) * 100) : null,
        pasosPlan: objetivoDePasos(program, desde, p.pasosBase) ?? p.pasosBase ?? null,
        pasosReales: pasosDias.length ? Math.round(media(pasosDias)! / 100) * 100 : null,
        esperado: plan?.plan ?? null,
        franja: plan?.franja ?? null,
        real, estado, futura, enCurso,
      });
    }
    // La fase siguiente, si aún no tiene pesos propios, sale de donde acaba esta.
    if (ref != null && objetivo) {
      refSiguiente = planDeFase({ ref, objetivo, pesoObjetivo: fase.targetWeight, semanas: fase.weeks, desde: inicioFase, fecha: addDays(inicioFase, fase.weeks * 7 - 1) }).plan;
    }
  });
  return out;
}

export interface OpcionDeAjuste {
  tipo: 'alargar' | 'apretar';
  titulo: string;
  detalle: string;
  /** El programa con el cambio ya hecho, listo para guardar si el coach lo aplica. */
  programa: NutritionProgram;
  /** Lo que queda apuntado como decisión de la semana. */
  decision: string;
}

export { calcularGastoReal };

export interface EvaluacionDelPlan {
  semana: SemanaDelPlan;          // la última con peso real
  estado: EstadoSemana;
  desvio: number;                 // real − esperado
  ritmo: number | null;           // kg/sem, últimas 4 semanas con peso
  ritmoPlan: number | null;       // kg/sem que pide la fase
  semanaFinFase: number;
  objetivoFase: number | null;
  finAlRitmo: number | null;
  explicacion: string;
  opciones: OpcionDeAjuste[];
  /** Últimas 4 semanas vividas. */
  adherencia: number | null;
  pasosMedios: number | null;
  pasosPlan: number | null;
  kcalRegistradas: number | null;
  kcalPlan: number | null;
  mantenimientoObservado: number | null;
}

const fmt = (n: number, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), d)}`;
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fechaCorta = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function evaluarPlan(
  program: NutritionProgram,
  semanas: SemanaDelPlan[],
  /** El gasto real de la app (utils/gastoReal.ts); sin él no hay mantenimiento observado. */
  gasto?: Pick<GastoReal, 'kcal' | 'confianza' | 'sospechaInfraRegistro'> | null,
): EvaluacionDelPlan | null {
  const conPeso = semanas.filter(s => s.real != null && s.esperado != null && s.estado);
  const ultima = conPeso.at(-1);
  if (!ultima) return null;
  const fase = ultima.fase;
  const deLaFase = semanas.filter(s => s.faseIdx === ultima.faseIdx);
  const finFase = deLaFase.at(-1)!;
  const objetivoFase = finFase.esperado;
  const desvio = r2(ultima.real! - ultima.esperado!);

  const recientes = conPeso.slice(-4);
  const ritmoBruto = recientes.length >= 2 ? ritmoReal(recientes.map(s => s.real!)) : null;
  const ritmo = ritmoBruto == null ? null : r2(ritmoBruto);
  const primeraFase = deLaFase.find(s => s.esperado != null);
  const ritmoPlan = primeraFase && objetivoFase != null && fase.weeks > 1
    ? r2((objetivoFase - primeraFase.esperado!) / (fase.weeks - 1)) : null;
  const restantes = Math.max(0, finFase.semana - ultima.semana);
  const finAlRitmo = ritmo != null ? r1(ultima.real! + ritmo * restantes) : null;

  const vividas = semanas.filter(s => !s.futura).slice(-4);
  const adh = media(vividas.map(s => s.adherencia).filter((n): n is number => n != null));
  const pasosMedios = media(vividas.map(s => s.pasosReales).filter((n): n is number => n != null));
  // Solo las semanas con días suficientes: una semana con dos desayunos
  // apuntados daría 800 kcal de media y un déficit que no existe.
  const kcalReg = media(vividas.filter(s => s.kcalFiables).map(s => s.kcalRegistradas).filter((n): n is number => n != null));
  // Mantenimiento observado: el mismo gasto real que enseña el resto de la app.
  const mantenimiento = gasto?.kcal != null && gasto.confianza !== 'insuficiente' && !gasto.sospechaInfraRegistro
    ? Math.round(gasto.kcal / 50) * 50 : null;

  const partes: string[] = [];
  if (ritmo != null) {
    partes.push(`En las últimas ${recientes.length} semanas ${ritmo < 0 ? 'baja' : ritmo > 0 ? 'sube' : 'se mantiene'} ${ritmo !== 0 ? `${fmt(Math.abs(ritmo), 2)} kg/sem` : ''}${ritmoPlan != null ? ` (el plan pide ${sign(ritmoPlan, 2)})` : ''}.`);
  }
  if (finAlRitmo != null && objetivoFase != null && restantes > 0) {
    const falta = r1(finAlRitmo - objetivoFase);
    partes.push(`A este ritmo llega a ${fmt(finAlRitmo)} kg en la S${finFase.semana}${Math.abs(falta) >= 0.3 ? `: ${falta > 0 ? 'faltarían' : 'sobrarían'} ${fmt(Math.abs(falta))} kg` : ', justo en el objetivo'}.`);
  }
  if (adh != null || pasosMedios != null) {
    partes.push(`Dieta ${adh != null ? `${Math.round(adh)} %` : 'sin registros'} y ${pasosMedios != null ? `${miles(pasosMedios)} pasos` : 'sin pasos'} de media.`);
  }

  const opciones: OpcionDeAjuste[] = [];
  const estado = ultima.estado!;
  if (estado !== 'en-plan' && objetivoFase != null) {
    const pendiente = objetivoFase - ultima.real!;
    // Alargar: solo si ya va en la buena dirección; si no, alargar no llega nunca.
    if (ritmo != null && Math.abs(ritmo) >= 0.05 && Math.sign(ritmo) === Math.sign(pendiente)) {
      const necesarias = pendiente / ritmo;
      const extra = Math.ceil(necesarias - restantes);
      if (extra > 0 && extra <= 16) {
        const phases = program.phases.map((f, i) => (i === ultima.faseIdx ? { ...f, weeks: f.weeks + extra } : f));
        const llega = addDays(finFase.hasta, extra * 7);
        opciones.push({
          tipo: 'alargar',
          titulo: 'Alargar',
          detalle: `+${extra} ${extra === 1 ? 'semana' : 'semanas'} de ${fase.name.split(' — ')[0].toLowerCase()}, mismas kcal · llega el ${fechaCorta(llega)}`,
          programa: { ...program, phases },
          decision: `Alargo ${fase.name.split(' — ')[0]} ${extra} ${extra === 1 ? 'semana' : 'semanas'}.`,
        });
      }
    }
    // Apretar: el ritmo que haría falta para llegar a tiempo, en kcal.
    if (restantes > 0 && ultima.kcalPlan) {
      const ritmoNecesario = pendiente / restantes;
      const propuesta = proponerAjuste({
        ritmoObjetivo: ritmoNecesario,
        ritmoReal: ritmo,
        kcalActuales: ultima.kcalPlan,
        mantenimientoEstimado: mantenimiento,
        confianza: conPeso.length >= 6 ? 'alta' : conPeso.length >= 4 ? 'media' : 'baja',
      });
      if (propuesta.hayPropuesta && propuesta.kcalPropuestas && propuesta.kcalPropuestas !== ultima.kcalPlan) {
        const phases = program.phases.map((f, i) => (i === ultima.faseIdx ? { ...f, targetKcal: propuesta.kcalPropuestas! } : f));
        opciones.push({
          tipo: 'apretar',
          titulo: propuesta.kcalPropuestas < ultima.kcalPlan ? 'Apretar' : 'Subir kcal',
          detalle: `${miles(propuesta.kcalPropuestas)} kcal (antes ${miles(ultima.kcalPlan)}) · ${sign(ritmoNecesario, 2)} kg/sem hasta la S${finFase.semana}`,
          programa: { ...program, phases },
          decision: `Paso a ${miles(propuesta.kcalPropuestas)} kcal.`,
        });
      }
    }
  }

  return {
    semana: ultima, estado, desvio, ritmo, ritmoPlan,
    semanaFinFase: finFase.semana, objetivoFase, finAlRitmo,
    explicacion: partes.join(' '),
    opciones,
    adherencia: adh == null ? null : Math.round(adh),
    pasosMedios: pasosMedios == null ? null : Math.round(pasosMedios / 100) * 100,
    pasosPlan: ultima.pasosPlan,
    kcalRegistradas: kcalReg == null ? null : Math.round(kcalReg),
    kcalPlan: ultima.kcalPlan,
    mantenimientoObservado: mantenimiento,
  };
}
