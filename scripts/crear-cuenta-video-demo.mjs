// Crea (y rellena) una cuenta de ATLETA lista para grabar el vídeo de
// presentación de la app: onboarding, entrenamiento, nutrición, progreso.
//
// Reutiliza la misma receta que scripts/sembrarAtletaDemo.mjs (probada con la
// revisión de Apple) pero:
//   · usa un correo propio para el vídeo (no el de revisión de tiendas),
//   · crea la cuenta de Auth y le fija una contraseña fija y memorizable,
//   · PUBLICA el plan (planPublishedAt) para que no haya que tocar la consola
//     del coach antes de grabar.
//
// Todo lo sembrado lleva `demoSeed: true` y `videoDemo: true`.
//
//   node scripts/crear-cuenta-video-demo.mjs            # crea + siembra + publica
//   node scripts/crear-cuenta-video-demo.mjs --limpiar  # borra lo sembrado (no borra la cuenta de Auth)

import { readFileSync } from 'fs';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url))));
const auth = getAuth();

const EMAIL = 'demo.video@danielenforma.app';
// La contraseña NO se escribe aquí: este repo es público y lo que entra en su
// historia no se saca después. Se pasa por entorno al ejecutar el script:
//
//   DEMO_VIDEO_PASSWORD='...' node scripts/crear-cuenta-video-demo.mjs
//
// Si la cuenta ya existía con otra contraseña, este script se la reescribe con
// la que le pases (ver `asegurarCuenta`).
const PASSWORD = process.env.DEMO_VIDEO_PASSWORD;
const NOMBRE = 'Marcos Vídeo';
const COACH_UID = 'THa4aRnQQVT2tPXBEqq5yytJxIm1';
const MARCA = { demoSeed: true, videoDemo: true };

const SEMANAS = 5;
const DIAS_SESION = [1, 2, 4, 5];

const iso = d => d.toISOString().slice(0, 10);
const sumaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function lunesDe(d) {
  const x = new Date(d);
  const dow = x.getDay();
  return sumaDias(x, dow === 0 ? -6 : 1 - dow);
}

const RUTINAS = [
  { nombre: 'Día 1 · Empuje', ejercicios: [
    { exerciseId: 'sys_press-banca-declinado-caja-toracica-plana', muscleGroup: 'pecho', sets: 4, reps: '6-8', rir: 2, restSeconds: 150, kg: 60 },
    { exerciseId: 'sys_press-de-hombros-en-maquina-pendular', muscleGroup: 'deltoide_ant', sets: 3, reps: '8-10', rir: 2, restSeconds: 120, kg: 35 },
    { exerciseId: 'sys_elevaciones-laterales-con-mancuernas', muscleGroup: 'deltoide_lat', sets: 4, reps: '12-15', rir: 1, restSeconds: 75, kg: 9 },
    { exerciseId: 'sys_extensiones-de-triceps-en-polea-alta-con-cuerda', muscleGroup: 'triceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 75, kg: 25 },
  ] },
  { nombre: 'Día 2 · Pierna (rodilla)', ejercicios: [
    { exerciseId: 'sys_sentadilla-hack-pies-abajo', muscleGroup: 'cuadriceps', sets: 4, reps: '6-8', rir: 2, restSeconds: 180, kg: 80 },
    { exerciseId: 'sys_peso-muerto-rumano', muscleGroup: 'isquios', sets: 3, reps: '8-10', rir: 2, restSeconds: 150, kg: 70 },
    { exerciseId: 'sys_prensa-pendular-pies-abajo-menor-dorsiflexion', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 120, kg: 120 },
    { exerciseId: 'sys_elevaciones-de-talones-en-prensa', muscleGroup: 'gemelo', sets: 4, reps: '12-15', rir: 1, restSeconds: 60, kg: 90 },
  ] },
  { nombre: 'Día 3 · Tirón', ejercicios: [
    { exerciseId: 'sys_jalon-estable-en-polea-alta-agarre-ancho-prono', muscleGroup: 'dorsal', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 55 },
    { exerciseId: 'sys_remo-en-maquina-ascendente-agarre-prono', muscleGroup: 'trapecio', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 50 },
    { exerciseId: 'sys_facepull-dominante-de-deltoides-posterior', muscleGroup: 'deltoide_post', sets: 3, reps: '12-15', rir: 1, restSeconds: 75, kg: 20 },
    { exerciseId: 'sys_curl-de-biceps-con-barra-z', muscleGroup: 'biceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 75, kg: 22 },
  ] },
  { nombre: 'Día 4 · Pierna (cadera)', ejercicios: [
    { exerciseId: 'sys_hip-thrust-tempo-controlado', muscleGroup: 'gluteo', sets: 4, reps: '8-10', rir: 2, restSeconds: 150, kg: 85 },
    { exerciseId: 'sys_zancadas-estaticas-en-multipower-dominante-rodilla', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 2, restSeconds: 120, kg: 40 },
    { exerciseId: 'sys_curl-femoral-en-polea-tumbado', muscleGroup: 'isquios', sets: 3, reps: '10-12', rir: 1, restSeconds: 90, kg: 30 },
    { exerciseId: 'sys_crunch-abdominal-con-flexion-de-cadera', muscleGroup: 'core', sets: 3, reps: '12-15', rir: 1, restSeconds: 60, kg: 10 },
  ] },
];

const COMIDAS = [
  { name: 'Desayuno', slot: 1, items: [
    ['MIX_HC', '250ml leche semidesnatada', 1],
    ['HC', '30g arroz, pasta, couscous o quinoa', 2],
    ['GRASA', '20g chocolate +72% (2 onzas)', 1],
  ] },
  { name: 'Media mañana', slot: 2, items: [
    ['PROT', '120g queso cottage light', 1],
    ['HC', '150g uvas', 1],
  ] },
  { name: 'Comida', slot: 3, items: [
    ['PROT', '80g carne roja magra (sin grasa)', 2],
    ['HC', '120g boniato', 2],
    ['GRASA', '100g tomate frito estilo casero', 1],
  ] },
  { name: 'Merienda', slot: 4, aroundTraining: true, items: [
    ['MIX_HC', '1 yogurt natural (125-140g)', 1],
    ['HC', '30g papilla de cereales sin azúcares añadidos', 1],
  ] },
  { name: 'Cena', slot: 5, items: [
    ['MIX_GRASA', '65g pescado azul', 2],
    ['HC', '60g yuca', 1],
    ['GRASA', '15g mantequilla', 1],
  ] },
];

async function borrarPorMarca(coleccion, campo = 'athleteId', valor = EMAIL) {
  const snap = await db.collection(coleccion).where(campo, '==', valor).where('demoSeed', '==', true).get();
  let n = 0;
  for (const d of snap.docs) { await d.ref.delete(); n++; }
  return n;
}

async function limpiar() {
  let total = 0;
  for (const col of ['workoutAssignments', 'workoutLogs', 'diets', 'bodyweightLogs', 'stepLogs', 'dietCompletionLogs']) {
    const n = await borrarPorMarca(col);
    console.log(`  ${col}: ${n} borrados`);
    total += n;
  }
  const rutinas = await db.collection('workouts').where('ownerId', '==', COACH_UID).where('demoSeed', '==', true).get();
  for (const d of rutinas.docs) { if (d.data().videoDemo) { await d.ref.delete(); total++; } }
  console.log(`\nTotal: ${total} documentos. La cuenta de Auth y el perfil siguen ahí.`);
}

async function asegurarCuenta() {
  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
    await auth.updateUser(user.uid, { password: PASSWORD, emailVerified: true, disabled: false, displayName: NOMBRE });
    console.log('Cuenta de Auth ya existía → contraseña reajustada.');
  } catch {
    user = await auth.createUser({ email: EMAIL, password: PASSWORD, emailVerified: true, displayName: NOMBRE });
    console.log('Cuenta de Auth creada.');
  }
  const ahora = new Date().toISOString();
  await db.collection('user_profiles').doc(user.uid).set({
    userId: user.uid, email: EMAIL, displayName: NOMBRE, role: 'client',
    avatarUrl: '', level: 3, xp: 640, currentStreak: 4, maxStreak: 9,
    initialWeight: 77.2, targetWeight: 74, actualWeight: 75.6,
    planDurationMonths: 6, createdAt: ahora,
    legal: {
      terminos:   { version: 1, fecha: ahora, opciones: { analisisIA: true } },
      privacidad: { version: 1, fecha: ahora },
    },
  }, { merge: true });
  await db.collection('invites').doc(EMAIL).set({
    id: EMAIL, email: EMAIL, invitedAt: ahora, status: 'joined', joinedAt: ahora,
  }, { merge: true });
  return user.uid;
}

async function sembrar(uidAtleta) {
  const hoy = new Date();
  const hoyIso = iso(hoy);
  const lunesEstaSemana = lunesDe(hoy);
  const ahora = new Date().toISOString();

  const idsRutina = [];
  for (const rutina of RUTINAS) {
    const ref = db.collection('workouts').doc();
    await ref.set({
      ownerId: COACH_UID, name: rutina.nombre, tags: ['Vídeo demo'],
      exercises: rutina.ejercicios.map((e, i) => ({
        exerciseId: e.exerciseId, order: i, sets: e.sets, reps: e.reps,
        restSeconds: e.restSeconds, rir: e.rir, muscleGroup: e.muscleGroup,
      })),
      ...MARCA,
    });
    idsRutina.push(ref.id);
  }
  console.log(`✔ ${idsRutina.length} rutinas`);

  let nAsign = 0, nLogs = 0;
  for (let semana = 0; semana < SEMANAS; semana++) {
    const lunes = sumaDias(lunesEstaSemana, (semana - (SEMANAS - 1)) * 7);
    const factor = 1 + 0.025 * semana;
    for (let d = 0; d < DIAS_SESION.length; d++) {
      const fecha = iso(sumaDias(lunes, DIAS_SESION[d] - 1));
      const hecho = fecha < hoyIso;
      const asignacion = db.collection('workoutAssignments').doc();
      await asignacion.set({
        workoutId: idsRutina[d], athleteId: EMAIL, date: fecha,
        status: hecho ? 'completed' : 'pending', ...MARCA,
      });
      nAsign++;
      if (!hecho) continue;
      const rutina = RUTINAS[d];
      await db.collection('workoutLogs').doc().set({
        athleteId: EMAIL, workoutId: idsRutina[d], assignmentId: asignacion.id, date: fecha,
        completedAt: `${fecha}T19:${20 + d}:00.000Z`,
        entries: rutina.ejercicios.map(e => {
          const [min, max] = e.reps.split('-').map(Number);
          const tope = max ?? min;
          const carga = Math.round((e.kg * factor) / 2.5) * 2.5;
          return {
            exerciseId: e.exerciseId,
            sets: Array.from({ length: e.sets }, (_, s) => ({
              weight: carga,
              repsDone: Math.max(min, tope - Math.floor(s / 2)),
              rir: Math.max(0, e.rir - (s === e.sets - 1 ? 1 : 0)),
            })),
          };
        }),
        ...MARCA,
      });
      nLogs++;
    }
  }
  console.log(`✔ ${nAsign} asignaciones · ${nLogs} entrenos registrados`);

  const dietaRef = db.collection('diets').doc();
  const presupuesto = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  const comidas = COMIDAS.map((c, i) => {
    const items = c.items.map(([category, foodLabel, quantity]) => {
      presupuesto[category] += quantity;
      return { category, foodLabel, quantity };
    });
    return { id: `comida_${i + 1}`, name: c.name, slot: c.slot, items, ...(c.aroundTraining ? { aroundTraining: true } : {}) };
  });
  await dietaRef.set({
    athleteId: EMAIL, name: 'Plan de definición · 2.100 kcal',
    budget: presupuesto, meals: comidas,
    coachNote: 'Los hidratos de la merienda van pegados al entreno. Si un día entrenas por la mañana, muévela al desayuno.',
    ...MARCA,
  });
  await db.collection('athleteDietConfigs').doc(EMAIL).set({ athleteId: EMAIL, activeDietIds: [dietaRef.id] }, { merge: true });
  await db.collection('athleteNutritionConfig').doc(EMAIL).set({ athleteId: EMAIL, enabledModes: ['OMNIVORO'], stepGoal: 9000 }, { merge: true });
  console.log('✔ dieta activa con 5 comidas');

  for (let i = 1; i <= 5; i++) {
    const fecha = iso(sumaDias(hoy, -i));
    const hechos = [];
    comidas.forEach((c, ci) => c.items.forEach((_, ii) => { if (!(i === 2 && ci === 3)) hechos.push(`${c.id}_${ii}`); }));
    await db.collection('dietCompletionLogs').doc(`${EMAIL}_${fecha}`).set({
      athleteId: EMAIL, date: fecha, dietId: dietaRef.id, doneItemIds: hechos, ...MARCA,
    });
  }
  console.log('✔ 5 días de adherencia a la dieta');

  let nPeso = 0;
  for (let i = 34; i >= 0; i--) {
    const fecha = iso(sumaDias(hoy, -i));
    const tendencia = 77.2 - (34 - i) * 0.05;
    const ruido = ((i * 37) % 7 - 3) * 0.12;
    await db.collection('bodyweightLogs').doc(`videodemo_${fecha}`).set({
      athleteId: EMAIL, date: fecha, weight: Math.round((tendencia + ruido) * 10) / 10,
      kind: 'daily', createdAt: `${fecha}T07:30:00.000Z`, ...MARCA,
    });
    nPeso++;
  }
  console.log(`✔ ${nPeso} pesos diarios`);

  for (let i = 14; i >= 1; i--) {
    const fecha = iso(sumaDias(hoy, -i));
    await db.collection('stepLogs').doc(`videodemo_${fecha}`).set({
      athleteId: EMAIL, date: fecha, steps: 6200 + ((i * 911) % 5300),
      source: 'manual', createdAt: `${fecha}T22:00:00.000Z`, ...MARCA,
    });
  }
  console.log('✔ 14 días de pasos');

  const maquinas = await db.collection('maquinas').where('visible', '==', true).limit(12).get();
  await db.collection('gimnasios').doc(EMAIL).set({
    atletaId: EMAIL, maquinas: maquinas.docs.map(d => d.id), maquinasPropias: [],
    progresoCatalogo: { revisadas: 63, total: 63, categoriaActual: null, completado: true, pendienteRecordatorio: false, versionCatalogo: 1 },
    actualizadoEn: ahora,
  }, { merge: true });
  console.log(`✔ gimnasio con ${maquinas.size} máquinas`);

  const primerLunes = iso(sumaDias(lunesEstaSemana, -(SEMANAS - 1) * 7));
  const ultimoPeso = await db.collection('bodyweightLogs').where('athleteId', '==', EMAIL).orderBy('date', 'desc').limit(1).get();
  await db.collection('user_profiles').doc(uidAtleta).set({
    planStartDate: primerLunes, planDurationMonths: 6,
    initialWeight: 77.2, actualWeight: ultimoPeso.docs[0]?.data().weight ?? 75.6, targetWeight: 74,
    planPublishedAt: ahora,   // ← plan ya visible: no hay que tocar la consola del coach
  }, { merge: true });
  console.log(`✔ perfil: plan desde ${primerLunes}, publicado, peso actual ${ultimoPeso.docs[0]?.data().weight}`);
}

const limpiando = process.argv.includes('--limpiar');
const resetOnboarding = process.argv.includes('--reset-onboarding');
if (resetOnboarding) {
  // Vuelve a dejar el wizard de preguntas iniciales como si fuera el primer
  // login: borra el documento onboarding/{email}. OJO: en el navegador donde ya
  // se completó queda una copia en localStorage (`enforma_onboarding_v1`) que
  // también saltaría el wizard — para grabarlo hay que entrar en ventana de
  // incógnito o borrar los datos del sitio.
  await db.collection('onboarding').doc(EMAIL).delete();
  console.log(`Onboarding de ${EMAIL} reseteado. Entra en INCÓGNITO para grabar las preguntas iniciales.`);
} else if (limpiando) {
  console.log(`Borrando lo sembrado para ${EMAIL}...\n`);
  await limpiar();
} else {
  // Se comprueba ANTES de tocar nada: fallar a mitad dejaría la cuenta de Auth
  // creada y el sembrado sin hacer, que es el peor estado posible.
  if (!PASSWORD) {
    console.error('Falta DEMO_VIDEO_PASSWORD. Ejecuta:\n');
    console.error("  DEMO_VIDEO_PASSWORD='la-que-quieras' node scripts/crear-cuenta-video-demo.mjs\n");
    process.exit(1);
  }
  console.log(`Preparando la cuenta de vídeo ${EMAIL}...\n`);
  const uid = await asegurarCuenta();
  await sembrar(uid);
  console.log('\n=== CREDENCIALES ===');
  console.log('Email:    ' + EMAIL);
  console.log('Password: la que has pasado en DEMO_VIDEO_PASSWORD');
  console.log('====================');
}
process.exit(0);
