// Fusiona las dos poblaciones de clientes en una sola lista:
//   · `user_profiles` — quien tiene cuenta en la app (docId = UID de Auth)
//   · `crmContactos`  — quien no la tiene (leads, importados de hoja de cálculo)
//
// Toda la UI del CRM consume `Cliente`, sin saber de dónde salió cada uno. La
// única diferencia visible es que un cliente con `userId` puede abrirse en
// ClientHub y uno sin cuenta no.
//
// Un contacto con `userId` (persona que ya se registró) se fusiona con su
// perfil en una sola fila: los datos personales del contacto ganan solo donde
// el perfil no tiene nada, porque el perfil lo mantiene el propio atleta y está
// más fresco.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllUserProfiles, getCrmContactos } from '../../../dbService';
import type { UserProfile } from '../../../types';
import type { Cliente, CrmContacto, EstadoCrm } from '../types';

function perfilACliente(p: UserProfile): Cliente {
  return {
    id: p.userId,
    origen: 'perfil',
    userId: p.userId,
    nombre: p.displayName || p.email,
    email: p.email,
    dni: p.dni,
    direccion: p.direccion,
    telefono: p.telefono,
    // Un perfil sin `estadoCrm` es un cliente que ya existía antes del CRM:
    // se trata como activo en vez de forzar un backfill.
    estadoCrm: p.estadoCrm ?? 'activo',
    avatarUrl: p.avatarUrl,
    createdAt: p.createdAt,
  };
}

function contactoACliente(c: CrmContacto): Cliente {
  return {
    id: c.id,
    origen: 'contacto',
    contactoId: c.id,
    userId: c.userId,
    nombre: c.nombre,
    email: c.email,
    dni: c.dni,
    direccion: c.direccion,
    telefono: c.telefono,
    estadoCrm: c.estadoCrm,
    createdAt: c.createdAt,
  };
}

export interface UseClientesResult {
  clientes: Cliente[];
  isPending: boolean;
  error: unknown;
  contadores: Record<EstadoCrm, number>;
}

export function useClientes(): UseClientesResult {
  const perfilesQ = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
  });
  const contactosQ = useQuery({
    queryKey: ['crmContactos'],
    queryFn: getCrmContactos,
  });

  const clientes = useMemo<Cliente[]>(() => {
    const perfiles = perfilesQ.data ?? [];
    const contactos = contactosQ.data ?? [];

    const porUserId = new Map<string, Cliente>();
    for (const p of perfiles) porUserId.set(p.userId, perfilACliente(p));

    const sueltos: Cliente[] = [];
    for (const c of contactos) {
      const enlazado = c.userId ? porUserId.get(c.userId) : undefined;
      if (enlazado) {
        // Ya se registró: una sola fila. El perfil manda; el contacto rellena huecos.
        porUserId.set(c.userId!, {
          ...enlazado,
          contactoId: c.id,
          dni: enlazado.dni ?? c.dni,
          direccion: enlazado.direccion ?? c.direccion,
          telefono: enlazado.telefono ?? c.telefono,
        });
      } else {
        sueltos.push(contactoACliente(c));
      }
    }

    return [...porUserId.values(), ...sueltos]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [perfilesQ.data, contactosQ.data]);

  const contadores = useMemo(() => {
    const acc: Record<EstadoCrm, number> = { activo: 0, pausado: 0, baja: 0 };
    for (const c of clientes) acc[c.estadoCrm] += 1;
    return acc;
  }, [clientes]);

  return {
    clientes,
    isPending: perfilesQ.isPending || contactosQ.isPending,
    error: perfilesQ.error ?? contactosQ.error,
    contadores,
  };
}

export function useCliente(id?: string): { cliente: Cliente | null; isPending: boolean } {
  const { clientes, isPending } = useClientes();
  const cliente = useMemo(
    () => (id ? clientes.find(c => c.id === id) ?? null : null),
    [clientes, id]
  );
  return { cliente, isPending };
}
