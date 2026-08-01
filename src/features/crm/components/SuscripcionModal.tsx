import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useCrearSuscripcion, useActualizarSuscripcion } from '../hooks/useSuscripciones';
import { parseEurosACents, formatEuros, centsAInputEuros } from '../lib/dinero';
import { hoyISO } from '../lib/fechas';
import { EscrituraEncolada } from '../../../db/crm';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';
import ClienteSelector from './ClienteSelector';
import type { Cliente, CrmSuscripcion, Periodicidad } from '../types';

const PERIODICIDADES: { id: Periodicidad; label: string }[] = [
  { id: 'mensual',    label: 'Mensual' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'semestral',  label: 'Semestral' },
  { id: 'anual',      label: 'Anual' },
];

interface Props {
  cliente?: Cliente;
  suscripcion?: CrmSuscripcion;
  coachEmail: string;
  onCerrar: () => void;
}

// Crear o editar una suscripción. Sin generación automática de pago al crear
// (a diferencia de un servicio) — el primer cobro, igual que los siguientes,
// pasa siempre por el botón "Registrar cobro" de SuscripcionesBlock.
export default function SuscripcionModal({ cliente, suscripcion, coachEmail, onCerrar }: Props) {
  const { showToast } = useToast();
  const crear = useCrearSuscripcion();
  const actualizar = useActualizarSuscripcion();
  const modoEdicion = Boolean(suscripcion);

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(cliente ?? null);
  const [concepto, setConcepto] = useState(suscripcion?.concepto ?? '');
  const [importe, setImporte] = useState(suscripcion ? centsAInputEuros(suscripcion.importeCents) : '');
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(
    suscripcion && suscripcion.periodicidad !== 'unico' ? suscripcion.periodicidad : 'mensual'
  );
  const [proximoCobro, setProximoCobro] = useState(suscripcion?.proximoCobro ?? hoyISO());

  const importeCents = parseEurosACents(importe);
  const importeInvalido = importe.trim().length > 0 && importeCents === null;
  const mutando = crear.isPending || actualizar.isPending;

  // En modo edición no hace falta clienteSeleccionado: el ClienteSelector ni
  // se monta en ese modo (el cliente ya está fijado por la suscripción), así
  // que exigirlo aquí dejaría el botón deshabilitado para siempre al editar
  // (bug real, encontrado en verificación en vivo — ver mismo comentario en
  // PagoModal.tsx).
  const puedeGuardar =
    (modoEdicion || Boolean(clienteSeleccionado)) && concepto.trim().length > 0 &&
    !importeInvalido && Boolean(proximoCobro) && !mutando;

  const guardar = async () => {
    try {
      if (modoEdicion && suscripcion) {
        await actualizar.mutateAsync({
          id: suscripcion.id,
          clientId: suscripcion.clientId,
          updates: {
            concepto: concepto.trim(),
            importeCents: importeCents ?? 0,
            periodicidad,
            proximoCobro,
          },
        });
        showToast('Suscripción actualizada', 'success');
      } else if (clienteSeleccionado) {
        await crear.mutateAsync({
          cliente: clienteSeleccionado,
          coachEmail,
          datos: { concepto: concepto.trim(), importeCents: importeCents ?? 0, periodicidad, proximoCobro },
        });
        showToast('Suscripción creada', 'success');
      }
      onCerrar();
    } catch (err) {
      if (err instanceof EscrituraEncolada) {
        showToast('Guardado sin conexión. Se sincronizará solo.', 'info');
        onCerrar();
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se ha podido guardar la suscripción', 'error');
    }
  };

  return (
    <Modal
      titulo={modoEdicion ? `Editar suscripción · ${suscripcion!.clientNombre}` : 'Nueva suscripción'}
      onCerrar={onCerrar}
      footer={
        <>
          <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={!puedeGuardar}>
            {mutando ? 'Guardando…' : modoEdicion ? 'Guardar cambios' : 'Crear suscripción'}
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
          <input className={inputClass} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Suscripción mensual" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Importe"
            error={importeInvalido ? 'No entiendo ese importe.' : undefined}
            hint={!importeInvalido && importeCents ? formatEuros(importeCents) : 'En euros: 49,90'}
          >
            <input className={inputClass} value={importe} onChange={e => setImporte(e.target.value)} placeholder="49,90" inputMode="decimal" />
          </Campo>

          <Campo label="Periodicidad">
            <select
              className={inputClass}
              value={periodicidad}
              onChange={e => setPeriodicidad(e.target.value as Periodicidad)}
            >
              {PERIODICIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Campo>
        </div>

        <Campo label="Próximo cobro" hint="El primer cobro también se genera con el botón «Registrar cobro», no al crear.">
          <input className={inputClass} type="date" value={proximoCobro} onChange={e => setProximoCobro(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}
