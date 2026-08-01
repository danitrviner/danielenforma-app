// Escrituras sobre un cliente. Encaminan solas al sitio correcto: si tiene
// cuenta se escribe en `user_profiles`, si no en `crmContactos`. Los
// componentes no deciden esto.
//
// `estadoCrm` de un cliente CON cuenta lo escribe el coach sobre user_profiles,
// y las reglas lo permiten solo a él (está en la lista de campos bloqueados del
// `allow update` del atleta, junto a planStartDate/role/xp).

import { useMutation, useQueryClient } from '@tanstack/react-query';
// `updateClienteCrmFields` y no `updateUserProfile`: la segunda cae a
// localStorage en silencio cuando Firestore falla (src/db/profiles.ts:326) y un
// cambio de estado comercial no puede perderse así.
import { updateClienteCrmFields, updateCrmContacto, createCrmContacto } from '../../../dbService';
import { normalizarDni, normalizarPrefijo, normalizarNumero } from '../lib/identidad';
import { crmKeys } from '../lib/crmQueries';
import type { Cliente, CrmContacto, EstadoCrm } from '../types';

export interface DatosPersonales {
  nombre?: string;
  email?: string;
  dni?: string;
  direccion?: string;
  telefono?: { prefijo: string; numero: string };
  estadoCrm?: EstadoCrm;
}

// Normaliza antes de escribir para que el mismo DNI escrito de tres formas
// («12345678z», «12345678-Z», «12345678 Z») sea un solo valor en Firestore —
// si no, la detección de duplicados de la importación no sirve de nada.
function normalizar(d: DatosPersonales): DatosPersonales {
  const out: DatosPersonales = { ...d };
  if (d.dni !== undefined) out.dni = normalizarDni(d.dni) || undefined;
  if (d.nombre !== undefined) out.nombre = d.nombre.trim();
  if (d.email !== undefined) out.email = d.email.trim().toLowerCase() || undefined;
  if (d.direccion !== undefined) out.direccion = d.direccion.trim() || undefined;
  if (d.telefono !== undefined) {
    const numero = normalizarNumero(d.telefono.numero);
    out.telefono = numero
      ? { prefijo: normalizarPrefijo(d.telefono.prefijo) || '+34', numero }
      : undefined;
  }
  return out;
}

export function useGuardarCliente() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ cliente, datos }: { cliente: Cliente; datos: DatosPersonales }) => {
      const d = normalizar(datos);

      if (cliente.origen === 'perfil' && cliente.userId) {
        await updateClienteCrmFields(cliente.userId, {
          ...(d.nombre !== undefined ? { displayName: d.nombre } : {}),
          ...(d.dni !== undefined ? { dni: d.dni } : {}),
          ...(d.direccion !== undefined ? { direccion: d.direccion } : {}),
          ...(d.telefono !== undefined ? { telefono: d.telefono } : {}),
          ...(d.estadoCrm !== undefined ? { estadoCrm: d.estadoCrm } : {}),
        });
        return;
      }

      if (cliente.contactoId) {
        await updateCrmContacto(cliente.contactoId, {
          ...(d.nombre !== undefined ? { nombre: d.nombre } : {}),
          ...(d.email !== undefined ? { email: d.email } : {}),
          ...(d.dni !== undefined ? { dni: d.dni } : {}),
          ...(d.direccion !== undefined ? { direccion: d.direccion } : {}),
          ...(d.telefono !== undefined ? { telefono: d.telefono } : {}),
          ...(d.estadoCrm !== undefined ? { estadoCrm: d.estadoCrm } : {}),
        });
        return;
      }

      throw new Error('Cliente sin destino de escritura: no tiene ni perfil ni contacto.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.perfiles });
      qc.invalidateQueries({ queryKey: crmKeys.contactos });
    },
  });
}

export function useCrearContacto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (datos: DatosPersonales & { origenCaptacion?: string; notas?: string }) => {
      const d = normalizar(datos);
      if (!d.nombre) throw new Error('El nombre es obligatorio.');

      const payload: Omit<CrmContacto, 'id' | 'createdAt' | 'updatedAt'> = {
        nombre: d.nombre,
        email: d.email,
        dni: d.dni,
        direccion: d.direccion,
        telefono: d.telefono,
        estadoCrm: d.estadoCrm ?? 'activo',
        origen: datos.origenCaptacion,
        notas: datos.notas,
      };
      return createCrmContacto(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.contactos });
    },
  });
}
