import React, { createContext, useCallback, useContext, useState } from 'react';

type ToastKind = 'error' | 'success';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_STYLE: Record<ToastKind, { icon: string; classes: string }> = {
  error:   { icon: 'error',        classes: 'bg-red-600 text-white' },
  success: { icon: 'check_circle', classes: 'bg-emerald-600 text-white' },
};

let nextId = 0;

// Notificación efímera para acciones que hoy fallan en silencio (guardar,
// asignar, borrar) — sin esto el usuario no tiene forma de saber que algo no
// se guardó. Provider único montado en App.tsx; cualquier pantalla llama a
// useToast().showToast(...).
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, kind: ToastKind = 'error') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center px-4 w-full max-w-md pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg font-sans text-sm font-bold w-full ${KIND_STYLE[t.kind].classes}`}
          >
            <span className="material-symbols-outlined text-base flex-shrink-0">{KIND_STYLE[t.kind].icon}</span>
            <span className="min-w-0">{t.message}</span>
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
