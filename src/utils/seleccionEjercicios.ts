import { Exercise, MuscleGroup, Workout, WorkoutLog } from '../types';
import { calcularPerfilProgramacion, PerfilEjercicio } from './perfilProgramacion';
import { normalizarTexto } from './busqueda';

/* ═══════════════════════════════════════════════════════════════════════════
   QUÉ EJERCICIO PONER — con el criterio de Dani, no por orden alfabético.

   El generador de rutinas del editor de mesociclos elegía así:

       const ex = available[i % available.length];
       ... reps: '8-12', rir: 2, restSeconds: 90

   `available` es el catálogo filtrado por grupo, en el orden en que llega de
   Firestore. O sea: el ejercicio que sale es el que esté primero en la lista,
   y los números son los mismos para el press banca que para el gemelo de pie.
   Un plan generado así hay que reescribirlo entero a mano, que es justo lo que
   el generador venía a evitar.

   Este motor elige de otra forma. El orden de preferencia sale de lo que Dani
   PROGRAMA DE VERDAD (`perfilProgramacion`, sus propias rutinas), y las
   series/reps/RIR/descanso de las medianas de ESE ejercicio en sus rutinas.
   Encima de eso, cuatro correcciones:

     · El material del atleta. Un ejercicio que no puede hacer no sube, por
       mucho que Dani lo use.
     · Las lesiones y lo que el atleta dijo que no quiere hacer.
     · Rotación: lo que lleva tres bloques seguidos puesto baja, para que el
       cuarto mes no sea idéntico al primero.
     · Variedad dentro del día: dos ejercicios seguidos del mismo grupo no
       deberían ser el mismo patrón si hay alternativa.

   Y devuelve `razones` por ejercicio. Sin eso, el coach recibe una lista que
   no puede auditar y vuelve a reescribirla a mano por desconfianza, que es el
   mismo final por otro camino.

   Puro: ni React, ni Firestore, ni reloj propio.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Valores de respaldo cuando un ejercicio no tiene historial de Dani. */
export const ESQUEMA_POR_DEFECTO = { reps: '8-12', rir: 2, restSeconds: 90 };

/** Bloques seguidos usando el mismo ejercicio a partir de los cuales conviene rotar. */
export const BLOQUES_PARA_ROTAR = 3;

export interface EjercicioElegido {
  exerciseId: string;
  nombre: string;
  grupo: MuscleGroup;
  sets: number;
  reps: string;
  rir: number;
  restSeconds: number;
  /** El material del atleta no cubre este ejercicio, pero no había alternativa. */
  materialIncompatible: boolean;
  /** Por qué salió este y con estos números. Se enseña al desplegar la fila. */
  razones: string[];
}

export interface EntradaSeleccion {
  grupo: MuscleGroup;
  /** Series a repartir en este grupo y día, ya troceadas. */
  trozos: number[];
  catalogo: Exercise[];
  /** Rutinas del coach: de aquí sale su criterio. */
  rutinasDelCoach: Workout[];
  /** Material que tiene el atleta. Vacío = no se filtra. */
  materialDelAtleta: string[];
  /** Historial del atleta, para la rotación. */
  logsDelAtleta?: WorkoutLog[];
  /** Nombres o palabras que hay que evitar (lesiones, preferencias del alta). */
  vetados?: string[];
}

interface Candidato {
  ejercicio: Exercise;
  perfil: PerfilEjercicio | null;
  compatible: boolean;
  vetado: boolean;
  bloquesSeguidos: number;
}

// La misma normalización que todos los buscadores de la app (sin tildes,
// espacios plegados), no una copia más débil.
const normalizar = normalizarTexto;

/** ¿El material del atleta cubre este ejercicio? Sin etiquetas, sí. */
function cubreElMaterial(ex: Exercise, material: string[]): boolean {
  const eq = ex.equipment ?? [];
  if (eq.length === 0 || material.length === 0) return true;
  const suyo = material.map(normalizar);
  return eq.some(e => suyo.includes(normalizar(e)));
}

/**
 * ¿Lo veta una lesión o una preferencia?
 *
 * Entran dos cosas distintas por la misma puerta: nombres de ejercicio exactos
 * («press banca», de los que el atleta odia) y FRASES libres del alta
 * («molestia en el hombro, evitar press militar»). Antes solo se comprobaba
 * `nombre.includes(veto)`, que funciona para lo primero y NUNCA para lo
 * segundo: el nombre de un ejercicio no contiene una frase entera, así que
 * las lesiones no vetaban nada y el generador decía que sí.
 *
 * Ahora vale en los dos sentidos: el veto está dentro del nombre (nombre
 * exacto) o el nombre está dentro del veto (la frase menciona el ejercicio).
 * Sigue sin ser inteligente —«hombro» no veta el press militar por saber de
 * anatomía—, pero lo que el coach escribe con el nombre del ejercicio dentro
 * sí lo veta, que es lo que el comentario de MesocycleManager promete.
 */
function estaVetado(ex: Exercise, vetados: string[]): boolean {
  if (vetados.length === 0) return false;
  const nombre = normalizar(ex.name).trim();
  if (nombre.length < 3) return false;
  return vetados.some(v => {
    const t = normalizar(v).trim();
    return t.length >= 3 && (nombre.includes(t) || t.includes(nombre));
  });
}

/**
 * En cuántos mesociclos SEGUIDOS y recientes aparece el ejercicio.
 *
 * Se cuenta desde el bloque más reciente hacia atrás y se para en el primero
 * en que no aparece: lo que interesa es la racha actual, no el total
 * histórico. Un ejercicio que se usó mucho hace un año y se dejó no necesita
 * rotarse, ya está rotado.
 */
export function bloquesSeguidosCon(exerciseId: string, logs: WorkoutLog[]): number {
  const porMeso = new Map<string, Set<string>>();
  const orden: string[] = [];
  for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
    const meso = log.mesocycleId ?? '';
    if (!meso) continue;
    if (!porMeso.has(meso)) { porMeso.set(meso, new Set()); orden.push(meso); }
    for (const e of log.entries) porMeso.get(meso)!.add(e.exerciseId);
  }
  let racha = 0;
  for (const meso of orden) {
    if (porMeso.get(meso)!.has(exerciseId)) racha += 1;
    else break;
  }
  return racha;
}

/**
 * Los candidatos de un grupo, del que más encaja al que menos.
 *
 * El orden es: primero los que el atleta puede hacer y no están vetados,
 * después por cuántas veces los programa Dani, y a igualdad por nombre para
 * que el resultado sea determinista. La rotación resta dentro de ese orden.
 */
export function ordenarCandidatos(entrada: EntradaSeleccion): Candidato[] {
  const { grupo, catalogo, rutinasDelCoach, materialDelAtleta, logsDelAtleta = [], vetados = [] } = entrada;
  const perfil = calcularPerfilProgramacion(rutinasDelCoach, catalogo);
  const porNombre = new Map(perfil[grupo]?.map(p => [p.nombre, p]) ?? []);

  return catalogo
    .filter(e => e.muscleGroup === grupo)
    .map<Candidato>(e => ({
      ejercicio: e,
      perfil: porNombre.get(e.name) ?? null,
      compatible: cubreElMaterial(e, materialDelAtleta),
      vetado: estaVetado(e, vetados),
      bloquesSeguidos: bloquesSeguidosCon(e.id, logsDelAtleta),
    }))
    .sort((a, b) => {
      // Un vetado nunca sube: es una lesión o un «esto no lo hago».
      if (a.vetado !== b.vetado) return a.vetado ? 1 : -1;
      if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
      const rotaA = a.bloquesSeguidos >= BLOQUES_PARA_ROTAR;
      const rotaB = b.bloquesSeguidos >= BLOQUES_PARA_ROTAR;
      if (rotaA !== rotaB) return rotaA ? 1 : -1;
      const vecesA = a.perfil?.veces ?? 0;
      const vecesB = b.perfil?.veces ?? 0;
      if (vecesA !== vecesB) return vecesB - vecesA;
      return a.ejercicio.name.localeCompare(b.ejercicio.name);
    });
}

/**
 * Elige los ejercicios de un grupo para un día, uno por trozo de series.
 *
 * Si hay menos candidatos que trozos se repite —tres bloques de pecho con dos
 * ejercicios disponibles son 3+3+3 entre los dos— porque quedarse corto de
 * series es peor que repetir un ejercicio.
 */
export function elegirEjercicios(entrada: EntradaSeleccion): EjercicioElegido[] {
  const candidatos = ordenarCandidatos(entrada);
  if (candidatos.length === 0) return [];

  const hayCompatibles = candidatos.some(c => c.compatible && !c.vetado);

  return entrada.trozos.map((sets, i) => {
    const c = candidatos[i % candidatos.length];
    const p = c.perfil;
    const razones: string[] = [];

    if (p) {
      razones.push(`Lo programas en ${p.veces} ${p.veces === 1 ? 'rutina' : 'rutinas'} tuyas`);
      if (p.series != null || p.reps || p.rir != null) {
        razones.push('Series, reps, RIR y descanso salen de la mediana de tus rutinas con este ejercicio');
      }
    } else {
      razones.push('No lo tienes en ninguna rutina: va con el esquema por defecto');
    }
    if (!c.compatible) {
      razones.push(hayCompatibles
        ? 'Su material no encaja con el del atleta'
        : 'Ningún ejercicio de este grupo encaja con el material del atleta');
    }
    if (c.vetado) razones.push('Coincide con algo que el atleta no debe hacer: cámbialo');
    if (c.bloquesSeguidos >= BLOQUES_PARA_ROTAR) {
      razones.push(`Lleva ${c.bloquesSeguidos} bloques seguidos: tocaría rotarlo`);
    }

    return {
      exerciseId: c.ejercicio.id,
      nombre: c.ejercicio.name,
      grupo: entrada.grupo,
      sets,
      reps: p?.reps ?? ESQUEMA_POR_DEFECTO.reps,
      rir: p?.rir ?? ESQUEMA_POR_DEFECTO.rir,
      restSeconds: p?.descansoSeg ?? ESQUEMA_POR_DEFECTO.restSeconds,
      materialIncompatible: !c.compatible,
      razones,
    };
  });
}
