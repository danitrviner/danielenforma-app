import { QSchedule, Mesocycle } from '../types';
import { hoyIsoLocal } from './trainingWeek';

// Generic recurring-schedule evaluation, extracted from questionnaireSchedule.ts
// so it can be reused for anything scheduled with a QSchedule (currently
// questionnaires and photo check-ins) without duplicating the date math.

export interface Scheduled {
  schedule: QSchedule;
  startDate: string; // YYYY-MM-DD
}

// Contexto opcional para los disparadores por evento ('plan_week' y
// 'mesocycle_end'). El caller debe pasar los mesociclos ya filtrados al
// atleta dueño de `a` — scheduleEngine no conoce el athleteId de `a`.
export interface ScheduleContext {
  mesocycles?: Mesocycle[];
}

/* Era `new Date().toISOString().slice(0, 10)`, o sea el día en UTC. El resto
   de este motor trabaja con `new Date()` en hora LOCAL (`isDueToday` compara
   con `setHours(0,0,0,0)`), así que entre medianoche y las 2:00 de España las
   dos mitades hablaban de días distintos: la hora local decía «hoy es 15» y
   esta función devolvía el 14. Un cuestionario que vencía el 15 aparecía como
   pendiente y la foto subida esa madrugada no contaba para su ocurrencia.
   `hoyIsoLocal()` es la única fuente de «hoy» de la app. */
export function todayStr(): string {
  return hoyIsoLocal();
}

export function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
}

// Fecha objetivo de un disparador 'plan_week': la semana N (1-indexada) desde
// startDate, en el día de la semana indicado (por defecto, el mismo día de la
// semana que startDate). Exportada para que questionnaireSchedule.ts pueda
// calcular ventanas de ocurrencia "vencido hasta responder" sin duplicar la
// aritmética de fechas.
export function planWeekDueDate(schedule: QSchedule, start: Date): Date {
  const week = schedule.planWeek ?? 1;
  const weekday = schedule.planWeekday ?? start.getDay();
  const due = new Date(start);
  due.setDate(due.getDate() + (week - 1) * 7);
  const shift = (weekday - due.getDay() + 7) % 7;
  due.setDate(due.getDate() + shift);
  return due;
}

// Último día (inclusive) de un mesociclo, menos un offset opcional en días
// (offset positivo = antes del cierre, negativo = después). Exportada por el
// mismo motivo que planWeekDueDate.
export function mesocycleEndDate(m: Mesocycle, offsetDays: number): Date {
  const start = startOfDay(m.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + m.weeks * 7 - 1 - offsetDays);
  return end;
}

export function isDueToday(a: Scheduled, ctx?: ScheduleContext): boolean {
  if (!a.schedule) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startOfDay(a.startDate);
  if (today < start) return false;

  const { type } = a.schedule;
  if (type === 'once') return a.startDate === todayStr();
  if (type === 'weekdays') return (a.schedule.weekdays ?? []).includes(today.getDay());
  if (type === 'interval') {
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
    return diff % (a.schedule.intervalDays ?? 7) === 0;
  }
  if (type === 'monthly') return today.getDate() === (a.schedule.dayOfMonth ?? 1);
  if (type === 'plan_week') {
    return planWeekDueDate(a.schedule, start).getTime() === today.getTime();
  }
  if (type === 'mesocycle_end') {
    const offset = a.schedule.mesocycleOffsetDays ?? 0;
    return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() === today.getTime());
  }
  return false;
}

// A schedule is "upcoming" (not due today, but will recur).
export function isUpcoming(a: Scheduled, ctx?: ScheduleContext): boolean {
  if (!a.schedule) return false;
  if (isDueToday(a, ctx)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startOfDay(a.startDate);
  const { type } = a.schedule;
  if (type === 'plan_week') {
    return planWeekDueDate(a.schedule, start).getTime() > today.getTime();
  }
  if (type === 'mesocycle_end') {
    const offset = a.schedule.mesocycleOffsetDays ?? 0;
    return (ctx?.mesocycles ?? []).some(m => mesocycleEndDate(m, offset).getTime() > today.getTime());
  }
  return today <= start || type !== 'once';
}

// Short human label for an "active assignments" list row — shared by the
// questionnaire and photo check-in assignment UIs in ClientHub.
/** La misma cadencia, pero para el ATLETA. `scheduleLabel` es una etiqueta
 *  compacta pensada para las tablas del coach, donde caben pocos caracteres y
 *  se leen muchas seguidas ("Cada 14d", "Día 26/mes"); en la pantalla de
 *  Revisión eso son abreviaturas de máquina delante de alguien que solo quiere
 *  saber cada cuánto le toca. Función aparte a propósito: cambiar
 *  `scheduleLabel` alteraría las dos pantallas del coach. */
export function cadenciaEnCristiano(schedule: QSchedule): string {
  const DIAS = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados'];
  switch (schedule?.type) {
    case 'once': return 'Una sola vez';
    case 'weekdays': {
      const dias = (schedule.weekdays ?? []).map(d => DIAS[d]).filter(Boolean);
      if (dias.length === 0) return 'Sin fecha fija';
      const texto = dias.length === 1
        ? dias[0]
        : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
      return texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    case 'interval': {
      const n = schedule.intervalDays ?? 1;
      if (n === 1) return 'Todos los días';
      if (n === 7) return 'Cada semana';
      if (n === 14) return 'Cada dos semanas';
      if (n === 30 || n === 31) return 'Cada mes';
      return `Cada ${n} días`;
    }
    case 'monthly': return `El día ${schedule.dayOfMonth ?? 1} de cada mes`;
    case 'plan_week': return `En la semana ${schedule.planWeek ?? 1} de tu plan`;
    case 'mesocycle_end': {
      const off = schedule.mesocycleOffsetDays ?? 0;
      if (off === 0) return 'Al acabar el bloque';
      return off > 0
        ? `${off} día${off === 1 ? '' : 's'} antes de acabar el bloque`
        : `${-off} día${-off === 1 ? '' : 's'} después de acabar el bloque`;
    }
    default: return 'Sin fecha fija';
  }
}

export function scheduleLabel(schedule: QSchedule): string {
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  switch (schedule?.type) {
    case 'once':     return 'Una vez';
    case 'weekdays': return (schedule.weekdays ?? []).map(d => DAYS[d]).join(', ') || '—';
    case 'interval': return `Cada ${schedule.intervalDays ?? 1}d`;
    case 'monthly':  return `Día ${schedule.dayOfMonth ?? 1}/mes`;
    case 'plan_week': return `Semana ${schedule.planWeek ?? 1} del plan`;
    case 'mesocycle_end': {
      const off = schedule.mesocycleOffsetDays ?? 0;
      if (off === 0) return 'Fin de bloque';
      return off > 0 ? `${off}d antes de fin de bloque` : `${-off}d después de fin de bloque`;
    }
    default:         return '—';
  }
}

/** Fecha local en formato YYYY-MM-DD (no UTC — `toISOString()` se adelanta o
 *  se atrasa un día según la zona horaria). */
function ymdLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Próxima fecha (hoy incluido) en la que toca responder, o `null` si la
 *  ocurrencia ya pasó y no se repite ('once'/'plan_week' vencidos) o si no se
 *  puede saber (un 'mesocycle_end' sin mesociclos en el contexto).
 *
 *  Es lo que el coach necesita leer de un vistazo en la lista de asignados:
 *  `scheduleLabel` dice cada cuánto, esto dice CUÁNDO cae la siguiente. */
export function proximaOcurrencia(a: Scheduled, ctx?: ScheduleContext): string | null {
  if (!a.schedule) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = startOfDay(a.startDate);
  // Nunca antes del alta de la asignación: si empieza en el futuro, la primera
  // ocurrencia se busca desde ese día, no desde hoy.
  const desde = inicio > hoy ? inicio : hoy;

  switch (a.schedule.type) {
    case 'once':
      return inicio >= hoy ? a.startDate : null;

    case 'weekdays': {
      const dias = a.schedule.weekdays ?? [];
      if (dias.length === 0) return null;
      for (let i = 0; i < 7; i++) {
        const cand = new Date(desde);
        cand.setDate(cand.getDate() + i);
        if (dias.includes(cand.getDay())) return ymdLocal(cand);
      }
      return null;
    }

    case 'interval': {
      const n = a.schedule.intervalDays ?? 7;
      if (n <= 0) return null;
      if (desde <= inicio) return ymdLocal(inicio);
      const diff = Math.floor((desde.getTime() - inicio.getTime()) / 86400000);
      const resto = diff % n;
      const cand = new Date(desde);
      if (resto !== 0) cand.setDate(cand.getDate() + (n - resto));
      return ymdLocal(cand);
    }

    case 'monthly': {
      const dia = a.schedule.dayOfMonth ?? 1;
      // Dos intentos: este mes y el siguiente. El día se recorta al último del
      // mes (un "día 31" en febrero cae el 28/29, no se salta el mes).
      for (let salto = 0; salto < 2; salto++) {
        const ref = new Date(desde.getFullYear(), desde.getMonth() + salto, 1);
        const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const cand = new Date(ref.getFullYear(), ref.getMonth(), Math.min(dia, ultimo));
        if (cand >= desde) return ymdLocal(cand);
      }
      return null;
    }

    case 'plan_week': {
      const due = planWeekDueDate(a.schedule, inicio);
      return due >= hoy ? ymdLocal(due) : null;
    }

    case 'mesocycle_end': {
      const offset = a.schedule.mesocycleOffsetDays ?? 0;
      const futuras = (ctx?.mesocycles ?? [])
        .map(m => mesocycleEndDate(m, offset))
        .filter(d => d >= hoy)
        .sort((x, y) => x.getTime() - y.getTime());
      return futuras.length > 0 ? ymdLocal(futuras[0]) : null;
    }

    default:
      return null;
  }
}

/** "Hoy" / "Mañana" / "sáb, 19 sep" — cómo se lee una fecha de vencimiento en
 *  la lista de asignados. Devuelve '' si no hay fecha. */
export function etiquetaFechaCorta(iso: string | null, hoyIso?: string): string {
  if (!iso) return '';
  const hoy = startOfDay(hoyIso ?? ymdLocal(new Date()));
  const fecha = startOfDay(iso);
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Hoy en hora LOCAL. `todayStr()` usa `toISOString()` (UTC) y en España se
 *  queda en el día anterior entre medianoche y las 2 de la mañana; para fechas
 *  que el coach elige y lee (el alta de una asignación) eso es un día de menos. */
export function hoyLocalStr(): string {
  return ymdLocal(new Date());
}

/** La cadencia para la TABLA del coach: ni la abreviatura de máquina de
 *  `scheduleLabel` ("Día 26/mes") ni la frase de atleta de
 *  `cadenciaEnCristiano` ("El día 26 de cada mes", que en una columna se parte
 *  en dos líneas). Una línea, en castellano, legible de un vistazo. */
export function cadenciaParaTabla(schedule: QSchedule): string {
  const CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const LARGOS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  switch (schedule?.type) {
    case 'once': return 'Una sola vez';
    case 'weekdays': {
      const dias = (schedule.weekdays ?? []).filter(d => d >= 0 && d <= 6);
      if (dias.length === 0) return 'Sin fecha fija';
      if (dias.length === 1) return `Los ${LARGOS[dias[0]]}`;
      // A partir de cuatro días la lista es más larga que el dato que aporta.
      if (dias.length > 3) return `${dias.length} días/semana`;
      const nombres = dias.map(d => CORTOS[d]);
      return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    }
    case 'interval': {
      const n = schedule.intervalDays ?? 1;
      if (n === 1) return 'Cada día';
      if (n === 7) return 'Cada semana';
      if (n % 7 === 0) return `Cada ${n / 7} semanas`;
      if (n === 30 || n === 31) return 'Cada mes';
      return `Cada ${n} días`;
    }
    case 'monthly': return `Cada mes · día ${schedule.dayOfMonth ?? 1}`;
    case 'plan_week': return `Semana ${schedule.planWeek ?? 1} del plan`;
    case 'mesocycle_end': {
      const off = schedule.mesocycleOffsetDays ?? 0;
      if (off === 0) return 'Fin de bloque';
      return off > 0 ? `${off} d antes del fin` : `${-off} d tras el fin`;
    }
    default: return 'Sin fecha fija';
  }
}
