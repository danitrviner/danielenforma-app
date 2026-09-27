/* READ-ONLY: por qué no sale el curso/clase de TrainingLab en la app del atleta. */
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const courses = (await db.collection('academyCourses').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const lessons = (await db.collection('academyLessons').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const access = (await db.collection('academyAccess').get()).docs.map(d => ({ id: d.id, ...d.data() }));

console.log(`### Cursos (${courses.length})`);
for (const c of courses) {
  const nLessons = lessons.filter(l => l.courseId === c.id).length;
  console.log(`- [${c.published ? 'PUBLICADO' : 'BORRADOR'}] "${c.title}" (id=${c.id}) categoria=${c.category} lessonCount=${c.lessonCount} lecciones_reales=${nLessons} unlockRule=${JSON.stringify(c.unlockRule)}`);
}

console.log(`\n### Lecciones (${lessons.length})`);
for (const l of lessons) {
  const course = courses.find(c => c.id === l.courseId);
  console.log(`- "${l.title}" (id=${l.id}) courseId=${l.courseId} (${course ? course.title : 'CURSO NO EXISTE'}) video=${l.videoProvider}:${l.videoId} order=${l.order}`);
}

console.log(`\n### Accesos concedidos (${access.length})`);
for (const a of access) {
  console.log(`- ${a.id} enabled=${a.enabled} grantedCourses=${a.grantedCourses ? JSON.stringify(a.grantedCourses) : 'todos'} grantedBy=${a.grantedBy}`);
}
