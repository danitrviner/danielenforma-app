import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const doc1 = await db.collection('catalogos').doc('academyCourses').get();
const doc2 = await db.collection('catalogos').doc('academyLessons').get();
console.log('academyCourses version doc:', doc1.exists ? doc1.data() : 'NO EXISTE');
console.log('academyLessons version doc:', doc2.exists ? doc2.data() : 'NO EXISTE');
