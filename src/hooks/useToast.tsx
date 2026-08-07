import React, { createContext, useCallback, useContext, useState } from 'react';
import Icon from '../components/ui/Icon';

// 'info' se añadió para el CRM (2026-08-01): una escritura encolada sin
// conexión no es un error (el dato está en IndexedDB y sube solo) ni un éxito
// (todavía no está en el servidor). Pintarla de rojo hace que el coach
// reintente y duplique; de verde, que se confíe.
type ToastKind = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Botón de acción a la derecha, en oro — típicamente "Deshacer". */
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* Fase 3: el handoff fija una sola tarjeta neutra (`inset`, no un color por
 * tipo) — solo el icono lleva el color del tono. Antes cada tipo tenía su
 * propio fondo sólido (rojo/verde), lo que competía visualmente con el oro
 * de una acción real dentro del propio toast ("Deshacer"). */
const TONO: Record<ToastKind, { icono: string; color: string }> = {
  error:   { icono: 'error',        color: 'text-danger' },
  success: { icono: 'check_circle', color: 'text-success' },
  info:    { icono: 'cloud_sync',   color: 'text-ink-2' },
};

/** 3,2 s en pantalla (handoff) — no los 4 s que tenía antes. */
const DURACION_MS = 3200;

let nextId = 0;

// Notificación efímera para acciones que hoy fallan en silencio (guardar,
// asignar, borrar) — sin esto el usuario no tiene forma de saber que algo no
// se guardó. Provider único montado en App.tsx; cualquier pantalla llama a
// useToast().showToast(...).
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, kind: ToastKind = 'error', options?: ToastOptions) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, kind, message, ...options }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), DURACION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-[calc(var(--nav-h)+24px)] md:bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-toast)] flex flex-col gap-2 items-center px-4 w-full max-w-md pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="animate-toast-in pointer-events-auto flex w-full items-center gap-3 rounded-field bg-inset px-4 py-3 shadow-e2"
          >
            <Icon name={TONO[t.kind].icono} size="m" className={`shrink-0 ${TONO[t.kind].color}`} />
            <span className="min-w-0 flex-1 font-sans text-body-s font-medium text-ink">{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                onClick={t.onAction}
                className="shrink-0 font-sans text-body-s font-bold text-accent"
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
