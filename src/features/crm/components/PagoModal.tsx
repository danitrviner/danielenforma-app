import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useCrearPago, useActualizarPago } from '../hooks/usePagos';
import { parseEurosACents, formatEuros, centsAInputEuros } from '../lib/dinero';
import { hoyISO } from '../lib/fechas';
import { EscrituraEncolada } from '../../../db/crm';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';
import ClienteSelector from './ClienteSelector';
import type { Cliente, CrmPago, EstadoPago } from '../types';

interface Props {
  cliente?: Cliente;
  pago?: CrmPago;
  coachEmail: string;
  onCerrar: () => void;
}

// Crear (pago manual, no ligado a servicio ni suscripción) o editar un pago
// existente. `clientId` nunca se reasigna en modo edición — un pago pertenece
// a quien se creó, cambiar el dueño sería un cambio de propietario del dinero,
// no una corrección.
export default function PagoModal({ cliente, pago, coachEmail, onCerrar }: Props) {
  const { showToast } = useToast();
  const crear = useCrearPago();
  const actualizar = useActualizarPago();
  const modoEdicion = Boolean(pago);

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(cliente ?? null);
  const [concepto, setConcepto] = useState(pago?.concepto ?? '');
  const [importe, setImporte] = useState(pago ? centsAInputEuros(pago.importeCents) : '');
  const [fechaEmision, setFechaEmision] = useState(pago?.fechaEmision ?? hoyISO());
  const [estado, setEstado] = useState<EstadoPago>(pago?.estado ?? 'pendiente');
  const [fechaCobro, setFechaCobro] = useState(pago?.fechaCobro ?? hoyISO());

  const importeCents = parseEurosACents(importe);
  const importeInvalido = importe.trim().length > 0 && importeCents === null;
  const mutando = crear.isPending || actualizar.isPending;

  // En modo edición no hace falta clienteSeleccionado: el cliente ya está
  // fijado por `pago.clientId` y no se reasigna (ver comentario de arriba);
  // el ClienteSelector ni se monta en ese modo, así que exigirlo aquí dejaría
  // el botón deshabilitado para siempre al editar.
  const puedeGuardar =
    (modoEdicion || Boolean(clienteSeleccionado)) && concepto.trim().length > 0 &&
    !importeInvalido && Boolean(fechaEmision) && !mutando;

  const guardar = async () => {
    try {
      if (modoEdicion && pago) {
        await actualizar.mutateAsync({
          id: pago.id,
          clientId: pago.clientId,
          updates: {
            concepto: concepto.trim(),
            importeCents: importeCents ?? 0,
            fechaEmision,
            estado,
            fechaCobro: estado === 'pagado' ? fechaCobro : undefined,
          },
        });
        showToast('Pago actualizado', 'success');
      } else if (clienteSeleccionado) {
        await crear.mutateAsync({
          cliente: clienteSeleccionado,
          coachEmail,
          datos: {
            concepto: concepto.trim(),
            importeCents: importeCents ?? 0,
            estado,
            fechaEmision,
            fechaCobro: estado === 'pagado' ? fechaCobro : undefined,
          },
        });
        showToast('Pago registrado', 'success');
      }
      onCerrar();
    } catch (err) {
      if (err instanceof EscrituraEncolada) {
        showToast('Guardado sin conexión. Se sincronizará solo.', 'info');
        onCerrar();
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se ha podido guardar el pago', 'error');
    }
  };

  return (
    <Modal
      titulo={modoEdicion ? `Editar pago · ${pago!.clientNombre}` : 'Registrar pago'}
      onCerrar={onCerrar}
      footer={
        <>
          <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={!puedeGuardar}>
            {mutando ? 'Guardando…' : modoEdicion ? 'Guardar cambios' : 'Registrar pago'}
          </BotonPrimario>
        </>
      }
    >
      <div className="space-y-3">
        {!modoEdicion && (
          <Campo label="Cliente *">
            <ClienteSelector value={clienteSeleccionado} onChange={setClienteSeleccionado} />
          </Campo>
        )}

        <Campo label="Concepto *">
          <input className={inputClass} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Sesión suelta" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Importe"
            error={importeInvalido ? 'No entiendo ese importe.' : undefined}
            hint={!importeInvalido && importeCents ? formatEuros(importeCents) : 'En euros: 49,90'}
          >
            <input className={inputClass} value={importe} onChange={e => setImporte(e.target.value)} placeholder="49,90" inputMode="decimal" />
          </Campo>

          <Campo label="Fecha de emisión">
            <input className={inputClass} type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
          </Campo>
        </div>

        <Campo label="Estado">
          <div className="flex gap-1.5">
            {(['pendiente', 'pagado'] as EstadoPago[]).map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setEstado(e)}
                aria-pressed={estado === e}
                className={`flex-1 px-2.5 py-1.5 rounded-lg font-mono text-[9px] uppercase tracking-widest transition-colors ${
                  estado === e
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-field text-ink-2 border border-white/7 hover:border-white/12'
                }`}
              >
                {e === 'pendiente' ? 'Pendiente' : 'Pagado'}
              </button>
            ))}
          </div>
        </Campo>

        {estado === 'pagado' && (
          <Campo label="Fecha de cobro">
            <input className={inputClass} type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} />
          </Campo>
        )}
      </div>
    </Modal>
  );
}
