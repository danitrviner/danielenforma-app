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
import { partirPorArchivado } from '../lib/archivado';
import type { Cliente, CrmContacto, EstadoCrm } from '../types';

function perfilACliente(p: UserProfile): Cliente {
  return {
    id: p.userId,
    fuente: 'perfil',
    userId: p.userId,
    nombre: p.displayName || p.email,
    email: p.email,
    dni: p.dni,
    direccion: p.direccion,
    telefono: p.telefono,
    // Un perfil sin `estadoCrm` es un cliente que ya existía antes del CRM:
    // se trata como activo en vez de forzar un backfill.
    estadoCrm: p.estadoCrm ?? 'activo',
    // Un perfil anonimizado (cuenta borrada, `borrado_xxxx@anonimo.local`) se
    // trata como archivado: se conserva por el histórico del negocio, pero no
    // es alguien con quien se pueda trabajar y no debe ensuciar ninguna lista.
    archivado: p.archivadoCrm === true || p.anonimizado === true,
    anonimizado: p.anonimizado === true,
    origen: p.origen,
    fechaBaja: p.fechaBaja,
    motivoBaja: p.motivoBaja,
    motivoBajaDetalle: p.motivoBajaDetalle,
    avatarUrl: p.avatarUrl,
    createdAt: p.createdAt,
  };
}

function contactoACliente(c: CrmContacto): Cliente {
  return {
    id: c.id,
    fuente: 'contacto',
    contactoId: c.id,
    userId: c.userId,
    nombre: c.nombre,
    email: c.email,
    dni: c.dni,
    direccion: c.direccion,
    telefono: c.telefono,
    estadoCrm: c.estadoCrm,
    origen: c.origen,
    archivado: c.archivado === true,
    fechaBaja: c.fechaBaja,
    motivoBaja: c.motivoBaja,
    motivoBajaDetalle: c.motivoBajaDetalle,
    createdAt: c.createdAt,
  };
}

export interface UseClientesResult {
  /** Los que se trabajan: sin archivados (salvo que se pidan expresamente). */
  clientes: Cliente[];
  /** Solo los archivados — para el filtro «Archivados» y su contador. */
  archivados: Cliente[];
  isPending: boolean;
  error: unknown;
  /** Cuenta por estado SOBRE `clientes`: un archivado no suma en ningún lote. */
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
          // El origen (canal de captación) casi siempre lo tiene el contacto
          // importado, no el perfil que se creó después al registrarse — el
          // perfil manda solo si de verdad ya tiene uno.
          origen: enlazado.origen ?? c.origen,
          // Archivado si lo está por cualquiera de los dos lados: la fila es
          // una sola, y basta con que se haya archivado desde uno.
          archivado: enlazado.archivado || c.archivado === true,
        });
      } else {
        sueltos.push(contactoACliente(c));
      }
    }

    return [...porUserId.values(), ...sueltos]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [perfilesQ.data, contactosQ.data]);

  // El archivado se parte AQUÍ, en el único sitio por el que pasa toda la UI
  // del CRM, y no en cada pantalla: así ninguna lista, contador o selector
  // nuevo se olvida de excluirlos y vuelve a enseñar a quien se quitó de en
  // medio. Quien los necesite pide `archivados` a propósito.
  const { visibles, archivados } = useMemo(() => partirPorArchivado(clientes), [clientes]);

  const contadores = useMemo(() => {
    const acc: Record<EstadoCrm, number> = { lead: 0, llamada_agendada: 0, activo: 0, pausado: 0, baja: 0 };
    for (const c of visibles) acc[c.estadoCrm] += 1;
    return acc;
  }, [visibles]);

  return {
    clientes: visibles,
    archivados,
    isPending: perfilesQ.isPending || contactosQ.isPending,
    error: perfilesQ.error ?? contactosQ.error,
    contadores,
  };
}

// La ficha SÍ busca entre los archivados: si no, archivar a alguien y pulsar
// su fila dejaba un «Cliente no encontrado» del que no se podía desarchivar.
export function useCliente(id?: string): { cliente: Cliente | null; isPending: boolean } {
  const { clientes, archivados, isPending } = useClientes();
  const cliente = useMemo(
    () => (id ? [...clientes, ...archivados].find(c => c.id === id) ?? null : null),
    [clientes, archivados, id]
  );
  return { cliente, isPending };
}
