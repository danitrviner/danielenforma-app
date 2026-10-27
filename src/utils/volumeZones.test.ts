import { describe, it, expect } from 'vitest';
import { heatmapBg, heatmapText } from './volumeZones';


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
