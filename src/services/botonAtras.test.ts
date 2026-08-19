import { describe, it, expect, beforeEach, vi } from 'vitest';

// El módulo importa @capacitor/app y @capacitor/core, que fuera de un móvil no
// tienen nada que hacer. Se sustituyen por lo mínimo, y `isNativePlatform`
// devuelve false para que ninguna prueba registre listeners de verdad.
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), exitApp: vi.fn() } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

const { apilarCerrador, fijarManejadorDeRuta, manejarAtras, _reiniciarPila } =
  await import('./botonAtras');

beforeEach(() => { _reiniciarPila(); });

describe('manejarAtras — manda la capa de más arriba', () => {
  it('sin capas abiertas, decide la ruta', () => {
    const ruta = vi.fn();
    fijarManejadorDeRuta(ruta);

    manejarAtras(true);

    expect(ruta).toHaveBeenCalledWith(true);
  });

  it('con una capa abierta, la cierra y NO navega', () => {
    const ruta = vi.fn();
    const cerrarSheet = vi.fn();
    fijarManejadorDeRuta(ruta);
    apilarCerrador(cerrarSheet);

    manejarAtras(true);

    expect(cerrarSheet).toHaveBeenCalledOnce();
    // Este es el bug de 07-9 en una línea: antes se navegaba por debajo y el
    // overlay se quedaba flotando sobre otra pantalla.
    expect(ruta).not.toHaveBeenCalled();
  });

  it('con dos capas, cierra la de arriba y deja la de abajo', () => {
    const sheet = vi.fn();
    const dialogoDentroDelSheet = vi.fn();
    apilarCerrador(sheet);
    apilarCerrador(dialogoDentroDelSheet);

    manejarAtras(true);

    expect(dialogoDentroDelSheet).toHaveBeenCalledOnce();
    expect(sheet).not.toHaveBeenCalled();
  });

  it('cerradas las capas una a una, vuelve a mandar la ruta', () => {
    const ruta = vi.fn();
    fijarManejadorDeRuta(ruta);
    const quitarA = apilarCerrador(vi.fn());
    const quitarB = apilarCerrador(vi.fn());

    quitarB();
    quitarA();
    manejarAtras(false);

    expect(ruta).toHaveBeenCalledWith(false);
  });
});

describe('apilarCerrador — el desapilado no puede descolocar la pila', () => {
  it('quitar la capa de ABAJO deja mandando a la de arriba', () => {
    // Pasa de verdad: un Sheet que se desmonta por un cambio de datos mientras
    // tiene encima un Dialog de confirmación. Si se desapilara por posición en
    // vez de por identidad, se quitaría el Dialog y mandaría el Sheet muerto.
    const sheet = vi.fn();
    const dialogo = vi.fn();
    const quitarSheet = apilarCerrador(sheet);
    apilarCerrador(dialogo);

    quitarSheet();
    manejarAtras(true);

    expect(dialogo).toHaveBeenCalledOnce();
    expect(sheet).not.toHaveBeenCalled();
  });

  it('quitar dos veces la misma capa no se lleva por delante a otra', () => {
    const primera = vi.fn();
    const segunda = vi.fn();
    const quitarPrimera = apilarCerrador(primera);
    apilarCerrador(segunda);

    quitarPrimera();
    quitarPrimera(); // React puede limpiar dos veces en StrictMode

    manejarAtras(true);
    expect(segunda).toHaveBeenCalledOnce();
  });

  it('sin capas ni manejador de ruta, no revienta', () => {
    expect(() => manejarAtras(true)).not.toThrow();
  });
});
