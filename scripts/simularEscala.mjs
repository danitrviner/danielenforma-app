/**
 * Simulación de escala: 20 atletas, 6 meses de historial, 3-4 entrenos/semana,
 * con dietas, registros y métricas. Corre contra el EMULADOR, nunca producción.
 *
 * Mide cuántos documentos devuelve cada consulta real de la app = lecturas que
 * se pagan. El objetivo no es "¿funciona?" sino "¿cuánto cuesta un día normal
 * cuando esto lleve medio año en marcha?".
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Guardarraíl: este script SIEMBRA MILES DE DOCUMENTOS FALSOS. Si por lo que
// sea apuntara a producción, metería 20 atletas inventados con seis meses de
// historial entre los datos reales. Sin emulador, no se ejecuta.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('ABORTADO: sin FIRESTORE_EMULATOR_HOST. Este script solo corre contra el emulador.');
  process.exit(1);
}
initializeApp({ projectId: 'enforma-sim' });
const db = getFirestore();

const ATLETAS = 20;
const SEMANAS = 104;             // 2 años, para poder proyectar por cortes
const ENTRENOS_SEMANA = 3.5;
const emails = Array.from({ length: ATLETAS }, (_, i) => `atleta${i}@sim.test`);

const dia = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

// ── Sembrado ────────────────────────────────────────────────────────────────
let escritos = 0;
let lote = db.batch(), enLote = 0;
async function set(col, id, data) {
  lote.set(db.collection(col).doc(id), data);
  escritos++;
  if (++enLote >= 450) { await lote.commit(); lote = db.batch(); enLote = 0; }
}
const cerrar = async () => { if (enLote) { await lote.commit(); lote = db.batch(); enLote = 0; } };

console.log(`Sembrando ${ATLETAS} atletas × ${SEMANAS} semanas...`);
for (let a = 0; a < ATLETAS; a++) {
  const email = emails[a];
  await set('user_profiles', `uid${a}`, { userId: `uid${a}`, email, role: 'client', displayName: `Atleta ${a}` });
  await set('onboarding', email, { athleteId: email, targetCalories: 2400 });
  for (let d = 0; d < 3; d++) await set('diets', `diet_${a}_${d}`, { athleteId: email, name: `Dieta ${d}`, meals: [] });
  for (let m = 0; m < 6; m++) await set('mesocycles', `meso_${a}_${m}`, { athleteId: email, name: `Meso ${m}` });

  const totalEntrenos = Math.round(SEMANAS * ENTRENOS_SEMANA);
  for (let w = 0; w < totalEntrenos; w++) {
    const fecha = dia(Math.floor(w * 7 / ENTRENOS_SEMANA));
    await set('workoutAssignments', `wa_${a}_${w}`, {
      athleteId: email, workoutId: `w${w % 10}`, date: fecha, status: 'completed', mesocycleId: `meso_${a}_${w % 6}` });
    await set('workoutLogs', `wl_${a}_${w}`, {
      athleteId: email, workoutId: `w${w % 10}`, date: fecha, entries: [] });
  }
  for (let d = 0; d < SEMANAS * 7; d++) {
    await set('bodyweightLogs',     `bw_${a}_${d}`, { athleteId: email, date: dia(d), weightKg: 75 });
    await set('stepLogs',           `sl_${a}_${d}`, { athleteId: email, date: dia(d), steps: 8000 });
    await set('dietCompletionLogs', `${email}_${dia(d)}`, { athleteId: email, date: dia(d) });
  }
  for (let w = 0; w < SEMANAS; w++) {
    await set('questionnaireResponses', `qr_${a}_${w}`, { athleteId: email, date: dia(w * 7) });
  }
}
await cerrar();
console.log(`Sembrados ${escritos} documentos.\n`);

// ── Medición por horizonte ─────────────────────────────────────────────────
// Una consulta SIN ventana devuelve todo el historial. Para saber qué
// devolvería con una cuenta de X meses, se cuenta lo que hay desde ese corte:
// es exactamente lo que la consulta traería si la cuenta tuviera esa edad.
const C = (c) => db.collection(c);
const e0 = emails[0];
const HORIZONTES = [[6,180],[12,365],[24,730]];

const SIN_VENTANA = [
  ['workoutAssignments','date'], ['workoutLogs','date'],
  ['bodyweightLogs','date'], ['stepLogs','date'], ['dietCompletionLogs','date'],
  ['questionnaireResponses','date'],
];
const FIJAS = [['diets',null],['mesocycles',null]];

console.log('LECTURAS POR SESIÓN DE UN ATLETA, según antigüedad de la cuenta\n');
const porHorizonte = {};
for (const [meses, dias] of HORIZONTES) {
  const corte = dia(dias);
  let total = 0;
  const detalle = [];
  for (const [col] of SIN_VENTANA) {
    const n = (await C(col).where('athleteId','==',e0).where('date','>=',corte).get()).size;
    total += n; detalle.push([col, n]);
  }
  for (const [col] of FIJAS) {
    const n = (await C(col).where('athleteId','==',e0).get()).size;
    total += n; detalle.push([col, n]);
  }
  porHorizonte[meses] = { total, detalle };
}

const cols = [...SIN_VENTANA.map(x=>x[0]), ...FIJAS.map(x=>x[0])];
console.log('  colección'.padEnd(28) + HORIZONTES.map(h=>String(h[0]+'m').padStart(8)).join(''));
cols.forEach((c,idx) => {
  console.log('  '+c.padEnd(26) + HORIZONTES.map(h=>String(porHorizonte[h[0]].detalle[idx][1]).padStart(8)).join(''));
});
console.log('  '+'TOTAL / sesión'.padEnd(26) + HORIZONTES.map(h=>String(porHorizonte[h[0]].total).padStart(8)).join(''));

console.log('\n\nCUOTA DIARIA (20 atletas × 2 sesiones/día, tope 50.000)\n');
for (const [meses] of HORIZONTES) {
  const dia_ = porHorizonte[meses].total * ATLETAS * 2;
  const pct = dia_/50000*100;
  const marca = pct>=100 ? 'SE AGOTA — la app deja de funcionar' : pct>=60 ? 'al límite' : 'ok';
  console.log(`  ${String(meses).padStart(2)} meses: ${String(dia_).padStart(7)} lecturas/día  ${String(pct.toFixed(0)).padStart(4)}%  ${marca}`);
}

console.log('\n\nCONSULTA DEL COACH (pantalla "semana", lote de 15 atletas)\n');
for (const [meses, dias] of HORIZONTES) {
  const lote15 = emails.slice(0,15);
  const todo = (await C('workoutAssignments').where('athleteId','in',lote15).where('date','>=',dia(dias)).get()).size;
  const semana = (await C('workoutAssignments').where('athleteId','in',lote15).where('date','>=',dia(7)).get()).size;
  console.log(`  ${String(meses).padStart(2)} meses: ${String(todo).padStart(6)} docs sin acotar   vs ${semana} si acotara a la semana que muestra`);
}

console.log('\n\nEFECTO DE ACOTAR LOS REGISTROS DIARIOS A 8 SEMANAS\n');
for (const [meses, dias] of HORIZONTES) {
  let sin=0, con=0;
  for (const col of ['bodyweightLogs','stepLogs','dietCompletionLogs']) {
    sin += (await C(col).where('athleteId','==',e0).where('date','>=',dia(dias)).get()).size;
    con += (await C(col).where('athleteId','==',e0).where('date','>=',dia(56)).get()).size;
  }
  console.log(`  ${String(meses).padStart(2)} meses: ${String(sin).padStart(4)} -> ${con} lecturas por sesión`);
}
