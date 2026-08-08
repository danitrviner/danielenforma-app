import React, { useState } from 'react';
import { inviteClient } from '../../../dbService';
import { mensajeDeErrorFirestore } from '../../../utils/erroresFirestore';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';

interface Props {
  onCerrar: () => void;
}

/**
 * Invitar una cuenta de app real (enlace de acceso sin contraseña por
 * email) — DISTINTO de "Nuevo cliente" (contacto CRM sin cuenta,
 * `NuevoClienteModal`). Reutiliza `inviteClient` de `db/invites.ts`, la
 * misma función que `ClientsScreen.tsx`; no se duplica lógica de envío.
 *
 * `auth/operation-not-allowed` es el error esperado hasta que Dani active
 * «Vínculo del correo electrónico» en Firebase Console (P0-2) — se muestra
 * tal cual, no como un fallo genérico, porque el arreglo no es de código.
 */
export default function InvitarAtletaModal({ onCerrar }: Props) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState<string | null>(null);

  const enviar = async () => {
    const limpio = email.trim();
    if (!limpio) return;
    setEnviando(true);
    setError('');
    try {
      await inviteClient(limpio);
      setEnviado(limpio);
    } catch (err) {
      console.error('inviteClient error:', err);
      // El copy vive en utils/erroresFirestore: es el mismo catálogo que usa el
      // alta desde ClientsScreen, y tener dos redacciones del mismo fallo en dos
      // pantallas es como se acaba arreglando solo una.
      setError(mensajeDeErrorFirestore(err, 'enviar la invitación'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo="Invitar atleta"
      onCerrar={onCerrar}
      footer={
        enviado ? (
          <BotonPrimario onClick={onCerrar}>Hecho</BotonPrimario>
        ) : (
          <>
            <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
            <BotonPrimario onClick={enviar} disabled={!email.trim() || enviando}>
              {enviando ? 'Enviando…' : 'Enviar invitación'}
            </BotonPrimario>
          </>
        )
      }
    >
      {enviado ? (
        <p className="font-sans text-caption text-ink">
          Invitación enviada a <span className="font-bold">{enviado}</span>. Cuando entre con ese enlace, tendrá cuenta de app.
        </p>
      ) : (
        <Campo label="Email del atleta *" error={error || undefined}>
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="atleta@ejemplo.com"
            autoFocus
          />
        </Campo>
      )}
    </Modal>
  );
}
