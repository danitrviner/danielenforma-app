import React, { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPendingInvites, inviteClient, cancelInvite, markInviteJoined, getAllUserProfiles } from '../../../dbService';
import { mensajeDeErrorFirestore } from '../../../utils/erroresFirestore';
import { useToast } from '../../../hooks/useToast';
import { Icon } from '../../../components/ui';

/* 14-08 (tarea 13). Vivía dentro de ClientsScreen (el «Inicio» del coach),
   mezclado con el resto del panel de atletas — se mueve aquí, al CRM, que es
   donde vive el resto del ciclo de alta de un cliente (Nuevo cliente,
   Importar, Invitar atleta). No enseña nada si no hay invitaciones
   pendientes: no es un hueco vacío que ocupar en la pantalla, es un aviso
   que solo importa cuando hay algo pendiente de verdad. */
export default function InvitacionesPendientesPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const pendingInvitesKey = ['pendingInvites'] as const;
  const { data: pendingInvites = [] } = useQuery({
    queryKey: pendingInvitesKey,
    queryFn: getPendingInvites,
  });
  // Comparte caché con ClientsScreen/CommandPalette/etc.
  const { data: profiles = [] } = useQuery({ queryKey: ['userProfiles'], queryFn: getAllUserProfiles });
  const joinedEmails = useMemo(
    () => new Set(profiles.map(p => p.email.toLowerCase())),
    [profiles]
  );
  // Red de seguridad: si markInviteJoined nunca pudo escribir (el atleta no
  // tiene permiso de lectura en reglas antiguas sin desplegar, o cualquier
  // otro fallo), el coach SÍ puede escribir aquí — lo marca perezosamente en
  // cuanto ve que ya existe un perfil con ese email, así una invitación
  // aceptada desaparece de la lista aunque el atleta nunca la haya podido
  // marcar él mismo.
  useEffect(() => {
    const yaUnidos = pendingInvites.filter(inv => joinedEmails.has(inv.email.toLowerCase()));
    if (yaUnidos.length === 0) return;
    Promise.all(yaUnidos.map(inv => markInviteJoined(inv.email)))
      .then(() => queryClient.invalidateQueries({ queryKey: pendingInvitesKey }))
      .catch(err => console.warn('marcado perezoso de invitaciones aceptadas falló:', err));
  }, [pendingInvites, joinedEmails, queryClient]);

  const visibleInvites = pendingInvites.filter(inv => !joinedEmails.has(inv.email.toLowerCase()));

  if (visibleInvites.length === 0) return null;

  const reenviar = async (email: string) => {
    try {
      await inviteClient(email);
      queryClient.invalidateQueries({ queryKey: pendingInvitesKey });
      showToast(`Correo reenviado a ${email} para que cree su contraseña.`, 'success');
    } catch (err) {
      console.error('resend invite error:', err);
      // Mismo catálogo que el alta: si el correo salió y lo que falló fue el
      // registro, decir "no se pudo reenviar" volvería a mentir.
      showToast(mensajeDeErrorFirestore(err, `reenviar la invitación a ${email}`), 'error');
    }
  };

  const cancelar = async (email: string) => {
    try {
      await cancelInvite(email);
      queryClient.invalidateQueries({ queryKey: pendingInvitesKey });
      showToast(`Invitación a ${email} cancelada.`, 'success');
    } catch (err) {
      console.error('cancel invite error:', err);
      showToast(mensajeDeErrorFirestore(err, `cancelar la invitación a ${email}`), 'error');
    }
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4">
      <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-3">
        Invitaciones pendientes ({visibleInvites.length})
      </p>
      <div className="space-y-2">
        {visibleInvites.map(inv => (
          <div key={inv.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
            <Icon name="mail" size="s" className="text-ink-2" />
            <div className="flex-1 min-w-0">
              <p className="font-sans text-label text-ink truncate">{inv.email}</p>
              <p className="font-mono text-caption text-ink-3">
                Invitado el {new Date(inv.invitedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => reenviar(inv.email)}
              className="font-mono text-caption text-data hover:underline uppercase tracking-wide flex-shrink-0"
            >
              Reenviar
            </button>
            <button
              type="button"
              onClick={() => cancelar(inv.email)}
              className="font-mono text-caption text-danger hover:underline uppercase tracking-wide flex-shrink-0"
            >
              Cancelar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
