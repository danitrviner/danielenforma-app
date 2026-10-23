import { describe, it, expect } from 'vitest';
import { clasificarNombre, entradaDelCatalogo, etiquetaDeTipoServicio, CATALOGO_SERVICIOS } from './catalogoServicios';

describe('catálogo de servicios', () => {
  it('es cerrado: trimestral, semestral, anual y otro', () => {
    expect(CATALOGO_SERVICIOS.map(e => e.id)).toEqual(['trimestral', 'semestral', 'anual', 'otro']);
  });
  it('los tres primeros derivan su nombre y su duración; «otro» no', () => {
    expect(entradaDelCatalogo('trimestral')).toMatchObject({ nombre: 'Asesoría trimestral', meses: 3, periodicidad: 'trimestral' });
    expect(entradaDelCatalogo('anual')).toMatchObject({ meses: 12, periodicidad: 'anual' });
    expect(entradaDelCatalogo('otro')).toMatchObject({ nombre: null, meses: null, periodicidad: null });
  });
  it('un servicio sin tipo sale como «Sin clasificar»', () => {
    expect(etiquetaDeTipoServicio(undefined)).toBe('Sin clasificar');
    expect(etiquetaDeTipoServicio('semestral')).toBe('Semestral');
  });
});

describe('clasificarNombre', () => {
  const casos: Array<[string, string, 'segura' | 'dudosa']> = [
    ['Asesoría 3 meses', 'trimestral', 'segura'],
    ['asesoria trimestral', 'trimestral', 'segura'],
    ['Plan TRIMESTRE', 'trimestral', 'segura'],
    ['Programa 90 días', 'trimestral', 'segura'],
    ['Asesoría 6 meses', 'semestral', 'segura'],
    ['Semestral online', 'semestral', 'segura'],
    ['Asesoría anual', 'anual', 'segura'],
    ['Plan 12 meses', 'anual', 'segura'],
    ['Programa 1 año', 'anual', 'segura'],
    ['Sesión suelta', 'otro', 'dudosa'],
    ['Mensual', 'otro', 'dudosa'],
    ['', 'otro', 'dudosa'],
  ];
  it.each(casos)('«%s» → %s (%s)', (nombre, tipo, confianza) => {
    expect(clasificarNombre(nombre)).toEqual({ tipo, confianza });
  });
  it('si el nombre nombra dos duraciones, no adivina', () => {
    expect(clasificarNombre('Asesoría 3 meses o 6 meses')).toEqual({ tipo: 'otro', confianza: 'dudosa' });
  });
  it('las semanas no se traducen solas: «12 semanas» queda para revisar', () => {
    expect(clasificarNombre('Oferta 12 semanas')).toEqual({ tipo: 'otro', confianza: 'dudosa' });
  });
  it('no confunde «13» ni «30 meses» con un tipo', () => {
    expect(clasificarNombre('Plan 13 sesiones')).toEqual({ tipo: 'otro', confianza: 'dudosa' });
    expect(clasificarNombre('Plan 30 meses')).toEqual({ tipo: 'otro', confianza: 'dudosa' });
  });
});

describe('la copia del script de migración da lo mismo', () => {
  it('clasifica igual que clasificarNombre', async () => {
    const mjs = await import('../../../../scripts/_lib/clasificarServicio.mjs');
    for (const nombre of ['Asesoría 3 meses', 'trimestral', 'Plan 6 meses', 'Semestral', 'Asesoría anual', '1 año', '12 meses',
      'Sesión suelta', 'Oferta 12 semanas', '3 o 6 meses', '', 'Plan 30 meses', '52 semanas']) {
      expect(mjs.clasificarNombre(nombre)).toEqual(clasificarNombre(nombre));
    }
  });
});
