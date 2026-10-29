// El ejecutor del SERVIDOR para `aplicarPropuesta`: las mismas operaciones de
// dominio que `ejecutarEnCliente`, escritas con el SDK de administración. Lo
// usa el bucle del autopiloto cuando la política de una decisión es
// `automatico` o `aviso`; en sombra y en rodaje no se llama nunca.
//
// Lo que el cliente hace de más y aquí se replica a mano: el sello de versión
// de los catálogos (`catalogos/{nombre}`) para que los dispositivos relean
// `workouts` y `mesocycleTemplates`, y los grupos normalizados del mesociclo.
// El historial de cambios del coach (`cambiosAtleta`) lo escribe aquí el
// servidor con `autor: 'asistente'`: es lo que hace que «Lo que he cambiado»
// cuente también lo automático.
import type { SnapshotDocumento } from '../../src/types.js';
import { COLECCION_DE_OPERACION, fotoDeCreacion, resolverReferencias, type LectorAplicacion, type Operacion } from '../../src/autopiloto/aplicarPropuesta.js';
import { normalizeMuscleGroups } from '../../src/utils/normalizeMuscleGroups.js';
import { normalizarFicha } from '../../src/utils/fichaViva.js';
import { COACH_EMAIL, getAdminDb } from './auth.js';
import type { FuenteDeDatos } from '../../src/ai/tools/datos.js';

type Firestore = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

export interface ResultadoEjecucionServidor {
  refs: Record<string, string>;
  creados: SnapshotDocumento[];
  hechas: number;
}

function sinIndefinidos<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(sinIndefinidos) as unknown as T;
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (v !== undefined) salida[k] = sinIndefinidos(v);
    return salida as T;
  }
  return obj;
}

const CON_SELLO = new Set(['workouts', 'exercises', 'mesocycleTemplates']);

export class ErrorDeEjecucionServidor extends Error {
  constructor(readonly hechas: number, readonly total: number, readonly operacion: Operacion, readonly causa: unknown) {
    super(`Falló la operación ${hechas + 1} de ${total} (${operacion.tipo}); se escribieron ${hechas}.`);
    this.name = 'ErrorDeEjecucionServidor';
  }
}

export async function ejecutarEnServidor(db: Firestore, operaciones: Operacion[]): Promise<ResultadoEjecucionServidor> {
  const refs: Record<string, string> = {};
  const creados: SnapshotDocumento[] = [];
  const sellos = new Set<string>();
  const col = (n: string) => db.collection(n);
  const crear = async (op: Operacion, coleccion: string, datos: object, ref?: string, id?: string): Promise<string> => {
    const docRef = id ? col(coleccion).doc(id) : col(coleccion).doc();
    await docRef.set(sinIndefinidos(datos));
    if (ref) refs[ref] = docRef.id;
    creados.push(fotoDeCreacion(op, docRef.id));
    if (CON_SELLO.has(coleccion)) sellos.add(coleccion);
    return docRef.id;
  };
  const actualizar = async (coleccion: string, id: string, cambios: object) => {
    await col(coleccion).doc(id).set(sinIndefinidos(cambios), { merge: true });
    if (CON_SELLO.has(coleccion)) sellos.add(coleccion);
  };
  const guardarDoc = async (coleccion: string, id: string, datos: object) => {
    await col(coleccion).doc(id).set(sinIndefinidos(datos));
    if (CON_SELLO.has(coleccion)) sellos.add(coleccion);
  };

  let hechas = 0;
  for (const bruta of operaciones) {
    const op = resolverReferencias(bruta, refs);
    try {
      switch (op.tipo) {
        case 'crearDieta': await crear(op, 'diets', op.dieta, op.ref); break;
        case 'actualizarDieta': await actualizar('diets', op.id, op.cambios); break;
        case 'crearMesociclo': await crear(op, 'mesocycles', { ...op.mesociclo, groups: normalizeMuscleGroups(op.mesociclo.groups) }, op.ref); break;
        case 'actualizarMesociclo': await actualizar('mesocycles', op.id, op.cambios); break;
        case 'crearRutina': await crear(op, 'workouts', op.rutina, op.ref); break;
        case 'actualizarRutina': await actualizar('workouts', op.id, op.cambios); break;
        case 'crearAsignacion': await crear(op, 'workoutAssignments', op.asignacion); break;
        case 'actualizarAsignacion': await actualizar('workoutAssignments', op.id, op.cambios); break;
        case 'guardarRoadmap': { const { athleteId, ...resto } = op.roadmap; await guardarDoc('roadmaps', athleteId, resto); break; }
        case 'guardarPrograma': { const { athleteId, ...resto } = op.programa; await guardarDoc('nutritionPrograms', athleteId, resto); break; }
        case 'crearTarea': await crear(op, 'tasks', op.tarea); break;
        case 'guardarJuicioFicha': {
          const s = await col('athleteStatus').doc(op.athleteId).get();
          const actual = normalizarFicha(s.exists ? (s.data() as Record<string, unknown>) : undefined);
          await col('athleteStatus').doc(op.athleteId).set(sinIndefinidos({ ...actual, ...op.patch, updatedAt: new Date().toISOString() }), { merge: true });
          break;
        }
        case 'actualizarPerfil': await actualizar('user_profiles', op.userId, op.cambios); break;
        case 'guardarConfigNutricion': { const { athleteId, ...resto } = op.config; await guardarDoc('athleteNutritionConfigs', athleteId, { athleteId, ...resto }); break; }
        case 'guardarConfigDieta': { const { athleteId, ...resto } = op.config; await guardarDoc('athleteDietConfigs', athleteId, { athleteId, ...resto }); break; }
        case 'asignarCuestionario': await crear(op, 'questionnaireAssignments', op.asignacion); break;
        case 'asignarFotos': await crear(op, 'photoAssignments', op.asignacion); break;
        case 'crearCardio': await crear(op, 'cardioAssignments', op.asignacion); break;
        case 'guardarReto': await crear(op, 'weeklyChallenges', op.reto, undefined, op.reto.id); break;
        case 'crearPlantillaMesociclo': await crear(op, 'mesocycleTemplates', op.plantilla, op.ref); break;
        case 'feedbackCheckin': await actualizar('checkins', op.checkInId, { coachFeedback: op.feedback, approved: true, approvedAt: new Date() }); break;
        case 'responderRevision': await actualizar('questionnaireResponses', op.responseId, { respuestaCoach: op.respuesta, reviewedAt: op.respuesta.enviadaEn }); break;
        case 'enviarMensaje': await crear(op, 'mensajesCoach', op.mensaje, undefined, op.mensaje.id); break;
      }
      hechas++;
    } catch (err) {
      throw new ErrorDeEjecucionServidor(hechas, operaciones.length, op, err);
    }
  }
  // Los sellos, al final y una vez por catálogo: los dispositivos relerán.
  const version = new Date().toISOString();
  for (const nombre of sellos) await col('catalogos').doc(nombre).set({ version }, { merge: true });
  return { refs, creados, hechas };
}

/** El lector de `aplicarPropuesta` montado sobre la fuente de datos de administración. */
export function lectorDeServidor(fuente: FuenteDeDatos): LectorAplicacion {
  return {
    dietas: email => fuente.getDietsForAthlete(email),
    mesociclos: email => fuente.getMesocycles(email),
    rutinas: () => fuente.getWorkouts(),
    roadmap: email => fuente.getRoadmap(email),
    programa: email => fuente.getNutritionProgram(email),
    perfil: async email => (await fuente.getAllUserProfiles()).find(u => u.email === email) ?? null,
    asignaciones: perfil => fuente.getWorkoutAssignments({ uid: perfil.userId, email: perfil.email }),
    configNutricion: async email => (await fuente.getAthleteNutritionConfig(email)) ?? null,
    configDieta: async email => (await fuente.getAthleteDietConfig(email)) ?? null,
    ejercicios: () => fuente.getExercises(),
    checkin: async id => (await fuente.getCheckIns()).find(c => c.id === id) ?? null,
    ficha: email => fuente.getDossier(email),
    respuestaCuestionario: async (email, id) => (await fuente.getResponsesForAthlete(email)).find(r => r.id === id) ?? null,
  };
}

/** Deshacer en servidor: el mismo contrato que `db/restauracion.ts`. */
export async function restaurarEnServidor(db: Firestore, fotos: SnapshotDocumento[]): Promise<number> {
  let n = 0;
  for (const foto of [...fotos].reverse()) {
    const ref = db.collection(foto.coleccion).doc(foto.id);
    if (foto.datos === null) await ref.delete();
    else if (foto.parcial) await ref.set(sinIndefinidos(foto.datos), { merge: true });
    else await ref.set(sinIndefinidos(foto.datos));
    if (CON_SELLO.has(foto.coleccion)) await db.collection('catalogos').doc(foto.coleccion).set({ version: new Date().toISOString() }, { merge: true });
    n++;
  }
  return n;
}

export const COACH = COACH_EMAIL;
export { COLECCION_DE_OPERACION };
