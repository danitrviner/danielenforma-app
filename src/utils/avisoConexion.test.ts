import { describe, it, expect } from 'vitest';
import { decidirAviso, textoDelAviso, Señales } from './avisoConexion';

function señales(over: Partial<Señales> = {}): Señales {
  return { estado: 'ok', pendientes: 0, sinRed: false, ...over };
}

describe('decidirAviso — prioridad por daño, no por orden de llegada', () => {
  it('no avisa de nada cuando todo va bien', () => {
    expect(decidirAviso(señales())).toBe('ok');
  });

  it('permisos gana a todo lo demás', () => {
    expect(decidirAviso(señales({ estado: 'permisos', pendientes: 3, sinRed: true }))).toBe('permisos');
  });

  it('modo local gana a encolado: ahí el dato NO se está guardando', () => {
    expect(decidirAviso(señales({ estado: 'red', pendientes: 3, sinRed: true }))).toBe('red');
  });

  it('avisa de encolado con escrituras pendientes aunque el navegador crea que hay red', () => {
    // El caso del wifi de hotel que no enruta: navigator.onLine dice que sí, y
    // sin embargo las escrituras están venciendo el plazo.
    expect(decidirAviso(señales({ pendientes: 2, sinRed: false }))).toBe('encolado');
  });

  it('avisa de encolado sin red aunque todavía no haya nada pendiente', () => {
    // Es el aviso preventivo: la persona entra al gimnasio del sótano y sabe,
    // antes de marcar la primera serie, que puede seguir.
    expect(decidirAviso(señales({ pendientes: 0, sinRed: true }))).toBe('encolado');
  });
});

describe('textoDelAviso — lo que se le dice a la persona', () => {
  it('con el dato a salvo NO dice que no se esté guardando', () => {
    const texto = textoDelAviso('encolado', 2);
    expect(texto).toMatch(/Guardado en el móvil/);
    expect(texto).not.toMatch(/NO se están guardando/);
  });

  it('con el dato en riesgo lo dice sin rodeos', () => {
    expect(textoDelAviso('red', 0)).toMatch(/NO se están guardando/);
    expect(textoDelAviso('permisos', 0)).toMatch(/NO se están guardando/);
  });

  it('el aviso de permisos manda a Dani, no al router de casa', () => {
    // P1-6: mandar a alguien a mirar su wifi cuando el problema está en su
    // cuenta es lo que dejó a un atleta sin poder completar el alta.
    expect(textoDelAviso('permisos', 0)).toMatch(/Avisa a Dani/);
    expect(textoDelAviso('permisos', 0)).not.toMatch(/conexión|cobertura/);
  });

  it('concuerda el singular y el plural', () => {
    expect(textoDelAviso('encolado', 1)).toMatch(/1 cambio pendiente/);
    expect(textoDelAviso('encolado', 4)).toMatch(/4 cambios pendientes/);
  });

  it('sin nada pendiente todavía, invita a seguir en vez de contar cambios', () => {
    const texto = textoDelAviso('encolado', 0);
    expect(texto).toMatch(/puedes seguir/);
    expect(texto).not.toMatch(/\d/);
  });
});
