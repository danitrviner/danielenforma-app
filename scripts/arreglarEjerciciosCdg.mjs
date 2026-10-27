#!/usr/bin/env node
/**
 * Arreglos de datos de `exercises` detectados en la revisión CDG del 27-10-2026
 * (docs/revision-cdg-2026-10-27.md). SIMULACRO por defecto: enseña qué haría y
 * no toca nada. Con --aplicar escribe (y marca el catálogo como cambiado).
 *
 *  1. Dos ejercicios del catálogo original cuyo id dice «mayor flexión de
 *     rodilla» quedaron, tras la limpieza, con el nombre corto y vinculados al
 *     hip thrust NORMAL (cuentan los pesos equivocados), y crearEjerciciosCdg
 *     creó después el duplicado «-cdg» con el vínculo bueno:
 *       - se restaura el nombre y el `cdgNombre` de los originales;
 *       - se borran los «-cdg» (sin uso en rutinas ni plantillas, 27-10).
 *  2. Nueve fullbody (clean, snatch, push jerk, push press…) no tienen
 *     `muscleGroup`: no cuentan series en ningún grupo. Y a Thruster, Split
 *     jerk y Ring muscle up el grupo «por pesos» les salió un estabilizador.
 *     Solo con --grupos (a la espera del OK de Dani).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/arreglarEjerciciosCdg.mjs [--grupos] [--aplicar]
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb, marcarCatalogoCambiado } from './_lib/firestoreDb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const GRUPOS = args.includes('--grupos')
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Falta GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1) }

const nombresCdg = new Set(JSON.parse(readFileSync(resolve(__dirname, 'cdg/catalogo-cdg.json'), 'utf8')).exercises.map(e => e.exercise))

/** id → campos a escribir (update) */
const ACTUALIZAR = {
  'sys_hip-thrust-mayor-flexion-de-rodilla-maxima-aceleracion': {
    name: 'Hip thrust mayor flexión de rodilla máxima aceleración',
    primaryFocus: 'Hip thrust mayor flexión de rodilla máxima aceleración',
    cdgNombre: 'Hip thrust mayor flexión de rodilla máxima aceleración - Glúteo, lumbares, cuádriceps',
  },
  'sys_hip-thrust-mayor-flexion-de-rodilla-tempo-controlado': {
    name: 'Hip thrust mayor flexión de rodilla tempo controlado',
    primaryFocus: 'Hip thrust mayor flexión de rodilla tempo controlado',
    cdgNombre: 'Hip thrust mayor flexión de rodilla tempo controlado - Glúteo, lumbares, cuádriceps',
  },
  ...(GRUPOS ? {
    // Propuesta (pendiente de Dani). Los 9 fullbody sin grupo son levantamientos
    // olímpicos: el mismo criterio que ya tienen sus hermanos (dumbbell clean,
    // kettlebell clean y snatch → glúteo; los pulls → trapecio).
    'sys_push-jerk': { muscleGroup: 'deltoide_ant', secondaryMuscleGroups: ['triceps', 'cuadriceps', 'gluteo'] },
    'sys_push-press': { muscleGroup: 'deltoide_ant', secondaryMuscleGroups: ['triceps', 'cuadriceps', 'gluteo'] },
    'sys_clean': { muscleGroup: 'gluteo', secondaryMuscleGroups: ['trapecio', 'cuadriceps', 'lumbares'] },
    'sys_hang-clean': { muscleGroup: 'gluteo', secondaryMuscleGroups: ['trapecio', 'cuadriceps', 'lumbares'] },
    'sys_hang-power-clean': { muscleGroup: 'gluteo', secondaryMuscleGroups: ['trapecio', 'cuadriceps', 'lumbares'] },
    'sys_muscle-clean': { muscleGroup: 'trapecio', secondaryMuscleGroups: ['gluteo', 'biceps', 'lumbares'] },
    'sys_dumbbell-snatch': { muscleGroup: 'gluteo', secondaryMuscleGroups: ['deltoide_ant', 'trapecio', 'lumbares'] },
    'sys_muscle-snatch': { muscleGroup: 'trapecio', secondaryMuscleGroups: ['deltoide_ant', 'gluteo', 'lumbares'] },
    'sys_hang-power-snatch': { muscleGroup: 'gluteo', secondaryMuscleGroups: ['deltoide_ant', 'trapecio', 'lumbares'] },
    // Grupo «por pesos» que no tiene sentido (el estabilizador pesa más que el motor).
    'sys_thruster': { muscleGroup: 'cuadriceps', secondaryMuscleGroups: ['deltoide_ant', 'gluteo', 'triceps'] },
    'sys_split-jerk': { muscleGroup: 'deltoide_ant', secondaryMuscleGroups: ['triceps', 'cuadriceps', 'gluteo'] },
    'sys_ring-muscle-up': { muscleGroup: 'dorsal', secondaryMuscleGroups: ['pecho', 'triceps', 'biceps'] },
  } : {}),
}
/** Duplicados creados por crearEjerciciosCdg.mjs: se borran si ninguna rutina ni plantilla los usa. */
const BORRAR = [
  'sys_hip-thrust-mayor-flexion-de-rodilla-maxima-aceleracion-cdg',
  'sys_hip-thrust-mayor-flexion-de-rodilla-tempo-controlado-cdg',
]

const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))

// Comprobación de uso (solo lectura): nunca se borra un ejercicio referenciado.
const usados = new Set()
for (const col of ['workouts', 'mesocycleTemplates']) {
  const snap = await db.collection(col).get()
  for (const d of snap.docs) {
    const x = d.data()
    const lista = col === 'workouts' ? (x.exercises ?? []) : (x.days ?? x.workouts ?? []).flatMap(w => w.exercises ?? [])
    for (const e of lista) usados.add(e.exerciseId)
  }
}

let fallos = 0
const plan = []
for (const [id, campos] of Object.entries(ACTUALIZAR)) {
  const snap = await db.collection('exercises').doc(id).get()
  if (!snap.exists) { console.log(`✘ no existe exercises/${id}`); fallos++; continue }
  if (campos.cdgNombre && !nombresCdg.has(campos.cdgNombre)) { console.log(`✘ ${id}: «${campos.cdgNombre}» no está en el catálogo CDG`); fallos++; continue }
  const actual = snap.data()
  const diff = Object.fromEntries(Object.entries(campos).filter(([k, v]) => JSON.stringify(actual[k]) !== JSON.stringify(v)))
  if (!Object.keys(diff).length) { console.log(`= ${id}: ya está bien`); continue }
  plan.push({ tipo: 'update', id, diff, antes: Object.fromEntries(Object.keys(diff).map(k => [k, actual[k]])) })
}
for (const id of BORRAR) {
  const snap = await db.collection('exercises').doc(id).get()
  if (!snap.exists) { console.log(`= ${id}: ya no existe`); continue }
  if (usados.has(id)) { console.log(`! ${id}: lo usa alguna rutina o plantilla, NO se borra`); fallos++; continue }
  plan.push({ tipo: 'delete', id, antes: { name: snap.data().name, cdgNombre: snap.data().cdgNombre } })
}

console.log(`\n${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'} · ${plan.length} operaciones`)
for (const p of plan) console.log(`  ${p.tipo.padEnd(6)} ${p.id}\n         antes: ${JSON.stringify(p.antes)}${p.diff ? `\n         ahora: ${JSON.stringify(p.diff)}` : ''}`)
if (fallos) console.log(`\n${fallos} comprobaciones fallidas: revisa antes de aplicar.`)
if (!APLICAR || fallos || !plan.length) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(fallos ? 1 : 0) }

const batch = db.batch()
for (const p of plan) {
  const ref = db.collection('exercises').doc(p.id)
  if (p.tipo === 'update') batch.update(ref, p.diff); else batch.delete(ref)
}
await batch.commit()
await marcarCatalogoCambiado(db, 'exercises')
console.log('Hecho. Sello de versión de «exercises» actualizado.')
process.exit(0)
