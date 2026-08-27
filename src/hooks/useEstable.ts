import { useRef } from 'react';

/**
 * Envuelve `fn` en una función de identidad ESTABLE (la misma referencia en
 * todos los renders) que siempre llama a la versión más reciente. Pensado
 * para memoizar (`useMemo`/`React.memo`) sin arrastrar closures viejas: la
 * función en sí puede recrearse en cada render del componente que la define
 * (no necesita `useCallback` propio) porque `useEstable` siempre ejecuta la
 * de ESTE render, nunca la de cuando se creó la referencia estable.
 *
 * Mismo patrón que React usará con `useEffectEvent` cuando deje de ser
 * experimental — hasta entonces, esta es la versión de mano.
 */
export function useEstable<T extends (...args: any[]) => any>(fn: T): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useRef(((...args: Parameters<T>) => fnRef.current(...args)) as T).current;
}
