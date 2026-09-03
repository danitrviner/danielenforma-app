import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useCrearSuscripcion, useActualizarSuscripcion } from '../hooks/useSuscripciones';
import { parseEurosACents, formatEuros, centsAInputEuros } from '../lib/dinero';
import { hoyISO, formatDia } from '../lib/fechas';
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

// Crear o editar una suscripción.
//
// 03-09: al crear se puede generar YA el cobro pendiente del primer ciclo,
// marcado por defecto. Antes no: el primer cobro, como los siguientes, solo
// nacía al pulsar "Registrar cobro", y una suscripción dada de alta hoy para
// empezar el lunes que viene no aparecía como dinero por cobrar en ningún
// sitio —ni en Pagos, ni en «Pendiente de cobro», ni en el resumen— hasta que
// alguien se acordaba de pulsar el botón. La fecha futura no es problema: un
// pago pendiente se lista igual, solo que sin marca de retraso hasta que pase.
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
  const [generarPrimerCobro, setGenerarPrimerCobro] = useState(true);

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
          datos: {
            concepto: concepto.trim(),
            importeCents: importeCents ?? 0,
            periodicidad,
            proximoCobro,
            generarPrimerCobro,
          },
        });
        showToast(
          generarPrimerCobro && (importeCents ?? 0) > 0
            ? `Suscripción creada y cobro pendiente del ${formatDia(proximoCobro)} generado`
            : 'Suscripción creada',
          'success',
        );
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

        <Campo
          label={modoEdicion ? 'Próximo cobro' : 'Primer cobro'}
          hint={modoEdicion
            ? 'La fecha del siguiente cobro por generar.'
            : 'Puede ser futura: el plan que empieza el lunes se cobra ese lunes.'}
        >
          <input className={inputClass} type="date" value={proximoCobro} onChange={e => setProximoCobro(e.target.value)} />
        </Campo>

        {!modoEdicion && (
          <label className="flex items-start gap-2 px-3 py-2 rounded-control bg-accent/8 border border-accent/20 cursor-pointer">
            <input
              type="checkbox"
              checked={generarPrimerCobro}
              onChange={e => setGenerarPrimerCobro(e.target.checked)}
              className="accent-accent"
            />
            <span className="font-sans text-caption text-ink leading-relaxed">
              Dejar ya el cobro de ese día como pendiente
              <span className="block text-ink-2">
                Aparece en Pagos y en «Pendiente de cobro» desde hoy, con fecha
                {proximoCobro ? ` del ${formatDia(proximoCobro)}` : ''}. El siguiente ciclo se genera
                con «Registrar cobro».
                {(importeCents ?? 0) <= 0 && ' Con importe 0 no se genera nada.'}
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
