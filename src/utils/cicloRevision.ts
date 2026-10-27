import type { Mesocycle, QSchedule } from '../types.js';
import { addDays } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Ciclo de revisión de un atleta (paquete oficial, 27-10)

   Cada atleta tiene un DÍA DE REVISIÓN: el día en que su coach le revisa. La
   revisión se le abre 3 días antes y caduca el día después. Es la regla de
   siempre generalizada: con revisión el lunes (el valor por defecto) se abre
   el viernes, está pendiente viernes, sábado, domingo y lunes, y el martes
   caduca —exactamente lo que había fijo en el código—.

     Revisa   Se abre   Pendiente      Caduca
     lunes    viernes   vie → lun      martes
     martes   sábado    sáb → mar      miércoles
     miérc.   domingo   dom → mié      jueves

   Un ciclo dura 7 días y empieza el día de caducidad del anterior: con
   revisión el lunes, martes → lunes.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Revisión el lunes: la regla anterior a poder elegir el día. */
export const DIA_REVISION_POR_DEFECTO = 1;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const local = (s: string) => { const d = new Date(s.slice(0, 10) + 'T00:00:00'); d.setHours(0, 0, 0, 0); return d; };

/** Un día de revisión válido (0-6) o el de por defecto. */
export function normalizarDiaRevision(dia?: number | null): number {
  return Number.isInteger(dia) && (dia as number) >= 0 && (dia as number) <= 6 ? (dia as number) : DIA_REVISION_POR_DEFECTO;
}

/** Día de apertura y de caducidad (0=dom…6=sáb) para un día de revisión. */
export function diasDelCiclo(diaRevision?: number | null): { revision: number; apertura: number; caducidad: number } {
  const revision = normalizarDiaRevision(diaRevision);
  return { revision, apertura: (revision + 4) % 7, caducidad: (revision + 1) % 7 };
}

/** Día en que se abre la revisión del ciclo al que pertenece `fecha`. El ciclo
 *  va del día de caducidad al día de revisión: con revisión el lunes, un lunes
 *  o un domingo apuntan al viernes anterior y un martes o un miércoles al
 *  siguiente. */
export function aperturaDelCiclo(fecha: string, diaRevision?: number | null): string {
  const { apertura, caducidad } = diasDelCiclo(diaRevision);
  const d = local(fecha);
  const posicion = (d.getDay() - caducidad + 7) % 7;           // día de caducidad = 0
  d.setDate(d.getDate() + ((apertura - caducidad + 7) % 7) - posicion);
  return iso(d);
}

/** Día en que caduca el ciclo que se abre en `apertura` (4 días después). */
export function caducidadDelCiclo(apertura: string): string {
  return addDays(apertura, 4);
}

/** Primera apertura igual o posterior a `fecha`. */
export function aperturaDesde(fecha: string, diaRevision?: number | null): string {
  const { apertura } = diasDelCiclo(diaRevision);
  const d = local(fecha);
  d.setDate(d.getDate() + ((apertura - d.getDay() + 7) % 7));
  return iso(d);
}

export type PausaRevisiones = { desde: string; hasta: string };

/** ¿La revisión que se abre en `apertura` cae dentro de una pausa? */
export function enPausa(apertura: string, pausa?: PausaRevisiones | null): boolean {
  if (!pausa?.desde || !pausa?.hasta) return false;
  return apertura >= pausa.desde && apertura <= pausa.hasta;
}

/* ── Calendario «semana del bloque» ─────────────────────────────────────── */

/** Bloque de descarga: corto y marcado como descarga. No lleva cierre ni
 *  mediciones propias (el cierre fue el del bloque anterior). */
export function esBloqueDeDescarga(m: Pick<Mesocycle, 'weeks' | 'objective'>): boolean {
  return m.weeks <= 2 && /descarga|deload/i.test(m.objective ?? '');
}

/** Semana (1-indexada) del bloque que pide el calendario, o null si en ese
 *  bloque no toca (descarga, o más corto que `minSemanasBloque`). */
export function semanaPedida(s: QSchedule, m: Pick<Mesocycle, 'weeks' | 'objective'>): number | null {
  if (esBloqueDeDescarga(m)) return null;
  if (s.minSemanasBloque && m.weeks < s.minSemanasBloque) return null;
  const semanas = Math.max(1, m.weeks);
  switch (s.semanaDelBloque ?? 'ultima') {
    case 'primera': return 1;
    case 'mitad': return Math.ceil(semanas / 2);
    default: return semanas;
  }
}

/** Fecha (apertura del ciclo de revisión) en que toca en un bloque concreto.
 *  Es la apertura del ciclo que contiene el último día de esa semana del
 *  bloque, sin salirse del bloque por delante. */
export function fechaSemanaDelBloque(s: QSchedule, m: Pick<Mesocycle, 'weeks' | 'objective' | 'startDate'>, diaRevision?: number | null): string | null {
  const semana = semanaPedida(s, m);
  if (semana == null) return null;
  const ultimoDiaDeLaSemana = addDays(m.startDate.slice(0, 10), semana * 7 - 1);
  const apertura = aperturaDelCiclo(ultimoDiaDeLaSemana, diaRevision);
  return apertura < m.startDate.slice(0, 10) ? m.startDate.slice(0, 10) : apertura;
}

/** Todas las fechas en que toca un 'mesocycle_week', una por bloque, ordenadas. */
export function fechasSemanaDelBloque(s: QSchedule, mesos: Pick<Mesocycle, 'weeks' | 'objective' | 'startDate'>[], diaRevision?: number | null): string[] {
  return mesos
    .map(m => fechaSemanaDelBloque(s, m, diaRevision))
    .filter((f): f is string => !!f)
    .sort();
}

/* ── Ajustes de revisión de un atleta ───────────────────────────────────── */

export interface AjustesRevision { diaRevision?: number; pausa?: PausaRevisiones }

/** Lo que el calendario necesita saber del perfil del atleta. */
export function ajustesRevisionDe(p?: { diaRevision?: number; pausaRevisiones?: PausaRevisiones } | null): AjustesRevision {
  return { diaRevision: p?.diaRevision, pausa: p?.pausaRevisiones };
}
