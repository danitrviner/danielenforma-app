import { describe, it, expect, beforeEach, vi } from 'vitest';

/* El servicio del CRM que «se guarda» y no aparece (auditoría §1.1).
 *
 * No era el formulario ni la petición: el servicio SÍ llega a Firestore. Lo que
 * falla es la caché de catálogos.
 *
 * `leerCatalogo` sirve la copia local del dispositivo mientras el sello de
 * versión coincida, y `marcarCatalogoCambiado` adelanta el sello LOCAL a
 * propósito, para que el propio dispositivo que acaba de escribir no vuelva a
 * bajarse el catálogo entero. Eso funciona porque Firestore aplica al instante
 * en la caché local las escrituras hechas con addDoc/setDoc/updateDoc/writeBatch
 * (latency compensation).
 *
 * `runTransaction` NO se aplica a la caché local: va al servidor y vuelve, y sin
 * un listener abierto sobre esa colección el documento nuevo no entra en la
 * copia del dispositivo. La secuencia era:
 *
 *   1. createCrmServicioConPago confirma la transacción en el servidor.
 *   2. marcarCatalogoCambiado adelanta el sello local → «mi copia está al día».
 *   3. La siguiente lectura sirve la copia local... SIN el servicio nuevo.
 *
 * Y se quedaba así para siempre en ese navegador, porque el sello local y el
 * remoto coincidían. De ahí el «no aparece en ningún sitio».
 *
 * La regla que fija esto: quien escribe por transacción INVALIDA su sello en
 * vez de adelantarlo. Paga una relectura y ve su propio dato. */

/** localStorage falso: el de Node no trae uno, igual que en almacenLocal.test.ts. */
const almacen: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen[k] ?? null,
  setItem: (k: string, v: string) => { almacen[k] = v; },
  removeItem: (k: string) => { delete almacen[k]; },
  clear: () => { for (const k of Object.keys(almacen)) delete almacen[k]; },
});

const mockSetDoc = vi.fn(async () => {});
vi.mock('../firebase', () => ({
  db: {},
  doc: (...args: unknown[]) => args,
  collection: (...args: unknown[]) => args,
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({ docs: [], size: 0 }),
  getDocsFromCache: async () => ({ docs: [], size: 0 }),
  setDoc: (...args: unknown[]) => mockSetDoc(...(args as [])),
}));

import { marcarCatalogoCambiado, CLAVE_VERSION_LOCAL_PARA_TESTS } from './catalogoVersionado';

const CLAVE = CLAVE_VERSION_LOCAL_PARA_TESTS('crmServicios');

function selloLocal(): { version: string; n: number } | null {
  const raw = localStorage.getItem(CLAVE);
  return raw ? JSON.parse(raw) : null;
}

describe('marcarCatalogoCambiado', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSetDoc.mockClear();
  });

  it('adelanta el sello local en una escritura normal, para no releer el catálogo', () => {
    localStorage.setItem(CLAVE, JSON.stringify({ version: 'v1', n: 13 }));
    return marcarCatalogoCambiado('crmServicios').then(() => {
      const sello = selloLocal();
      expect(sello).not.toBeNull();
      expect(sello!.version).not.toBe('v1');   // adelantado
      expect(sello!.n).toBe(13);               // el recuento se conserva
    });
  });

  it('BORRA el sello local cuando la escritura fue por transacción', async () => {
    // Es el arreglo: sin sello, la siguiente lectura va al servidor y trae el
    // servicio recién creado. Cuesta una lectura y es lo que hay que pagar por
    // ver lo que acabas de guardar.
    localStorage.setItem(CLAVE, JSON.stringify({ version: 'v1', n: 13 }));
    await marcarCatalogoCambiado('crmServicios', { invalidarLocal: true });
    expect(selloLocal()).toBeNull();
  });

  it('avisa igualmente a los demás dispositivos', async () => {
    localStorage.setItem(CLAVE, JSON.stringify({ version: 'v1', n: 13 }));
    await marcarCatalogoCambiado('crmServicios', { invalidarLocal: true });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('sin sello previo no inventa uno', async () => {
    // Un dispositivo que nunca leyó el catálogo no puede afirmar que su copia
    // esté al día.
    await marcarCatalogoCambiado('crmServicios');
    expect(selloLocal()).toBeNull();
  });
});

describe('nadie vuelve a escribir un catálogo por transacción sin invalidar', () => {
  /* Guardia de código, no de comportamiento.
   *
   * El fallo del servicio invisible no se ve leyendo `createCrmServicioConPago`:
   * hay que saber que `leerCatalogo` sirve caché local y que `runTransaction` no
   * la alimenta. Es justo la clase de trampa que alguien vuelve a pisar dentro
   * de seis meses. Este test lee el fuente y se queja.
   *
   * Mira solo lo que viene DESPUÉS de cada transacción, no todo el fichero: las
   * escrituras normales (addDoc/updateDoc/writeBatch) sí alimentan la caché y
   * deben seguir adelantando el sello, que es lo que ahorra las lecturas. */
  it('crm.ts: los sellos que siguen a una transacción invalidan la copia local', async () => {
    const { readFileSync } = await import('fs');
    const lineas = readFileSync(new URL('./crm.ts', import.meta.url), 'utf8').split('\n');

    const sospechosos: string[] = [];
    lineas.forEach((linea, i) => {
      if (!linea.includes('runTransaction(')) return;
      // Hasta el final de esa función, o 60 líneas, lo que llegue antes.
      for (let j = i + 1; j < Math.min(i + 60, lineas.length); j++) {
        if (/^\}/.test(lineas[j])) break;                 // acabó la función
        if (!lineas[j].includes('marcarCatalogoCambiado(')) continue;
        if (!lineas[j].includes('invalidarLocal')) {
          sospechosos.push(`línea ${j + 1}: ${lineas[j].trim()}`);
        }
      }
    });

    expect(sospechosos, [
      'Estos marcados de sello van detrás de una escritura por transacción y no',
      'invalidan la copia local. Una transacción NO entra en la caché del',
      'dispositivo, así que adelantar el sello deja al usuario mirando una copia',
      'sin lo que acaba de guardar (auditoría §1.1). Pasa { invalidarLocal: true }.',
    ].join('\n')).toEqual([]);
  });
});
