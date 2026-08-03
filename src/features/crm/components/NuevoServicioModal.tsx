import React, { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useCrearServicio } from '../hooks/useServicios';
import { parseEurosACents, formatEuros, repartirEnCuotas } from '../lib/dinero';
import { hoyISO, sumarMeses, mesesDePeriodicidad, formatDia } from '../lib/fechas';
import { EscrituraEncolada } from '../../../db/crm';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';
import type { Cliente, Periodicidad } from '../types';

const PERIODICIDADES: { id: Periodicidad; label: string }[] = [
  { id: 'mensual',     label: 'Mensual' },
  { id: 'trimestral',  label: 'Trimestral' },
  { id: 'semestral',   label: 'Semestral' },
  { id: 'anual',       label: 'Anual' },
  { id: 'unico',       label: 'Pago único' },
];

export default function NuevoServicioModal({ cliente, coachEmail, onCerrar }: {
  cliente: Cliente; coachEmail: string; onCerrar: () => void;
}) {
  const { showToast } = useToast();
  const crear = useCrearServicio();

  const [nombre, setNombre] = useState('');
  const [importe, setImporte] = useState('');
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('mensual');
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [generarPago, setGenerarPago] = useState(true);
  const [cuotas, setCuotas] = useState(1);

  const importeCents = parseEurosACents(importe);
  const importeInvalido = importe.trim().length > 0 && importeCents === null;
  const fechasInvertidas = Boolean(fechaFin) && fechaFin < fechaInicio;

  // Sugerencia de fecha de fin a partir de la periodicidad — se rellena al
  // vuelo pero se puede sobrescribir. Evita el error típico de dejar el fin en
  // blanco y que el servicio no caduque nunca.
  const sugerirFin = () => {
    const meses = mesesDePeriodicidad(periodicidad);
    if (meses == null) return;
    setFechaFin(sumarMeses(fechaInicio, meses));
  };

  const puedeGuardar =
    nombre.trim().length > 0 && !importeInvalido && !fechasInvertidas && !crear.isPending;

  const guardar = async () => {
    try {
      await crear.mutateAsync({
        cliente,
        coachEmail,
        datos: {
          nombre: nombre.trim(),
          importeCents: importeCents ?? 0,
          periodicidad,
          fechaContratacion: hoyISO(),
          fechaInicio,
          fechaFin: fechaFin || undefined,
          descripcion: descripcion.trim() || undefined,
          generarPago,
          cuotas,
        },
      });
      showToast(
        generarPago && (importeCents ?? 0) > 0
          ? cuotas > 1
            ? `Servicio creado y ${cuotas} cobros pendientes generados`
            : 'Servicio creado y cobro pendiente generado'
          : 'Servicio creado',
        'success'
      );
      onCerrar();
    } catch (err) {
      if (err instanceof EscrituraEncolada) {
        showToast('Guardado sin conexión. Se sincronizará solo.', 'info');
        onCerrar();
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se ha podido crear el servicio', 'error');
    }
  };

  return (
    <Modal
      titulo={`Nuevo servicio · ${cliente.nombre}`}
      onCerrar={onCerrar}
      footer={
        <>
          <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={!puedeGuardar}>
            {crear.isPending ? 'Guardando…' : 'Crear servicio'}
          </BotonPrimario>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Nombre del servicio *">
          <input className={inputClass} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Asesoría 3 meses" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Importe"
            error={importeInvalido ? 'No entiendo ese importe.' : undefined}
            hint={!importeInvalido && importeCents ? formatEuros(importeCents) : 'En euros: 149,90'}
          >
            <input className={inputClass} value={importe} onChange={e => setImporte(e.target.value)} placeholder="149,90" inputMode="decimal" />
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

          <Campo label="Inicio">
            <input className={inputClass} type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </Campo>

          <Campo
            label="Fin"
            error={fechasInvertidas ? 'El fin es anterior al inicio.' : undefined}
            hint={!fechasInvertidas && fechaFin ? formatDia(fechaFin) : 'Opcional'}
          >
            <input className={inputClass} type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </Campo>
        </div>

        {periodicidad !== 'unico' && (
          <button
            type="button"
            onClick={sugerirFin}
            className="font-sans text-caption uppercase tracking-widest text-accent hover:underline"
          >
            Calcular fin desde la periodicidad
          </button>
        )}

        <Campo label="Descripción">
          <input className={inputClass} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Opcional" />
        </Campo>

        <label className="flex items-start gap-2 px-3 py-2 rounded-control bg-accent/8 border border-accent/20 cursor-pointer">
          <input
            type="checkbox"
            checked={generarPago}
            onChange={e => setGenerarPago(e.target.checked)}
            className="mt-0.5 accent-accent"
          />
          <span className="font-sans text-caption text-ink leading-relaxed">
            Generar el cobro pendiente al crear el servicio
            <span className="block text-ink-2">
              Se escriben todos los documentos en la misma transacción: o entran todos, o ninguno.
              {(importeCents ?? 0) <= 0 && ' Con importe 0 no se genera nada.'}
            </span>
          </span>
        </label>

        {generarPago && (
          <Campo
            label="Fraccionar en"
            hint={
              cuotas > 1 && importeCents
                ? `${formatEuros(repartirEnCuotas(importeCents, cuotas)[0])} × ${cuotas - 1} + ${formatEuros(repartirEnCuotas(importeCents, cuotas)[cuotas - 1])}, uno al mes`
                : 'Pago único por el importe completo'
            }
          >
            <div className="flex items-center gap-2">
              <input
                className={`${inputClass} w-20`}
                type="number"
                min={1}
                max={12}
                value={cuotas}
                onChange={e => setCuotas(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
              />
              <span className="font-sans text-caption text-ink-2">
                {cuotas === 1 ? 'cuota' : 'cuotas mensuales'}
              </span>
            </div>
          </Campo>
        )}
      </div>
    </Modal>
  );
}
