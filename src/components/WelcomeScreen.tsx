import React, { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, isSignInWithEmailLink, signInWithEmailLink } from '../firebase';
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
  const [resetMessage, setResetMessage] = useState('');
  // Invite link (passwordless email-link sign-in) handling
  const [awaitingInviteEmail, setAwaitingInviteEmail] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [completingInvite, setCompletingInvite] = useState(false);

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    const savedEmail = window.localStorage.getItem('emailForSignIn');
    if (savedEmail) {
      completeInviteSignIn(savedEmail);
    } else {
      setAwaitingInviteEmail(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeInviteSignIn = async (emailToUse: string) => {
    setError('');
    setCompletingInvite(true);
    try {
      const result = await signInWithEmailLink(auth, emailToUse, window.location.href);
      window.localStorage.removeItem('emailForSignIn');
      // Drop the sign-in-link query params so a refresh doesn't re-trigger this flow
      window.history.replaceState({}, document.title, window.location.pathname);
      setLocalBypassMode(false);
      onLoginSuccess(result.user);
    } catch (err: any) {
      console.error('signInWithEmailLink error:', err);
      setAwaitingInviteEmail(true);
      setError('No se pudo verificar el enlace. Confirma que el correo es el mismo al que se envió la invitación.');
    } finally {
      setCompletingInvite(false);
    }
  };

  const handleConfirmInviteEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmailInput.trim()) return;
    completeInviteSignIn(inviteEmailInput.trim());
  };
  const [resetting, setResetting] = useState(false);

  const handleForgotPassword = async () => {
    setError('');
    setResetMessage('');
    if (!email) {
      setError('Escribe tu correo electrónico arriba y vuelve a pulsar "¿Olvidaste tu contraseña?".');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage(`Te hemos enviado un correo a ${email} para restablecer tu contraseña. Revisa también la carpeta de spam.`);
    } catch (err: any) {
      console.error('sendPasswordResetEmail error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('No existe ninguna cuenta con ese correo.');
      } else {
        setError(err.message || 'No se pudo enviar el correo de recuperación.');
      }
    } finally {
      setResetting(false);
    }
  };

  const handleGoogleLogin = () => {
    setError('');
    setLoading(true);
    // Try popup first (works in most browsers). On popup-blocked fall back to redirect.
    signInWithPopup(auth, googleProvider)
      .then(result => {
        setLocalBypassMode(false);
        onLoginSuccess(result.user);
      })
      .catch(err => {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
          if (err.code === 'auth/popup-closed-by-user') {
            setLoading(false);
            return;
          }
          // Popup blocked → navigate via redirect instead
          signInWithRedirect(auth, googleProvider).catch(redirectErr => {
            console.error('signInWithRedirect error:', redirectErr);
            setError(`Error al iniciar sesión con Google (${redirectErr.code ?? redirectErr.message})`);
            setLoading(false);
          });
        } else {
          console.error('Google sign-in error:', err);
          setError(`Error al iniciar sesión con Google (${err.code ?? err.message})`);
          setLoading(false);
        }
      });
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

  // Sandbox login: always resets any in-progress loading state first
  const handleSandboxLogin = async (role: 'client' | 'coach') => {
    setError('');
    setLoading(true); // grab the lock (cancels any concurrent form submission visually)
    const sandboxEmail = role === 'coach' ? 'danitrviner@gmail.com' : 'atleta@enforma.com';
    const sandboxPassword = 'enforma_sandbox_123';
    
    try {
      let user;

      // 1. Intenta sign-in con credenciales existentes
      try {
        const result = await signInWithEmailAndPassword(auth, sandboxEmail, sandboxPassword);
        user = result.user;
      } catch (loginErr: any) {
        // 2. Solo si el usuario no existe, intenta crearlo
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
          const result = await createUserWithEmailAndPassword(auth, sandboxEmail, sandboxPassword);
          user = result.user;
        } else {
          throw loginErr;
        }
      }

      // 3. Éxito — flujo Firebase real, sin bypass
      setLocalBypassMode(false);
      localStorage.setItem('enforma_sandbox_role_hint', role);
      onLoginSuccess(user);
    } catch (err: any) {
      // 4. Bypass SOLO ante operation-not-allowed o error de red (sin código Firebase)
      if (err.code === 'auth/operation-not-allowed' || !err.code) {
        console.warn('Firebase Auth bloqueado o sin red. Entrando en Offline Local Bypass:', err);
        setLocalBypassMode(true);
        localStorage.setItem('enforma_sandbox_role_hint', role);
        const mockUser = {
          uid: role === 'coach' ? 'coach_dani_local' : 'client_alex_default',
          email: sandboxEmail,
          displayName: role === 'coach' ? 'Dani Coach (En Forma)' : 'Atleta En Forma',
        };
        onLoginSuccess(mockUser);
      } else {
        console.error('Sandbox login error:', err.code, err.message);
        setError(`Error de acceso (${err.code}). Intenta con Google o el formulario.`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Invited-user flow: they opened the invite link on a device/browser where we
  // don't already know their email (normal case — the coach sent it, not them).
  // Show a minimal "confirm your email" step instead of the full login UI.
  if (awaitingInviteEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0e0e0e] relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-[#fbcb1a]/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-[#00eefc]/5 blur-[120px] rounded-full"></div>

        <div className="w-full max-w-md bg-[#131313] border border-white/7 p-8 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-10">
          <div className="flex flex-col items-center mb-6">
            <div className="flex items-center gap-2 text-[#fbcb1a] mb-2">
              <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              <span className="font-sans font-black text-3xl tracking-tighter uppercase">EN FORMA</span>
            </div>
            <p className="text-[#c6c9ab] text-xs font-mono tracking-widest uppercase">Confirma tu invitación</p>
          </div>

          <p className="text-sm text-[#c6c9ab] mb-5 text-center">
            Para completar tu acceso, confirma el correo electrónico al que tu entrenador te envió la invitación.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/35 text-red-200 p-3 rounded text-sm mb-5 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleConfirmInviteEmail} className="space-y-4">
            <input
              type="email"
              value={inviteEmailInput}
              onChange={e => setInviteEmailInput(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full bg-[#1c1b1b] border border-white/7 rounded p-3 text-sm text-white focus:outline-none focus:border-[#fbcb1a] transition-colors"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={completingInvite}
              className="w-full h-[48px] bg-[#fbcb1a] text-black font-sans font-bold uppercase rounded-md hover:bg-[#d4a800] active:scale-95 transition-all text-sm tracking-widest disabled:opacity-50"
            >
              {completingInvite ? 'Verificando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0e0e0e] relative overflow-hidden">
      {/* Background glow designs */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-[#fbcb1a]/5 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-[#00eefc]/5 blur-[120px] rounded-full"></div>

      <div className="w-full max-w-md bg-[#131313] border border-white/7 p-8 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-10 transition-all">
        {/* En Forma Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 text-[#fbcb1a] mb-2 animate-pulse">
            <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span className="font-sans font-black text-3xl tracking-tighter uppercase">EN FORMA</span>
          </div>
          <p className="text-[#c6c9ab] text-xs font-mono tracking-widest uppercase">ELITE PERFORMANCE SYSTEM</p>
        </div>

        {/* Instant Access Instructions Box */}
        <div className="bg-[#1a1e20] border border-teal-500/25 rounded-lg p-3.5 mb-6 text-xs text-slate-300 space-y-2 font-sans shadow-inner">
          <div className="flex items-center gap-2 text-[#fbcb1a] font-bold font-mono uppercase tracking-wider text-[10px]">
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

        {resetMessage && (
          <div className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/35 text-[#fbcb1a] p-3 rounded text-sm mb-6 text-center">
            {resetMessage}
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
              className="w-full bg-[#1c1b1b] border border-white/7 rounded p-3 text-sm text-white focus:outline-none focus:border-[#fbcb1a] transition-colors"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-mono text-[#c6c9ab] uppercase tracking-wider">Contraseña</label>
              {!isRegistering && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  className="text-[10px] text-[#fbcb1a] hover:underline transition-colors font-mono disabled:opacity-50"
                >
                  {resetting ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
                </button>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full bg-[#1c1b1b] border border-white/7 rounded p-3 text-sm text-white focus:outline-none focus:border-[#fbcb1a] transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[48px] bg-[#fbcb1a] text-black font-sans font-bold uppercase rounded-md hover:bg-[#d4a800] active:scale-95 transition-all text-sm tracking-widest flex items-center justify-center gap-2"
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
          className="w-full h-[48px] bg-[#1a1c1c] hover:bg-[#282a2b] text-white font-mono rounded-md border border-white/7 active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
        >
          <img 
            src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/google_g_color_28dp.png" 
            alt="Google" 
            className="w-5 h-5 object-contain"
          />
          Google Sign-In
        </button>

        {/* Guest Demo — solo en entorno de desarrollo */}
        {import.meta.env.DEV && (
          <div className="mt-8 pt-6 border-t border-white/60 text-center">
            <span className="block text-xs font-mono text-[#fbcb1a] uppercase mb-4 tracking-wider font-extrabold">DEV · Acceso Sandbox</span>
            <button
              onClick={() => handleSandboxLogin('client')}
              disabled={loading}
              className="w-full py-3 px-3 bg-gradient-to-r from-teal-950 to-[#121414] hover:from-teal-900 border border-teal-700/60 rounded-md text-teal-200 text-xs font-mono flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
            >
              <span className="material-symbols-outlined text-lg">fitness_center</span>
              <span className="font-bold">Sandbox Atleta</span>
            </button>
            <p className="text-[10px] text-[#c6c9ab] mt-2 font-mono">
              Solo visible en desarrollo. En producción, usa Google Sign-In.
            </p>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-xs text-[#fbcb1a] hover:underline transition-colors font-mono"
          >
            {isRegistering ? '¿Ya tienes una cuenta? Iniciar sesión' : '¿Nuevo en En Forma? Regístrate aquí'}
          </button>
        </div>
      </div>
    </div>
  );
}
