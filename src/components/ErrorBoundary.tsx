import React from 'react';

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
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#111110] p-6">
          <div className="max-w-lg w-full bg-[#181816] border border-red-500/30 rounded-2xl p-6 space-y-4">
            <h1 className="font-sans font-bold text-lg text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-red-400">error</span>
              Se ha producido un error
            </h1>
            <p className="font-mono text-xs text-[#c6c9ab] break-words">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] transition-all"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
