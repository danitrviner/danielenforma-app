// Llena la cuenta de revisión de las tiendas con datos realistas.
//
// Por qué existe: el revisor de Apple/Google entra con esa cuenta y, sin plan
// publicado ni historial, se topa con la pantalla de espera «tu entrenador está
// montando tu plan», que es un bloqueo total — no puede ver ni una pantalla de
// la app. Eso es un rechazo por la directriz 2.1.
//
// Lo que NO hace: publicar el plan. `planPublishedAt` lo pone el entrenador
// desde su consola (ClientWorkoutsPanel → «Mostrar el plan al atleta»), y así
// se queda, para que ese paso se haga por el camino real y de paso se pruebe.
//
// Todo lo que crea lleva `demoSeed: true`, así que `--limpiar` lo borra sin
// tocar nada más.
//
//   node scripts/sembrarAtletaDemo.mjs            # siembra
//   node scripts/sembrarAtletaDemo.mjs --limpiar  # borra lo sembrado

import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url))));

const EMAIL = 'revision.appstore@danielenforma.app';
const COACH_UID = 'THa4aRnQQVT2tPXBEqq5yytJxIm1';
const UID_ATLETA = 'inLfw7oXvVTE6wGqtN0eDokKs1y2';
const MARCA = { demoSeed: true };

// Semanas de historial. 4 cerradas + la semana en curso.
const SEMANAS = 5;
// Lunes, martes, jueves y viernes: el reparto de 4 días más común.
const DIAS_SESION = [1, 2, 4, 5];

const iso = d => d.toISOString().slice(0, 10);
const sumaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Lunes de la semana de `d` (la semana empieza en lunes, no en domingo). */
function lunesDe(d) {
  const x = new Date(d);
  const dow = x.getDay();
  return sumaDias(x, dow === 0 ? -6 : 1 - dow);
}

// ── Rutinas ───────────────────────────────────────────────────────────────────
// Ejercicios reales del catálogo del sistema (ids verificados contra la base).
// `kg` es la carga de la PRIMERA semana; sube un 2,5 % por semana.

const RUTINAS = [
  {
    nombre: 'Día 1 · Empuje',
    ejercicios: [
      { exerciseId: 'sys_press-banca-declinado-caja-toracica-plana', muscleGroup: 'pecho', sets: 4, reps: '6-8', rir: 2, restSeconds: 150, kg: 60 },
      { exerciseId: 'sys_press-de-hombros-en-maquina-pendular', muscleGroup: 'deltoide_ant', sets: 3, reps: '8-10', rir: 2, restSeconds: 120, kg: 35 },
      { exerciseId: 'sys_elevaciones-laterales-con-mancuernas', muscleGroup: 'deltoide_lat', sets: 4, reps: '12-15', rir: 1, restSeconds: 75, kg: 9 },
      { exerciseId: 'sys_extensiones-de-triceps-en-polea-alta-con-cuerda', muscleGroup: 'triceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 75, kg: 25 },
    ],
  },
  {
    nombre: 'Día 2 · Pierna (rodilla)',
    ejercicios: [
      { exerciseId: 'sys_sentadilla-hack-pies-abajo', muscleGroup: 'cuadriceps', sets: 4, reps: '6-8', rir: 2, restSeconds: 180, kg: 80 },
      { exerciseId: 'sys_peso-muerto-rumano', muscleGroup: 'isquios', sets: 3, reps: '8-10', rir: 2, restSeconds: 150, kg: 70 },
      { exerciseId: 'sys_prensa-pendular-pies-abajo-menor-dorsiflexion', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 120, kg: 120 },
      { exerciseId: 'sys_elevaciones-de-talones-en-prensa', muscleGroup: 'gemelo', sets: 4, reps: '12-15', rir: 1, restSeconds: 60, kg: 90 },
    ],
  },
  {
    nombre: 'Día 3 · Tirón',
    ejercicios: [
      { exerciseId: 'sys_jalon-estable-en-polea-alta-agarre-ancho-prono', muscleGroup: 'dorsal', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 55 },
      { exerciseId: 'sys_remo-en-maquina-ascendente-agarre-prono', muscleGroup: 'trapecio', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 50 },
      { exerciseId: 'sys_facepull-dominante-de-deltoides-posterior', muscleGroup: 'deltoide_post', sets: 3, reps: '12-15', rir: 1, restSeconds: 75, kg: 20 },
      { exerciseId: 'sys_curl-de-biceps-con-barra-z', muscleGroup: 'biceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 75, kg: 22 },
    ],
  },
  {
    nombre: 'Día 4 · Pierna (cadera)',
    ejercicios: [
      { exerciseId: 'sys_hip-thrust-tempo-controlado', muscleGroup: 'gluteo', sets: 4, reps: '8-10', rir: 2, restSeconds: 150, kg: 85 },
      { exerciseId: 'sys_zancadas-estaticas-en-multipower-dominante-rodilla', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 2, restSeconds: 120, kg: 40 },
      { exerciseId: 'sys_curl-femoral-en-polea-tumbado', muscleGroup: 'isquios', sets: 3, reps: '10-12', rir: 1, restSeconds: 90, kg: 30 },
      { exerciseId: 'sys_crunch-abdominal-con-flexion-de-cadera', muscleGroup: 'core', sets: 3, reps: '12-15', rir: 1, restSeconds: 60, kg: 10 },
    ],
  },
];

// ── Dieta ─────────────────────────────────────────────────────────────────────
// Etiquetas literales del banco de alimentos (colección `foodItems`), para que
// el buscador de sustituciones encuentre equivalentes de verdad.

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

// ── Utilidades ────────────────────────────────────────────────────────────────

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
  for (const d of rutinas.docs) { await d.ref.delete(); total++; }
  console.log(`  workouts: ${rutinas.size} borrados`);
  console.log(`\nTotal: ${total} documentos.`);
  console.log('No se tocan gimnasios/, athleteDietConfigs/ ni el perfil: los comparte la app real.');
}

// ── Siembra ───────────────────────────────────────────────────────────────────

async function sembrar() {
  const hoy = new Date();
  const hoyIso = iso(hoy);
  const lunesEstaSemana = lunesDe(hoy);
  const ahora = new Date().toISOString();

  // 1 · Rutinas del entrenador
  const idsRutina = [];
  for (const rutina of RUTINAS) {
    const ref = db.collection('workouts').doc();
    await ref.set({
      ownerId: COACH_UID,
      name: rutina.nombre,
      tags: ['Demo revisión'],
      exercises: rutina.ejercicios.map((e, i) => ({
        exerciseId: e.exerciseId,
        order: i,
        sets: e.sets,
        reps: e.reps,
        restSeconds: e.restSeconds,
        rir: e.rir,
        muscleGroup: e.muscleGroup,
      })),
      ...MARCA,
    });
    idsRutina.push(ref.id);
  }
  console.log(`✔ ${idsRutina.length} rutinas`);

  // 2 · Asignaciones e historial de series
  let nAsign = 0, nLogs = 0;
  for (let semana = 0; semana < SEMANAS; semana++) {
    // semana 0 = la más antigua; la última es la semana en curso
    const lunes = sumaDias(lunesEstaSemana, (semana - (SEMANAS - 1)) * 7);
    const factor = 1 + 0.025 * semana; // +2,5 % de carga por semana

    for (let d = 0; d < DIAS_SESION.length; d++) {
      const fecha = iso(sumaDias(lunes, DIAS_SESION[d] - 1));
      // El entreno de hoy se deja PENDIENTE a propósito: así el revisor entra y
      // tiene algo que hacer, en vez de una semana ya cerrada.
      const hecho = fecha < hoyIso;
      const asignacion = db.collection('workoutAssignments').doc();
      await asignacion.set({
        workoutId: idsRutina[d],
        athleteId: EMAIL,
        date: fecha,
        status: hecho ? 'completed' : 'pending',
        ...MARCA,
      });
      nAsign++;
      if (!hecho) continue;

      const rutina = RUTINAS[d];
      await db.collection('workoutLogs').doc().set({
        athleteId: EMAIL,
        workoutId: idsRutina[d],
        assignmentId: asignacion.id,
        date: fecha,
        completedAt: `${fecha}T19:${20 + d}:00.000Z`,
        entries: rutina.ejercicios.map(e => {
          const [min, max] = e.reps.split('-').map(Number);
          const tope = max ?? min;
          const carga = Math.round((e.kg * factor) / 2.5) * 2.5;
          return {
            exerciseId: e.exerciseId,
            sets: Array.from({ length: e.sets }, (_, s) => ({
              weight: carga,
              // Las últimas series caen un par de repeticiones, como en la vida real.
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

  // 3 · Dieta activa
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
    athleteId: EMAIL,
    name: 'Plan de definición · 2.100 kcal',
    budget: presupuesto,
    meals: comidas,
    coachNote: 'Los hidratos de la merienda van pegados al entreno. Si un día entrenas por la mañana, muévela al desayuno.',
    ...MARCA,
  });
  await db.collection('athleteDietConfigs').doc(EMAIL).set(
    { athleteId: EMAIL, activeDietIds: [dietaRef.id] }, { merge: true },
  );
  await db.collection('athleteNutritionConfig').doc(EMAIL).set(
    { athleteId: EMAIL, enabledModes: ['OMNIVORO'], stepGoal: 9000 }, { merge: true },
  );
  console.log('✔ dieta activa con 5 comidas');

  // 4 · Adherencia de los últimos días
  for (let i = 1; i <= 5; i++) {
    const fecha = iso(sumaDias(hoy, -i));
    // Casi todo cumplido, con algún hueco: una adherencia del 100 % clavada
    // durante cinco días seguidos no se la cree nadie.
    const hechos = [];
    comidas.forEach((c, ci) => c.items.forEach((_, ii) => {
      if (!(i === 2 && ci === 3)) hechos.push(`${c.id}_${ii}`);
    }));
    await db.collection('dietCompletionLogs').doc(`${EMAIL}_${fecha}`).set({
      athleteId: EMAIL, date: fecha, dietId: dietaRef.id, doneItemIds: hechos, ...MARCA,
    });
  }
  console.log('✔ 5 días de adherencia a la dieta');

  // 5 · Peso corporal: 35 días bajando de 77,2 a ~75,5 con ruido diario
  let nPeso = 0;
  for (let i = 34; i >= 0; i--) {
    const fecha = iso(sumaDias(hoy, -i));
    const tendencia = 77.2 - (34 - i) * 0.05;
    const ruido = ((i * 37) % 7 - 3) * 0.12;
    await db.collection('bodyweightLogs').doc(`demo_${fecha}`).set({
      athleteId: EMAIL, date: fecha, weight: Math.round((tendencia + ruido) * 10) / 10,
      kind: 'daily', createdAt: `${fecha}T07:30:00.000Z`, ...MARCA,
    });
    nPeso++;
  }
  console.log(`✔ ${nPeso} pesos diarios`);

  // 6 · Pasos de las dos últimas semanas (hoy no: lo registra el revisor si quiere)
  for (let i = 14; i >= 1; i--) {
    const fecha = iso(sumaDias(hoy, -i));
    await db.collection('stepLogs').doc(`demo_${fecha}`).set({
      athleteId: EMAIL, date: fecha, steps: 6200 + ((i * 911) % 5300),
      source: 'manual', createdAt: `${fecha}T22:00:00.000Z`, ...MARCA,
    });
  }
  console.log('✔ 14 días de pasos');

  // 7 · Gimnasio: sin esto, al entrar sale el catálogo de máquinas antes que nada
  const maquinas = await db.collection('maquinas').where('visible', '==', true).limit(12).get();
  await db.collection('gimnasios').doc(EMAIL).set({
    atletaId: EMAIL,
    maquinas: maquinas.docs.map(d => d.id),
    maquinasPropias: [],
    progresoCatalogo: {
      revisadas: 63, total: 63, categoriaActual: null,
      completado: true, pendienteRecordatorio: false, versionCatalogo: 1,
    },
    actualizadoEn: ahora,
  }, { merge: true });
  console.log(`✔ gimnasio con ${maquinas.size} máquinas`);

  // 8 · Coherencia del perfil: el plan tiene que haber empezado cuando empezó
  // el historial, o la ficha dice «semana 1 de 26» encima de cinco semanas de
  // entrenos. Y el peso actual, el último registrado.
  const primerLunes = iso(sumaDias(lunesEstaSemana, -(SEMANAS - 1) * 7));
  const ultimoPeso = await db.collection('bodyweightLogs')
    .where('athleteId', '==', EMAIL).orderBy('date', 'desc').limit(1).get();
  await db.collection('user_profiles').doc(UID_ATLETA).set({
    planStartDate: primerLunes,
    planDurationMonths: 6,
    initialWeight: 77.2,
    actualWeight: ultimoPeso.docs[0]?.data().weight ?? 75.5,
    targetWeight: 74,
  }, { merge: true });
  console.log(`✔ perfil: plan desde ${primerLunes}, peso actual ${ultimoPeso.docs[0]?.data().weight}`);

  console.log('\n── Falta un paso, y es tuyo ──');
  console.log('Entra en la consola de entrenador → Cliente Demo → Plan → Entrenamientos');
  console.log('y pulsa «Mostrar el plan al atleta». Hasta entonces sigue viendo la');
  console.log('pantalla de espera: el plan lo publica el coach, no este script.');
}

const limpiando = process.argv.includes('--limpiar');
console.log(limpiando ? `Borrando los datos de demostración de ${EMAIL}...\n` : `Sembrando ${EMAIL}...\n`);
await (limpiando ? limpiar() : sembrar());
