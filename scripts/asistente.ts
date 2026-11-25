/* ═══════════════════════════════════════════════════════════════════════════
   EL PUENTE DEL ASISTENTE (25-11-2026): las tools de En Forma sin la API.

   El asistente de la app es un modelo llamado por API que usa 51 tools. Esto
   pone ESAS MISMAS tools —mismos lectores, mismos validadores, mismas
   propuestas— al alcance de una sesión de Claude Code en el ordenador de Dani,
   que es quien piensa. No hay llamada de pago: solo cambia quién decide.

   Lo que NO cambia, a propósito:
     · las tools leen con el consentimiento del atleta por delante (despachador);
     · escribir sigue siendo PROPONER: una propuesta en la bandeja de la app,
       con su editor, su antes → después y su deshacer;
     · aprobar aplica con el mismo `aplicarPropuesta` que el botón de la app.

   EN SECO POR DEFECTO. Sin `--escribir` nada toca Firestore: las escrituras
   se interceptan y se enseñan. Así se puede validar una propuesta entera (los
   validadores corren igual) antes de crearla de verdad.

   Uso (desde la raíz del repo):
     npx tsx scripts/asistente.ts tools [texto]
     npx tsx scripts/asistente.ts esquema <tool>
     npx tsx scripts/asistente.ts contexto [prompt|doctrina|perfil|instrucciones]
     npx tsx scripts/asistente.ts guion <mes_nuevo|revision|renovar_mes> <email>
     npx tsx scripts/asistente.ts tool <nombre> '<json>' [--escribir]
     npx tsx scripts/asistente.ts pendientes [email]
     npx tsx scripts/asistente.ts aprobar <idPropuesta> [--nota "…"] [--escribir]
     npx tsx scripts/asistente.ts rechazar <idPropuesta> "<motivo>" [--escribir]
     npx tsx scripts/asistente.ts clips <email> [--n 5] [--completo]
     npx tsx scripts/asistente.ts clips recientes [--n 10]
     npx tsx scripts/asistente.ts clips video <id>

   Credenciales: la cuenta de servicio de En Forma (GOOGLE_APPLICATION_CREDENTIALS,
   ./serviceAccount.json o ~/en-forma/serviceAccount.json). `clips` lee, y solo
   lee, el Firestore de Clips con las de ~/clips/apps/web/.env.local.
   ═══════════════════════════════════════════════════════════════════════════ */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fuenteAdmin, leerDoctrina, leerInstruccionesFijas, uidDelCoach } from '../api/_lib/fuenteAdmin.js';
import { ejecutarEnServidor, lectorDeServidor } from '../api/_lib/ejecutarEnServidor.js';
import { TOOL_DEFINITIONS, executeTool, usarFuenteDeDatos } from '../src/ai/tools.server.js';
import type { FuenteDeDatos } from '../src/ai/tools/datos.js';
import { SYSTEM_PROMPT } from '../src/ai/systemPrompt.js';
import { DOCTRINA_DEFAULTS, buildDoctrinaBlock } from '../src/ai/doctrina.js';
import { renderPerfilProgramacion } from '../src/ai/perfilProgramacion.js';
import { TAREAS } from '../src/ai/tareas.js';
import { aplicarPropuesta } from '../src/autopiloto/aplicarPropuesta.js';
import { hoyIsoLocal, isoLocal } from '../src/utils/trainingWeek.js';
import type { AiProposal } from '../src/types.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Argumentos ───────────────────────────────────────────────────────────────

/** Separa lo posicional de las banderas (`--escribir`, `--n 5`, `--nota "…"`). */
export function leerArgumentos(argv: string[]): { posicionales: string[]; banderas: Record<string, string | true> } {
  const CON_VALOR = new Set(['n', 'nota']);
  const posicionales: string[] = [];
  const banderas: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { posicionales.push(a); continue; }
    const nombre = a.slice(2);
    if (CON_VALOR.has(nombre) && argv[i + 1] !== undefined) banderas[nombre] = argv[++i];
    else banderas[nombre] = true;
  }
  return { posicionales, banderas };
}

/** El JSON de entrada de una tool: literal, `@ruta` a un archivo, o vacío. */
export function leerEntrada(crudo: string | undefined): Record<string, unknown> {
  if (!crudo) return {};
  const texto = crudo.startsWith('@') ? readFileSync(crudo.slice(1), 'utf8') : crudo;
  const valor: unknown = JSON.parse(texto);
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('La entrada de la tool tiene que ser un objeto JSON.');
  return valor as Record<string, unknown>;
}

// ── En seco ──────────────────────────────────────────────────────────────────

export interface Apunte { metodo: string; args: unknown[] }
const ESCRIBE = /^(create|update|append|save|delete|set|add)/;

/** La misma fuente de datos, pero con las ESCRITURAS interceptadas: se apuntan
 *  y devuelven algo con forma (un id de mentira), sin tocar Firestore. Las
 *  lecturas pasan tal cual, así que los validadores ven los datos reales. */
export function fuenteEnSeco(real: FuenteDeDatos, apuntes: Apunte[]): FuenteDeDatos {
  let n = 0;
  return new Proxy(real, {
    get(objetivo, clave) {
      const original = Reflect.get(objetivo, clave) as unknown;
      if (typeof clave !== 'string' || typeof original !== 'function' || !ESCRIBE.test(clave)) return original;
      return async (...args: unknown[]) => {
        apuntes.push({ metodo: clave, args });
        const primero = args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? (args[0] as object) : {};
        return { ...primero, id: `SECO_${++n}` };
      };
    },
  });
}

// ── Conexión ─────────────────────────────────────────────────────────────────

function cuentaDeServicio(): object {
  const candidatas = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    join(RAIZ, 'serviceAccount.json'),
    join(homedir(), 'en-forma', 'serviceAccount.json'),
  ].filter((r): r is string => !!r);
  const ruta = candidatas.find(r => existsSync(r));
  if (!ruta) throw new Error(`No encuentro la cuenta de servicio de En Forma. Probé: ${candidatas.join(' · ')}`);
  return JSON.parse(readFileSync(ruta, 'utf8')) as object;
}

function abrirEnForma() {
  const config = JSON.parse(readFileSync(join(RAIZ, 'firebase-applet-config.json'), 'utf8')) as { firestoreDatabaseId?: string };
  // Sin el id, getFirestore() abriría la base (default), que existe y está vacía.
  if (!config.firestoreDatabaseId) throw new Error('firebase-applet-config.json no trae firestoreDatabaseId.');
  const app = getApps().find(a => a.name === '[DEFAULT]') ?? initializeApp({ credential: cert(cuentaDeServicio()) });
  return getFirestore(app, config.firestoreDatabaseId);
}

/** Variables de un `.env` sencillo (CLAVE=valor, con o sin comillas). */
export function leerEnv(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of texto.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (!m) continue;
    let valor = m[2];
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    salida[m[1]] = valor;
  }
  return salida;
}

function abrirClips() {
  const ruta = join(homedir(), 'clips', 'apps', 'web', '.env.local');
  if (!existsSync(ruta)) throw new Error(`No encuentro las credenciales de Clips en ${ruta}`);
  const env = leerEnv(readFileSync(ruta, 'utf8'));
  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('A ~/clips/apps/web/.env.local le faltan las claves de Firebase.');
  const app = getApps().find(a => a.name === 'clips') ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, 'clips');
  return getFirestore(app);
}

// ── Salida ───────────────────────────────────────────────────────────────────

const decir = (texto: string) => process.stdout.write(`${texto}\n`);
const recorta = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max)}… (+${texto.length - max} caracteres)` : texto);

function enseñarApuntes(apuntes: Apunte[]): void {
  if (apuntes.length === 0) return;
  decir('\n── EN SECO: no se ha escrito nada. Con --escribir se habría escrito: ──');
  for (const a of apuntes) decir(`· ${a.metodo}: ${recorta(JSON.stringify(a.args), 6000)}`);
}

// ── Órdenes ──────────────────────────────────────────────────────────────────

/** Lo que se aprueba desde aquí queda igual que aprobado con el botón de la app. */
async function aprobar(db: FirebaseFirestore.Firestore, fuente: FuenteDeDatos, coachUid: string, id: string, nota: string, escribir: boolean): Promise<void> {
  const snap = await db.collection('aiProposals').doc(id).get();
  if (!snap.exists) throw new Error(`No existe la propuesta ${id}.`);
  const p = { id: snap.id, ...(snap.data() as object) } as AiProposal;
  if (p.status !== 'proposed') throw new Error(`La propuesta ${id} está «${p.status}»: solo se aprueban las pendientes.`);
  const ahora = new Date().toISOString();
  const decision = await aplicarPropuesta(p, lectorDeServidor(fuente), { coachUid, ahora });
  if (decision.ok === false) throw new Error(`No se puede aplicar: ${decision.motivo}`);
  decir(`Propuesta ${id} · ${p.kind} · ${p.athleteId}\n«${p.summary}»`);
  decir(`Operaciones (${decision.operaciones.length}): ${decision.operaciones.map(o => o.tipo).join(', ')}`);
  if (!escribir) {
    decir('\n── EN SECO: no se ha aplicado. Detalle de lo que se escribiría: ──');
    decir(recorta(JSON.stringify(decision.operaciones, null, 1), 12000));
    return;
  }
  const ejec = await ejecutarEnServidor(db, decision.operaciones);
  const resultEntityId = decision.resultEntityId ?? (decision.resultEntityRef ? ejec.refs[decision.resultEntityRef] : undefined);
  const notaLimpia = nota.trim();
  await snap.ref.set({
    status: 'approved', reviewedAt: ahora, aplicadaEn: ahora,
    autor: p.autor ?? 'asistente', politica: p.politica ?? 'proponer',
    snapshotAntes: [...decision.snapshotAntes, ...ejec.creados],
    ...(resultEntityId ? { resultEntityId } : {}),
    ...(notaLimpia ? { expediente: { datos: '', huecos: '', preguntas: [], esperado: '', ...p.expediente, notaAlAprobar: notaLimpia } } : {}),
  }, { merge: true });
  await fuente.appendDossierFacts(p.athleteId, [{
    at: ahora, kind: 'aprobacion', text: notaLimpia ? `${p.summary} — ${notaLimpia}` : p.summary, proposalId: p.id, chatId: p.chatId,
  }]);
  decir(`\nAPLICADA${resultEntityId ? ` (id de lo creado: ${resultEntityId})` : ''}. Se puede deshacer desde Propuestas en la app.`);
}

async function rechazar(db: FirebaseFirestore.Firestore, id: string, motivo: string, escribir: boolean): Promise<void> {
  const snap = await db.collection('aiProposals').doc(id).get();
  if (!snap.exists) throw new Error(`No existe la propuesta ${id}.`);
  const p = { id: snap.id, ...(snap.data() as object) } as AiProposal;
  if (p.status !== 'proposed') throw new Error(`La propuesta ${id} está «${p.status}»: solo se rechazan las pendientes.`);
  const ahora = new Date().toISOString();
  const limpio = motivo.trim();
  const cambio = {
    status: 'rejected', reviewedAt: ahora,
    ...(limpio ? { comentarios: [...(p.comentarios ?? []), { at: ahora, text: `Rechazada: ${limpio}` }] } : {}),
  };
  if (!escribir) { decir(`EN SECO: se rechazaría «${p.summary}»${limpio ? ` con el motivo «${limpio}»` : ''}.`); return; }
  await snap.ref.set(cambio, { merge: true });
  decir(`RECHAZADA «${p.summary}».`);
}

async function pendientes(db: FirebaseFirestore.Firestore, email?: string): Promise<void> {
  const snap = await db.collection('aiProposals').where('status', '==', 'proposed').get();
  const lista = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as AiProposal))
    .filter(p => !email || p.athleteId.toLowerCase() === email.toLowerCase())
    .sort((a, b) => a.athleteId.localeCompare(b.athleteId) || a.createdAt.localeCompare(b.createdAt));
  if (lista.length === 0) { decir('No hay propuestas pendientes.'); return; }
  for (const p of lista) decir(`${p.id} · ${p.athleteId} · ${p.kind} · ${p.createdAt.slice(0, 10)} · ${p.summary}`);
}

/** Clips guarda las fechas como Timestamp de Firestore; los vídeos viejos, como número. */
const aMilis = (x: unknown): number => (typeof x === 'number' ? x : (x as { toMillis?: () => number } | null)?.toMillis?.() ?? 0);

interface VideoDeClips {
  id: string; title?: string; createdAt?: unknown; durationSec?: number | null; status?: string; archived?: boolean;
  clientId?: string | null; athleteEmail?: string | null;
  ai?: { summary?: string; keyPoints?: string[]; tasks?: string[] } | null;
  spokenTasks?: { text: string; t: number }[];
}

const fechaDe = (v: VideoDeClips) => (aMilis(v.createdAt) ? isoLocal(new Date(aMilis(v.createdAt))) : '¿fecha?');
const cabeceraDe = (v: VideoDeClips) =>
  `${fechaDe(v)} · ${v.title ?? '(sin título)'} · ${v.durationSec ? `${Math.round(v.durationSec / 60)} min` : '¿duración?'} · ${v.status ?? ''} · ${v.athleteEmail ?? 'SIN ATLETA ASIGNADO'} · id ${v.id}`;

async function loQueDijo(db: FirebaseFirestore.Firestore, videoId: string): Promise<string> {
  const t = await db.collection('videos').doc(videoId).collection('transcript').doc('main').get();
  return t.exists ? String((t.data() as { fullText?: string }).fullText ?? '') : '';
}

async function enseñarVideo(db: FirebaseFirestore.Firestore, v: VideoDeClips, maxTexto: number): Promise<void> {
  decir(`## ${cabeceraDe(v)}`);
  if (v.spokenTasks?.length) decir(`Tareas que Dani dijo en voz alta:\n${v.spokenTasks.map(t => `- ${t.text} (min ${Math.floor(t.t / 60)}:${String(Math.floor(t.t % 60)).padStart(2, '0')})`).join('\n')}`);
  if (v.ai?.summary) decir(`Resumen: ${v.ai.summary}`);
  if (v.ai?.keyPoints?.length) decir(`Puntos clave:\n${v.ai.keyPoints.map(k => `- ${k}`).join('\n')}`);
  if (v.ai?.tasks?.length) decir(`Tareas del resumen:\n${v.ai.tasks.map(t => `- ${t}`).join('\n')}`);
  const dicho = await loQueDijo(db, v.id);
  decir(dicho ? `Lo que dijo Dani:\n${recorta(dicho, maxTexto)}\n` : '(sin transcripción)\n');
}

/** El feedback hablado de Dani en Clips. Tres formas:
 *    clips <email>         los vídeos asignados a ese atleta, con lo que dijo;
 *    clips recientes       los últimos vídeos, estén asignados o no (para emparejarlos a mano);
 *    clips video <id>      un vídeo entero. */
async function clips(args: string[], cuantos: number, completo: boolean): Promise<void> {
  const db = abrirClips();
  const leer = (docs: FirebaseFirestore.QueryDocumentSnapshot[]): VideoDeClips[] => docs.map(d => ({ id: d.id, ...(d.data() as object) }));
  const porFecha = (a: VideoDeClips, b: VideoDeClips) => aMilis(b.createdAt) - aMilis(a.createdAt);

  if (args[0] === 'video') {
    if (!args[1]) throw new Error('Falta el id del vídeo.');
    const d = await db.collection('videos').doc(args[1]).get();
    if (!d.exists) throw new Error(`Clips no tiene el vídeo ${args[1]}.`);
    await enseñarVideo(db, { id: d.id, ...(d.data() as object) }, Number.MAX_SAFE_INTEGER);
    return;
  }
  if (args[0] === 'recientes') {
    const todos = leer((await db.collection('videos').get()).docs).filter(v => !v.archived).sort(porFecha).slice(0, cuantos);
    decir(`# Últimos ${todos.length} vídeos de Clips\n`);
    for (const v of todos) {
      const dicho = await loQueDijo(db, v.id);
      decir(`- ${cabeceraDe(v)}\n  ${dicho ? `«${recorta(dicho.replace(/\s+/g, ' '), completo ? 2000 : 240)}»` : '(sin transcripción)'}`);
    }
    return;
  }

  const correo = (args[0] ?? '').toLowerCase();
  if (!correo.includes('@')) throw new Error('Uso: clips <email> | clips recientes | clips video <id>');
  const porId = new Map<string, VideoDeClips>();
  for (const v of leer((await db.collection('videos').where('athleteEmail', '==', correo).get()).docs)) porId.set(v.id, v);
  // Los vídeos anteriores al campo `athleteEmail` solo llevan el cliente.
  const clientes = await db.collection('clients').where('enFormaEmail', '==', correo).get();
  for (const c of clientes.docs) for (const v of leer((await db.collection('videos').where('clientId', '==', c.id).get()).docs)) porId.set(v.id, v);

  const videos = [...porId.values()].filter(v => !v.archived).sort(porFecha);
  if (videos.length === 0) { decir(`Clips no tiene vídeos asignados a ${correo}. Prueba «clips recientes»: puede haber vídeos suyos sin asignar.`); return; }
  decir(`# Clips de ${correo}: ${videos.length} vídeo${videos.length === 1 ? '' : 's'} (se enseñan los ${Math.min(cuantos, videos.length)} últimos)\n`);
  for (const v of videos.slice(0, cuantos)) await enseñarVideo(db, v, completo ? Number.MAX_SAFE_INTEGER : 5000);
}

async function principal(): Promise<void> {
  const { posicionales, banderas } = leerArgumentos(process.argv.slice(2));
  const [orden, ...resto] = posicionales;
  const escribir = banderas.escribir === true;

  if (!orden || orden === 'ayuda') {
    decir('Órdenes: tools [texto] · esquema <tool> · contexto [prompt|doctrina|perfil|instrucciones] · guion <tarea> <email> · tool <nombre> \'<json>\' [--escribir] · pendientes [email] · aprobar <id> [--nota "…"] [--escribir] · rechazar <id> "<motivo>" [--escribir] · clips <email>|recientes|video <id> [--n 5] [--completo]');
    return;
  }
  if (orden === 'tools') {
    const filtro = (resto[0] ?? '').toLowerCase();
    for (const t of TOOL_DEFINITIONS) {
      if (filtro && !`${t.name} ${t.description}`.toLowerCase().includes(filtro)) continue;
      decir(`${t.name} — ${recorta(t.description, 220)}`);
    }
    return;
  }
  if (orden === 'esquema') {
    const t = TOOL_DEFINITIONS.find(x => x.name === resto[0]);
    if (!t) throw new Error(`No existe la tool «${resto[0]}». Mira «tools».`);
    decir(`${t.name}\n${t.description}\n\n${JSON.stringify(t.input_schema, null, 1)}`);
    return;
  }
  if (orden === 'clips') {
    await clips(resto, Number(banderas.n) || (resto[0] === 'recientes' ? 10 : 5), banderas.completo === true);
    return;
  }

  const db = abrirEnForma();
  const coachUid = await uidDelCoach(db);
  const real = fuenteAdmin(db, coachUid);

  if (orden === 'contexto') {
    const parte = resto[0];
    const [doctrina, instrucciones, landmarks, rutinas, ejercicios] = await Promise.all([
      leerDoctrina(db, DOCTRINA_DEFAULTS), leerInstruccionesFijas(db), real.getVolumeLandmarks(), real.getWorkouts(), real.getExercises(),
    ]);
    const bloques: Record<string, string> = {
      prompt: SYSTEM_PROMPT,
      doctrina: buildDoctrinaBlock(doctrina.entrenamiento, doctrina.nutricion, landmarks),
      perfil: renderPerfilProgramacion(rutinas, ejercicios),
      instrucciones: instrucciones.trim() ? `# INSTRUCCIONES FIJAS DE DANI (mandan sobre todo lo demás)\n${instrucciones.trim()}` : '# INSTRUCCIONES FIJAS DE DANI\n(no hay ninguna escrita)',
    };
    if (parte && !bloques[parte]) throw new Error(`Parte desconocida: ${parte}. Vale: ${Object.keys(bloques).join(', ')}.`);
    decir((parte ? [bloques[parte]] : Object.values(bloques)).join('\n\n════════════════════════════════════════\n\n'));
    decir(`\nFecha de hoy: ${hoyIsoLocal()}.`);
    return;
  }
  if (orden === 'guion') {
    const tarea = TAREAS.find(t => t.id === resto[0]);
    if (!tarea || !resto[1]) throw new Error(`Uso: guion <${TAREAS.map(t => t.id).join('|')}> <email>`);
    const perfil = await real.getUserProfileByEmail(resto[1]);
    if (!perfil) throw new Error(`No existe ningún cliente con email ${resto[1]}.`);
    decir(tarea.prompt(perfil.displayName ?? resto[1], perfil.email));
    return;
  }
  if (orden === 'pendientes') { await pendientes(db, resto[0]); return; }
  if (orden === 'rechazar') {
    if (!resto[0]) throw new Error('Falta el id de la propuesta.');
    await rechazar(db, resto[0], resto[1] ?? '', escribir);
    return;
  }

  const apuntes: Apunte[] = [];
  const fuente = escribir ? real : fuenteEnSeco(real, apuntes);
  usarFuenteDeDatos(fuente);

  if (orden === 'aprobar') {
    if (!resto[0]) throw new Error('Falta el id de la propuesta.');
    await aprobar(db, fuente, coachUid, resto[0], typeof banderas.nota === 'string' ? banderas.nota : '', escribir);
    return;
  }
  if (orden === 'tool') {
    const nombre = resto[0];
    if (!TOOL_DEFINITIONS.some(t => t.name === nombre)) throw new Error(`No existe la tool «${nombre}». Mira «tools».`);
    const { content, isError } = await executeTool(nombre, leerEntrada(resto[1]), `claude-code_${hoyIsoLocal()}`);
    decir(content);
    if (isError) process.exitCode = 2;
    enseñarApuntes(apuntes);
    return;
  }
  throw new Error(`Orden desconocida: ${orden}. Prueba «ayuda».`);
}

// Solo corre al ejecutarlo, no al importarlo desde un test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Firestore deja conexiones abiertas, así que hay que salir a mano; pero solo
  // cuando la salida se ha vaciado: salir antes corta el texto a los 64 KB si va
  // por una tubería (y `contexto` pasa de eso).
  const salir = (codigo: number) => process.stdout.write('', () => process.exit(codigo));
  principal().then(() => salir(Number(process.exitCode ?? 0)), err => { process.stderr.write(`ERROR: ${(err as Error)?.message ?? err}\n`, () => process.exit(1)); });
}
