import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con retraso: cada cambio reinicia el temporizador, así que
 * solo se propaga el último valor una vez la persona deja de teclear. Pensado
 * para buscadores que filtran listas grandes en memoria (recetas, ejercicios,
 * alimentos) — sin esto, cada tecla refiltra y repinta la lista entera.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
