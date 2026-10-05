/* Qué contestó el atleta al aviso de cambios de una sesión que todavía no ha
   terminado. Al terminar se guarda en el propio WorkoutLog (`novedadesVistas`,
   que es lo que ve el coach); esto solo cubre el rato de en medio, para que
   salir a la lista y volver a entrar no le enseñe el aviso otra vez. */

const CLAVE = 'enforma_aviso_sesion_v1';

type Guardado = Record<string, boolean>;

function leer(): Guardado {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Guardado; } catch { return {}; }
}

const id = (email: string, assignmentId: string) => `${email}|${assignmentId}`;

/** true = «Entendido», false = lo cerró sin leer, null = aún no lo ha visto. */
export function cargarAvisoSesion(email: string, assignmentId: string): boolean | null {
  const v = leer()[id(email, assignmentId)];
  return typeof v === 'boolean' ? v : null;
}

export function guardarAvisoSesion(email: string, assignmentId: string, leido: boolean): void {
  try {
    const todo = leer();
    todo[id(email, assignmentId)] = leido;
    // Solo hacen falta las sesiones en curso: con 30 sobra.
    const recortado = Object.fromEntries(Object.entries(todo).slice(-30));
    localStorage.setItem(CLAVE, JSON.stringify(recortado));
  } catch { /* sin almacenamiento: se volverá a enseñar al reabrir, nada más */ }
}

export function borrarAvisoSesion(email: string, assignmentId: string): void {
  try {
    const todo = leer();
    delete todo[id(email, assignmentId)];
    localStorage.setItem(CLAVE, JSON.stringify(todo));
  } catch { /* nada que borrar */ }
}
