// Siembra un AÑO completo de datos realistas sobre la cuenta sandbox del
// atleta (atleta@enforma.com, "Marcos Ibáñez" en la consola del coach) para
// revisar la pantalla Roadmap → Calendario antes y durante su implementación.
//
// Por qué esta cuenta y no otra: es la sandbox documentada del propio repo
// (CLAUDE.md · "atleta@enforma.com (email/pwd) para sandbox atleta"), no un
// cliente real — confirmado con Dani. Lo que había en ella (3 mesociclos
// solapados con fechas idénticas, un `targetWeight` de 40 kg, dietas sin
// ítems, tareas tituladas "de prueba") es basura de sesiones de test
// anteriores, no historial real: se borra y se sustituye entero.
//
// Periodización: los 9 bloques y sus fechas replican tal cual los `BLOCKS`/
// `NBLOCKS` del prototipo de diseño (P2 - Roadmap Calendario.dc.html), así
// que hoy (2026-08-28) cae en "Mantenimiento · semana 5 de 7" — el mismo
// estado que muestran las capturas de referencia.
//
// Todo lo que crea lleva `calSeed: true`, así que `--limpiar` lo borra sin
// tocar el perfil, el gimnasio ni la config de nutrición/dieta del atleta.
//
//   node scripts/sembrarCalendarioMarcos.mjs            # siembra
//   node scripts/sembrarCalendarioMarcos.mjs --limpiar  # borra lo sembrado

import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url))));

const EMAIL = 'atleta@enforma.com';
const COACH_UID = 'THa4aRnQQVT2tPXBEqq5yytJxIm1';
const MARCA = { calSeed: true };
const HOY_ISO = '2026-08-28'; // fecha "de hoy" fijada en la sesión — no Date.now() de verdad

// Fechas en hora LOCAL, nunca `toISOString()` — en Europe/Madrid (UTC+1/+2)
// un `new Date('2026-01-01T00:00:00').toISOString()` da '2025-12-31', que es
// justo el desplazamiento de un día que ya documenta `hoyIsoLocal()` en
// src/utils/trainingWeek.ts. Mismo patrón aquí: construir el string desde
// los componentes locales de la fecha, no desde su representación UTC.
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => new Date(s + 'T00:00:00');
const sumaDias = (s, n) => { const x = parseISO(s); x.setDate(x.getDate() + n); return iso(x); };
const diffDias = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

// Hash determinista por string — mismo patrón `rnd()` que el prototipo, para
// que la siembra sea reproducible (repetir el script sin --limpiar de por
// medio da los mismos números).
function rnd(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return ((x >>> 0) % 1000) / 1000;
}

// ── Periodización de entrenamiento — igual que BLOCKS del prototipo ────────────
const BLOQUES = [
  { n: 'Fuerza base',      s: '2026-01-01', e: '2026-02-22', tipo: 'fuerza' },
  { n: 'Hipertrofia I',    s: '2026-02-23', e: '2026-04-05', tipo: 'hipertrofia' },
  { n: 'Descarga',         s: '2026-04-06', e: '2026-04-19', tipo: 'descarga' },
  { n: 'Hipertrofia II',   s: '2026-04-20', e: '2026-05-31', tipo: 'hipertrofia' },
  { n: 'Definición',       s: '2026-06-01', e: '2026-07-26', tipo: 'definicion' },
  { n: 'Mantenimiento',    s: '2026-07-27', e: '2026-09-13', tipo: 'mantenimiento' },
  { n: 'Fuerza máxima',    s: '2026-09-14', e: '2026-11-01', tipo: 'fuerza' },
  { n: 'Descarga',         s: '2026-11-02', e: '2026-11-15', tipo: 'descarga' },
  { n: 'Definición',       s: '2026-11-16', e: '2026-12-31', tipo: 'definicion' },
];

// ── Periodización de nutrición — igual que NBLOCKS del prototipo ───────────────
const FASES_NUTRI = [
  { n: 'Volumen controlado',  s: '2026-01-01', e: '2026-02-22', kcal: 2600, tipo: 'superavit',     pesoObjetivo: 79 },
  { n: 'Superávit +250',      s: '2026-02-23', e: '2026-04-05', kcal: 2850, tipo: 'superavit',     pesoObjetivo: 81 },
  { n: 'Mantenimiento',       s: '2026-04-06', e: '2026-04-19', kcal: 2500, tipo: 'mantenimiento', pesoObjetivo: 81 },
  { n: 'Superávit +250',      s: '2026-04-20', e: '2026-05-31', kcal: 2850, tipo: 'superavit',     pesoObjetivo: 83 },
  { n: 'Déficit −400',        s: '2026-06-01', e: '2026-07-26', kcal: 2100, tipo: 'deficit',       pesoObjetivo: 77 },
  { n: 'Mantenimiento',       s: '2026-07-27', e: '2026-09-13', kcal: 2350, tipo: 'mantenimiento', pesoObjetivo: 76.5 },
  { n: 'Superávit ligero',    s: '2026-09-14', e: '2026-11-01', kcal: 2700, tipo: 'superavit',     pesoObjetivo: 78 },
  { n: 'Mantenimiento',       s: '2026-11-02', e: '2026-11-15', kcal: 2500, tipo: 'mantenimiento', pesoObjetivo: 78 },
  { n: 'Déficit −400',        s: '2026-11-16', e: '2026-12-31', kcal: 2100, tipo: 'deficit',       pesoObjetivo: 75 },
];

// ── Rutinas — mismos 4 días y mismos ids de ejercicio ya verificados que usa
// sembrarAtletaDemo.mjs. Se reutiliza el MISMO pool de rutinas durante todo
// el año (como haría un coach real con un split que no cambia, solo la
// carga) — la variación de fase la aporta `factorDeFase()`.
const RUTINAS = [
  { nombre: 'Empuje A · Pecho y hombro', ejercicios: [
    { exerciseId: 'sys_press-banca-declinado-caja-toracica-plana', muscleGroup: 'pecho', sets: 4, reps: '6-8', rir: 2, restSeconds: 150, kg: 60 },
    { exerciseId: 'sys_press-de-hombros-en-maquina-pendular', muscleGroup: 'deltoide_ant', sets: 3, reps: '8-10', rir: 2, restSeconds: 120, kg: 35 },
    { exerciseId: 'sys_elevaciones-laterales-con-mancuernas', muscleGroup: 'deltoide_lat', sets: 4, reps: '12-15', rir: 1, restSeconds: 75, kg: 9 },
    { exerciseId: 'sys_extensiones-de-triceps-en-polea-alta-con-cuerda', muscleGroup: 'triceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 75, kg: 25 },
  ] },
  { nombre: 'Pierna · Cuádriceps', ejercicios: [
    { exerciseId: 'sys_sentadilla-hack-pies-abajo', muscleGroup: 'cuadriceps', sets: 4, reps: '6-8', rir: 2, restSeconds: 180, kg: 80 },
    { exerciseId: 'sys_peso-muerto-rumano', muscleGroup: 'isquios', sets: 3, reps: '8-10', rir: 2, restSeconds: 150, kg: 70 },
    { exerciseId: 'sys_prensa-pendular-pies-abajo-menor-dorsiflexion', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 120, kg: 120 },
    { exerciseId: 'sys_elevaciones-de-talones-en-prensa', muscleGroup: 'gemelo', sets: 4, reps: '12-15', rir: 1, restSeconds: 60, kg: 90 },
  ] },
  { nombre: 'Tirón A · Espalda', ejercicios: [
    { exerciseId: 'sys_jalon-estable-en-polea-alta-agarre-ancho-prono', muscleGroup: 'dorsal', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 55 },
    { exerciseId: 'sys_remo-en-maquina-ascendente-agarre-prono', muscleGroup: 'trapecio', sets: 4, reps: '8-10', rir: 2, restSeconds: 120, kg: 50 },
    { exerciseId: 'sys_facepull-dominante-de-deltoides-posterior', muscleGroup: 'deltoide_post', sets: 3, reps: '12-15', rir: 1, restSeconds: 75, kg: 20 },
    { exerciseId: 'sys_curl-de-biceps-con-barra-z', muscleGroup: 'biceps', sets: 3, reps: '10-12', rir: 1, restSeconds: 75, kg: 22 },
  ] },
  { nombre: 'Pierna · Cadera', ejercicios: [
    { exerciseId: 'sys_hip-thrust-tempo-controlado', muscleGroup: 'gluteo', sets: 4, reps: '8-10', rir: 2, restSeconds: 150, kg: 85 },
    { exerciseId: 'sys_zancadas-estaticas-en-multipower-dominante-rodilla', muscleGroup: 'cuadriceps', sets: 3, reps: '10-12', rir: 2, restSeconds: 120, kg: 40 },
    { exerciseId: 'sys_curl-femoral-en-polea-tumbado', muscleGroup: 'isquios', sets: 3, reps: '10-12', rir: 1, restSeconds: 90, kg: 30 },
    { exerciseId: 'sys_crunch-abdominal-con-flexion-de-cadera', muscleGroup: 'core', sets: 3, reps: '12-15', rir: 1, restSeconds: 60, kg: 10 },
  ] },
];

// Grupos musculares completos — MuscleGroupConfig por grupo, requerido por
// el tipo Mesocycle.groups (Record<MuscleGroup, MuscleGroupConfig>).
const TODOS_LOS_GRUPOS = [
  'pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post',
  'biceps', 'triceps', 'antebrazo', 'cuadriceps', 'isquios', 'gluteo',
  'aductores', 'gemelo', 'core', 'lumbares', 'rotadores',
];
function gruposPorDefecto() {
  const series = { pecho: 13, dorsal: 12, trapecio: 12, deltoide_ant: 11, deltoide_lat: 10, deltoide_post: 11, biceps: 10, triceps: 9, cuadriceps: 13, isquios: 9, gluteo: 8 };
  const g = {};
  for (const grupo of TODOS_LOS_GRUPOS) g[grupo] = { series: series[grupo] ?? 0, priority: 'media' };
  return g;
}

// ── Dietas — 4 perfiles reutilizados por varias fases con kcal parecidas,
// mismo patrón de 5 comidas que sembrarAtletaDemo.mjs (etiquetas literales
// del banco de alimentos). El `targetKcal` que se ve en el calendario sale
// de NutritionPhase, no de la dieta — el presupuesto de la dieta solo tiene
// que ser plausible para ese rango de kcal.
function comidasBase(escala) {
  const base = [
    { name: 'Desayuno', items: [['MIX_HC', '250ml leche semidesnatada', 1], ['HC', '30g arroz, pasta, couscous o quinoa', 2], ['GRASA', '20g chocolate +72% (2 onzas)', 1]] },
    { name: 'Media mañana', items: [['PROT', '120g queso cottage light', 1], ['HC', '150g uvas', 1]] },
    { name: 'Comida', items: [['PROT', '80g carne roja magra (sin grasa)', 2], ['HC', '120g boniato', 2], ['GRASA', '100g tomate frito estilo casero', 1]] },
    { name: 'Merienda', items: [['MIX_HC', '1 yogurt natural (125-140g)', 1], ['HC', '30g papilla de cereales sin azúcares añadidos', 1]] },
    { name: 'Cena', items: [['MIX_GRASA', '65g pescado azul', 2], ['HC', '60g yuca', 1], ['GRASA', '15g mantequilla', 1]] },
  ];
  return base.map((c, i) => ({
    id: `comida_${i + 1}`,
    name: c.name,
    items: c.items.map(([category, foodLabel, quantity]) => ({ category, foodLabel, quantity: Math.max(1, Math.round(quantity * escala)) })),
  }));
}
function presupuestoDe(comidas) {
  const p = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const c of comidas) for (const it of c.items) p[it.category] += it.quantity;
  return p;
}

// Cardio — un par de sesiones de Zona 2 a la semana, todo el año.
const TIPOS_CARDIO = ['zona2', 'intervalos'];

// ── Utilidades de borrado ───────────────────────────────────────────────────

async function borrarPorMarca(coleccion, campo = 'athleteId') {
  const snap = await db.collection(coleccion).where(campo, '==', EMAIL).where('calSeed', '==', true).get();
  const CHUNK = 450;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + CHUNK)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.size;
}

async function limpiar() {
  let total = 0;
  for (const col of ['mesocycles', 'workoutAssignments', 'workoutLogs', 'diets', 'bodyweightLogs',
    'dietCompletionLogs', 'cardioSessions', 'tasks', 'progressPhotos', 'questionnaireAssignments']) {
    const n = await borrarPorMarca(col);
    console.log(`  ${col}: ${n} borrados`);
    total += n;
  }
  const rutinas = await db.collection('workouts').where('ownerId', '==', COACH_UID).where('calSeed', '==', true).get();
  const batch = db.batch();
  for (const d of rutinas.docs) batch.delete(d.ref);
  if (rutinas.size > 0) await batch.commit();
  console.log(`  workouts: ${rutinas.size} borrados`);
  total += rutinas.size;

  const np = await db.collection('nutritionPrograms').doc(EMAIL).get();
  if (np.exists && np.data().calSeed) { await np.ref.delete(); console.log('  nutritionPrograms: 1 borrado'); total++; }

  const rm = await db.collection('roadmaps').doc(EMAIL).get();
  if (rm.exists && rm.data().calSeed) { await rm.ref.delete(); console.log('  roadmaps: 1 borrado'); total++; }

  console.log(`\nTotal: ${total} documentos. Perfil, gimnasio y config de nutrición no se tocan.`);
}

// ── Siembra ──────────────────────────────────────────────────────────────────

async function sembrar() {
  console.log(`Sembrando un año de datos de calendario sobre ${EMAIL}…\n`);

  // 0 · Limpieza previa — lo que hay hoy son 3 mesociclos de test solapados
  // y basura de sesiones anteriores, no historial real. Se sustituye entero.
  console.log('Limpiando datos anteriores de esta cuenta (marcados y sin marcar, de esta prueba)…');
  for (const col of ['mesocycles', 'workoutAssignments', 'workoutLogs', 'diets', 'bodyweightLogs',
    'dietCompletionLogs', 'cardioSessions', 'tasks', 'progressPhotos', 'questionnaireAssignments']) {
    const snap = await db.collection(col).where('athleteId', '==', EMAIL).get();
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    if (snap.size > 0) await batch.commit();
    console.log(`  ${col}: ${snap.size} borrados`);
  }
  const rutinasViejas = await db.collection('workouts').where('ownerId', '==', COACH_UID).get();
  {
    const batch = db.batch();
    for (const d of rutinasViejas.docs) batch.delete(d.ref);
    if (rutinasViejas.size > 0) await batch.commit();
    console.log(`  workouts (todas las del coach de prueba): ${rutinasViejas.size} borrados`);
  }
  console.log();

  // 1 · Rutinas — un pool fijo de 4, reutilizado todo el año.
  const idsRutina = [];
  for (const rutina of RUTINAS) {
    const ref = db.collection('workouts').doc();
    await ref.set({
      ownerId: COACH_UID,
      name: rutina.nombre,
      tags: ['Calendario · ejemplo'],
      exercises: rutina.ejercicios.map((e, i) => ({
        exerciseId: e.exerciseId, order: i, sets: e.sets, reps: e.reps,
        restSeconds: e.restSeconds, rir: e.rir, muscleGroup: e.muscleGroup,
      })),
      ...MARCA,
    });
    idsRutina.push(ref.id);
  }
  console.log(`✔ ${idsRutina.length} rutinas`);

  // 2 · Mesociclos — uno por bloque de periodización, con `phaseType` para
  // que el calendario coloree por tipo sin tener que adivinarlo del texto.
  const idsMeso = [];
  let numero = 1;
  for (const b of BLOQUES) {
    const semanas = Math.round(diffDias(b.s, b.e) / 7) + 1;
    const ref = db.collection('mesocycles').doc();
    await ref.set({
      athleteId: EMAIL,
      number: numero++,
      startDate: b.s,
      objective: b.n,
      phaseType: b.tipo,
      daysPerWeek: 4,
      groups: gruposPorDefecto(),
      weeks: semanas,
      ...(b.tipo === 'descarga' ? { deloadWeek: 1 } : {}),
      ...MARCA,
    });
    idsMeso.push({ id: ref.id, ...b, semanas });
  }
  console.log(`✔ ${idsMeso.length} mesociclos (${BLOQUES[0].s} — ${BLOQUES.at(-1).e})`);

  // 3 · Asignaciones + logs de entreno — lunes/martes/jueves/viernes todo el
  // año. Pasado: completado / parcial / saltado según hash determinista.
  // Futuro (incl. hoy en adelante): pendiente, sin log.
  const DIAS_SESION = [1, 2, 4, 5]; // lun, mar, jue, vie (1=lunes)
  let nAsign = 0, nLogs = 0;
  const batchesAsignLogs = [];
  let batchActual = db.batch();
  let opsEnBatch = 0;
  const push = op => {
    op(batchActual);
    opsEnBatch++;
    if (opsEnBatch >= 400) { batchesAsignLogs.push(batchActual); batchActual = db.batch(); opsEnBatch = 0; }
  };

  for (const meso of idsMeso) {
    // Progresión de carga acumulada desde el inicio del año hasta el inicio
    // de este bloque, +2 %/semana dentro del bloque — así la carga sube todo
    // el año, no solo dentro de cada mesociclo suelto.
    const semanasDesdeInicio = diffDias('2026-01-01', meso.s) / 7;
    const factorBase = 1 + 0.012 * semanasDesdeInicio;

    let cursor = parseISO(meso.s);
    const fin = parseISO(meso.e);
    let semanaEnBloque = 0;
    while (cursor <= fin) {
      const lunes = iso(cursor);
      const factorSemana = factorBase + 0.02 * semanaEnBloque;
      // Semana de descarga: menos volumen, no menos peso — se salta el 4º día.
      const diasEstaSemanaSem = meso.tipo === 'descarga' ? DIAS_SESION.slice(0, 3) : DIAS_SESION;

      for (let d = 0; d < diasEstaSemanaSem.length; d++) {
        const fecha = sumaDias(lunes, diasEstaSemanaSem[d] - 1);
        if (parseISO(fecha) > parseISO(meso.e)) continue;
        const esFuturo = fecha >= HOY_ISO;
        const r = rnd(fecha + '-' + d);

        const asigRef = db.collection('workoutAssignments').doc();
        let status = 'pending';
        if (!esFuturo) {
          status = r < 0.72 ? 'completed' : r < 0.88 ? 'completed' /* parcial: log recortado */ : 'skipped';
        }
        push(b => b.set(asigRef, {
          workoutId: idsRutina[d], athleteId: EMAIL, date: fecha, status,
          mesocycleId: meso.id, ...MARCA,
        }));
        nAsign++;

        if (!esFuturo && status === 'completed') {
          const esParcial = r >= 0.72 && r < 0.88;
          const rutina = RUTINAS[d];
          const ejerciciosAIncluir = esParcial ? rutina.ejercicios.slice(0, Math.max(1, rutina.ejercicios.length - 1)) : rutina.ejercicios;
          const logRef = db.collection('workoutLogs').doc();
          push(b => b.set(logRef, {
            athleteId: EMAIL, workoutId: idsRutina[d], assignmentId: asigRef.id, mesocycleId: meso.id,
            date: fecha, completedAt: `${fecha}T19:${20 + d}:00.000Z`,
            entries: ejerciciosAIncluir.map(e => {
              const [min, max] = e.reps.split('-').map(Number);
              const tope = max ?? min;
              const setsAIncluir = esParcial ? Math.max(1, e.sets - 1) : e.sets;
              const carga = Math.round((e.kg * factorSemana) / 2.5) * 2.5;
              return {
                exerciseId: e.exerciseId,
                sets: Array.from({ length: setsAIncluir }, (_, s) => ({
                  weight: carga,
                  repsDone: Math.max(min, tope - Math.floor(s / 2)),
                  rir: Math.max(0, e.rir - (s === setsAIncluir - 1 ? 1 : 0)),
                })),
              };
            }),
            ...MARCA,
          }));
          nLogs++;
        }
      }
      cursor.setDate(cursor.getDate() + 7);
      semanaEnBloque++;
    }
  }
  if (opsEnBatch > 0) batchesAsignLogs.push(batchActual);
  for (const b of batchesAsignLogs) await b.commit();
  console.log(`✔ ${nAsign} asignaciones · ${nLogs} entrenos registrados`);

  // 4 · Peso corporal — cada 3-4 días, con la tendencia de la fase de
  // nutrición vigente en cada fecha (sube en superávit, baja en déficit).
  {
    const batch1 = db.batch();
    let n = 0, pesoAnterior = 78; // arranque del año
    let cursor = parseISO('2026-01-01');
    const hoy = parseISO(HOY_ISO);
    while (cursor <= hoy) {
      const fecha = iso(cursor);
      const fase = FASES_NUTRI.find(f => fecha >= f.s && fecha <= f.e) ?? FASES_NUTRI[0];
      const objetivoDiario = fase.pesoObjetivo;
      // Se acerca un poco cada log al objetivo de la fase + ruido de báscula.
      pesoAnterior += (objetivoDiario - pesoAnterior) * 0.06 + (rnd(fecha) - 0.5) * 0.3;
      const ref = db.collection('bodyweightLogs').doc();
      batch1.set(ref, { athleteId: EMAIL, date: fecha, weight: Math.round(pesoAnterior * 10) / 10, kind: 'daily', createdAt: `${fecha}T07:30:00.000Z`, ...MARCA });
      n++;
      cursor.setDate(cursor.getDate() + 3);
    }
    await batch1.commit();
    console.log(`✔ ${n} registros de peso`);
  }

  // 5 · Programa de nutrición + 4 dietas reutilizadas por kcal parecidas.
  const dietaPorKcal = new Map(); // kcal objetivo del PERFIL de dieta -> {id, escala}
  async function dietaParaKcal(kcalFase) {
    // Perfiles de dieta a 2100/2350/2600/2850 kcal — cada fase usa el más
    // cercano, el número exacto que ve el coach sale de `targetKcal` en la
    // fase, no de la dieta.
    const perfiles = [2100, 2350, 2600, 2850];
    const kcalPerfil = perfiles.reduce((a, b) => Math.abs(b - kcalFase) < Math.abs(a - kcalFase) ? b : a);
    if (dietaPorKcal.has(kcalPerfil)) return dietaPorKcal.get(kcalPerfil);
    const escala = kcalPerfil / 2350;
    const comidas = comidasBase(escala);
    const ref = db.collection('diets').doc();
    await ref.set({
      athleteId: EMAIL, name: `Plan · ${kcalPerfil} kcal`,
      budget: presupuestoDe(comidas), meals: comidas,
      coachNote: 'Los hidratos de la merienda van pegados al entreno.',
      ...MARCA,
    });
    dietaPorKcal.set(kcalPerfil, ref.id);
    return ref.id;
  }

  const fasesConDieta = [];
  for (const f of FASES_NUTRI) fasesConDieta.push({ ...f, dietId: await dietaParaKcal(f.kcal) });

  await db.collection('nutritionPrograms').doc(EMAIL).set({
    athleteId: EMAIL,
    startDate: FASES_NUTRI[0].s,
    phases: fasesConDieta.map((f, i) => ({
      id: `fase_${i + 1}`, name: f.n, weeks: Math.round(diffDias(f.s, f.e) / 7) + 1,
      dietId: f.dietId, targetWeight: f.pesoObjetivo, targetKcal: f.kcal, phaseType: f.tipo,
    })),
    lastSeenPhaseId: 'fase_1',
    ...MARCA,
  });
  console.log(`✔ programa de nutrición · ${dietaPorKcal.size} dietas · ${fasesConDieta.length} fases`);

  // 6 · Adherencia a la dieta — 4 de cada 5 días marcados, todo el año hasta hoy.
  {
    const batches = [];
    let batch = db.batch(); let ops = 0;
    let cursor = parseISO('2026-01-01');
    const hoy = parseISO(HOY_ISO);
    let n = 0;
    while (cursor <= hoy) {
      const fecha = iso(cursor);
      const fase = fasesConDieta.find(f => fecha >= f.s && fecha <= f.e) ?? fasesConDieta[0];
      const comidasDeLaDieta = comidasBase(1); // misma estructura para contar ids
      const r = rnd(fecha + 'diet');
      if (r > 0.12) { // ~88% de los días con algún registro
        const hechos = [];
        comidasDeLaDieta.forEach((c, ci) => c.items.forEach((_, ii) => {
          const saltaEsteItem = rnd(fecha + ci + ii) < 0.12; // ~88% adherencia media
          if (!saltaEsteItem) hechos.push(`${c.id}_${ii}`);
        }));
        const ref = db.collection('dietCompletionLogs').doc(`${EMAIL}_${fecha}`);
        batch.set(ref, { athleteId: EMAIL, date: fecha, dietId: fase.dietId, doneItemIds: hechos, ...MARCA });
        ops++; n++;
        if (ops >= 400) { batches.push(batch); batch = db.batch(); ops = 0; }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (ops > 0) batches.push(batch);
    for (const b of batches) await b.commit();
    console.log(`✔ ${n} días de adherencia a la dieta`);
  }

  // 7 · Cardio — Zona 2 los miércoles, intervalos los sábados, desde marzo.
  {
    const batches = []; let batch = db.batch(); let ops = 0; let n = 0;
    let cursor = parseISO('2026-03-01');
    const hoy = parseISO(HOY_ISO);
    while (cursor <= hoy) {
      const dow = cursor.getDay(); // 0=dom..6=sáb
      if (dow === 3 || dow === 6) {
        const fecha = iso(cursor);
        const r = rnd(fecha + 'cardio');
        if (r > 0.2) { // ~80% de las sesiones programadas se hacen
          const esIntervalos = dow === 6;
          const duracionMin = esIntervalos ? 28 + Math.round(r * 12) : 35 + Math.round(r * 20);
          const fcMedia = esIntervalos ? 148 + Math.round(r * 20) : 128 + Math.round(r * 14);
          const ref = db.collection('cardioSessions').doc();
          batch.set(ref, {
            athleteId: EMAIL, type: esIntervalos ? 'intervalos' : 'zona2', date: fecha,
            startedAt: `${fecha}T08:00:00.000Z`, durationSec: duracionMin * 60,
            avgHR: fcMedia, maxHR: fcMedia + 18,
            timeInZoneSec: esIntervalos
              ? { z1: 0, z2: 300, z3: 400, z4: duracionMin * 60 - 700, z5: 0 }
              : { z1: 120, z2: duracionMin * 60 - 240, z3: 120, z4: 0, z5: 0 },
            samples: [], sampleIntervalSec: 5,
            ...MARCA,
          });
          ops++; n++;
          if (ops >= 400) { batches.push(batch); batch = db.batch(); ops = 0; }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (ops > 0) batches.push(batch);
    for (const b of batches) await b.commit();
    console.log(`✔ ${n} sesiones de cardio`);
  }

  // 8 · Tareas (revisiones/cuestionarios/fotos) — una cada 2-3 semanas + fin
  // de cada mesociclo, estado 'done' en el pasado y 'pending' desde hoy.
  {
    const batch = db.batch();
    let n = 0;
    const hitos = [
      { fecha: '2026-01-15', tipo: 'revision', titulo: 'Revisión con coach' },
      { fecha: '2026-02-22', tipo: 'revision', titulo: 'Test de fuerza' },
      { fecha: '2026-03-01', tipo: 'foto',     titulo: 'Foto de progreso' },
      { fecha: '2026-04-06', tipo: 'cuestionario', titulo: 'Cambio de plan de nutrición' },
      { fecha: '2026-05-16', tipo: 'revision', titulo: 'Revisión con coach' },
      { fecha: '2026-06-20', tipo: 'foto',     titulo: 'Foto de progreso' },
      { fecha: '2026-07-27', tipo: 'cuestionario', titulo: 'Cambio de plan de nutrición' },
      { fecha: '2026-08-08', tipo: 'revision', titulo: 'Revisión con coach' },
      { fecha: '2026-08-19', tipo: 'revision', titulo: 'Test de fuerza · fecha clave' },
      { fecha: '2026-08-30', tipo: 'foto',     titulo: 'Foto de progreso' },
      { fecha: '2026-09-12', tipo: 'revision', titulo: 'Revisión de cierre de bloque' },
      { fecha: '2026-10-17', tipo: 'revision', titulo: 'Revisión con coach' },
      { fecha: '2026-11-14', tipo: 'revision', titulo: 'Competición · objetivo' },
      { fecha: '2026-12-19', tipo: 'foto',     titulo: 'Foto de progreso' },
    ];
    for (const h of hitos) {
      const ref = db.collection('tasks').doc();
      batch.set(ref, {
        athleteId: EMAIL, type: h.tipo, title: h.titulo, dueDate: h.fecha,
        status: h.fecha < HOY_ISO ? 'done' : 'pending',
        createdBy: 'coach', createdAt: `${h.fecha}T08:00:00.000Z`,
        ...MARCA,
      });
      n++;
    }
    await batch.commit();
    console.log(`✔ ${n} tareas/hitos`);
  }

  // 9 · Fotos de progreso — placeholder https (sin subida real a Storage);
  // solo lo que necesita el calendario para el chip "Foto de progreso subida".
  {
    const fechas = ['2026-03-01', '2026-06-20', '2026-08-30', '2026-12-19'];
    const batch = db.batch();
    for (const fecha of fechas) {
      const ref = db.collection('progressPhotos').doc(`${EMAIL}_${fecha}_front`);
      batch.set(ref, {
        id: `${EMAIL}_${fecha}_front`, athleteId: EMAIL, date: fecha, view: 'front',
        url: `https://placehold.co/480x640/141414/FFC72C?text=${fecha}`,
        uploadedAt: `${fecha}T09:00:00.000Z`, ...MARCA,
      });
    }
    await batch.commit();
    console.log(`✔ ${fechas.length} fotos de progreso (placeholder, sin Storage real)`);
  }

  // 10 · Roadmap — objetivos/hitos con fecha, para que "Añadir hito" y la
  // rejilla del calendario tengan algo real que mostrar además de las tareas.
  await db.collection('roadmaps').doc(EMAIL).set({
    athleteId: EMAIL,
    items: [
      { id: 'hito_1', title: 'Test de fuerza · fin de Fuerza base', type: 'hito', lane: 'entreno', targetDate: '2026-02-22', status: 'logrado' },
      { id: 'hito_2', title: 'Cambio a Definición', type: 'hito', lane: 'nutricion', targetDate: '2026-06-01', status: 'logrado' },
      { id: 'hito_3', title: 'Competición · objetivo', type: 'objetivo', lane: 'general', targetDate: '2026-11-14', status: 'pendiente' },
    ],
    ...MARCA,
  });
  console.log('✔ roadmap con 3 hitos/objetivos');

  // 11 · Cuestionarios asignados — usa plantillas REALES del coach (no
  // inventadas), igual que hará "Aplicar al bloque" en el calendario.
  const REVISION_SEMANAL_ID = 'MMGzc05JfMnUDAXW76I9';
  const MEDICIONES_ID = 'h4bp7kzC0vwR8f9KIe1l';
  const DOMS_ID = 'P0gRajHwto1Lw68cn178';
  const ahoraISO = new Date(HOY_ISO + 'T12:00:00.000Z').toISOString();
  const asignaciones = [
    { questionnaireId: REVISION_SEMANAL_ID, schedule: { type: 'weekdays', weekdays: [1] }, startDate: '2026-07-27' },
    { questionnaireId: MEDICIONES_ID, schedule: { type: 'monthly', dayOfMonth: 1 }, startDate: '2026-07-27' },
    { questionnaireId: DOMS_ID, schedule: { type: 'weekdays', weekdays: [5] }, startDate: '2026-07-27' },
  ];
  {
    const batch = db.batch();
    for (const a of asignaciones) {
      const ref = db.collection('questionnaireAssignments').doc();
      batch.set(ref, { ...a, athleteId: EMAIL, active: true, createdAt: ahoraISO, ...MARCA });
    }
    await batch.commit();
    console.log(`✔ ${asignaciones.length} cuestionarios asignados (plantillas reales del coach)`);
  }

  console.log('\nListo. Cuenta: atleta@enforma.com · contraseña ya existente (sandbox del repo).');
  console.log('Para borrar todo lo sembrado: node scripts/sembrarCalendarioMarcos.mjs --limpiar');
}

const modo = process.argv[2];
if (modo === '--limpiar') {
  limpiar().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
} else {
  sembrar().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
