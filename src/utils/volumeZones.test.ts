import { describe, it, expect } from 'vitest';
import { heatmapBg, heatmapText, zoneLabel, VOLUME_ZONE_LEGEND } from './volumeZones';


// 27-10 (revisión del modo claro): la cifra de la celda va en TINTA en todas
// las zonas con color. El texto teñido (estado al 55 % con la tinta) medía
// 3,3:1 en oscuro sobre la celda verde y 4,4:1 sobre la roja; el fondo ya
// lleva el color de la zona, el texto no tiene que repetirlo.
const tinta = 'var(--color-ink)';

describe('los colores genéricos reproducen los umbrales de siempre', () => {
  /* `MesocycleTemplateLibrary` llevaba su propia copia de estos colores con los
     umbrales escritos a mano. Al unificarla contra `GENERIC_LANDMARK`, esto fija
     que el reparto por zonas sigue siendo el mismo — si alguien toca la rampa,
     el fallo sale aquí y no en una pantalla pintando otra cosa que el resto. */
  const casos: [number, string][] = [
    [0, 'var(--color-ink-3)'],
    [1, tinta], [4, tinta],
    [5, tinta], [9, tinta],
    [10, tinta], [14, tinta],
    [15, tinta], [30, tinta],
  ];

  it.each(casos)('con %i series el texto va en %s', (series, color) => {
    expect(heatmapText(series)).toBe(color);
  });

  it('el fondo de 0 series es el de una celda vacía, no un color de zona', () => {
    expect(heatmapBg(0)).toBe('var(--color-surface)');
  });

  it('dentro de una zona, más series es más intenso', () => {
    const opacidad = (s: string) => Number(s.match(/([\d.]+)%\)/)?.[1] ?? 0);
    expect(opacidad(heatmapBg(9))).toBeGreaterThan(opacidad(heatmapBg(5)));
    expect(opacidad(heatmapBg(14))).toBeGreaterThan(opacidad(heatmapBg(10)));
  });
});

describe('el rótulo de cada zona dice lo que es', () => {
  const pecho = { mv: 4, mev: 6, mavMin: 10, mavMax: 16, mrv: 22 };

  /* La zona azul son las series POR DEBAJO del mínimo efectivo. Se rotulaba
     «MEV» a secas, y 3 series de un grupo con MEV 6 se leían como «ya está en
     su mínimo efectivo» (17-11-2026). */
  it('por debajo del MEV no se llama «MEV»', () => {
    expect(zoneLabel(3, pecho)).toBe('Bajo MEV');
    expect(zoneLabel(5, pecho)).toBe('Bajo MEV');
  });

  it('al llegar al MEV ya es productivo', () => {
    expect(zoneLabel(6, pecho)).toBe('Productivo');
    expect(zoneLabel(0, pecho)).toBe('Sin volumen');
    expect(zoneLabel(12, pecho)).toBe('MAV');
  });

  it('la leyenda usa los mismos rótulos que las celdas', () => {
    expect(VOLUME_ZONE_LEGEND.map(z => z.label)).toEqual(['Sin volumen', 'Bajo MEV', 'Productivo', 'MAV', 'MRV']);
  });
});
