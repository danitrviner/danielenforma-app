/**
 * TEMPORAL · QA de compatibilidad de reglas (Claude, 04-09).
 * Comprueba si la consulta de recetas del CLIENTE VIEJO (el que va dentro de
 * los binarios ya publicados) sobrevive a las reglas NUEVAS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

const ATLETA = 'atleta@enforma.com';
const OWNER_RECETARIO_TODOS = ['recetas', 'indya'];
const UID = 'uidAtleta';

let n = 0;
async function entorno(reglas: string): Promise<RulesTestEnvironment> {
  // Proyecto propio por escenario: el emulador guarda las reglas POR proyecto y
  // el otro fichero de tests corre en paralelo sobre `enforma-reglas-test`.
  const e = await initializeTestEnvironment({
    projectId: `compat-reglas-${++n}`,
    firestore: { rules: reglas, host: '127.0.0.1', port: 8080 },
  });
  // El atleta tiene que EXISTIR como usuario de la app (esUsuarioDeLaApp).
  await e.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'user_profiles', UID), { email: ATLETA, role: 'client' });
    await setDoc(doc(ctx.firestore(), 'recipes', 'r1'), { ownerId: UID, name: 'mia' });
    await setDoc(doc(ctx.firestore(), 'recipes', 'r2'), { ownerId: 'otroUid', name: 'de otro' });
  });
  return e;
}

const reglasNuevas = readFileSync('firestore.rules', 'utf8');
const reglasViejas = execSync('git show origin/main:firestore.rules', { encoding: 'utf8' });

describe('recetas · cliente viejo vs reglas nuevas', () => {
  let env: RulesTestEnvironment;
  afterAll(async () => { await env?.cleanup(); });

  const consultaVieja = (db: any) =>
    getDocs(query(collection(db, 'recipes'), where('ownerId', 'not-in', OWNER_RECETARIO_TODOS)));
  const consultaNueva = (db: any) =>
    getDocs(query(collection(db, 'recipes'), where('ownerId', '==', UID)));

  it('CLIENTE VIEJO + REGLAS VIEJAS = funciona (situación actual)', async () => {
    env = await entorno(reglasViejas);
    const db = env.authenticatedContext('uidAtleta', { email: ATLETA, email_verified: true }).firestore();
    await expect(consultaVieja(db)).resolves.toBeDefined();
    await env.cleanup();
  });

  it('CLIENTE VIEJO + REGLAS NUEVAS = SE ROMPE', async () => {
    env = await entorno(reglasNuevas);
    const db = env.authenticatedContext('uidAtleta', { email: ATLETA, email_verified: true }).firestore();
    await expect(consultaVieja(db)).rejects.toThrow();
    await env.cleanup();
  });

  it('CLIENTE NUEVO + REGLAS VIEJAS = funciona (permite desplegar la app ya)', async () => {
    env = await entorno(reglasViejas);
    const db = env.authenticatedContext('uidAtleta', { email: ATLETA, email_verified: true }).firestore();
    await expect(consultaNueva(db)).resolves.toBeDefined();
    await env.cleanup();
  });

  it('CLIENTE NUEVO + REGLAS NUEVAS = funciona', async () => {
    env = await entorno(reglasNuevas);
    const db = env.authenticatedContext('uidAtleta', { email: ATLETA, email_verified: true }).firestore();
    await expect(consultaNueva(db)).resolves.toBeDefined();
    await env.cleanup();
  });
});
