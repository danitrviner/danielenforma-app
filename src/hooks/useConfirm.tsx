import React, { useCallback, useRef, useState } from 'react';
import { Dialog, Button } from '../components/ui';

/**
 * Reemplaza `window.confirm()`: el diálogo nativo no se puede mostrar (o
 * silenciosamente devuelve `false`) en un WebView de Capacitor o en un
 * navegador que ya bloqueó diálogos repetidos de esta pestaña — el atleta o
 * el coach ve que el botón "no hace nada" sin ningún aviso. Este hook usa el
 * `Dialog` propio del design system, que siempre se puede pintar.
 *
 * Uso: `const { confirm, ConfirmDialog } = useConfirm();` y
 * `if (!await confirm('¿Seguro?')) return;` — renderiza `<ConfirmDialog />`
 * una vez en el árbol del componente.
 */
export function useConfirm() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const resolverRef = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback((mensaje: string) => {
    setMensaje(mensaje);
    return new Promise<boolean>(resolve => { resolverRef.current = resolve; });
  }, []);

  const responder = useCallback((valor: boolean) => {
    setMensaje(null);
    resolverRef.current(valor);
  }, []);

  const ConfirmDialog = useCallback(() => (
    <Dialog open={mensaje !== null} onClose={() => responder(false)} size="s" label="Confirmar">
      <p className="font-sans text-body-s text-ink px-4 py-4">{mensaje}</p>
      <div className="flex gap-2 border-t border-hairline px-4 py-3">
        <Button variant="secondary" onClick={() => responder(false)} className="flex-1">Cancelar</Button>
        <Button variant="primary" onClick={() => responder(true)} className="flex-1">Confirmar</Button>
      </div>
    </Dialog>
  ), [mensaje, responder]);

  return { confirm, ConfirmDialog };
}
