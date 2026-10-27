/* Catálogo de alimentos (N-04) para los scripts de recetas (N-05).
 *
 * Con `--catalogo alimentos.csv` se lee del CSV de Dani (no toca Firestore);
 * con `--catalogo-json catalogo.json`, de un volcado JSON de `AlimentoCatalogo[]`.
 * Sin ninguno, se lee de Firestore con GOOGLE_APPLICATION_CREDENTIALS. */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { abrirDb } from './firestoreDb.mjs';
import { validarCsv, COLECCION_CATALOGO, type AlimentoCatalogo, type TrozoCatalogo } from '../../src/utils/catalogoAlimentos';

export async function cargarCatalogoAlimentos(args: string[]): Promise<{ lista: AlimentoCatalogo[]; origen: string }> {
  const j = args.indexOf('--catalogo-json');
  if (j >= 0) {
    const archivo = args[j + 1];
    if (!archivo) throw new Error('Falta el archivo después de --catalogo-json.');
    const lista = JSON.parse(readFileSync(resolve(archivo), 'utf8')) as AlimentoCatalogo[];
    if (!Array.isArray(lista)) throw new Error(`${archivo} no es una lista de alimentos.`);
    return { lista, origen: `JSON ${archivo}` };
  }
  const i = args.indexOf('--catalogo');
  if (i >= 0) {
    const archivo = args[i + 1];
    if (!archivo) throw new Error('Falta el archivo después de --catalogo.');
    const { alimentos, erroresGenerales, filas } = validarCsv(readFileSync(resolve(archivo), 'utf8'));
    if (erroresGenerales.length) throw new Error(erroresGenerales.join(' '));
    const malas = filas.filter(f => f.errores.length > 0).length;
    return { lista: alimentos, origen: `CSV ${archivo}${malas ? ` (${malas} filas con error, ignoradas)` : ''}` };
  }
  const sa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!sa) throw new Error('Falta GOOGLE_APPLICATION_CREDENTIALS (o usa --catalogo alimentos.csv).');
  const db = abrirDb(JSON.parse(readFileSync(resolve(sa), 'utf8')));
  const snap = await db.collection(COLECCION_CATALOGO).get();
  const lista = snap.docs.filter(d => d.id.startsWith('trozo_')).flatMap(d => (d.data() as TrozoCatalogo).alimentos ?? []);
  return { lista, origen: 'Firestore' };
}

/** Quita `--catalogo <archivo>`, `--catalogo-json <archivo>` y los `--flags` para quedarse con los argumentos sueltos. */
export function argumentosSueltos(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--catalogo' || args[i] === '--catalogo-json') { i++; continue; }
    if (!args[i].startsWith('--')) out.push(args[i]);
  }
  return out;
}
