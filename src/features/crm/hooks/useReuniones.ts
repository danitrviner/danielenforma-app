import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCrmReuniones, getCrmReunionesByCliente, createCrmReunion, updateCrmReunion } from '../../../dbService';
import { crmKeys } from '../lib/crmQueries';
import type { Cliente, CrmReunion, TipoReunion } from '../types';

export interface NuevaReunion {
  tipo: TipoReunion;
  fecha: string;
}

export function useReuniones() {
  return useQuery({
    queryKey: crmKeys.reuniones,
    queryFn: getCrmReuniones,
  });
}

export function useReunionesDe(clientId?: string) {
  return useQuery({
    queryKey: crmKeys.reunionesDe(clientId ?? ''),
    queryFn: () => getCrmReunionesByCliente(clientId!),
    enabled: Boolean(clientId),
  });
}

function invalidarReuniones(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  qc.invalidateQueries({ queryKey: crmKeys.reuniones });
  qc.invalidateQueries({ queryKey: crmKeys.reunionesDe(clientId) });
}

export function useCrearReunion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cliente, coachEmail, datos }: {
      cliente: Cliente; coachEmail: string; datos: NuevaReunion;
    }) => createCrmReunion({
      clientId: cliente.id,
      clientNombre: cliente.nombre,
      tipo: datos.tipo,
      fecha: datos.fecha,
      realizada: false,
      createdBy: coachEmail,
    }),
    onSuccess: (_res, vars) => invalidarReuniones(qc, vars.cliente.id),
  });
}

// Cubre tanto la edición completa (vía ReunionModal) como el toggle rápido
// "Marcar como realizada" (updates: {realizada: true}) — misma operación de
// fondo, solo cambia qué se pasa en `updates`.
export function useActualizarReunion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; clientId: string; updates: Partial<CrmReunion> }) =>
      updateCrmReunion(id, updates),
    onSuccess: (_res, vars) => invalidarReuniones(qc, vars.clientId),
  });
}
