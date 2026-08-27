/**
 * Pruebas de `firestore.rules` contra el emulador · 04-10
 *
 * Estas NO corren con `npm test`: necesitan el emulador de Firestore levantado,
 * que a su vez necesita Java. Se ejecutan con `npm run test:reglas`, que lo
 * arranca, pasa las pruebas y lo apaga.
 *
 * Por qué existen. El informe pedía explícitamente probar 04-10 en el emulador
 * ANTES de desplegarlo, y por un motivo muy concreto: el cambio exige tener
 * documento en `user_profiles` para leer los catálogos, y un atleta recién
 * invitado ENTRA ANTES DE TENERLO. Si el orden real fuera «leer catálogo →
 * crear perfil» en vez de «crear perfil → leer catálogo», la regla dejaría
 * encerrado a todo cliente nuevo — que es exactamente el fallo P0-2 que este
 * proyecto ya sufrió una vez. Desplegar sin comprobarlo era inaceptable.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'enforma-reglas-test';
const COACH = 'danitrviner@gmail.com';
const ATLETA = 'atleta@enforma.com';

// Las doce colecciones de catálogo que 04-10 cierra.
const CATALOGOS = [
  'exercises', 'maquinas', 'workouts', 'foodItems', 'mesocycleTemplates',
  'recipes', 'questionnaires', 'challengeTemplates', 'resources',
  'onboardingTemplates', 'academyCourses', 'academyLessons',
];

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/** Siembra saltándose las reglas, como haría el servidor. */
async function sembrar(fn: (db: any) => Promise<void>) {
  await env.withSecurityRulesDisabled(async ctx => { await fn(ctx.firestore()); });
}

describe('04-10 · catálogos solo para usuarios de la app', () => {
  it('BLOQUEA a quien solo tiene un UID recién registrado', async () => {
    // El atacante del hallazgo: createUserWithEmailAndPassword por REST le da
    // un token válido, pero nunca pasa por getOrCreateUserProfile.
    const intruso = env.authenticatedContext('uid-recien-registrado', {
      email: 'intruso@ejemplo.com', email_verified: true,
    }).firestore();

    for (const col of CATALOGOS) {
      await assertFails(getDoc(doc(intruso, col, 'cualquiera')));
    }
  });

  it('DEJA PASAR a un atleta con perfil creado', async () => {
    const uid = 'uid-atleta-real';
    await sembrar(async db => {
      await setDoc(doc(db, 'user_profiles', uid), { userId: uid, email: ATLETA, role: 'client' });
      for (const col of CATALOGOS) {
        await setDoc(doc(db, col, 'ficha'), { nombre: 'algo' });
      }
    });

    const atleta = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();
    for (const col of CATALOGOS) {
      await assertSucceeds(getDoc(doc(atleta, col, 'ficha')));
    }
  });

  it('bloquea también a quien no ha iniciado sesión', async () => {
    const anonimo = env.unauthenticatedContext().firestore();
    for (const col of CATALOGOS) {
      await assertFails(getDoc(doc(anonimo, col, 'cualquiera')));
    }
  });
});

describe('04-10 · el atleta recién invitado NO se queda encerrado', () => {
  /* Este es EL caso que bloqueaba el despliegue. La secuencia real del primer
     día, en este orden:
       1. el coach le da de alta (api/create-athlete escribe `invites`)
       2. el atleta entra por primera vez — todavía SIN user_profiles
       3. getOrCreateUserProfile le CREA el perfil
       4. a partir de ahí la app lee catálogos
     Si el paso 4 ocurriera antes del 3, la regla lo dejaría fuera. */

  it('puede crear su perfil aunque aún no tenga uno (paso 3)', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'invites', ATLETA), { id: ATLETA, email: ATLETA, status: 'pending' });
    });

    const uid = 'uid-recien-invitado';
    const nuevo = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();

    // El perfil se crea con las reglas de user_profiles, que NO dependen de
    // esUsuarioDeLaApp() — si dependieran, sería imposible crear el primero.
    await assertSucceeds(setDoc(doc(nuevo, 'user_profiles', uid), {
      userId: uid, email: ATLETA, role: 'client',
    }));
  });

  it('y una vez creado el perfil, ya lee los catálogos (paso 4)', async () => {
    const uid = 'uid-recien-invitado';
    await sembrar(async db => {
      await setDoc(doc(db, 'invites', ATLETA), { id: ATLETA, email: ATLETA, status: 'pending' });
      await setDoc(doc(db, 'exercises', 'sentadilla'), { nombre: 'Sentadilla' });
    });

    const nuevo = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();
    await setDoc(doc(nuevo, 'user_profiles', uid), { userId: uid, email: ATLETA, role: 'client' });
    await assertSucceeds(getDoc(doc(nuevo, 'exercises', 'sentadilla')));
  });
});

describe('04-10 · el coach sigue entrando', () => {
  it('lee los catálogos con su perfil', async () => {
    const uid = 'uid-coach';
    await sembrar(async db => {
      await setDoc(doc(db, 'user_profiles', uid), { userId: uid, email: COACH, role: 'coach' });
      await setDoc(doc(db, 'recipes', 'r1'), { nombre: 'Receta' });
    });
    const coach = env.authenticatedContext(uid, { email: COACH, email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(coach, 'recipes', 'r1')));
  });
});

describe('workoutAssignments · el atleta puede cerrar/saltar su propia sesión', () => {
  // Bug real: el atleta no podía marcar su asignación como completada al
  // terminar un entrenamiento (el log SÍ se guardaba, esta segunda escritura
  // no) — y el mismo permission-denied encendía el banner "sin permiso para
  // guardar" en cualquier otra pantalla que tocara después.
  const uidAtleta = 'uid-atleta-assignment';

  it('puede poner status a completed/skipped/perdido en su propia asignación', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a1'), {
        athleteId: uidAtleta, workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const atleta = env.authenticatedContext(uidAtleta, { email: ATLETA, email_verified: true }).firestore();
    await assertSucceeds(updateDoc(doc(atleta, 'workoutAssignments', 'a1'), { status: 'completed' }));
  });

  it('NO puede cambiar otro campo a la vez que status', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a2'), {
        athleteId: uidAtleta, workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const atleta = env.authenticatedContext(uidAtleta, { email: ATLETA, email_verified: true }).firestore();
    await assertFails(updateDoc(doc(atleta, 'workoutAssignments', 'a2'), { status: 'completed', workoutId: 'w2' }));
  });

  it('NO puede poner un status fuera de la lista permitida', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a3'), {
        athleteId: uidAtleta, workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const atleta = env.authenticatedContext(uidAtleta, { email: ATLETA, email_verified: true }).firestore();
    await assertFails(updateDoc(doc(atleta, 'workoutAssignments', 'a3'), { status: 'pending' }));
  });

  it('NO puede tocar la asignación de otro atleta', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a4'), {
        athleteId: 'uid-otro-atleta', workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const atleta = env.authenticatedContext(uidAtleta, { email: ATLETA, email_verified: true }).firestore();
    await assertFails(updateDoc(doc(atleta, 'workoutAssignments', 'a4'), { status: 'completed' }));
  });

  it('el coach sigue pudiendo crear/editar asignaciones libremente', async () => {
    const uidCoach = 'uid-coach-2';
    const coach = env.authenticatedContext(uidCoach, { email: COACH, email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(coach, 'workoutAssignments', 'a5'), {
      athleteId: uidAtleta, workoutId: 'w1', date: '2026-08-18', status: 'pending',
    }));
  });

  // ── Migración UID→EMAIL (24-08) ────────────────────────────────────────────
  // Durante el paso conviven documentos con las dos claves. Las reglas tienen
  // que dejar al atleta cerrar su sesión en AMBOS casos, o se queda sin poder
  // marcar entrenamientos justo mientras corre la migración.

  it('migrado a email: el atleta puede cerrar su sesión con athleteId = email', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a6'), {
        athleteId: ATLETA, workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const atleta = env.authenticatedContext(uidAtleta, { email: ATLETA, email_verified: true }).firestore();
    await assertSucceeds(updateDoc(doc(atleta, 'workoutAssignments', 'a6'), { status: 'completed' }));
  });

  it('migrado a email: sigue sin poder tocar la de otro atleta', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a7'), {
        athleteId: 'otro@enforma.com', workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const atleta = env.authenticatedContext(uidAtleta, { email: ATLETA, email_verified: true }).firestore();
    await assertFails(updateDoc(doc(atleta, 'workoutAssignments', 'a7'), { status: 'completed' }));
  });

  // Sin email verificado la rama nueva no aplica. Se usa un uid distinto del
  // suyo para que la rama antigua tampoco lo salve por accidente.
  it('migrado a email: sin email verificado NO puede', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'workoutAssignments', 'a8'), {
        athleteId: ATLETA, workoutId: 'w1', date: '2026-08-18', status: 'pending',
      });
    });
    const sinVerificar = env.authenticatedContext('uid-sin-verificar', { email: ATLETA, email_verified: false }).firestore();
    await assertFails(updateDoc(doc(sinVerificar, 'workoutAssignments', 'a8'), { status: 'completed' }));
  });
});

describe('athleteCardioProfile · el atleta puede fijar su FCmax a mano', () => {
  // Bug/gap real: antes solo el coach podía escribir aquí — el modelo FITIV
  // (zonas automáticas + FCmax editable) exige que el propio atleta pueda
  // guardar la suya sin depender de que el coach apruebe un test.
  it('el atleta puede leer y escribir su propio perfil de cardio', async () => {
    const uid = 'uid-atleta-cardio';
    const atleta = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(atleta, 'athleteCardioProfile', ATLETA), {
      athleteId: ATLETA, maxHR: 190, method: 'hrr',
      zones: { z1: { min: 90, max: 108 }, z2: { min: 108, max: 126 }, z3: { min: 126, max: 144 }, z4: { min: 144, max: 162 }, z5: { min: 162, max: 190 } },
      updatedAt: new Date().toISOString(), updatedBy: ATLETA,
    }));
    await assertSucceeds(getDoc(doc(atleta, 'athleteCardioProfile', ATLETA)));
  });

  it('NO puede escribir el perfil de cardio de otro atleta', async () => {
    const uid = 'uid-atleta-cardio-2';
    const atleta = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();
    await assertFails(setDoc(doc(atleta, 'athleteCardioProfile', 'otro@enforma.com'), {
      athleteId: 'otro@enforma.com', maxHR: 190, method: 'hrr',
    }));
  });

  it('el coach sigue pudiendo escribir el perfil de cualquier atleta', async () => {
    const uidCoach = 'uid-coach-3';
    const coach = env.authenticatedContext(uidCoach, { email: COACH, email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(coach, 'athleteCardioProfile', ATLETA), {
      athleteId: ATLETA, maxHR: 185, method: 'hrr', updatedBy: COACH,
    }));
  });
});

describe('invites · T8.b el atleta puede leer su propia invitación', () => {
  // Bug real: podía ESCRIBIR su invitación pero no LEERLA. markInviteJoined
  // (src/db/invites.ts) empieza con un getDoc → permission-denied silencioso
  // → la invitación se quedaba "pending" para siempre aunque el alta hubiera
  // terminado bien.
  it('lee su propia invitación por email', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'invites', ATLETA), { id: ATLETA, email: ATLETA, status: 'pending' });
    });
    const uid = 'uid-atleta-invite';
    const atleta = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(atleta, 'invites', ATLETA)));
  });

  it('NO puede leer la invitación de otro email', async () => {
    const otro = 'otro@enforma.com';
    await sembrar(async db => {
      await setDoc(doc(db, 'invites', otro), { id: otro, email: otro, status: 'pending' });
    });
    const uid = 'uid-atleta-invite-2';
    const atleta = env.authenticatedContext(uid, { email: ATLETA, email_verified: true }).firestore();
    await assertFails(getDoc(doc(atleta, 'invites', otro)));
  });

  it('el coach sigue pudiendo leer cualquier invitación', async () => {
    await sembrar(async db => {
      await setDoc(doc(db, 'invites', ATLETA), { id: ATLETA, email: ATLETA, status: 'pending' });
    });
    const uidCoach = 'uid-coach-4';
    const coach = env.authenticatedContext(uidCoach, { email: COACH, email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(coach, 'invites', ATLETA)));
  });
});
