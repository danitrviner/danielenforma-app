import React, { useState } from 'react';
import { eliminarMiCuenta } from '../db/cuenta';
import { mensajeDeErrorAuth } from '../utils/erroresAuth';
import { Dialog, Button, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Eliminar mi cuenta» (B-1 · 01-1 · 03-4).

   Sigue el diseño que ya existía en el handoff de Fase 3
   (docs/design/fase3/Transversales - Experiencia.dc.html:259): título, la frase
   «Esto no se puede deshacer» y el desglose literal de qué se pierde. No se
   inventa otra pantalla.

   Dos barreras antes de borrar, y ninguna es decorativa:

     · Escribir el propio correo. Obliga a leer, y hace imposible el borrado por
       pulsación accidental o por un niño jugando con el móvil.
     · La contraseña. El servidor rechaza el borrado si el inicio de sesión tiene
       más de 10 minutos, así que un móvil desbloqueado olvidado encima de una
       mesa no basta.

   Y una promesa que la UI tiene que cumplir: lo que se dice aquí es lo que hace
   `api/delete-account.ts`. Por eso se menciona explícitamente lo que NO se
   borra —los registros de facturación, anonimizados por obligación fiscal—,
   que es justo lo que una pantalla de borrado suele callarse.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  onClose: () => void;
  email: string;
}

const SE_PIERDE = [
  'Tus entrenamientos, series y cargas registradas',
  'Tus planes de nutrición, menús y adherencia',
  'Tu peso, tus medidas y todo tu historial de progreso',
  'Tus fotos de progreso y los vídeos que hayas subido',
  'Tus revisiones, cuestionarios y notas con tu entrenador',
  'Tus datos de cardio y frecuencia cardíaca',
];

export default function EliminarCuentaDialog({ open, onClose, email }: Props) {
  const [confirmacionEmail, setConfirmacionEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [borrando, setBorrando] = useState(false);

  const emailCoincide = confirmacionEmail.trim().toLowerCase() === email.trim().toLowerCase();
  const puedeBorrar = emailCoincide && password.length > 0 && !borrando;

  const cerrar = () => {
    if (borrando) return; // no se cierra a media faena
    setConfirmacionEmail('');
    setPassword('');
    setError('');
    onClose();
  };

  const borrar = async () => {
    if (!puedeBorrar) return;
    setError('');
    setBorrando(true);
    try {
      await eliminarMiCuenta(password);
      // No se toca el estado ni se navega: `eliminarMiCuenta` cierra la sesión,
      // y el `onAuthStateChanged` de App.tsx devuelve a la pantalla de acceso.
      // Intentar además redirigir desde aquí solo produciría una carrera.
    } catch (err) {
      console.error('eliminarMiCuenta error:', err);
      setError(mensajeDeErrorAuth(err, 'eliminar la cuenta'));
      setBorrando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={cerrar}
      title="Eliminar tu cuenta"
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="secondary" size="m" onClick={cerrar} disabled={borrando} fullWidth>
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="m"
            onClick={borrar}
            disabled={!puedeBorrar}
            loading={borrando}
            loadingLabel="Eliminando"
            fullWidth
          >
            Eliminar para siempre
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="font-sans text-body-s text-ink-2">
          Esto no se puede deshacer. Perderías, exactamente:
        </p>

        <ul className="rounded-control bg-raised overflow-hidden">
          {SE_PIERDE.map(linea => (
            <li
              key={linea}
              className="px-4 py-3 font-sans text-body-s text-ink-2 border-b border-hairline last:border-b-0"
            >
              {linea}
            </li>
          ))}
        </ul>

        <div className="flex gap-3 rounded-control bg-raised p-3">
          <Icon name="receipt_long" size="s" className="text-accent shrink-0 mt-0.5" />
          <p className="font-sans text-caption text-ink-3">
            Los registros de facturación se conservan <strong className="text-ink-2">sin tus datos
            personales</strong>: la ley obliga a guardar la documentación de los pagos ya cobrados.
            Tu nombre, correo, DNI, dirección y teléfono se sustituyen por un identificador sin
            significado.{' '}
            <a
              href="/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              Más detalle
            </a>
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-danger/7 border border-danger/24 text-danger p-3 rounded-surface text-body-s">
            {error}
          </div>
        )}

        <div className="space-y-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="borrar-email" className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
              Escribe {email} para confirmar
            </label>
            <input
              id="borrar-email"
              type="email"
              value={confirmacionEmail}
              onChange={e => setConfirmacionEmail(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={borrando}
              className="h-[48px] w-full rounded-field border border-hairline bg-field px-4 font-sans text-title-s text-ink focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger focus:ring-inset disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="borrar-password" className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3">
              Tu contraseña
            </label>
            <input
              id="borrar-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={borrando}
              className="h-[48px] w-full rounded-field border border-hairline bg-field px-4 font-sans text-title-s text-ink focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger focus:ring-inset disabled:opacity-50"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
