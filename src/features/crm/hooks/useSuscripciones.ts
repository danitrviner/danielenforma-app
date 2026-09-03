import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCrmSuscripciones, getCrmSuscripcionesByCliente,
  createCrmSuscripcion, updateCrmSuscripcion, deleteCrmSuscripcion,
  registrarCobroSuscripcion,
} from '../../../dbService';
import { CobroYaRegistrado } from '../../../db/crm';
import { useToast } from '../../../hooks/useToast';
import { crmKeys } from '../lib/crmQueries';
import type { Cliente, CrmSuscripcion, Periodicidad } from '../types';

export interface NuevaSuscripcion {
  concepto: string;
  importeCents: number;
  periodicidad: Periodicidad;
  proximoCobro: string;
  /**
   * Genera ya el cobro pendiente de ese primer ciclo (aunque su fecha sea
   * futura) y deja `proximoCobro` en el ciclo siguiente. Sin esto, una
   * suscripción que empieza el lunes que viene no era dinero por cobrar en
   * ningún sitio hasta que alguien pulsara «Registrar cobro».
   */
  generarPrimerCobro?: boolean;
}

export function useSuscripciones() {
  return useQuery({
    queryKey: crmKeys.suscripciones,
    queryFn: getCrmSuscripciones,
  });
}

export function useSuscripcionesDe(clientId?: string) {
  return useQuery({
    queryKey: crmKeys.suscripcionesDe(clientId ?? ''),
    queryFn: () => getCrmSuscripcionesByCliente(clientId!),
    enabled: Boolean(clientId),
  });
}

// Invalida siempre las 4 keys relevantes (global + por-cliente, suscripciones
// + pagos) porque cualquier mutación de una suscripción puede afectar a las
// listas de pagos (crear una nueva, o generar un cobro).
function invalidarTodo(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  qc.invalidateQueries({ queryKey: crmKeys.suscripciones });
  qc.invalidateQueries({ queryKey: crmKeys.suscripcionesDe(clientId) });
  qc.invalidateQueries({ queryKey: crmKeys.pagos });
  qc.invalidateQueries({ queryKey: crmKeys.pagosDe(clientId) });
}

export function useCrearSuscripcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cliente, coachEmail, datos }: {
      cliente: Cliente; coachEmail: string; datos: NuevaSuscripcion;
    }) => createCrmSuscripcion(
      {
        clientId: cliente.id,
        clientNombre: cliente.nombre,
        concepto: datos.concepto,
        importeCents: datos.importeCents,
        periodicidad: datos.periodicidad,
        proximoCobro: datos.proximoCobro,
        estado: 'activa',
        createdBy: coachEmail,
      },
      { generarPrimerCobro: datos.generarPrimerCobro },
    ),
    onSuccess: (_res, vars) => invalidarTodo(qc, vars.cliente.id),
  });
}

export function useActualizarSuscripcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; clientId: string; updates: Partial<CrmSuscripcion> }) =>
      updateCrmSuscripcion(id, updates),
    onSuccess: (_res, vars) => invalidarTodo(qc, vars.clientId),
  });
}

/**
 * Borra la suscripción (la regla de recurrencia). Los cobros que ya generó se
 * quedan: son hechos, algunos ya cobrados. Para dejar de facturar sin perder
 * la ficha, «Pausar» sigue siendo lo suyo — esto es para las creadas por error.
 */
export function useEliminarSuscripcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; clientId: string }) => deleteCrmSuscripcion(id),
    onSuccess: (_res, vars) => invalidarTodo(qc, vars.clientId),
  });
}

/**
 * "Registrar cobro" — llama a la transacción idempotente del backend. Si
 * pierde la carrera contra otra invocación (doble clic, dos pestañas),
 * `CobroYaRegistrado` no se trata como error: se refresca la caché y se avisa
 * con un toast informativo, porque el cobro de ese ciclo SÍ se generó (por la
 * otra invocación), solo que esta llegó tarde.
 */
export function useRegistrarCobro() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ suscripcion, coachEmail }: { suscripcion: CrmSuscripcion; coachEmail: string }) =>
      registrarCobroSuscripcion(suscripcion, coachEmail),
    onSuccess: (_res, vars) => {
      invalidarTodo(qc, vars.suscripcion.clientId);
      showToast('Cobro registrado', 'success');
    },
    onError: (err, vars) => {
      if (err instanceof CobroYaRegistrado) {
        invalidarTodo(qc, vars.suscripcion.clientId);
        showToast(err.message, 'info');
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se ha podido registrar el cobro', 'error');
    },
  });
}
