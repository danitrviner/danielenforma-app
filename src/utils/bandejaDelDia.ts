import { Mesocycle, UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';
import { addDays, diasEntreFechas, isoLocal } from './trainingWeek';
import { DIAS_AVISO_RENOVACION } from './calidadDelPlan';

/* ═══════════════════════════════════════════════════════════════════════════
   LA BANDEJA DEL DÍA — qué atleta necesita algo tuyo, y con cuánta prisa.

   La pantalla de inicio del coach ya listaba tres cosas: check-ins sin
   contestar, pagos vencidos y planes sin publicar. Lo que no listaba es lo que
   de verdad se escapa, porque no genera ningún evento: el atleta que lleva
   nueve días sin abrir la app, el que se dejó de pesar, el bloque que se acaba
   el viernes, el setup que quedó al 60 % hace tres semanas. Nada de eso avisa
   por su cuenta, y por eso se descubre tarde.

   ── Qué NO hace este motor ─────────────────────────────────────────────────
   No lee nada. Recibe lo que la pantalla YA tiene cargado —perfiles,
   check-ins, asignaciones de la semana, suscripciones— más los mesociclos, que
   es UNA consulta por lotes para todos los atletas a la vez. Meter aquí
   señales que exijan el historial de cada atleta multiplicaría las lecturas
   por el número de clientes en cada apertura de la app, que es justo lo que
   esta fase viene a quitar.

   ── El orden ───────────────────────────────────────────────────────────────
   No es alfabético ni por fecha: es por lo que le pasa al ATLETA si no haces
   nada. Primero lo que le tiene parado (no puede entrenar), después lo que hay
   que contestar hoy, y al final los avisos con antelación. Dentro de cada
   nivel, por nombre, para que la lista no baile entre recargas.

   Puro y determinista, con la fecha inyectada.
   ═══════════════════════════════════════════════════════════════════════════ */

export type UrgenciaSenal = 'bloqueado' | 'hoy' | 'pronto';

export type CategoriaSenal =
  | 'plan' | 'revision' | 'pago' | 'propuesta' | 'ausencia' | 'renovacion' | 'setup';

export interface SenalDelDia {
  id: string;
  athleteEmail: string;
  athleteName: string;
  urgencia: UrgenciaSenal;
  categoria: CategoriaSenal;
  /** Qué pasa, en una línea. */
  texto: string;
  /**
   * La ruta a la que se va al pulsar, entera.
   *
   * Entera y no «la pestaña del Hub» porque no todas las señales llevan al
   * Hub: un cobro vencido lleva al CRM, que no está indexado por email de
   * atleta sino por id de cliente. Con una ruta completa, la pantalla pinta
   * una sola lista ordenada por prisa en vez de dos listas separadas por un
   * detalle de enrutado.
   */
  destino: string;
}

export interface EntradaBandeja {
  atletas: UserProfile[];
  checkins: WeightCheckIn[];
  /** Asignaciones por email, tal como las tiene la pantalla de clientes. */
  asignacionesPorEmail: Map<string, WorkoutAssignment[]>;
  mesociclos: Mesocycle[];
  /**
   * Cobros vencidos, ya resueltos por el CRM. Llevan su propio destino porque
   * el CRM identifica al cliente por su id, no por el email del atleta — y
   * casarlos por NOMBRE sería una unión frágil que falla justo con los
   * nombres repetidos.
   */
  pagosVencidos?: { nombre: string; texto: string; destino: string }[];
  /** Cuántas propuestas del asistente esperan por atleta. */
  propuestasPorEmail?: Map<string, number>;
  hoy: string;
}

/** Días sin abrir la app a partir de los cuales conviene escribirle. */
export const DIAS_SIN_ENTRAR = 7;
/** Días sin mandar un check-in a partir de los cuales se avisa. */
export const DIAS_SIN_CHECKIN = 10;
/** Por debajo de este % de montaje, un plan con semanas de vida está a medias. */
export const SETUP_INCOMPLETO_PCT = 80;
/** Días desde el alta antes de los cuales no se avisa de un setup incompleto. */
export const DIAS_DE_GRACIA_SETUP = 7;

const PESO_URGENCIA: Record<UrgenciaSenal, number> = { bloqueado: 0, hoy: 1, pronto: 2 };

function aIso(fecha: Date | string): string | null {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return isoLocal(d);
}

export function construirBandejaDelDia(entrada: EntradaBandeja): SenalDelDia[] {
  const { atletas, checkins, asignacionesPorEmail, mesociclos, hoy } = entrada;
  const pagos = entrada.pagosVencidos ?? [];
  const propuestas = entrada.propuestasPorEmail ?? new Map<string, number>();
  const senales: SenalDelDia[] = [];

  const checkinsPorEmail = new Map<string, WeightCheckIn[]>();
  for (const c of checkins) {
    const k = c.email.toLowerCase();
    if (!checkinsPorEmail.has(k)) checkinsPorEmail.set(k, []);
    checkinsPorEmail.get(k)!.push(c);
  }

  for (const a of atletas) {
    const email = a.email;
    const nombre = a.displayName || email;
    const suyos = checkinsPorEmail.get(email.toLowerCase()) ?? [];
    const añadir = (
      id: string, urgencia: UrgenciaSenal, categoria: CategoriaSenal, texto: string, tab: string,
    ) => senales.push({
      id: `${categoria}_${email}_${id}`,
      athleteEmail: email, athleteName: nombre, urgencia, categoria, texto,
      destino: `/clients/${encodeURIComponent(email)}/${tab}`,
    });

    // ── Lo que le tiene parado ───────────────────────────────────────────
    const asignaciones = asignacionesPorEmail.get(email) ?? [];
    if (asignaciones.length === 0) {
      añadir('sin_entrenos', 'bloqueado', 'plan', 'Sin entrenamientos asignados', 'entrenamientos');
    } else if (!a.planPublishedAt) {
      // El trabajo está hecho y solo falta pulsar el botón: el caso que más se
      // escapa, porque desde el lado del coach parece terminado.
      añadir('sin_publicar', 'bloqueado', 'plan', 'Plan sin publicar · el atleta no lo ve', 'entrenamientos');
    }

    // ── Lo que hay que contestar hoy ─────────────────────────────────────
    const pendientes = suyos.filter(c => !c.approved || !c.coachFeedback).length;
    if (pendientes > 0) {
      añadir('checkins', 'hoy', 'revision',
        `${pendientes} ${pendientes === 1 ? 'revisión pendiente' : 'revisiones pendientes'}`, 'revisiones');
    }
    const nPropuestas = propuestas.get(email) ?? 0;
    if (nPropuestas > 0) {
      añadir('propuestas', 'hoy', 'propuesta',
        `${nPropuestas} ${nPropuestas === 1 ? 'propuesta del asistente' : 'propuestas del asistente'} sin revisar`, 'revision');
    }
    // ── Lo que no avisa por su cuenta ────────────────────────────────────
    const ultimoLogin = a.lastLoginAt ? aIso(a.lastLoginAt) : null;
    if (ultimoLogin) {
      const dias = diasEntreFechas(ultimoLogin, hoy);
      if (dias >= DIAS_SIN_ENTRAR) {
        añadir('sin_entrar', 'pronto', 'ausencia', `Lleva ${dias} días sin abrir la app`, 'revision');
      }
    }

    const fechasCheckin = suyos.map(c => aIso(c.timestamp)).filter((f): f is string => !!f).sort();
    const ultimoCheckin = fechasCheckin[fechasCheckin.length - 1];
    if (ultimoCheckin) {
      const dias = diasEntreFechas(ultimoCheckin, hoy);
      if (dias >= DIAS_SIN_CHECKIN) {
        añadir('sin_checkin', 'pronto', 'ausencia', `${dias} días sin mandar check-in`, 'revisiones');
      }
    }

    // ── El bloque que se acaba ───────────────────────────────────────────
    const enCurso = mesociclos.find(m =>
      m.athleteId === email && !!m.startDate
      && hoy >= m.startDate && hoy <= addDays(m.startDate, m.weeks * 7 - 1));
    if (enCurso) {
      const quedan = diasEntreFechas(hoy, addDays(enCurso.startDate, enCurso.weeks * 7 - 1));
      if (quedan <= DIAS_AVISO_RENOVACION) {
        añadir('renovar', 'pronto', 'renovacion',
          quedan <= 0 ? 'El bloque termina hoy' : `El bloque termina en ${quedan} ${quedan === 1 ? 'día' : 'días'}`,
          'setup');
      }
    }

    // ── El montaje que se quedó a medias ─────────────────────────────────
    // Solo con margen desde el alta: un cliente de ayer está al 20 % y eso no
    // es un problema, es que acaba de entrar.
    const resumen = a.setupSummary;
    const inicio = a.planStartDate;
    if (resumen && inicio && diasEntreFechas(inicio, hoy) >= DIAS_DE_GRACIA_SETUP
        && resumen.pct < SETUP_INCOMPLETO_PCT) {
      añadir('setup', 'pronto', 'setup', `Montaje al ${resumen.pct} % desde hace semanas`, 'setup');
    }
  }

  /* Los check-ins de quien NO está en la lista de atletas: bajas del CRM,
     cuentas anonimizadas, o un correo sin perfil. Antes la bandeja recorría
     los check-ins directamente y salían todos; al pasar a recorrer atletas,
     estos se perdían — mientras la campana de Revisiones los seguía contando.
     Un cliente de baja que manda un check-in es precisamente de lo que hay
     que enterarse. */
  const conocidos = new Set(atletas.map(a => a.email.toLowerCase()));
  for (const [emailMin, suyos] of checkinsPorEmail) {
    if (conocidos.has(emailMin)) continue;
    const pendientes = suyos.filter(c => !c.approved || !c.coachFeedback).length;
    if (pendientes === 0) continue;
    const email = suyos[0].email;
    senales.push({
      id: `revision_${email}_checkins_huerfano`,
      athleteEmail: email, athleteName: email, urgencia: 'hoy', categoria: 'revision',
      texto: `${pendientes} ${pendientes === 1 ? 'revisión pendiente' : 'revisiones pendientes'} · no está en tu lista de atletas`,
      destino: '/reviews',
    });
  }

  // Los cobros van aparte: no cuelgan de un atleta de la app (el CRM tiene
  // contactos que ni siquiera tienen cuenta), así que se añaden con su propio
  // destino y entran en el mismo orden que todo lo demás.
  for (const p of pagos) {
    senales.push({
      id: `pago_${p.destino}`,
      athleteEmail: '', athleteName: p.nombre,
      urgencia: 'hoy', categoria: 'pago', texto: p.texto, destino: p.destino,
    });
  }

  return senales.sort((a, b) =>
    PESO_URGENCIA[a.urgencia] - PESO_URGENCIA[b.urgencia]
    || a.athleteName.localeCompare(b.athleteName)
    || a.id.localeCompare(b.id));
}

/** Cuántas señales hay de cada urgencia, para los contadores de la cabecera. */
export function contarPorUrgencia(senales: SenalDelDia[]): Record<UrgenciaSenal, number> {
  const out: Record<UrgenciaSenal, number> = { bloqueado: 0, hoy: 0, pronto: 0 };
  for (const s of senales) out[s.urgencia] += 1;
  return out;
}
