import React from 'react';
import { Icon, Button } from './ui';
import { reportarError } from '../monitorizacion';

interface State {
  error: Error | null;
}

// Without this, any uncaught render error blanks the entire app (React unmounts the
// tree on an uncaught exception) — a bug in one tab's rendering takes down every
// screen with no clue why. This shows the actual error instead, and lets the user
// recover without losing their session (reload keeps the same login).
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  // This project has no @types/react installed (react itself ships no .d.ts either),
  // so with no strict/noImplicitAny in tsconfig, `React.Component` resolves as `any` —
  // extending a value typed `any` gives a class with no inherited members visible to
  // the type checker. `declare` tells TS these exist at runtime (they do — real React
  // provides them) without needing the base class properly typed.
  declare props: { children: React.ReactNode };
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Este es el fallo que más importa reportar: ha tumbado la pantalla entera
    // y la persona está viendo el cartel rojo ahora mismo. El `componentStack`
    // dice qué componente lo provocó, que es justo lo que la pila de JavaScript
    // sola no cuenta.
    reportarError(error, 'ErrorBoundary', { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-6">
          <div className="max-w-lg w-full bg-surface border border-red-500/30 rounded-surface p-6 space-y-4">
            <h1 className="font-sans font-bold text-title-m text-white flex items-center gap-2">
              <Icon name="error" size="l" className="text-red-400" />
              Se ha producido un error
            </h1>
            <p className="font-sans text-label text-ink-2 break-words">{this.state.error.message}</p>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
