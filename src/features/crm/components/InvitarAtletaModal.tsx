import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { inviteClient } from '../../../dbService';
import { mensajeDeErrorFirestore } from '../../../utils/erroresFirestore';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';

interface Props {
  onCerrar: () => void;
  /** 14-08 (tarea 11). Cuando se abre desde la ficha de un contacto sin
   *  cuenta (ClienteDetail), precarga su email — así el alta usa el MISMO
   *  correo que el contacto y `api/create-athlete` puede enlazarlos por
   *  email sin que el coach tenga que volver a teclearlo (y arriesgarse a
   *  una mayúscula o un espacio distintos que rompan el enlace). */
  emailInicial?: string;
}

/**
 * Da de alta una cuenta de app real — DISTINTO de "Nuevo cliente" (contacto CRM
 * sin cuenta, `NuevoClienteModal`). Reutiliza `inviteClient` de `db/invites.ts`,
 * la misma función que `ClientsScreen.tsx`; no se duplica lógica de alta.
 *
 * Antes esto mandaba un enlace de acceso sin contraseña y fallaba siempre con
 * `auth/operation-not-allowed`, porque dependía de un ajuste de la consola de
 * Firebase que nunca se activó. Ahora la cuenta la crea el servidor y Firebase
 * manda un correo para que el atleta elija su contraseña, así que no depende de
 * ningún ajuste pendiente.
 */
export default function InvitarAtletaModal({ onCerrar, emailInicial }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(emailInicial ?? '');
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
      // `api/create-athlete` puede haber enlazado un contacto del CRM
      // existente (mismo email) con el `userId` recién creado — sin esto, el
      // coach vería el alta confirmada pero «Ficha de entreno» seguiría sin
      // aparecer hasta recargar.
      queryClient.invalidateQueries({ queryKey: ['crmContactos'] });
      queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
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
          Cuenta creada para <span className="font-bold">{enviado}</span>. Le hemos mandado un correo
          para que elija su contraseña; con ella entra en la app. Si no lo encuentra, dile que mire en
          spam o vuelve a invitarle desde aquí.
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
