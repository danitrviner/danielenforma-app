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
  leerRegistrosDeComida, leerRoadmap, leerSesionesDeCardio,
  marcarSesionPerdida, guardarConfigDeDieta, marcarFaseVista, guardarNivelesConseguidos, leerCheckIns,
  actualizarPeldanos, guardarReto, leerReto, crearAvisoUnaVez, guardarSenales, crearMensajeBorrador,
  leerCuestionariosAsignados, leerRespuestasDeCuestionarios, leerMesociclos,
  leerRutinas, leerRetos, leerExperiencia, guardarHuellaDelLatido, leerOnboarding, leerCuestionariosDelCoach, crearEpisodioUnaVez,
  leerMenusDelAtleta, publicarMenu,
} from './_lib/db-admin.js';
import { uidDelCoach, leerPoliticaAutopiloto } from './_lib/fuenteAdmin.js';
import { politicaDeEpisodio, POLITICA_POR_DEFECTO } from '../src/autopiloto/politica.js';
import { menusQuePublicar, planDePublicacion } from '../src/autopiloto/menuSemanal.js';
import { detectarEpisodios } from '../src/autopiloto/detectores.js';
import { detectarEmergentes } from '../src/autopiloto/emergentes.js';
import { puedeAnalizarseConIA } from '../src/ai/consentimientoIA.js';
import { recordatoriosDeRevision } from '../src/utils/recordatoriosRevision.js';
import { calcularSenales, senalesIguales } from '../src/utils/senalesDelAtleta.js';
import { planificarLatido, huellaDelLatido, ID_HUELLA_LATIDO } from '../src/utils/latidoDiario.js';
import { ejecutarRetoSemanal, type AlmacenDeRetos } from '../src/utils/motorRetoSemanal.js';
import { DEFAULT_LEVEL_LADDER } from '../src/data/defaultLevelLadder.js';
import { addDays, diasEntreFechas, getWeekStart } from '../src/utils/trainingWeek.js';

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

  // El catálogo de ejercicios es el MISMO para todos: se lee una vez, fuera del
  // bucle. Leerlo por atleta multiplicaba la colección entera por el número de
  // clientes en cada pasada, que con veinte atletas son veinte veces el
  // catálogo todas las noches para nada.
  let exercises;
  try {
    exercises = await leerEjercicios(db);
  } catch (err) {
    console.error('latido-diario: no se pudo leer el catálogo de ejercicios', err);
    res.status(500).json({ error: 'No se pudo leer el catálogo de ejercicios' });
    return;
  }

  // Las plantillas de cuestionario son las mismas para todos: una lectura.
  // Sin ellas los episodios se encolan igual, solo sin las alertas del motor.
  let plantillas: Awaited<ReturnType<typeof leerCuestionariosDelCoach>> = [];
  try { plantillas = await leerCuestionariosDelCoach(db, await uidDelCoach(db)); } catch (err) { console.warn('latido-diario: sin plantillas de cuestionario', err); }
  // La política del autopiloto (coachSettings/autopiloto): con qué política se
  // encolan los episodios y qué se hace con los menús. Sin documento, sombra.
  let politica = POLITICA_POR_DEFECTO;
  try { politica = await leerPoliticaAutopiloto(db); } catch (err) { console.warn('latido-diario: sin política del autopiloto, se usa sombra', err); }

  const resumen: ResumenDeAtleta[] = [];

  for (const perfil of atletas) {
    const email = perfil.email;
    try {
      /* Se leía `leerRetos` (la colección entera de retos del atleta, sin
         ventana) y no se usaba para nada: el motor lee las dos semanas que
         necesita por id. Fuera. Los pesajes llevan la misma ventana que el
         resto de colecciones diarias: quien necesita el peso INICIAL lo tiene
         en el perfil (`initialWeight`), no en el primer documento. */
      const [
        assignments, workoutLogs, bodyweightLogs, stepLogs,
        nutritionProgram, dietConfig, dietas, registrosDeComida, roadmap,
        cardio,
      ] = await Promise.all([
        leerAsignaciones(db, email, perfil.userId),
        leerLogsDeEntreno(db, email),
        leerPesajes(db, email, desde),
        leerPasos(db, email, desde),
        leerProgramaDeNutricion(db, email),
        leerConfigDeDieta(db, email),
        leerDietas(db, email),
        leerRegistrosDeComida(db, email, desde),
        leerRoadmap(db, email),
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

      // La huella de lo que se va a hacer, con el snapshot de ANTES, se escribe
      // primero: si una escritura falla a mitad, lo que ya cambió sigue
      // teniendo su «antes» guardado para deshacerlo desde la bandeja.
      const huella = huellaDelLatido(
        { profile: perfil, assignments, workoutLogs, bodyweightLogs, stepLogs, exercises, nutritionProgram, dietConfig, roadmap },
        acciones, lineas, hoy, new Date().toISOString(),
      );
      if (!enSeco && huella) await guardarHuellaDelLatido(db, ID_HUELLA_LATIDO(email, hoy), huella);

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
            case 'mensaje_borrador':
              await crearMensajeBorrador(db, accion.mensaje);
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
          // El cardio se descargaba y NO se le pasaba al motor, así que el
          // reto de Zona 2 veía `undefined` y no podía ni evaluarse.
          cardioSessions: cardio,
          projection: null,
        },
        hoy,
        almacen,
        // En el servidor SÍ se espera al cierre de la semana anterior: si no,
        // la función puede terminar antes que la escritura.
        {
          coachEmail: COACH_EMAIL,
          esperarAlCierreAnterior: true,
          // Solo si toca generar: el plan de esta semana (rutinas y bloque),
          // el historial para la rotación y el nivel del alta. Sin esto, el
          // reto que se generaba aquí era el de un atleta sin plan ni memoria.
          datosParaGenerar: async () => {
            const lunes = getWeekStart(hoy);
            const domingo = addDays(lunes, 6);
            const ids = [...new Set(assignments.filter(a => a.date >= lunes && a.date <= domingo).map(a => a.workoutId))];
            const [workouts, mesocycles, history, experienceLevel] = await Promise.all([
              leerRutinas(db, ids), leerMesociclos(db, email), leerRetos(db, email), leerExperiencia(db, email),
            ]);
            // Días sin registrar (señales de la noche anterior): tras una
            // semana de silencio el reto sale en suave (29-10).
            const silencioDias = perfil.senales?.ultimoRegistro ? diasEntreFechas(perfil.senales.ultimoRegistro, hoy) : null;
            return { workouts, mesocycles, history, experienceLevel, nivelForzado: roadmap?.challengeConfig?.nivel, silencioDias };
          },
        },
      );
      if (reto.pending) hecho.push('reto: pendiente del coach (lunes)');
      else if (reto.challenge) hecho.push(`reto: ${reto.challenge.status}`);

      if (cardio.length > 0) hecho.push(`${cardio.length} sesiones de cardio en ${DIAS_DE_HISTORIAL} días`);

      // ── 3. Recordatorios de la revisión (27-10) ──────────────────────────
      // El día que se abre y la víspera de caducar, solo si le falta algo. Va
      // en su propio try: un fallo aquí no debe borrar lo ya hecho arriba.
      try {
        const [cuestionarios, respuestas, mesociclos] = await Promise.all([
          leerCuestionariosAsignados(db, email),
          leerRespuestasDeCuestionarios(db, email, addDays(hoy, -21)),
          leerMesociclos(db, email),
        ]);
        const avisos = recordatoriosDeRevision({ hoy, perfil, asignaciones: cuestionarios, respuestas, mesociclos });
        if (!enSeco) for (const r of avisos) await crearAvisoUnaVez(db, r.dedupeKey, r.notificacion);
        if (avisos.length > 0) hecho.push(`recordatorio de revisión: ${avisos.length}`);

        // ── 4. El autopiloto: detectar y ENCOLAR (28-10) ──────────────────
        // El latido no llama al modelo. Deja episodios en `episodios/*` y los
        // consume api/autopiloto.ts. Solo atletas con consentimiento aceptado;
        // en modo sombra hasta que Dani suba la política (tanda 4).
        const onboarding = await leerOnboarding(db, email);
        const episodios = detectarEpisodios({
          email, hoy, ahora: new Date().toISOString(),
          consentimiento: puedeAnalizarseConIA(onboarding),
          politica: politicaDeEpisodio(politica),
          respuestas, plantillas, asignaciones: cuestionarios, mesociclos,
          onboardingCompletado: !!onboarding?.completedAt, planStartDate: perfil.planStartDate, planDurationMonths: perfil.planDurationMonths,
        });
        // Emergentes (tanda 6): dolor, perdidas, peso sin registrar, desvíos,
        // nota libre, bienestar. Misma foto que ya está leída + los check-ins.
        const checkins = await leerCheckIns(db, perfil.userId, addDays(hoy, -3));
        episodios.push(...detectarEmergentes({
          email, hoy, ahora: new Date().toISOString(), consentimiento: puedeAnalizarseConIA(onboarding), politica: politicaDeEpisodio(politica),
          asignaciones: assignments, logs: workoutLogs, pesajes: bodyweightLogs, registros: registrosDeComida, dietas, programa: nutritionProgram,
          respuestas, plantillas, checkins, alta: onboarding,
        }));
        let encolados = 0;
        if (!enSeco) for (const ep of episodios) { if (await crearEpisodioUnaVez(db, ep)) encolados++; }
        if (episodios.length > 0) hecho.push(`episodios: ${enSeco ? episodios.length : encolados} encolados`);

        // ── 5. El menú de la semana: borrador 24 h y luego solo (28-10) ────
        // El borrador lo genera la app del coach al abrir Inicio; aquí se
        // publica cuando lleva un día sin que Dani lo toque, según la política.
        const menus = await leerMenusDelAtleta(db, email);
        const ahoraIso = new Date().toISOString();
        for (const menu of menusQuePublicar(menus, politica, ahoraIso)) {
          if (!enSeco) {
            const plan = planDePublicacion(menu, menus, ahoraIso);
            await guardarHuellaDelLatido(db, `latido_menu_${email}_${hoy}`, {
              athleteId: email, kind: 'latido', status: 'aplicada', chatId: 'latido',
              summary: `Menú de la semana ${menu.semanaPrograma ?? '?'} publicado (${politica.menuAutomatico === 'publicar' ? 'publicación directa' : '24 h sin cambios'})`,
              rationale: 'El borrador lo generó la app con la dieta de la semana; la política del autopiloto lo publica si Dani no lo toca.',
              payload: { fecha: hoy, acciones: [{ tipo: 'publicar_menu', texto: `Menú ${menu.id} publicado` }] },
              cambios: [`Menú «${menu.name}»: borrador → publicado`],
              autor: 'latido', politica: 'automatico',
              snapshotAntes: [
                { coleccion: 'weeklyMenus', id: menu.id, datos: { status: 'draft', publishedAt: null }, parcial: true },
                ...plan.archivar.map(id => ({ coleccion: 'weeklyMenus', id, datos: { status: 'published' }, parcial: true })),
              ],
              createdAt: ahoraIso, aplicadaEn: ahoraIso,
            });
            await publicarMenu(db, plan);
          }
          hecho.push(`menú semana ${menu.semanaPrograma ?? '?'} publicado`);
        }

        // ── 6. Señales de acompañamiento (28-10) ───────────────────────────
        // Lo que la bandeja del coach necesita para ver quién se está
        // apagando, calculado aquí con lo que ya se ha leído y guardado en el
        // perfil solo si cambia. `respuestas` lleva 21 días: de sobra para la
        // ventana de 14 y para la última respuesta reciente; una más antigua
        // ya cuenta como «sin contestar» igual.
        const senales = calcularSenales(
          { assignments, workoutLogs, bodyweightLogs, stepLogs, dietLogs: registrosDeComida, respuestas, cuestionarios },
          hoy,
        );
        if (!senalesIguales(perfil.senales, senales)) {
          if (!enSeco) await guardarSenales(db, perfil.userId, senales);
          hecho.push(`señales: último registro ${senales.ultimoRegistro ?? 'nunca'}, ${senales.perdidas14d} perdidas en 14 días`);
        }
      } catch (err) {
        hecho.push(`recordatorio de revisión: error (${(err as Error)?.message ?? err})`);
      }

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
