import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../hooks/useToast';
import { useCrearContacto } from '../hooks/useClienteMutations';
import { useClientes } from '../hooks/useClientes';
import { esDniValido, normalizarDni, PREFIJOS_FRECUENTES } from '../lib/identidad';
import { EscrituraEncolada } from '../../../db/crm';
import Modal, { Campo, inputClass, BotonPrimario, BotonSecundario } from './Modal';

// Alta manual. Crea un `crmContacto` — una persona sin cuenta en la app. Los
// clientes que YA usan En Forma no se crean aquí: llegan por invitación desde
// la pantalla de Clientes existente y aparecen solos en esta lista.

export default function NuevoClienteModal({ onCerrar }: { onCerrar: () => void }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const crear = useCrearContacto();
  const { clientes } = useClientes();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [dni, setDni] = useState('');
  const [prefijo, setPrefijo] = useState('+34');
  const [numero, setNumero] = useState('');
  const [direccion, setDireccion] = useState('');

  const dniNorm = normalizarDni(dni);
  const dniMalFormado = dniNorm.length > 0 && !esDniValido(dniNorm);
  const duplicado = dniNorm.length > 0 && clientes.find(c => c.dni === dniNorm);

  const puedeGuardar = nombre.trim().length > 0 && !crear.isPending;

  const guardar = async () => {
    try {
      const contacto = await crear.mutateAsync({
        nombre,
        email,
        dni,
        direccion,
        telefono: { prefijo, numero },
        estadoCrm: 'activo',
        origenCaptacion: 'alta manual',
      });
      showToast('Cliente creado', 'success');
      onCerrar();
      navigate(`/crm/clientes/${contacto.id}`);
    } catch (err) {
      // EscrituraEncolada no es un fallo: el dato está en IndexedDB y sube solo
      // al recuperar conexión. Distinguirlo evita que el coach reintente y cree
      // un duplicado.
      if (err instanceof EscrituraEncolada) {
        showToast('Guardado sin conexión. Se sincronizará solo.', 'info');
        onCerrar();
        return;
      }
      showToast(err instanceof Error ? err.message : 'No se ha podido crear el cliente', 'error');
    }
  };

  return (
    <Modal
      titulo="Nuevo cliente"
      onCerrar={onCerrar}
      footer={
        <>
          <BotonSecundario onClick={onCerrar}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={!puedeGuardar}>
            {crear.isPending ? 'Guardando…' : 'Crear cliente'}
          </BotonPrimario>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Nombre *">
          <input className={inputClass} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellidos" />
        </Campo>

        <Campo label="Email">
          <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@email.com" />
        </Campo>

        <Campo
          label="DNI / NIE"
          error={dniMalFormado ? 'La letra de control no cuadra. Revísalo.' : undefined}
          hint={duplicado ? undefined : 'Se guarda sin guiones ni espacios.'}
        >
          <input className={inputClass} value={dni} onChange={e => setDni(e.target.value)} placeholder="12345678Z" />
        </Campo>

        {duplicado && (
          <p className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-[#fdba74]/10 border border-[#fdba74]/25 font-sans text-[10px] text-[#fdba74]">
            <span className="material-symbols-outlined text-[13px] shrink-0">warning</span>
            Ya existe un cliente con este DNI: <strong>{duplicado.nombre}</strong>. Puedes crearlo igualmente, pero probablemente sea un duplicado.
          </p>
        )}

        <Campo label="Teléfono">
          <div className="flex gap-1.5">
            <select
              className={`${inputClass} w-[104px] shrink-0`}
              value={prefijo}
              onChange={e => setPrefijo(e.target.value)}
              aria-label="Prefijo telefónico"
            >
              {PREFIJOS_FRECUENTES.map(p => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
            <input
              className={inputClass}
              value={numero}
              onChange={e => setNumero(e.target.value)}
              placeholder="600 000 000"
              inputMode="tel"
            />
          </div>
        </Campo>

        <Campo label="Dirección">
          <input className={inputClass} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, número, CP, ciudad" />
        </Campo>
      </div>
    </Modal>
  );
}
