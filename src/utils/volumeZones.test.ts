import { describe, it, expect } from 'vitest';
import { heatmapBg, heatmapText } from './volumeZones';


describe('los colores genéricos reproducen los umbrales de siempre', () => {
  /* `MesocycleTemplateLibrary` llevaba su propia copia de estos colores con los
     umbrales escritos a mano. Al unificarla contra `GENERIC_LANDMARK`, esto fija
     que el reparto por zonas sigue siendo el mismo — si alguien toca la rampa,
     el fallo sale aquí y no en una pantalla pintando otra cosa que el resto. */
  const casos: [number, string][] = [
    [0, 'var(--color-ink-3)'],
    [1, 'var(--color-info)'], [4, 'var(--color-info)'],
    [5, 'var(--color-success)'], [9, 'var(--color-success)'],
    [10, 'var(--color-warning)'], [14, 'var(--color-warning)'],
    [15, 'var(--color-danger)'], [30, 'var(--color-danger)'],
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
