// Actualiza el apartado 7 de la doctrina de NUTRICIÓN que Dani tiene guardada
// en Firestore (coachSettings/doctrinaNutricion) al criterio del 28-10-2026:
// proteína 1,6-2,2 g/kg (2,0-2,4 en déficit), grasa ~0,6 g/kg (0,8 en déficit).
//
// Por qué un script y no el default: `getDoctrina` lee el documento guardado
// (02-09-2026) y solo cae al texto por defecto de ai/doctrina.ts si no existe.
// Cambiar el default no cambia lo que lee el modelo. Solo toca el §7 y solo si
// está EXACTAMENTE como estaba (si Dani lo editó, no se pisa: se avisa).
//
// Simulacro por defecto. `--aplicar` escribe, y solo cuando Dani lo diga.
//   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/actualizarDoctrinaProteina.mjs [--aplicar]
import { readFileSync } from 'node:fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const credenciales = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credenciales) { console.error('Falta GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const aplicar = process.argv.includes('--aplicar');
const db = abrirDb(JSON.parse(readFileSync(credenciales, 'utf8')));

const VIEJO = `### 7. Proteína y grasa
Proteína: 0,8-1 g/kg de peso al día en volumen o mantenimiento. En déficit sube a 1-1,4 g/kg, y
cuanto MÁS profundo sea el déficit y más magro esté el atleta, más cerca del techo de 1,4.
Este es mi criterio, y está por debajo del rango que se cita habitualmente en la industria
(1,6-2,2 g/kg): no me lo discutas en cada propuesta, aplícalo.
Grasa: en torno a 0,6 g/kg, y nunca por debajo del 15-20% de las calorías totales.`;

const NUEVO = `### 7. Proteína y grasa
Proteína: 1,6-2,2 g/kg de peso al día (el alta de la app la calcula a 2 g/kg: ese es el punto de
partida). En déficit sube hacia 2,0-2,4 g/kg, y cuanto MÁS profundo sea el déficit y más magro esté
el atleta, más cerca del techo. Por debajo de 1,6 no propongas; por encima de 2,6 tampoco: a partir
de ahí no hay más músculo y sí menos hidratos.
Grasa: en torno a 0,6 g/kg (0,8 en déficit), y nunca por debajo del 15-20% de las calorías totales.`;

const ref = db.collection('coachSettings').doc('doctrinaNutricion');
const snap = await ref.get();
if (!snap.exists) { console.log('No hay doctrina guardada: el modelo ya lee el default nuevo. Nada que hacer.'); process.exit(0); }
const texto = snap.data().text ?? '';
if (texto.includes(NUEVO)) { console.log('Ya está actualizada.'); process.exit(0); }
if (!texto.includes(VIEJO)) {
  console.log('El §7 guardado NO es el texto original: Dani lo editó. No se toca. Revísalo a mano en Ajustes › Doctrina.');
  const i = texto.indexOf('### 7'); console.log(texto.slice(i, i + 600));
  process.exit(2);
}
const actualizado = texto.replace(VIEJO, NUEVO);
console.log(aplicar ? 'APLICANDO…' : 'SIMULACRO (añade --aplicar para escribir)');
console.log('--- §7 nuevo ---\n' + NUEVO);
if (aplicar) {
  await ref.set({ text: actualizado, updatedAt: new Date().toISOString() }, { merge: true });
  console.log('Escrito en coachSettings/doctrinaNutricion.');
}
