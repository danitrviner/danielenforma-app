import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const root='/Users/dani/en-forma';
const cfg=JSON.parse(readFileSync(resolve(root,'firebase-applet-config.json'),'utf8'));
initializeApp({credential:cert(JSON.parse(readFileSync(resolve(root,'serviceAccount.json'),'utf8')))});
const db=getFirestore(cfg.firestoreDatabaseId);
const w=await db.collection('workouts').where('mesocycleId','==','dvL7PqeJGL57CsSz8OrD').get();
const docs=w.docs.sort((a,b)=>a.data().name.localeCompare(b.data().name));
for(const d of docs){const x=d.data();console.log(`\n== ${x.name}  (${d.id}) ==`);for(const e of x.exercises||[])console.log(`   ${(e.sets+'x'+(e.reps??e.repRange??'?')).padEnd(9)} ${e.exerciseId}`);}
const m=(await db.collection('mesocycles').doc('dvL7PqeJGL57CsSz8OrD').get()).data();
console.log('\n== distribution.days ==');
for(const day of m.distribution?.days??[]) console.log(`offset=${day.offset??day.dayOffset} tipo=${day.dayType??'-'} series=`, JSON.stringify(day.series??day.assignments??{}));
process.exit(0);
