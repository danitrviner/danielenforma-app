import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useCrearReunion, useActualizarReunion } from '../hooks/useReuniones';
import { hoyISO } from '../lib/fechas';
import { EscrituraEncolada } from '../../../db/crm';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';
import ClienteSelector from './ClienteSelector';
import type { Cliente, CrmReunion, TipoReunion } from '../types';

const TIPOS: { id: TipoReunion; label: string }[] = [
  { id: 'optimizacion', label: 'Optimización' },
  { id: 'graduacion',   label: 'Graduación' },
];

interface Props {
  cliente?: Cliente;
  reunion?: CrmReunion;
  coachEmail: string;
  onCerrar: () => void;
}

export default function ReunionModal({ cliente, reunion, coachEmail, onCerrar }: Props) {
  const { showToast } = useToast();
  const crear = useCrearReunion();
  const actualizar = useActualizarReunion();
  const modoEdicion = Boolean(reunion);

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(cliente ?? null);
  const [tipo, setTipo] = useState<TipoReunion>(reunion?.tipo ?? 'optimizacion');
  const [fecha, setFecha] = useState(reunion?.fecha ?? hoyISO());

  const mutando = crear.isPending || actualizar.isPending;
  // En modo edición no hace falta clienteSeleccionado: el ClienteSelector ni se
  // monta ahí (el cliente ya está fijado por la reunión existente) — mismo
  // fix ya aplicado en PagoModal/SuscripcionModal tras encontrar el bug real
  // de "Guardar cambios" deshabilitado para siempre en Fase 2.
  const puedeGuardar = (modoEdicion || Boolean(clienteSeleccionado)) && Boolean(fecha) && !mutando;

  const guardar = async () => {
    try {
      if (modoEdicion && reunion) {
        await actualizar.mutateAsync({ id: reunion.id, clientId: reunion.clientId, updates: { tipo, fecha } });
        showToast('Reunión actualizada', 'success');
      } else if (clienteSeleccionado) {
        await crear.mutateAsync({ cliente: clienteSeleccionado, coachEmail, datos: { tipo, fecha } });
        showToast('Reunión creada', 'success');
      }
      onCerrar();
    } catch (err) {
      if (err instanceof EscrituraEncolada) {
        showToast('Guardado sin conexión. Se sincronizará solo.', 'info');
        onCerrar();
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se ha podido guardar la reunión', 'error');
    }
  };

  return (
    <Modal
      titulo={modoEdicion ? `Editar reunión · ${reunion!.clientNombre}` : 'Nueva reunión'}
      onCerrar={onCerrar}
      footer={
        <>
          <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={!puedeGuardar}>
            {mutando ? 'Guardando…' : modoEdicion ? 'Guardar cambios' : 'Crear reunión'}
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

        <Campo label="Tipo">
          <div className="flex gap-1.5">
            {TIPOS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                aria-pressed={tipo === t.id}
                className={`flex-1 px-2.5 py-1.5 rounded-control font-mono text-caption uppercase tracking-widest transition-colors ${
                  tipo === t.id
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-field text-ink-2 border border-hairline hover:border-strong'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Campo>

        <Campo label="Fecha *">
          <input className={inputClass} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}
