import { describe, it, expect } from 'vitest';
import { Exercise, MuscleGroup } from '../types';
import {
  getOrigen,
  grupoSugeridoPorOrigen,
  ordenarParaRevision,
  tieneInglesSinTraducir,
} from './ejerciciosOrigen';

const ej = (id: string, extra: Partial<Exercise> = {}): Exercise => ({
  id,
  ownerId: 'system',
  name: extra.name ?? id,
  primaryFocus: 'pecho',
  type: 'fuerza',
  isCustom: false,
  ...extra,
});

describe('getOrigen', () => {
  it('devuelve el nombre en inglés y la categoría de un importado real', () => {
    // ID real del catálogo: el cruce vídeo→Firestore lo hace el generador, y si
    // se rompiera la revisión perdería su única referencia de verdad.
    expect(getOrigen('e4G25WLd8o6HwfqbIeDy')).toEqual({
      nombreOriginal: 'Cable Hip Abduction',
      categoria: 'Abductores',
    });
  });

  it('devuelve null para los 40 escritos a mano, que no vienen de la importación', () => {
    expect(getOrigen('sys_pecho_press-de-banca-con-barra')).toBeNull();
  });
});

describe('tieneInglesSinTraducir', () => {
  it('detecta los corchetes que dejó el traductor por diccionario', () => {
    expect(tieneInglesSinTraducir(ej('a', { name: 'Contracción de pecho [stacked]' }))).toBe(true);
  });

  it('no marca un nombre limpio', () => {
    expect(tieneInglesSinTraducir(ej('a', { name: 'Press de banca con barra' }))).toBe(false);
  });
});

describe('grupoSugeridoPorOrigen', () => {
  it('traduce las categorías que mapean sin ambigüedad', () => {
    expect(grupoSugeridoPorOrigen('kwwQDNLaU9et7CNWsNba')).toBe('pecho');   // 'Pecho'
    expect(grupoSugeridoPorOrigen('zmkvlf0uJkxda12KfEjd')).toBe('biceps');  // 'Bíceps'
  });

  it('no inventa grupo cuando la categoría de origen es ambigua', () => {
    // 'Hombros' cubre tres grupos tipados (deltoides ant./lat./post.) y
    // 'Cuerpo Completo' no es ninguno. Devolver null es deliberado: heredar una
    // equivalencia inventada es justo el error que esta revisión viene a
    // arreglar.
    expect(grupoSugeridoPorOrigen('qaoFkIjT4E1lvzlGTA36')).toBeNull(); // 'Hombros'
    expect(grupoSugeridoPorOrigen('jR1ZUyQKILRoGPIA4bBd')).toBeNull(); // 'Cuerpo Completo'
  });

  it('devuelve null para un ID que no viene de la importación', () => {
    expect(grupoSugeridoPorOrigen('sys_pecho_press-de-banca-con-barra')).toBeNull();
  });
});

describe('ordenarParaRevision', () => {
  const orden: MuscleGroup[] = ['pecho', 'dorsal', 'core'];

  it('pone primero los que ya se usan en rutinas', () => {
    const lista = [
      ej('sin-usar', { muscleGroup: 'pecho' }),
      ej('usado', { muscleGroup: 'core' }),
    ];
    const r = ordenarParaRevision(lista, new Set(['usado']), orden);
    expect(r[0].id).toBe('usado');
  });

  it('agrupa por grupo muscular siguiendo el orden del macrociclo', () => {
    const lista = [
      ej('c', { muscleGroup: 'core' }),
      ej('a', { muscleGroup: 'pecho' }),
      ej('b', { muscleGroup: 'dorsal' }),
    ];
    const r = ordenarParaRevision(lista, new Set(), orden);
    expect(r.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('manda al final los que no tienen grupo asignado', () => {
    const lista = [ej('sin'), ej('con', { muscleGroup: 'core' })];
    const r = ordenarParaRevision(lista, new Set(), orden);
    expect(r.map(e => e.id)).toEqual(['con', 'sin']);
  });

  it('desempata por nombre dentro del mismo grupo', () => {
    const lista = [
      ej('z', { muscleGroup: 'pecho', name: 'Zancada' }),
      ej('a', { muscleGroup: 'pecho', name: 'Aperturas' }),
    ];
    const r = ordenarParaRevision(lista, new Set(), orden);
    expect(r.map(e => e.name)).toEqual(['Aperturas', 'Zancada']);
  });

  it('no altera la lista original', () => {
    const lista = [ej('b', { muscleGroup: 'core' }), ej('a', { muscleGroup: 'pecho' })];
    ordenarParaRevision(lista, new Set(), orden);
    expect(lista.map(e => e.id)).toEqual(['b', 'a']);
  });
});
