// Parseo de .xlsx / .csv para la importación de clientes. Puro: no toca
// Firestore. La escritura por lotes vive en src/db/crm.ts
// (`importarCrmContactosBatch`), que sí es la única pieza con efectos.
//
// Por qué `read-excel-file` y no `xlsx` (SheetJS): la versión publicada en npm
// del paquete `xlsx` es la 0.18.5 de 2022, con CVEs conocidas sin parchear ahí
// (prototype pollution, ReDoS) — SheetJS movió las versiones arregladas a su
// propio CDN, que las reglas de este proyecto prohíben usar. `read-excel-file`
// solo lee (no necesitamos escribir .xlsx) y no arrastra dependencias de
// filesystem de Node, así que además pesa menos en el bundle del navegador.

// `readSheet` (no el `readXlsxFile` por defecto) porque este último siempre
// devuelve TODAS las hojas del libro (`Sheet[]`); a la importación solo le
// interesa la primera, que es la que produce cualquier exportación normal de
// "mis clientes" desde una hoja de cálculo.
import { readSheet } from 'read-excel-file/browser';
import Papa from 'papaparse';
import { normalizarDni, esDniValido } from './identidad';
import { parseFechaFlexible } from './fechas';
import type { EstadoCrm } from '../types';

export interface FilaImportada {
  fila: number;              // número de fila en el fichero original (1 = cabecera)
  nombre: string;
  email?: string;
  dni?: string;
  direccion?: string;
  prefijo?: string;
  numero?: string;
  errores: string[];         // vacío ⇒ fila válida
}

export interface ResultadoParseo {
  filas: FilaImportada[];
  validas: FilaImportada[];
  conError: FilaImportada[];
  cabecerasNoReconocidas: string[];
}

// Nombres de columna aceptados por campo, en minúsculas y sin acentos. El
// coach exporta de sitios distintos (hoja de cálculo propia, CRM anterior) y
// cada uno nombra las columnas a su manera — esto cubre las variantes
// razonables sin obligar a una plantilla exacta.
const ALIAS_COLUMNAS: Record<string, string[]> = {
  nombre: ['nombre', 'nombre completo', 'cliente', 'nombre y apellidos'],
  email: ['email', 'correo', 'correo electronico', 'mail'],
  dni: ['dni', 'nif', 'nie', 'documento'],
  direccion: ['direccion', 'domicilio'],
  prefijo: ['prefijo', 'codigo pais', 'prefijo telefono'],
  numero: ['telefono', 'movil', 'numero', 'numero telefono'],
};

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizarCabecera(s: string): string {
  return sinAcentos(String(s ?? '').trim().toLowerCase());
}

function mapearCabeceras(cabeceras: string[]): {
  indices: Partial<Record<keyof typeof ALIAS_COLUMNAS, number>>;
  noReconocidas: string[];
} {
  const norm = cabeceras.map(normalizarCabecera);
  const indices: Partial<Record<keyof typeof ALIAS_COLUMNAS, number>> = {};
  const usadas = new Set<number>();

  for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
    const idx = norm.findIndex(h => alias.includes(h));
    if (idx !== -1) {
      indices[campo as keyof typeof ALIAS_COLUMNAS] = idx;
      usadas.add(idx);
    }
  }

  const noReconocidas = cabeceras.filter((_, i) => !usadas.has(i) && cabeceras[i]?.trim());
  return { indices, noReconocidas };
}

function celda(fila: unknown[], idx?: number): string {
  if (idx == null) return '';
  const v = fila[idx];
  if (v == null) return '';
  // read-excel-file devuelve Date para celdas con formato fecha de Excel.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function construirFila(fila: unknown[], numFila: number, idx: ReturnType<typeof mapearCabeceras>['indices']): FilaImportada {
  const nombre = celda(fila, idx.nombre);
  const email = celda(fila, idx.email);
  const dniRaw = celda(fila, idx.dni);
  const direccion = celda(fila, idx.direccion);
  const prefijo = celda(fila, idx.prefijo);
  const numero = celda(fila, idx.numero);

  const errores: string[] = [];
  if (!nombre) errores.push('Falta el nombre');

  const dni = dniRaw ? normalizarDni(dniRaw) : undefined;
  if (dni && !esDniValido(dni)) errores.push(`DNI «${dniRaw}» no válido (letra de control incorrecta)`);

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push(`Email «${email}» no parece válido`);

  return {
    fila: numFila,
    nombre,
    email: email || undefined,
    dni,
    direccion: direccion || undefined,
    prefijo: prefijo || undefined,
    numero: numero || undefined,
    errores,
  };
}

async function leerXlsx(file: File): Promise<unknown[][]> {
  return readSheet(file);
}

function leerCsv(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      complete: results => resolve(results.data as unknown[][]),
      error: reject,
      skipEmptyLines: true,
    });
  });
}

export async function parsearArchivoClientes(file: File): Promise<ResultadoParseo> {
  const esCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  const filas = esCsv ? await leerCsv(file) : await leerXlsx(file);

  if (filas.length === 0) {
    return { filas: [], validas: [], conError: [], cabecerasNoReconocidas: [] };
  }

  const [cabecera, ...datos] = filas;
  const { indices, noReconocidas } = mapearCabeceras((cabecera as unknown[]).map(String));

  if (indices.nombre == null) {
    // Sin columna de nombre no hay nada que hacer — se reporta como cabecera
    // no reconocida en vez de intentar adivinar filas sin sentido.
    return {
      filas: [],
      validas: [],
      conError: [],
      cabecerasNoReconocidas: ['nombre (obligatoria, no encontrada)', ...noReconocidas],
    };
  }

  const filasParsed = datos
    .map((fila, i) => construirFila(fila, i + 2, indices)) // +2: fila 1 es cabecera, humano cuenta desde 1
    .filter(f => f.nombre || f.email || f.dni); // descarta filas totalmente vacías (huecos al final del fichero)

  return {
    filas: filasParsed,
    validas: filasParsed.filter(f => f.errores.length === 0),
    conError: filasParsed.filter(f => f.errores.length > 0),
    cabecerasNoReconocidas: noReconocidas,
  };
}

// ── Duplicados ────────────────────────────────────────────────────────────────

export interface AvisoDuplicado {
  fila: FilaImportada;
  clienteExistente: { id: string; nombre: string };
  motivo: 'dni' | 'email';
}

/**
 * Cruza las filas válidas contra los clientes ya existentes. Por DNI (fuerte:
 * dos DNIs iguales son la misma persona con certeza) y por email (más débil:
 * se avisa igual, pero no bloquea). No muta nada — solo informa; quien decide
 * si importar duplicados es el coach, en la pantalla de preview.
 */
export function detectarDuplicados(
  filas: FilaImportada[],
  existentes: { id: string; nombre: string; dni?: string; email?: string }[]
): AvisoDuplicado[] {
  const porDni = new Map<string, { id: string; nombre: string }>();
  const porEmail = new Map<string, { id: string; nombre: string }>();
  for (const c of existentes) {
    if (c.dni) porDni.set(c.dni, { id: c.id, nombre: c.nombre });
    if (c.email) porEmail.set(c.email.toLowerCase(), { id: c.id, nombre: c.nombre });
  }

  const avisos: AvisoDuplicado[] = [];
  const dnisVistosEnFichero = new Set<string>();

  for (const fila of filas) {
    if (fila.dni) {
      // Duplicado dentro del propio fichero (dos filas con el mismo DNI).
      if (dnisVistosEnFichero.has(fila.dni)) {
        avisos.push({ fila, clienteExistente: { id: '', nombre: '(otra fila de este mismo fichero)' }, motivo: 'dni' });
      }
      dnisVistosEnFichero.add(fila.dni);

      const match = porDni.get(fila.dni);
      if (match) { avisos.push({ fila, clienteExistente: match, motivo: 'dni' }); continue; }
    }
    if (fila.email) {
      const match = porEmail.get(fila.email.toLowerCase());
      if (match) avisos.push({ fila, clienteExistente: match, motivo: 'email' });
    }
  }
  return avisos;
}

export function filaAContacto(fila: FilaImportada, estadoCrm: EstadoCrm = 'activo') {
  return {
    nombre: fila.nombre,
    email: fila.email,
    dni: fila.dni,
    direccion: fila.direccion,
    telefono: fila.numero ? { prefijo: fila.prefijo || '+34', numero: fila.numero } : undefined,
    estadoCrm,
    origen: 'importación',
  };
}

// Exportado por si en el futuro se quiere convertir una fecha de una columna
// adicional (p.ej. fecha de alta) durante la importación de servicios — hoy
// `parsearArchivoClientes` no la usa, pero vive junto al resto del parseo.
export { parseFechaFlexible };
