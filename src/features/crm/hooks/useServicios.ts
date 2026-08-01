import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCrmServiciosByCliente, createCrmServicioConPago,
  updateCrmServicio, archivarCrmServicio, desarchivarCrmServicio,
} from '../../../dbService';
import { crmKeys } from '../lib/crmQueries';
import { hoyISO } from '../lib/fechas';
import type { Cliente, CrmServicio, Periodicidad } from '../types';

export interface NuevoServicio {
  nombre: string;
  importeCents: number;
  periodicidad: Periodicidad;
  fechaContratacion: string;
  fechaInicio: string;
  fechaFin?: string;
  descripcion?: string;
  /** Genera el pago pendiente en la misma transacción. Por defecto sí. */
  generarPago: boolean;
}

export function useServiciosDe(clientId?: string) {
  return useQuery({
    queryKey: crmKeys.serviciosDe(clientId ?? ''),
    queryFn: () => getCrmServiciosByCliente(clientId!),
    enabled: Boolean(clientId),
  });
}

/**
 * El servicio «actual» de un cliente para la columna de la tabla: el activo
 * (no archivado, sin fecha de fin o con fin en el futuro) que empezó más tarde.
 * Devuelve null si no tiene ninguno vigente.
 */
export function servicioActual(servicios: CrmServicio[], hoy: string = hoyISO()): CrmServicio | null {
  const vigentes = servicios
    .filter(s => !s.archivado)
    .filter(s => !s.fechaFin || s.fechaFin >= hoy)
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  return vigentes[0] ?? null;
}

export function useCrearServicio() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ cliente, datos, coachEmail }: {
      cliente: Cliente; datos: NuevoServicio; coachEmail: string;
    }) => {
      const { generarPago, ...resto } = datos;
      return createCrmServicioConPago(
        {
          ...resto,
          clientId: cliente.id,
          clientNombre: cliente.nombre,
          createdBy: coachEmail,
        },
        { generarPago }
      );
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.serviciosDe(vars.cliente.id) });
      qc.invalidateQueries({ queryKey: crmKeys.pagosDe(vars.cliente.id) });
      qc.invalidateQueries({ queryKey: crmKeys.servicios });
      qc.invalidateQueries({ queryKey: crmKeys.pagos });
    },
  });
}

export function useActualizarServicio(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CrmServicio> }) =>
      updateCrmServicio(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.serviciosDe(clientId) });
      qc.invalidateQueries({ queryKey: crmKeys.servicios });
    },
  });
}

export function useArchivarServicio(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archivar }: { id: string; archivar: boolean }) =>
      archivar ? archivarCrmServicio(id) : desarchivarCrmServicio(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.serviciosDe(clientId) });
      qc.invalidateQueries({ queryKey: crmKeys.servicios });
    },
  });
}
