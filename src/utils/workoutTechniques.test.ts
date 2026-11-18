import { describe, it, expect } from 'vitest';
import { TECHNIQUE_DESCRIPTION } from './workoutTechniques';
import { AJUSTES_POR_DEFECTO } from './tecnicaDeSerie';
import { DOCTRINA_ENTRENAMIENTO_DEFAULT } from '../ai/doctrina';

/* Las pausas y porcentajes de las técnicas viven en tres sitios: la ficha que
   lee el atleta, los ajustes por defecto con los que se pauta y la doctrina
   del asistente. Hasta el 11-11-2026 decían cosas distintas (rest-pause
   10-15 s en la ficha y 20-30 s en la doctrina). Este test las ata. */
describe('técnicas de intensidad · una sola cifra en todas partes', () => {
  const tecnicas = DOCTRINA_ENTRENAMIENTO_DEFAULT.slice(DOCTRINA_ENTRENAMIENTO_DEFAULT.indexOf('### 12.'));

  it('rest-pause: 15-20 s en la ficha y en la doctrina', () => {
    expect(TECHNIQUE_DESCRIPTION.restpause).toContain('15-20 s');
    expect(tecnicas).toContain('15-20 s de pausa');
    expect(TECHNIQUE_DESCRIPTION.restpause).not.toContain('10-15');
    expect(tecnicas).not.toContain('20-30 s');
  });

  it('drop set: la bajada por defecto cae dentro del rango que se le explica al atleta y al asistente', () => {
    const pct = AJUSTES_POR_DEFECTO.dropset.pctBajada;
    expect(pct).toBeGreaterThanOrEqual(20);
    expect(pct).toBeLessThanOrEqual(25);
    expect(TECHNIQUE_DESCRIPTION.dropset).toContain('20-25 %');
    expect(tecnicas).toContain('20-25%');
  });

  it('myo-reps: el descanso por defecto es el que dicen la ficha y la doctrina', () => {
    const seg = AJUSTES_POR_DEFECTO.myoreps.descansoSeg;
    expect(TECHNIQUE_DESCRIPTION.myoreps).toContain(`${seg} s`);
    expect(tecnicas).toContain(`${seg} s entre miniseries`);
  });
});
