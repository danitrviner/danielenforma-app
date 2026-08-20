/* ═══════════════════════════════════════════════════════════════════════════
   Sesión de entrenamiento en curso · borrador local

   `05-5` de la revisión pre-publicación. Las series marcadas durante el
   entrenamiento vivían SOLO en el `useState` de TrainingScreen, y la única
   escritura era «Terminar sesión». En un gimnasio, con la pantalla apagada
   entre series y 40 minutos de sesión, que iOS mate la app en segundo plano no
   es el caso raro: es el caso normal. Cuando pasaba, las 15 series no existían
   en ningún sitio.

   Se persiste en localStorage y no en Firestore a propósito, por el mismo
   criterio que el borrador del cuestionario: no hay concepto de sesión parcial
   en el modelo de datos (`createWorkoutLog` es una escritura única), y el caso
   real es seguir en el mismo teléfono, no empezar en el móvil y acabar en el
   portátil.

   Tres decisiones que evitan que el remedio sea peor que la enfermedad:

   1. **La clave lleva el email del atleta.** `03-5` ya documenta que la app
      arrastra ~50 claves `enforma_*` globales que sobreviven al cierre de
      sesión; no se añade una más. En un móvil compartido, la sesión de uno no
      puede aparecer dentro de la de otro.
   2. **El borrador se descarta si la rutina ha cambiado de forma.** Si el
      coach reordena o cambia el número de series entre que el atleta abre el
      player y vuelve, restaurar por índice colocaría los kilos de un ejercicio
      en otro. Ante la duda, se pierde el borrador, que es recuperable
      repitiendo la sesión; un registro corrupto no lo es.
   3. **Caduca a las 20 horas.** Una sesión no dura más de un día. Sin caducidad
      el borrador de un martes reaparecería el jueves como si fuera de hoy.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Una fila de la tabla del player. Se declara aquí, y no se importa de
 *  TrainingScreen, para que el módulo sea testeable sin montar la pantalla. */
export interface SerieBorrador {
  weight: string;
  repsDone: string;
  rir: string;
  done: boolean;
}

export interface SesionEnCurso {
  assignmentId: string;
  workoutId: string;
  playerSets: SerieBorrador[][];
  exerciseNoteInputs: string[];
  workoutNoteInput: string;
  /** ISO. Sirve para caducar el borrador, no para mostrarlo. */
  guardadoEn: string;
  /** La forma PRESCRITA (series por ejercicio según la rutina, sin las
   *  bajadas/miniseries que el atleta añada a mano) en el momento de guardar.
   *  Se compara por separado de `playerSets.length` porque, desde que existen
   *  dropset/myoreps con filas añadidas en caliente, `playerSets` puede tener
   *  MÁS filas que la prescripción sin que eso signifique que el coach cambió
   *  la rutina — y menos filas si el coach sí la cambió, que es justo lo que
   *  este campo tiene que seguir detectando. Opcional por compatibilidad con
   *  borradores guardados antes de que existiera este campo. */
  formaPrescrita?: number[];
}

const PREFIJO = 'enforma_sesion_en_curso_v1';

/** 20 h: cubre de sobra cualquier sesión real (incluida la que se empieza de
 *  noche y se termina a la mañana siguiente) sin llegar a resucitar la de ayer
 *  a la misma hora. */
const CADUCIDAD_MS = 20 * 60 * 60 * 1000;

function clave(athleteEmail: string, assignmentId: string): string {
  return `${PREFIJO}_${athleteEmail}_${assignmentId}`;
}

/** La «forma» de una rutina: cuántas series tiene cada ejercicio, en orden.
 *  Es lo que se compara para decidir si un borrador sigue siendo aplicable. */
export function formaDeSesion(playerSets: SerieBorrador[][]): number[] {
  return playerSets.map(ex => ex.length);
}

function mismaForma(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export function guardarSesion(athleteEmail: string, sesion: SesionEnCurso): void {
  try {
    localStorage.setItem(clave(athleteEmail, sesion.assignmentId), JSON.stringify(sesion));
  } catch {
    // best-effort: en modo privado o con el almacenamiento lleno el player
    // sigue funcionando igual que antes, solo sin red de seguridad.
  }
}

/**
 * Devuelve el borrador solo si se puede aplicar con seguridad a la rutina que
 * se está abriendo ahora mismo. `formaActual` es la forma PRESCRITA de la
 * tabla recién prerrellenada (sin filas añadidas a mano); si no coincide con
 * la `formaPrescrita` que se guardó con el borrador, se borra y se devuelve
 * `null`. Un borrador sin `formaPrescrita` (guardado antes de que existiera
 * el campo) se compara contra `playerSets.length` como hacía siempre —
 * conservador, pero nunca menos seguro que antes.
 */
export function cargarSesion(
  athleteEmail: string,
  assignmentId: string,
  workoutId: string,
  formaActual: number[],
): SesionEnCurso | null {
  try {
    const raw = localStorage.getItem(clave(athleteEmail, assignmentId));
    if (!raw) return null;

    const sesion = JSON.parse(raw) as SesionEnCurso;

    const caducado = !sesion.guardadoEn || Date.now() - Date.parse(sesion.guardadoEn) > CADUCIDAD_MS;
    const otraRutina = sesion.workoutId !== workoutId;
    const formaGuardada = Array.isArray(sesion.formaPrescrita) ? sesion.formaPrescrita : formaDeSesion(sesion.playerSets);
    const cambióLaForma = !Array.isArray(sesion.playerSets) || !mismaForma(formaGuardada, formaActual);

    if (caducado || otraRutina || cambióLaForma) {
      borrarSesion(athleteEmail, assignmentId);
      return null;
    }
    return sesion;
  } catch {
    // JSON corrupto: se trata igual que no tener borrador.
    borrarSesion(athleteEmail, assignmentId);
    return null;
  }
}

export function borrarSesion(athleteEmail: string, assignmentId: string): void {
  try {
    localStorage.removeItem(clave(athleteEmail, assignmentId));
  } catch {
    // best-effort
  }
}

/** ¿Tiene el borrador alguna serie marcada? Un borrador sin nada hecho no
 *  merece ni restaurarse ni avisar de nada. */
export function tieneSeriesHechas(sesion: SesionEnCurso): boolean {
  return sesion.playerSets.some(ex => ex.some(s => s.done));
}

/**
 * Barre los borradores de este atleta que ya han caducado. Se llama al montar
 * la pantalla: sin esto, cada sesión abierta y nunca terminada dejaría una
 * clave para siempre.
 */
export function limpiarSesionesCaducadas(athleteEmail: string): void {
  try {
    const prefijo = `${PREFIJO}_${athleteEmail}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefijo)) continue;
      try {
        const sesion = JSON.parse(localStorage.getItem(k) || '') as SesionEnCurso;
        if (!sesion.guardadoEn || Date.now() - Date.parse(sesion.guardadoEn) > CADUCIDAD_MS) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // best-effort
  }
}
