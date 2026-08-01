import React, { useEffect, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useGuardarCliente } from '../hooks/useClienteMutations';
import { esDniValido, normalizarDni, PREFIJOS_FRECUENTES } from '../lib/identidad';
import { EscrituraEncolada } from '../../../db/crm';
import { Campo, inputClass, BotonPrimario } from './Modal';
import type { Cliente, EstadoCrm } from '../types';

const ESTADOS: { id: EstadoCrm; label: string }[] = [
  { id: 'activo',  label: 'Activo' },
  { id: 'pausado', label: 'Pausado' },
  { id: 'baja',    label: 'Baja' },
];

export default function DatosPersonalesTab({ cliente }: { cliente: Cliente }) {
  const { showToast } = useToast();
  const guardar = useGuardarCliente();

  const [nombre, setNombre] = useState(cliente.nombre);
  const [dni, setDni] = useState(cliente.dni ?? '');
  const [prefijo, setPrefijo] = useState(cliente.telefono?.prefijo ?? '+34');
  const [numero, setNumero] = useState(cliente.telefono?.numero ?? '');
  const [direccion, setDireccion] = useState(cliente.direccion ?? '');
  const [estadoCrm, setEstadoCrm] = useState<EstadoCrm>(cliente.estadoCrm);

  // Si la query se refresca en segundo plano (otra pestaña, invalidación), el
  // formulario tiene que seguir al dato — pero solo cuando cambia de cliente,
  // para no pisar lo que el coach está escribiendo ahora mismo.
  useEffect(() => {
    setNombre(cliente.nombre);
    setDni(cliente.dni ?? '');
    setPrefijo(cliente.telefono?.prefijo ?? '+34');
    setNumero(cliente.telefono?.numero ?? '');
    setDireccion(cliente.direccion ?? '');
    setEstadoCrm(cliente.estadoCrm);
  }, [cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dniNorm = normalizarDni(dni);
  const dniMalFormado = dniNorm.length > 0 && !esDniValido(dniNorm);

  const sucio =
    nombre !== cliente.nombre ||
    dniNorm !== (cliente.dni ?? '') ||
    numero !== (cliente.telefono?.numero ?? '') ||
    prefijo !== (cliente.telefono?.prefijo ?? '+34') ||
    direccion !== (cliente.direccion ?? '') ||
    estadoCrm !== cliente.estadoCrm;

  const onGuardar = async () => {
    try {
      await guardar.mutateAsync({
        cliente,
        datos: { nombre, dni, direccion, telefono: { prefijo, numero }, estadoCrm },
      });
      showToast('Datos guardados', 'success');
    } catch (err) {
      if (err instanceof EscrituraEncolada) {
        showToast('Guardado sin conexión. Se sincronizará solo.', 'info');
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se han podido guardar los datos', 'error');
    }
  };

  return (
    <div className="bg-[#181816]/80 backdrop-blur-sm border border-white/7 rounded-2xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Nombre">
          <input className={inputClass} value={nombre} onChange={e => setNombre(e.target.value)} />
        </Campo>

        <Campo label="Estado" hint="Solo lo cambias tú. El cliente no puede tocarlo.">
          <select
            className={inputClass}
            value={estadoCrm}
            onChange={e => setEstadoCrm(e.target.value as EstadoCrm)}
          >
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Campo>

        <Campo
          label="DNI / NIE"
          error={dniMalFormado ? 'La letra de control no cuadra. Revísalo.' : undefined}
        >
          <input className={inputClass} value={dni} onChange={e => setDni(e.target.value)} placeholder="12345678Z" />
        </Campo>

        <Campo label="Teléfono">
          <div className="flex gap-1.5">
            <select
              className={`${inputClass} w-[104px] shrink-0`}
              value={prefijo}
              onChange={e => setPrefijo(e.target.value)}
              aria-label="Prefijo telefónico"
            >
              {PREFIJOS_FRECUENTES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
            <input className={inputClass} value={numero} onChange={e => setNumero(e.target.value)} inputMode="tel" />
          </div>
        </Campo>

        <div className="sm:col-span-2">
          <Campo label="Dirección">
            <input className={inputClass} value={direccion} onChange={e => setDireccion(e.target.value)} />
          </Campo>
        </div>
      </div>

      {cliente.email && (
        <p className="font-mono text-[9px] text-[#555550]">
          Email: {cliente.email}
          {cliente.origen === 'perfil' && ' · lo gestiona el propio cliente desde su cuenta'}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {sucio && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#fdba74]">Sin guardar</span>
        )}
        <BotonPrimario onClick={onGuardar} disabled={!sucio || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </BotonPrimario>
      </div>
    </div>
  );
}
