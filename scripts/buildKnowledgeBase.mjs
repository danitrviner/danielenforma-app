// Ingesta de la bóveda de Obsidian de Dani hacia la base de conocimiento del
// asistente IA. Lee las notas de metodología (Entrenamiento + Nutrición), quita
// el frontmatter YAML, extrae título y tags, y produce un JSON que Dani importa
// EN LA APP (file-picker → Firestore coach-only). NO se mete en el repo ni en el
// bundle público: son apuntes `interno-only` de cursos de terceros.
//
// Uso:  node scripts/buildKnowledgeBase.mjs
// Salida: ~/Desktop/enforma-knowledge-base.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const VAULT = '/Users/dani/Desktop/Bóveda/Cerebro 1.0/02-Formacion-Cursos';
const SOURCES = [
  { folder: 'entrenamiento', dir: join(VAULT, 'Entrenamiento') },
  { folder: 'nutricion', dir: join(VAULT, 'Nutricion') },
];
const OUT = join(homedir(), 'Desktop', 'enforma-knowledge-base.json');

// Frontmatter YAML mínimo: solo necesitamos `tags: [a, b]`. Parser deliberadamente
// simple (sin dependencias) — la bóveda usa formato consistente.
function parseNote(raw, folder, file) {
  let body = raw;
  let tags = [];
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = raw.slice(fm[0].length);
    const tagLine = fm[1].match(/^tags:\s*\[(.*?)\]/m);
    if (tagLine) tags = tagLine[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const heading = body.match(/^#\s+(.+)$/m);
  const title = heading ? heading[1].trim() : basename(file, '.md').replace(/-/g, ' ');
  return { id: `${folder}/${basename(file, '.md')}`, title, folder, tags, text: body.trim() };
}

const notes = [];
for (const { folder, dir } of SOURCES) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    if (statSync(join(dir, file)).isDirectory()) continue;
    notes.push(parseNote(readFileSync(join(dir, file), 'utf8'), folder, file));
  }
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), notes }, null, 2), 'utf8');
const kb = Math.round(Buffer.byteLength(JSON.stringify(notes)) / 1024);
console.log(`✓ ${notes.length} notas (${kb} KB) → ${OUT}`);
console.log(`  entrenamiento: ${notes.filter(n => n.folder === 'entrenamiento').length} · nutricion: ${notes.filter(n => n.folder === 'nutricion').length}`);
