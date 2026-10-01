import { describe, it, expect } from 'vitest';
import { heatmapBg, heatmapText } from './volumeZones';


// El texto de zona se mezcla con la tinta: el color de estado puro no pasa 4,5:1
// sobre su propio tinte en claro (el chip MEV daba 3,2:1).
const mezcla = (t: string) => `color-mix(in oklab, var(--color-${t}) 55%, var(--color-ink))`;

describe('los colores genéricos reproducen los umbrales de siempre', () => {
  /* `MesocycleTemplateLibrary` llevaba su propia copia de estos colores con los
     umbrales escritos a mano. Al unificarla contra `GENERIC_LANDMARK`, esto fija
     que el reparto por zonas sigue siendo el mismo — si alguien toca la rampa,
     el fallo sale aquí y no en una pantalla pintando otra cosa que el resto. */
  const casos: [number, string][] = [
    [0, 'var(--color-ink-3)'],
    [1, mezcla('info')], [4, mezcla('info')],
    [5, mezcla('success')], [9, mezcla('success')],
    [10, mezcla('warning')], [14, mezcla('warning')],
    [15, mezcla('danger')], [30, mezcla('danger')],
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
