import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCrmPagos, getCrmPagosByCliente, createCrmPago, updateCrmPago, deleteCrmPago } from '../../../dbService';
import { crmKeys } from '../lib/crmQueries';
import { hoyISO } from '../lib/fechas';
import type { Cliente, CrmPago, EstadoPago } from '../types';

export interface NuevoPago {
  concepto: string;
  importeCents: number;
  estado: EstadoPago;
  fechaEmision: string;
  fechaCobro?: string;
}

export function usePagos() {
  return useQuery({
    queryKey: crmKeys.pagos,
    queryFn: getCrmPagos,
  });
}

export function usePagosDe(clientId?: string) {
  return useQuery({
    queryKey: crmKeys.pagosDe(clientId ?? ''),
    queryFn: () => getCrmPagosByCliente(clientId!),
    enabled: Boolean(clientId),
  });
}

function invalidarPagos(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  qc.invalidateQueries({ queryKey: crmKeys.pagos });
  qc.invalidateQueries({ queryKey: crmKeys.pagosDe(clientId) });
}

export function useCrearPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cliente, coachEmail, datos }: {
      cliente: Cliente; coachEmail: string; datos: NuevoPago;
    }) => createCrmPago({
      clientId: cliente.id,
      clientNombre: cliente.nombre,
      concepto: datos.concepto,
      importeCents: datos.importeCents,
      estado: datos.estado,
      fechaEmision: datos.fechaEmision,
      fechaCobro: datos.estado === 'pagado' ? (datos.fechaCobro || hoyISO()) : undefined,
      createdBy: coachEmail,
    }),
    onSuccess: (_res, vars) => invalidarPagos(qc, vars.cliente.id),
  });
}

// Cubre tanto la edición completa (vía PagoModal) como la acción rápida de un
// clic "marcar como pagado" (updates: {estado:'pagado', fechaCobro: hoyISO()})
// — ambas son la misma operación de fondo, solo cambia qué updates se pasan.
export function useActualizarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; clientId: string; updates: Partial<CrmPago> }) =>
      updateCrmPago(id, updates),
    onSuccess: (_res, vars) => invalidarPagos(qc, vars.clientId),
  });
}

// El botón que llama a esto solo se pinta si `pago.estado === 'pendiente'` —
// la regla de Firestore es quien de verdad lo impide (ver src/db/crm.ts);
// aquí no se repite esa comprobación, así que un intento sobre un pago ya
// pagado (bug de UI, no debería ocurrir) vuelve como error de Firestore.
export function useEliminarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; clientId: string }) => deleteCrmPago(id),
    onSuccess: (_res, vars) => invalidarPagos(qc, vars.clientId),
  });
}
