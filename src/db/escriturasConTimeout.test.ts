import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// core.ts importa `../firebase`, que al cargarse inicializa la app real. En un
// test eso no aporta nada y ata la prueba a que haya credenciales, así que se
// sustituye por lo mínimo que core.ts toca al importarse.
vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: null },
  onAuthStateChanged: () => () => {},
  // App Check se carga con `import()` en la app real y `authReady` espera a
  // esta promesa (ver core.ts). Aquí resuelve sin más: el test no prueba nada
  // de App Check, solo necesita que el módulo se pueda importar.
  appCheckListo: Promise.resolve(),
}));

const { conTimeout, EscrituraEncolada, escriturasPendientes, suscribirEscriturasPendientes } =
  await import('./core');

/* El contador de pendientes es estado de módulo, y eso es lo correcto en la
   app: una escritura encolada en la pantalla de entreno tiene que encender el
   mismo aviso que vea el resto de la app. En las pruebas obliga a dejarlo a
   cero al terminar cada una, o la siguiente hereda lo que dejó la anterior.
   De ahí `abrirEscritura`: registra cada promesa controlada y `afterEach` las
   cierra todas. */

interface Controlada {
  promesa: Promise<string>;
  resolver: (v: string) => void;
  rechazar: (e: unknown) => void;
  cerrada: boolean;
}

let abiertas: Controlada[] = [];

function abrirEscritura(): Controlada {
  let resolver!: (v: string) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<string>((res, rej) => { resolver = res; rechazar = rej; });
  const c: Controlada = {
    promesa,
    resolver: v => { c.cerrada = true; resolver(v); },
    rechazar: e => { c.cerrada = true; rechazar(e); },
    cerrada: false,
  };
  abiertas.push(c);
  return c;
}

/** Vence el plazo y devuelve el error, sin dejar rechazos sin manejar. */
async function vencer(carrera: Promise<unknown>): Promise<unknown> {
  const capturado = carrera.catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(8000);
  return capturado;
}

beforeEach(() => { vi.useFakeTimers(); abiertas = []; });

afterEach(async () => {
  for (const c of abiertas) if (!c.cerrada) c.resolver('cierre de la prueba');
  await vi.advanceTimersByTimeAsync(0);
  expect(escriturasPendientes()).toBe(0); // ninguna prueba deja basura a la siguiente
  vi.useRealTimers();
});

describe('conTimeout — el camino feliz no cambia', () => {
  it('devuelve el valor si el servidor confirma a tiempo', async () => {
    await expect(conTimeout('Guardar', Promise.resolve('ok'))).resolves.toBe('ok');
    expect(escriturasPendientes()).toBe(0);
  });

  it('deja subir el error real si la escritura falla de verdad', async () => {
    const fallo = new Error('permission-denied');
    await expect(conTimeout('Guardar', Promise.reject(fallo))).rejects.toBe(fallo);
    // Un fallo real NO es una escritura pendiente de sincronizar.
    expect(escriturasPendientes()).toBe(0);
  });

  it('no vence si la confirmación llega en el último momento', async () => {
    const c = abrirEscritura();
    const carrera = conTimeout('Guardar', c.promesa);

    await vi.advanceTimersByTimeAsync(7900);
    c.resolver('llegó justo');

    await expect(carrera).resolves.toBe('llegó justo');
    expect(escriturasPendientes()).toBe(0);
  });
});

describe('conTimeout — la escritura que no vuelve', () => {
  it('lanza EscrituraEncolada a los 8 s en vez de colgarse para siempre', async () => {
    const c = abrirEscritura();
    const error = await vencer(conTimeout('Guardar el entrenamiento', c.promesa));

    expect(error).toBeInstanceOf(EscrituraEncolada);
  });

  it('el mensaje dice que está guardado, no que haya fallado', async () => {
    const c = abrirEscritura();
    const error = await vencer(conTimeout('Guardar el entrenamiento', c.promesa));

    expect((error as Error).message).toMatch(/guardado en este dispositivo/);
    expect((error as Error).message).not.toMatch(/error|fall/i);
  });
});

describe('conTimeout — contador de pendientes', () => {
  it('cuenta la escritura vencida y la descuenta cuando por fin sincroniza', async () => {
    const c = abrirEscritura();
    await vencer(conTimeout('Guardar', c.promesa));
    expect(escriturasPendientes()).toBe(1);

    // Vuelve la conexión y Firestore confirma: el aviso debe apagarse solo,
    // sin que nadie sondee nada.
    c.resolver('confirmado tarde');
    await vi.advanceTimersByTimeAsync(0);
    expect(escriturasPendientes()).toBe(0);
  });

  it('también descuenta si la escritura encolada acaba fallando', async () => {
    const c = abrirEscritura();
    await vencer(conTimeout('Guardar', c.promesa));
    expect(escriturasPendientes()).toBe(1);

    // Un rechazo tardío no puede dejar el contador clavado: el banner se
    // quedaría encendido el resto de la sesión sin nada pendiente de verdad.
    c.rechazar(new Error('rechazada por reglas'));
    await vi.advanceTimersByTimeAsync(0);
    expect(escriturasPendientes()).toBe(0);
  });

  it('suma varias escrituras encoladas a la vez', async () => {
    const a = abrirEscritura();
    const b = abrirEscritura();
    const carreraA = conTimeout('A', a.promesa).catch((e: unknown) => e);
    const carreraB = conTimeout('B', b.promesa).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(8000);
    await Promise.all([carreraA, carreraB]);
    expect(escriturasPendientes()).toBe(2);

    a.resolver('ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(escriturasPendientes()).toBe(1);

    b.resolver('ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(escriturasPendientes()).toBe(0);
  });

  it('avisa a los suscriptores al encolar y al sincronizar', async () => {
    const avisos: number[] = [];
    const baja = suscribirEscriturasPendientes(() => avisos.push(escriturasPendientes()));

    const c = abrirEscritura();
    await vencer(conTimeout('Guardar', c.promesa));
    c.resolver('ok');
    await vi.advanceTimersByTimeAsync(0);

    expect(avisos).toEqual([1, 0]);
    baja();
  });

  it('la baja de la suscripción deja de avisar', async () => {
    let avisos = 0;
    const baja = suscribirEscriturasPendientes(() => { avisos++; });
    baja();

    const c = abrirEscritura();
    await vencer(conTimeout('Guardar', c.promesa));

    expect(avisos).toBe(0);
  });
});
