import { describe, it, expect } from 'vitest';
import { nombrePorDefecto } from './AthleteOnboardingWizard';

describe('nombrePorDefecto', () => {
  it('el principio del correo no cuenta como nombre elegido', () => {
    expect(nombrePorDefecto({ displayName: 'danielbriz8', email: 'danielbriz8@gmail.com' })).toBe(true);
    expect(nombrePorDefecto({ displayName: '', email: 'x@y.com' })).toBe(true);
  });
  it('un nombre de verdad se respeta', () => {
    expect(nombrePorDefecto({ displayName: 'Daniel Briz', email: 'danielbriz8@gmail.com' })).toBe(false);
  });
});
