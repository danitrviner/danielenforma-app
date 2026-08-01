import { describe, it, expect } from 'vitest';
import { detectarDuplicados, filaAContacto, type FilaImportada } from './importar';

// parsearArchivoClientes usa File/read-excel-file/papaparse, que dependen de
// APIs de navegador — se cubre con la importación manual en la app, no aquí.
// Estas pruebas cubren la parte pura y con más superficie de bug: cruzar
// filas contra clientes existentes y convertir una fila parseada en un
// contacto listo para escribir.

function filaBase(overrides: Partial<FilaImportada> = {}): FilaImportada {
  return {
    fila: 2,
    nombre: 'Ana García',
    email: 'ana@example.com',
    dni: '12345678Z',
    direccion: undefined,
    prefijo: '+34',
    numero: '600000000',
    errores: [],
    ...overrides,
  };
}

describe('detectarDuplicados', () => {
  it('avisa por DNI coincidente con un cliente existente', () => {
    const avisos = detectarDuplicados(
      [filaBase()],
      [{ id: 'u1', nombre: 'Ana G.', dni: '12345678Z' }]
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].motivo).toBe('dni');
    expect(avisos[0].clienteExistente.id).toBe('u1');
  });

  it('avisa por email coincidente cuando no hay DNI', () => {
    const avisos = detectarDuplicados(
      [filaBase({ dni: undefined })],
      [{ id: 'u1', nombre: 'Ana G.', email: 'ANA@example.com' }] // mayúsculas: debe ser insensible
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].motivo).toBe('email');
  });

  it('detecta dos filas del propio fichero con el mismo DNI', () => {
    const filas = [filaBase({ fila: 2 }), filaBase({ fila: 3 })];
    const avisos = detectarDuplicados(filas, []);
    // La segunda fila del fichero genera el aviso de duplicado interno.
    expect(avisos.some(a => a.fila.fila === 3 && a.clienteExistente.nombre.includes('este mismo fichero'))).toBe(true);
  });

  it('sin coincidencias no avisa de nada', () => {
    const avisos = detectarDuplicados(
      [filaBase({ dni: '87654321X', email: 'otro@example.com' })],
      [{ id: 'u1', nombre: 'Alguien', dni: '12345678Z', email: 'ana@example.com' }]
    );
    expect(avisos).toHaveLength(0);
  });
});

describe('filaAContacto', () => {
  it('mapea la fila a la forma de CrmContacto', () => {
    const c = filaAContacto(filaBase());
    expect(c.nombre).toBe('Ana García');
    expect(c.email).toBe('ana@example.com');
    expect(c.dni).toBe('12345678Z');
    expect(c.telefono).toEqual({ prefijo: '+34', numero: '600000000' });
    expect(c.estadoCrm).toBe('activo');
  });

  it('sin número no genera objeto telefono', () => {
    const c = filaAContacto(filaBase({ numero: undefined, prefijo: undefined }));
    expect(c.telefono).toBeUndefined();
  });

  it('usa +34 por defecto si hay número pero no prefijo', () => {
    const c = filaAContacto(filaBase({ prefijo: undefined }));
    expect(c.telefono?.prefijo).toBe('+34');
  });
});
