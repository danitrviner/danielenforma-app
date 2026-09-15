import { describe, it, expect } from 'vitest';
import { ProgressPhoto, BodyweightLog } from '../types';
import {
  fotosDeVista, parPorDefecto, semanasEntre, pesoEnFecha, etiquetaComparativa,
} from './paresDeFotos';

const foto = (date: string, view: ProgressPhoto['view'] = 'front', athleteId = 'a@b.com'): ProgressPhoto => ({
  id: `${athleteId}_${date}_${view}`, athleteId, date, view,
  url: `https://x/${date}_${view}.jpg`, uploadedAt: `${date}T10:00:00.000Z`,
});

const peso = (date: string, weight: number): BodyweightLog => ({
  id: date, athleteId: 'a@b.com', date, weight, createdAt: `${date}T08:00:00.000Z`,
});

describe('fotosDeVista', () => {
  it('filtra por vista y ordena de la más antigua a la más reciente', () => {
    const fotos = [foto('2026-03-01'), foto('2026-01-15'), foto('2026-02-01', 'back'), foto('2026-02-10')];
    expect(fotosDeVista(fotos, 'front').map(f => f.date)).toEqual(['2026-01-15', '2026-02-10', '2026-03-01']);
    expect(fotosDeVista(fotos, 'back').map(f => f.date)).toEqual(['2026-02-01']);
    expect(fotosDeVista(fotos, 'side')).toEqual([]);
  });

  it('descarta fotos sin fecha en vez de colarlas al principio del orden', () => {
    const sinFecha = { ...foto('2026-01-01'), date: '' };
    expect(fotosDeVista([sinFecha, foto('2026-02-01')], 'front').map(f => f.date)).toEqual(['2026-02-01']);
  });

  it('filtra por atleta solo cuando se le pide', () => {
    const fotos = [foto('2026-01-01', 'front', 'a@b.com'), foto('2026-01-02', 'front', 'otro@b.com')];
    expect(fotosDeVista(fotos, 'front')).toHaveLength(2);
    expect(fotosDeVista(fotos, 'front', 'a@b.com')).toHaveLength(1);
  });
});

describe('parPorDefecto', () => {
  it('coge la primera contra la última', () => {
    const par = parPorDefecto([foto('2026-01-01'), foto('2026-02-01'), foto('2026-03-01')]);
    expect(par?.antes.date).toBe('2026-01-01');
    expect(par?.ahora.date).toBe('2026-03-01');
  });

  it('devuelve null con una sola foto: una cortina contra sí misma no compara nada', () => {
    expect(parPorDefecto([foto('2026-01-01')])).toBeNull();
    expect(parPorDefecto([])).toBeNull();
  });
});

describe('semanasEntre', () => {
  it('cuenta semanas enteras', () => {
    expect(semanasEntre('2026-01-01', '2026-02-26')).toBe(8);
  });

  it('nunca devuelve 0: dos fotos de la misma semana son «1 semana»', () => {
    expect(semanasEntre('2026-01-01', '2026-01-02')).toBe(1);
    expect(semanasEntre('2026-01-01', '2026-01-01')).toBe(1);
  });
});

describe('pesoEnFecha', () => {
  const logs = [peso('2026-01-01', 80), peso('2026-02-01', 78.4), peso('2026-03-01', 77)];

  it('coge el registro más cercano, no el anterior', () => {
    expect(pesoEnFecha(logs, '2026-02-03')).toBe(78.4);
    expect(pesoEnFecha(logs, '2026-02-25')).toBe(77);
  });

  it('devuelve null sin registros', () => {
    expect(pesoEnFecha([], '2026-02-01')).toBeNull();
  });
});

describe('etiquetaComparativa', () => {
  it('junta semanas y delta de peso', () => {
    expect(etiquetaComparativa('2026-01-01', '2026-03-19', 80, 76.2)).toBe('11 SEMANAS · −3,8 KG');
  });

  it('marca la subida con +', () => {
    expect(etiquetaComparativa('2026-01-01', '2026-01-29', 70, 72.5)).toBe('4 SEMANAS · +2,5 KG');
  });

  it('sin peso en un extremo NO inventa un delta contra cero', () => {
    expect(etiquetaComparativa('2026-01-01', '2026-03-19', null, 76.2)).toBe('11 SEMANAS');
    expect(etiquetaComparativa('2026-01-01', '2026-03-19', 80, null)).toBe('11 SEMANAS');
    expect(etiquetaComparativa('2026-01-01', '2026-03-19')).toBe('11 SEMANAS');
  });

  it('dice «mismo peso» en vez de «−0 KG»', () => {
    expect(etiquetaComparativa('2026-01-01', '2026-01-29', 80, 80.02)).toBe('4 SEMANAS · MISMO PESO');
  });

  it('singular en la primera semana', () => {
    expect(etiquetaComparativa('2026-01-01', '2026-01-03', 80, 80)).toBe('1 SEMANA · MISMO PESO');
  });
});
