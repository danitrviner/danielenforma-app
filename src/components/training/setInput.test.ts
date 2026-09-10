import { describe, expect, it } from 'vitest';
import { textoPautado } from './setInput';

describe('textoPautado', () => {
  it('rango de repeticiones y RIR, que es lo que el atleta necesita ver', () => {
    expect(textoPautado({ reps: '8-10', rir: 2 })).toBe('8-10 reps · RIR 2');
  });

  it('un número suelto de repeticiones también vale', () => {
    expect(textoPautado({ reps: '12', rir: 1 })).toBe('12 reps · RIR 1');
  });

  it('AMRAP se enseña tal cual, sin la palabra «reps» detrás', () => {
    expect(textoPautado({ reps: 'AMRAP', rir: 0 })).toBe('AMRAP · RIR 0');
    expect(textoPautado({ reps: 'al fallo', rir: 0 })).toBe('al fallo · RIR 0');
  });

  it('sin repeticiones pautadas queda solo el RIR, sin un separador huérfano', () => {
    expect(textoPautado({ reps: '', rir: 3 })).toBe('RIR 3');
    expect(textoPautado({ reps: '   ', rir: 3 })).toBe('RIR 3');
  });
});
