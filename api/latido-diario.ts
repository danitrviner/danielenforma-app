// El latido diario: una pasada por todos los atletas, una vez al día.
//
// ── Qué problema resuelve ───────────────────────────────────────────────────
// Toda la lógica que mantiene la app viva —marcar como perdidas las sesiones
// que un atleta se dejó, crear y cerrar el reto de la semana, aplicar el cambio
// de fase de la dieta, anunciar un nivel nuevo— se ejecutaba cuando el atleta
// ABRÍA una pantalla («generate-on-read»). Dos agujeros que no se tapan desde
// el cliente:
//
//   · El atleta que no abre la app no existe. Sus sesiones siguen
//     «pendientes», su fase de nutrición no cambia y ni él ni el coach reciben
//     ningún aviso. Precisamente del que hay que enterarse es del invisible.
//   · El trabajo lo paga su móvil, en el primer render, todos los días.
//
// ── Qué NO hace ─────────────────────────────────────────────────────────────
// No tiene ni una regla de negocio dentro. Las decisiones están en
// `src/utils/latidoDiario.ts` y en `src/utils/motorRetoSemanal.ts`, que no
// saben nada de Firestore y se prueban con objetos en memoria; aquí solo se
// leen datos, se ejecutan las acciones que esos motores devuelven y se deja un
// resumen. Si alguna vez hay que cambiar cuántos días aguanta una sesión antes
// de darse por perdida, se cambia allí y lo ven a la vez el servidor y el
// cliente.
//
// Todo es idempotente: pasarlo dos veces el mismo día no duplica nada. Por eso
// puede convivir con el generate-on-read del cliente mientras se despliega, en
// vez de tener que apagar uno para encender el otro.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { COACH_EMAIL, getAdminDb } from './_lib/auth.js';
import {
  leerAtletasActivos, leerAsignaciones, leerLogsDeEntreno, leerPesajes, leerPasos,
  leerEjercicios, leerProgramaDeNutricion, leerConfigDeDieta, leerDietas,
  leerRegistrosDeComida, leerRoadmap, leerRetos, leerSesionesDeCardio,
  marcarSesionPerdida, guardarConfigDeDieta, marcarFaseVista, guardarNivelesConseguidos,
  actualizarPeldanos, guardarReto, leerReto, crearAvisoUnaVez,
} from './_lib/db-admin.js';
import { planificarLatido } from '../src/utils/latidoDiario.js';
import { ejecutarRetoSemanal, type AlmacenDeRetos } from '../src/utils/motorRetoSemanal.js';
import { DEFAULT_LEVEL_LADDER } from '../src/data/defaultLevelLadder.js';
import { addDays } from '../src/utils/trainingWeek.js';

export const config = { maxDuration: 300 };

/** Zona horaria del coach: el latido es «su» día, no el de UTC. */
const ZONA_DEL_COACH = 'Europe/Madrid';

/** Cuánto historial hace falta de las colecciones de un documento por día. */
const DIAS_DE_HISTORIAL = 120;

function hoyEnZona(zona: string): string {
  // `en-CA` da directamente YYYY-MM-DD, que es el formato de todas las fechas
  // del proyecto.
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date());
}

/** Comparación en tiempo constante: un `===` filtra el secreto por el reloj. */
function secretoValido(recibido: string | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface ResumenDeAtleta {
  email: string;
  hecho: string[];
  error?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Sin CORS a propósito: esto no lo llama ningún navegador.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    // Sin secreto configurado NO se ejecuta. Un endpoint que escribe en todos
    // los atletas y que cualquiera puede disparar no es un endpoint, es un
    // agujero.
    res.status(503).json({ error: 'CRON_SECRET no configurado' });
    return;
  }
  // Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`.
  const cabecera = req.headers.authorization ?? '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
  if (!secretoValido(recibido, secreto)) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const db = await getAdminDb();
  if (!db) {
    res.status(503).json({ error: 'Sin cuenta de servicio configurada' });
    return;
  }

  const hoy = hoyEnZona(ZONA_DEL_COACH);
  const desde = addDays(hoy, -DIAS_DE_HISTORIAL);
  const comenzoEn = Date.now();

  // `?seco=1` planifica y cuenta sin escribir nada. Es como se prueba esto
  // contra producción sin tocar a nadie.
  const enSeco = String(req.query.seco ?? '') === '1';

  let atletas;
  try {
    atletas = await leerAtletasActivos(db);
  } catch (err) {
    console.error('latido-diario: no se pudieron leer los atletas', err);
    res.status(500).json({ error: 'No se pudieron leer los atletas' });
    return;
  }

  const resumen: ResumenDeAtleta[] = [];

  for (const perfil of atletas) {
    const email = perfil.email;
    try {
      const [
        assignments, workoutLogs, bodyweightLogs, stepLogs, exercises,
        nutritionProgram, dietConfig, dietas, registrosDeComida, roadmap,
        retos, cardio,
      ] = await Promise.all([
        leerAsignaciones(db, email, perfil.userId),
        leerLogsDeEntreno(db, email),
        leerPesajes(db, email),
        leerPasos(db, email, desde),
        leerEjercicios(db),
        leerProgramaDeNutricion(db, email),
        leerConfigDeDieta(db, email),
        leerDietas(db, email),
        leerRegistrosDeComida(db, email, desde),
        leerRoadmap(db, email),
        leerRetos(db, email),
        leerSesionesDeCardio(db, email, desde),
      ]);

      const hecho: string[] = [];

      // ── 1. Lo que decide el orquestador ──────────────────────────────────
      const { acciones, resumen: lineas } = planificarLatido(
        {
          profile: perfil, assignments, workoutLogs, bodyweightLogs, stepLogs,
          exercises, nutritionProgram, dietConfig, roadmap,
        },
        { hoy, coachEmail: COACH_EMAIL },
      );

      if (!enSeco) {
        for (const accion of acciones) {
          switch (accion.tipo) {
            case 'marcar_sesion_perdida':
              await marcarSesionPerdida(db, accion.assignmentId);
              break;
            case 'activar_dieta':
              await guardarConfigDeDieta(db, accion.athleteEmail, accion.activeDietIds);
              break;
            case 'marcar_fase_vista':
              await marcarFaseVista(db, accion.athleteEmail, accion.phaseId);
              break;
            case 'guardar_niveles':
              await guardarNivelesConseguidos(db, accion.athleteEmail, {
                ...(roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER),
                achievedLevelIds: accion.achievedLevelIds,
              });
              break;
            case 'actualizar_peldanos':
              await actualizarPeldanos(db, accion.userId, accion.peldanos);
              break;
            case 'aviso':
              await crearAvisoUnaVez(db, accion.dedupeKey, accion.notificacion);
              break;
          }
        }
      }
      hecho.push(...lineas);

      // ── 2. El reto de la semana ──────────────────────────────────────────
      // Va aparte porque necesita leer y escribir a mitad de su propia
      // decisión: no se puede resolver con una lista de acciones planas.
      const almacen: AlmacenDeRetos = {
        getWeeklyChallenge: (e, semana) => leerReto(db, e, semana),
        saveWeeklyChallenge: ch => (enSeco ? Promise.resolve() : guardarReto(db, ch)),
        createNotificationDeduped: (clave, data) =>
          enSeco ? Promise.resolve() : crearAvisoUnaVez(db, clave, data),
      };
      const reto = await ejecutarRetoSemanal(
        email,
        {
          stepLogs, bodyweightLogs, workoutLogs, exercises,
          completionLogs: registrosDeComida,
          coachDiets: dietas.filter(d => !d.selfManaged),
          assignments,
          projection: null,
        },
        hoy,
        almacen,
        // En el servidor SÍ se espera al cierre de la semana anterior: si no,
        // la función puede terminar antes que la escritura.
        { coachEmail: COACH_EMAIL, esperarAlCierreAnterior: true },
      );
      if (reto.pending) hecho.push('reto: pendiente del coach (lunes)');
      else if (reto.challenge) hecho.push(`reto: ${reto.challenge.status}`);

      // Las sesiones de cardio no generan acciones todavía; se leen para que
      // el resumen diga si el atleta sigue moviéndose fuera de la sala.
      if (cardio.length > 0) hecho.push(`${cardio.length} sesiones de cardio en ${DIAS_DE_HISTORIAL} días`);

      resumen.push({ email, hecho });
    } catch (err) {
      // Un atleta que falla no puede tumbar la pasada de los demás: se anota y
      // se sigue. Sin esto, el primer documento corrupto deja a todos los
      // siguientes sin latido y nadie se entera.
      const mensaje = (err as Error)?.message ?? String(err);
      console.error(`latido-diario: falló el atleta ${email}:`, mensaje);
      resumen.push({ email, hecho: [], error: mensaje });
    }
  }

  const duracionMs = Date.now() - comenzoEn;
  const conError = resumen.filter(r => r.error).length;

  const encabezado = {
    fecha: hoy,
    ejecutadoEn: new Date().toISOString(),
    zona: ZONA_DEL_COACH,
    enSeco,
    atletas: resumen.length,
    conError,
    duracionMs,
  };

  /*
   * Lo que se GUARDA no lleva ni un correo.
   *
   * La primera versión guardaba el detalle por atleta, y eso convierte una
   * bitácora de operación en un fichero con datos personales: un atleta que
   * pide el borrado de su cuenta seguiría nombrado en 365 documentos al año,
   * y limpiarlos obligaría a recorrer la colección entera en cada baja —
   * justo lo que no se hace en este proyecto. El test de inventario del
   * borrado (src/db/borradoCuenta.test.ts) lo cazó antes de desplegarlo.
   *
   * Así que el documento persistido es solo el recuento: cuántos atletas,
   * cuántas acciones de cada tipo, cuántos fallaron. El detalle con nombres va
   * en la RESPUESTA —que solo ve quien tiene el secreto— y en los logs de la
   * función, que caducan solos.
   */
  const porAccion: Record<string, number> = {};
  for (const r of resumen) for (const linea of r.hecho) {
    const clave = linea.split(':')[0].replace(/\d+/g, 'N').trim();
    porAccion[clave] = (porAccion[clave] ?? 0) + 1;
  }
  const registro = { ...encabezado, porAccion };

  if (!enSeco) {
    try {
      await db.collection('latidos').doc(hoy).set(registro);
    } catch (err) {
      // Que no se pueda dejar el registro no invalida el trabajo ya hecho.
      console.warn('latido-diario: no se pudo guardar el resumen', err);
    }
  }

  res.status(200).json({ ...registro, detalle: resumen });
}
