/**
 * Comprueba el catálogo CDG completo contra la hoja real.
 * Uso: npx tsx scripts/cdg/probarCatalogo.mjs [ruta/catalogo-cdg.json]
 * (tsx hace falta porque importa el motor en TypeScript).
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { crearMotor, expandirCatalogo } from '../../src/utils/cdg/motor.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ruta = resolve(process.argv[2] ?? resolve(__dirname, 'catalogo-cdg.json'))
const compacto = JSON.parse(readFileSync(ruta, 'utf8'))
const catalogo = expandirCatalogo(compacto)

let fallos = 0
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fallos++ }

check(catalogo.length === 1034, `1.034 ejercicios (hay ${catalogo.length})`)
check(catalogo.every(e => e.muscleStress.length === 33 && e.muscleStress.every(m => Number.isFinite(m.value))), '33 valores de músculos en todos')
check(catalogo.every(e => e.jointStress.length === 11 && e.jointStress.every(j => Number.isFinite(j.value))), '11 valores de articulaciones en todos')
const nombres = catalogo.map(e => e.exercise)
const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i)
check(repetidos.length === 0, `ningún nombre repetido${repetidos.length ? ': ' + repetidos.slice(0, 5).join(' | ') : ''}`)

const motor = crearMotor(catalogo)
const casos = [
  ['Sentadilla búlgara con mancuernas (dominante rodilla) - Cuádriceps, aductores, glúteo', 4, '10-12', '4x2', 24.76702],
  ['Pike push up con déficit- Deltoides anterior, tríceps', 4, '10-12', '4x2', 9.01756]
]
for (const [nombre, series, reps, esfuerzo, esperado] of casos) {
  const IF = motor.calcularFila({ nombre, series, reps, esfuerzo }).IF
  check(Math.abs(IF - esperado) < 1e-5, `IF ${nombre.slice(0, 30)}… = ${IF} (esperado ${esperado})`)
}
process.exit(fallos ? 1 : 0)
