import { Contacto, Mesocycle, QuestionnaireResponse, UserProfile, WeightCheckIn, WorkoutAssignment } from '../types';
import { addDays, diasEntreFechas, isoLocal } from './trainingWeek';
import { DIAS_AVISO_RENOVACION } from './calidadDelPlan';
import type { MotivoContacto } from './plantillasWhatsApp';

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
  /**
   * Si la señal se resuelve escribiéndole por WhatsApp (28-10): el motivo
   * elige la plantilla y los datos la rellenan. La pantalla pinta el botón
   * «Escribirle» y, al pulsar «Ya le he escrito», registra el contacto.
   */
  contacto?: { motivo: MotivoContacto; dias?: number; perdidas?: number; fechaRevision?: string };
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
  /**
   * Respuestas de cuestionario de la ventana de la bandeja de Revisiones
   * (la misma consulta: `useRespuestasDeLaBandeja`). Para «revisión sin
   * respuesta». Opcional: sin ella, esa señal no se calcula.
   */
  respuestas?: QuestionnaireResponse[];
  /** Contactos recientes del coach (db/contactos.ts): callan una señal unos días. */
  contactos?: Contacto[];
  hoy: string;
}

/** Días sin abrir la app a partir de los cuales conviene escribirle. */
export const DIAS_SIN_ENTRAR = 7;
/** Días sin registrar nada a partir de los cuales «se está apagando» (Dani, 28-10). */
export const DIAS_SIN_REGISTRAR = 3;
/** Sesiones perdidas en 14 días que ya son una señal. */
export const PERDIDAS_QUE_AVISAN = 3;
/** Días sin contestar ningún cuestionario (dos ciclos semanales). */
export const DIAS_SIN_REVISION = 14;
/** Horas desde que envió la revisión sin que el coach contestara. */
export const HORAS_SIN_RESPUESTA = 24;
/** Días que un contacto registrado calla la señal que lo motivó. */
export const DIAS_QUE_CALLA_UN_CONTACTO = 3;
/** Días con la cuenta creada y sin plan a partir de los cuales el alta está parada. */
export const DIAS_ALTA_PARADA = 3;
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

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function construirBandejaDelDia(entrada: EntradaBandeja): SenalDelDia[] {
  const { atletas, checkins, asignacionesPorEmail, mesociclos, hoy } = entrada;
  const pagos = entrada.pagosVencidos ?? [];
  const propuestas = entrada.propuestasPorEmail ?? new Map<string, number>();
  const respuestas = entrada.respuestas ?? [];
  const contactos = entrada.contactos ?? [];
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
    // Pendiente = sin aprobar. Aprobar es lo que cierra la revisión; el texto
    // es opcional. Antes también contaba «aprobado sin texto», que quedaba
    // pendiente para siempre (B5, 26-10-2026).
    const pendientes = suyos.filter(c => !c.approved).length;
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
    // Un contacto reciente del coach por ese motivo calla la señal: ya le ha
    // escrito, no hace falta que la bandeja se lo repita cada mañana.
    const contactado = (motivo: MotivoContacto) => contactos.some(c =>
      c.athleteId === email.toLowerCase() && c.motivo === motivo
      && diasEntreFechas(c.fecha, hoy) < DIAS_QUE_CALLA_UN_CONTACTO);
    const añadirContacto = (
      id: string, urgencia: UrgenciaSenal, categoria: CategoriaSenal, texto: string, tab: string,
      contacto: NonNullable<SenalDelDia['contacto']>,
    ) => {
      if (contactado(contacto.motivo)) return;
      añadir(id, urgencia, categoria, texto, tab);
      senales[senales.length - 1].contacto = contacto;
    };

    const enMarcha = !!a.planPublishedAt;
    const s = a.senales;

    // «Se está apagando» (Dani, 28-10): 3 días sin registrar nada, 3 sesiones
    // perdidas en 14 días o dos ciclos sin contestar la revisión. Lo calcula
    // el latido (utils/senalesDelAtleta.ts); aquí solo se compara con hoy. Se
    // pinta como «para hoy»: la antigua «sin abrir la app» era `pronto` y la
    // pantalla no enseña ese nivel, así que nunca la vio nadie.
    if (enMarcha && s) {
      const sinRegistrar = s.ultimoRegistro ? diasEntreFechas(s.ultimoRegistro, hoy) : null;
      if (sinRegistrar !== null && sinRegistrar >= DIAS_SIN_REGISTRAR) {
        añadirContacto('apagandose', 'hoy', 'ausencia',
          `${sinRegistrar} días sin registrar nada`, 'revision',
          { motivo: 'sin_registrar', dias: sinRegistrar });
      } else if (s.perdidas14d >= PERDIDAS_QUE_AVISAN) {
        añadirContacto('perdidas', 'hoy', 'ausencia',
          `${s.perdidas14d} sesiones perdidas en 14 días`, 'entrenamientos',
          { motivo: 'perdidas', perdidas: s.perdidas14d });
      } else if (s.tieneCuestionarios && s.ultimaRespuesta && diasEntreFechas(s.ultimaRespuesta, hoy) >= DIAS_SIN_REVISION) {
        añadirContacto('sin_revision', 'hoy', 'ausencia',
          `${diasEntreFechas(s.ultimaRespuesta, hoy)} días sin contestar la revisión`, 'revisiones',
          { motivo: 'sin_revision', dias: diasEntreFechas(s.ultimaRespuesta, hoy) });
      }
    } else if (enMarcha) {
      // Sin señales del latido todavía (perfil anterior al 28-10 o latido sin
      // pasar): lo único que hay es el último login.
      const ultimoLogin = a.lastLoginAt ? aIso(a.lastLoginAt) : null;
      if (ultimoLogin) {
        const dias = diasEntreFechas(ultimoLogin, hoy);
        if (dias >= DIAS_SIN_ENTRAR) {
          añadirContacto('sin_entrar', 'hoy', 'ausencia', `Lleva ${dias} días sin abrir la app`, 'revision',
            { motivo: 'sin_registrar', dias });
        }
      }
    }

    // ── La revisión que envió y nadie ha contestado ──────────────────────
    // Una por atleta (la más antigua), a partir de 24 h. Cuenta como
    // contestada si lleva `respuestaCoach`; «vista» (reviewedAt) no basta:
    // el atleta no ve que la hayas visto.
    const sinResponder = respuestas
      .filter(r => r.athleteId.toLowerCase() === email.toLowerCase() && !r.respuestaCoach)
      .map(r => r.submittedAt.slice(0, 10))
      .sort();
    if (sinResponder.length > 0 && !contactado('sin_respuesta')) {
      const primera = sinResponder[0];
      const horas = Math.round((Date.parse(`${hoy}T12:00:00`) - Date.parse(`${primera}T12:00:00`)) / 36e5);
      if (horas >= HORAS_SIN_RESPUESTA) {
        const dias = Math.round(horas / 24);
        const nDias = new Set(sinResponder).size;
        añadirContacto('sin_respuesta', 'hoy', 'revision',
          `Revisión del ${fechaCorta(primera)} sin contestar · ${dias} ${dias === 1 ? 'día' : 'días'}${nDias > 1 ? ` · y ${nDias - 1} más` : ''}`,
          'revision', { motivo: 'sin_respuesta', fechaRevision: primera, dias });
      }
    }

    // ── El alta que se quedó parada ──────────────────────────────────────
    // Cuenta creada, plan sin publicar y días pasando. La señal «sin
    // entrenamientos asignados» ya sale arriba como bloqueado; esto añade el
    // tiempo y el botón de escribirle, que es lo que falta para decidir si se
    // le ayuda o se archiva.
    const creado = a.createdAt ? aIso(a.createdAt) : null;
    if (!enMarcha && creado) {
      const dias = diasEntreFechas(creado, hoy);
      if (dias >= DIAS_ALTA_PARADA) {
        añadirContacto('alta_parada', 'hoy', 'setup', `Alta sin terminar desde hace ${dias} días`, 'setup',
          { motivo: 'alta_parada', dias });
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
    const suyosMeso = mesociclos.filter(m => m.athleteId === email && !!m.startDate);
    const finDe = (m: Mesocycle) => addDays(m.startDate, m.weeks * 7 - 1);
    const enCurso = suyosMeso.find(m => hoy >= m.startDate && hoy <= finDe(m));
    if (enCurso) {
      const quedan = diasEntreFechas(hoy, finDe(enCurso));
      if (quedan <= DIAS_AVISO_RENOVACION) {
        añadir('renovar', 'pronto', 'renovacion',
          quedan <= 0 ? 'El bloque termina hoy' : `El bloque termina en ${quedan} ${quedan === 1 ? 'día' : 'días'}`,
          'setup');
      }
    } else if (enMarcha && suyosMeso.length > 0) {
      // ── El bloque terminado sin siguiente ──────────────────────────────
      // Es el caso de la única baja medida (28-10): bloque acabado el 18-10,
      // nada detrás, baja el 23-10. Le tiene parado de verdad: no hay sesiones
      // nuevas que hacer.
      const ultimoFin = suyosMeso.map(finDe).sort().at(-1)!;
      const haySiguiente = suyosMeso.some(m => m.startDate > hoy);
      if (ultimoFin < hoy && !haySiguiente) {
        añadirContacto('bloque_sin_siguiente', 'bloqueado', 'plan',
          `Bloque terminado el ${fechaCorta(ultimoFin)} · sin bloque siguiente`, 'entrenamientos',
          { motivo: 'bloque_terminado', dias: diasEntreFechas(ultimoFin, hoy) });
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
    const pendientes = suyos.filter(c => !c.approved).length;
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
