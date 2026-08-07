import React, { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword, sendPasswordResetEmail, isSignInWithEmailLink, signInWithEmailLink } from '../firebase';
import { setLocalBypassMode } from '../dbService';
import { Button, Input } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Fase 3 (F3.5): re-skin sobre docs/design/fase3/Login y Espera - Experiencia.dc.html.
   Copy exacto del handoff: tagline de marca "De invisible a imparable" (no
   la genérica "Coaching de alto rendimiento" que llevaba antes), botón
   primario "Entrar" y el aviso de que el acceso lo crea Dani — no hay
   autorregistro, la única otra puerta es Google Sign-In (secundario, nunca
   compite en oro con el primario).
   ═══════════════════════════════════════════════════════════════════════════ */

interface WelcomeScreenProps {
  onLoginSuccess: (user: any) => void;
}

export default function WelcomeScreen({ onLoginSuccess }: WelcomeScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  // Regular email authentication — sign-in only. El alta de cuentas nuevas va
  // siempre por invitación del coach (enlace passwordless, ver
  // awaitingInviteEmail/completeInviteSignIn arriba) o por Google Sign-In;
  // el auto-registro por email+contraseña se quitó porque `firestore.rules`
  // ya no deja crear `user_profiles` sin invitación previa.
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, ingresa correo y contraseña.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess(result.user);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Credenciales incorrectas o usuario no encontrado. Si tu entrenador te ha invitado, usa el enlace de invitación que te envió por correo.');
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

  // Invited-user flow: they opened the invite link on a device/browser where we
  // don't already know their email (normal case — the coach sent it, not them).
  // Show a minimal "confirm your email" step instead of the full login UI.
  if (awaitingInviteEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 bg-bg relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-accent/6 blur-[120px] rounded-full" aria-hidden />

        <div className="w-full max-w-md bg-surface border border-hairline p-8 rounded-canvas shadow-e2 z-10">
          <div className="flex flex-col items-center mb-6 gap-2">
            <img src="/atlas-logo.png" alt="En Forma" className="w-14 h-14 object-contain" />
            <span className="font-display text-feature font-black tracking-tight uppercase text-accent">EN FORMA</span>
            <p className="text-ink-2 text-label font-mono tracking-widest uppercase">Confirma tu invitación</p>
          </div>

          <p className="text-body-s text-ink-2 mb-5 text-center">
            Para completar tu acceso, confirma el correo electrónico al que tu entrenador te envió la invitación.
          </p>

          {error && (
            <div className="bg-danger/7 border border-danger/24 text-danger p-3 rounded-surface text-body-s mb-5 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleConfirmInviteEmail} className="space-y-4">
            <Input
              type="email"
              value={inviteEmailInput}
              onChange={setInviteEmailInput}
              placeholder="tu@correo.com"
              required
              autoComplete="email"
            />
            <Button type="submit" variant="primary" size="l" loading={completingInvite} loadingLabel="Verificando" fullWidth>
              Continuar
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-bg relative overflow-hidden">
      {/* Ambiente de fondo: un único resplandor de acento, no dos — el oro es
          la única marca de color de la pantalla, el cian se retira. */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-accent/6 blur-[120px] rounded-full" aria-hidden />

      <div className="w-full max-w-md bg-surface border border-hairline p-8 rounded-canvas shadow-e2 z-10">
        {/* En Forma Header */}
        <div className="flex flex-col items-center mb-6 gap-2">
          <img src="/atlas-logo.png" alt="" className="w-16 h-16 object-contain" />
          <span className="font-display text-feature font-black tracking-tight uppercase text-accent">EN FORMA</span>
          <p className="text-ink-2 text-label font-mono tracking-widest uppercase">De invisible a imparable</p>
        </div>

        {error && (
          <div className="bg-danger/7 border border-danger/24 text-danger p-3 rounded-surface text-body-s mb-6 text-center">
            {error}
          </div>
        )}

        {resetMessage && (
          <div className="bg-accent/7 border border-accent/22 text-accent p-3 rounded-surface text-body-s mb-6 text-center">
            {resetMessage}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="atleta@enforma.com"
            autoComplete="email"
            required
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">Contraseña</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="font-mono text-caption text-accent hover:underline disabled:opacity-50"
              >
                {resetting ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              required
              className="h-[54px] w-full rounded-field border border-hairline bg-field px-4 font-sans text-title-s text-ink transition-colors duration-(--duration-state) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent focus:ring-inset"
            />
          </div>

          <Button type="submit" variant="primary" size="l" loading={loading} loadingLabel="Entrando" fullWidth>
            Entrar
          </Button>
        </form>

        <div className="flex items-center justify-center my-6" aria-hidden>
          <div className="h-px bg-hairline flex-1" />
          <span className="px-3 text-ink-3 text-caption font-mono uppercase tracking-widest">O ingresar con</span>
          <div className="h-px bg-hairline flex-1" />
        </div>

        <Button variant="secondary" size="l" onClick={handleGoogleLogin} disabled={loading} fullWidth>
          <img
            src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/google_g_color_28dp.png"
            alt=""
            className="w-5 h-5 object-contain"
          />
          Google Sign-In
        </Button>

        {/* Sin autorregistro: el acceso lo crea Dani. La pantalla nunca
            ofrece "crear cuenta" — solo explica a quién escribir. */}
        <p className="mt-6 text-center font-sans text-body-s text-ink-3">
          ¿Aún no tienes acceso? <span className="text-ink-2">Escribe a Dani para empezar.</span>
        </p>
      </div>
    </div>
  );
}
