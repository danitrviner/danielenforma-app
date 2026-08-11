import React, { useState } from 'react';
import { auth, signInWithEmailAndPassword, sendPasswordResetEmail } from '../firebase';
import { setLocalBypassMode } from '../dbService';
import { mensajeDeErrorAuth } from '../utils/erroresAuth';
import { Button, Input } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Fase 3 (F3.5): re-skin sobre docs/design/fase3/Login y Espera - Experiencia.dc.html.
   Copy exacto del handoff: tagline de marca "De invisible a imparable" (no
   la genérica "Coaching de alto rendimiento" que llevaba antes) y botón
   primario "Entrar".

   ── Un solo camino de acceso (10 ago 2026) ────────────────────────────────
   Esta pantalla tenía tres puertas y dos estaban rotas:

   · Google Sign-In no podía funcionar en iOS nativo: el SDK de Firebase rechaza
     el origen `capacitor://localhost` y en WKWebView no hay ventana emergente,
     así que el botón dejaba la app colgada en «Entrando…» para siempre (B-4).
     Además, ofrecer Google sin un login equivalente incumple la guideline 4.8
     de Apple y es rechazo seguro en revisión (B-3).
   · El enlace mágico de invitación no podía completarse dentro de la app: sin
     Universal Links ni escucha de deep link, `window.location.href` en nativo
     jamás lleva el `oobCode`, así que se abría en Safari (B-5). Y encima
     dependía de un ajuste de consola que nunca se activó, con lo que era la
     única puerta de alta y estaba cerrada (B-9).

   Ahora hay una sola: correo y contraseña. El alta la sigue creando el coach
   —no hay autorregistro—, pero la cuenta se crea en el servidor
   (`api/create-athlete.ts`) y Firebase manda un correo para que el atleta elija
   su contraseña. Ninguna contraseña viaja nunca por correo.

   Quitar las otras dos puertas no es solo simplificar: elimina de un golpe los
   cuatro bloqueantes de arriba y deja un único flujo que mantener, probar y
   explicarle al revisor de Apple.
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
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setResetMessage(`Te hemos enviado un correo a ${email} para crear una contraseña nueva. Revisa también la carpeta de spam.`);
    } catch (err: any) {
      console.error('sendPasswordResetEmail error:', err);
      setError(mensajeDeErrorAuth(err, 'enviar el correo'));
    } finally {
      setResetting(false);
    }
  };

  // Acceso: solo inicio de sesión. Las cuentas las crea el coach desde su panel
  // (api/create-athlete.ts) y el atleta elige contraseña desde el correo que le
  // manda Firebase; `firestore.rules` no deja crear un `user_profiles` sin una
  // invitación previa, así que un formulario de registro aquí no serviría.
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Escribe tu correo y tu contraseña.');
      return;
    }
    setError('');
    setResetMessage('');
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      setLocalBypassMode(false);
      onLoginSuccess(result.user);
    } catch (err: any) {
      console.error('signInWithEmailAndPassword error:', err);
      setError(mensajeDeErrorAuth(err));
    } finally {
      setLoading(false);
    }
  };

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
          <div role="alert" className="bg-danger/7 border border-danger/24 text-danger p-3 rounded-surface text-body-s mb-6 text-center">
            {error}
          </div>
        )}

        {resetMessage && (
          <div role="status" className="bg-accent/7 border border-accent/22 text-accent p-3 rounded-surface text-body-s mb-6 text-center">
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
              <label htmlFor="welcome-password" className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">Contraseña</label>
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
              id="welcome-password"
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

        {/* Sin autorregistro: el acceso lo crea Dani. La pantalla nunca ofrece
            "crear cuenta" — solo explica a quién escribir, y le recuerda a quien
            acaba de ser invitado dónde está su correo, que es la duda número uno
            del primer día. */}
        <p className="mt-6 text-center font-sans text-body-s text-ink-3">
          ¿Te acaban de invitar? <span className="text-ink-2">Busca en tu correo el mensaje para crear tu contraseña.</span>
        </p>
        <p className="mt-2 text-center font-sans text-body-s text-ink-3">
          ¿Aún no tienes acceso? <span className="text-ink-2">Escribe a Dani para empezar.</span>
        </p>
      </div>
    </div>
  );
}
