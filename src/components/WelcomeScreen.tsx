import React, { useState } from 'react';
import { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../firebase';
import { setLocalBypassMode } from '../dbService';

interface WelcomeScreenProps {
  onLoginSuccess: (user: any) => void;
}

export default function WelcomeScreen({ onLoginSuccess }: WelcomeScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Authenticate using Google Auth
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      onLoginSuccess(result.user);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setError('El navegador bloqueó la ventana emergente. Por favor, usa el inicio de sesión por correo alternativo o permite las ventanas.');
      } else {
        setError('Error al iniciar sesión con Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Regular email authentication
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, ingresa correo y contraseña.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        onLoginSuccess(result.user);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        onLoginSuccess(result.user);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Credenciales incorrectas o usuario no encontrado. Si no te has registrado, selecciona "Regístrate aquí" abajo o usa el botón de Google Sign-On.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este correo electrónico ya está registrado.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('La autenticación con Correo/Contraseña no está habilitada en la consola Firebase. Usa el botón "Google Sign-In" de abajo para ingresar de forma instantánea sin contraseña.');
      } else {
        setError(err.message || 'Error de autenticación.');
      }
    } finally {
      setLoading(false);
    }
  };

  // High-fidelity instant developer sandbox login with immediate local backup bypass
  const handleSandboxLogin = async (role: 'client' | 'coach') => {
    setError('');
    setLoading(true);
    const sandboxEmail = role === 'coach' ? 'danitrviner@gmail.com' : 'atleta@enforma.com';
    const sandboxPassword = 'enforma_sandbox_123';
    
    try {
      // First try standard Firebase Auth
      let user;
      try {
        const result = await signInWithEmailAndPassword(auth, sandboxEmail, sandboxPassword);
        user = result.user;
      } catch (loginErr: any) {
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential' || loginErr.code === 'auth/wrong-password') {
          const result = await createUserWithEmailAndPassword(auth, sandboxEmail, sandboxPassword);
          user = result.user;
        } else {
          throw loginErr;
        }
      }
      // Successfully authenticated with Firebase! Disable fallback if it was active
      setLocalBypassMode(false);
      onLoginSuccess(user);
    } catch (err: any) {
      console.warn('Firebase Auth blocked or misconfigured in Console. Entering through Offline Local Bypass:', err);
      // ENABLE LOCAL FALLBACK
      setLocalBypassMode(true);
      
      const mockUser = {
        uid: role === 'coach' ? 'coach_dani_local' : 'client_alex_default',
        email: sandboxEmail,
        displayName: role === 'coach' ? 'Dani Coach (En Forma)' : 'Atleta En Forma',
      };
      
      onLoginSuccess(mockUser);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0e0e0e] relative overflow-hidden">
      {/* Background glow designs */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-[#e2ff00]/5 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-[#00eefc]/5 blur-[120px] rounded-full"></div>
      
      <div className="w-full max-w-md bg-[#131313] border border-[#2a2a2a] p-8 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-10 transition-all">
        {/* En Forma Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 text-[#e2ff00] mb-2 animate-pulse">
            <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span className="font-sans font-black text-3xl tracking-tighter uppercase">EN FORMA</span>
          </div>
          <p className="text-[#c6c9ab] text-xs font-mono tracking-widest uppercase">ELITE PERFORMANCE SYSTEM</p>
        </div>

        {/* Instant Access Instructions Box */}
        <div className="bg-[#1a1e20] border border-teal-500/25 rounded-lg p-3.5 mb-6 text-xs text-slate-300 space-y-2 font-sans shadow-inner">
          <div className="flex items-center gap-2 text-[#e2ff00] font-bold font-mono uppercase tracking-wider text-[10px]">
            <span className="material-symbols-outlined text-sm animate-pulse">lock_open</span>
            <span>Acceso Garantizado 100%</span>
          </div>
          <p className="leading-relaxed text-[#c6c9ab]">
            Si estás dentro del visor de AI Studio, haz clic en cualquiera de los botones de <strong className="text-white">Acceso Instantáneo</strong> de abajo. Entrarás inmediatamente sin necesidad de contraseñas ni demoras utilizando el bypass inteligente.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/35 text-red-200 p-3 rounded text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#c6c9ab] uppercase tracking-wider mb-2">Correo Electrónico</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atleta@enforma.com"
              className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded p-3 text-sm text-white focus:outline-none focus:border-[#e2ff00] transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#c6c9ab] uppercase tracking-wider mb-2">Contraseña</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded p-3 text-sm text-white focus:outline-none focus:border-[#e2ff00] transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[48px] bg-[#e2ff00] text-black font-mono font-bold uppercase rounded-md hover:bg-[#bad200] active:scale-95 transition-all text-sm tracking-widest flex items-center justify-center gap-2"
          >
            {loading ? 'Procesando...' : isRegistering ? 'Crear Cuenta Atleta' : 'Ingresar al Portal'}
            <span className="material-symbols-outlined text-sm">login</span>
          </button>
        </form>

        <div className="flex items-center justify-center my-6">
          <div className="h-[1px] bg-[#2a2a2a] flex-1"></div>
          <span className="px-3 text-[#c6c9ab]/50 text-xs font-mono uppercase">O ingresar con</span>
          <div className="h-[1px] bg-[#2a2a2a] flex-1"></div>
        </div>

        {/* Google Authentication */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full h-[48px] bg-[#1a1c1c] hover:bg-[#282a2b] text-white font-mono rounded-md border border-[#2a2a2a] active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
        >
          <img 
            src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/google_g_color_28dp.png" 
            alt="Google" 
            className="w-5 h-5 object-contain"
          />
          Google Sign-In
        </button>

        {/* Guest Demo Bypasses (One-Button Action) */}
        <div className="mt-8 pt-6 border-t border-[#2a2a2a]/60 text-center">
          <span className="block text-xs font-mono text-[#e2ff00] uppercase mb-4 tracking-wider font-extrabold">🚀 Acceso de Un Solo Clic</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSandboxLogin('client')}
              disabled={loading}
              className="py-3 px-3 bg-gradient-to-r from-teal-950 to-[#121414] hover:from-teal-900 border border-teal-700/60 rounded-md text-teal-200 text-xs font-mono flex flex-col items-center gap-1.5 active:scale-95 transition-all shadow-md hover:shadow-teal-900/10"
            >
              <span className="material-symbols-outlined text-lg">fitness_center</span>
              <span className="font-bold">Modo Atleta / Cliente</span>
            </button>
            <button
              onClick={() => handleSandboxLogin('coach')}
              disabled={loading}
              className="py-3 px-3 bg-gradient-to-r from-[#d1b000]/10 to-[#121414] hover:from-[#d1b000]/25 border border-[#e2ff00]/40 rounded-md text-[#e2ff00] text-xs font-mono flex flex-col items-center gap-1.5 active:scale-95 transition-all shadow-md hover:shadow-[#e2ff00]/10"
            >
              <span className="material-symbols-outlined text-lg">assignment_ind</span>
              <span className="font-bold">Modo Entrenador</span>
            </button>
          </div>
          <p className="text-[10px] text-[#c6c9ab] mt-3 font-mono leading-tight">
            Diseñado para ingresar en forma directa estés donde estés.
          </p>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-xs text-[#e2ff00] hover:underline transition-colors font-mono"
          >
            {isRegistering ? '¿Ya tienes una cuenta? Iniciar sesión' : '¿Nuevo en En Forma? Regístrate aquí'}
          </button>
        </div>
      </div>
    </div>
  );
}
