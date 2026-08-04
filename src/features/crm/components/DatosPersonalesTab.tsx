import React, { useEffect, useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useGuardarCliente } from '../hooks/useClienteMutations';
import { esDniValido, normalizarDni, PREFIJOS_FRECUENTES } from '../lib/identidad';
import { hoyISO } from '../lib/fechas';
import { EscrituraEncolada } from '../../../db/crm';
import { Campo, inputClass, BotonPrimario } from './Modal';
import type { Cliente, EstadoCrm, MotivoBaja } from '../types';
import { Icon } from '../../../components/ui';

// Estados de preventa ('lead', 'llamada_agendada') solo tienen sentido para
// contactos sin cuenta — un `fuente === 'perfil'` ya se registró en la app,
// así que retroceder a "lead" no representa nada real. Se filtran aquí, no en
// el tipo (EstadoCrm es el mismo en los dos sitios a propósito, ver types.ts).
const ESTADOS_CONTACTO: { id: EstadoCrm; label: string }[] = [
  { id: 'lead',             label: 'Lead' },
  { id: 'llamada_agendada', label: 'Llamada agendada' },
  { id: 'activo',           label: 'Activo' },
  { id: 'pausado',          label: 'Pausado' },
  { id: 'baja',             label: 'Baja' },
];
const ESTADOS_PERFIL: { id: EstadoCrm; label: string }[] = [
  { id: 'activo',  label: 'Activo' },
  { id: 'pausado', label: 'Pausado' },
  { id: 'baja',    label: 'Baja' },
];

const MOTIVOS_BAJA: { id: MotivoBaja; label: string }[] = [
  { id: 'precio',                label: 'Precio' },
  { id: 'resultados',            label: 'No veía resultados' },
  { id: 'tiempo_disponibilidad', label: 'Falta de tiempo / disponibilidad' },
  { id: 'insatisfaccion',        label: 'Insatisfacción con el servicio' },
  { id: 'lesion_salud',          label: 'Lesión o motivo de salud' },
  { id: 'otro',                  label: 'Otro' },
];

const ORIGENES_SUGERIDOS = ['instagram', 'referido', 'ads', 'importación', 'web', 'otro'];

export default function DatosPersonalesTab({ cliente }: { cliente: Cliente }) {
  const { showToast } = useToast();
  const guardar = useGuardarCliente();

  const [nombre, setNombre] = useState(cliente.nombre);
  const [dni, setDni] = useState(cliente.dni ?? '');
  const [prefijo, setPrefijo] = useState(cliente.telefono?.prefijo ?? '+34');
  const [numero, setNumero] = useState(cliente.telefono?.numero ?? '');
  const [direccion, setDireccion] = useState(cliente.direccion ?? '');
  const [estadoCrm, setEstadoCrm] = useState<EstadoCrm>(cliente.estadoCrm);
  const [origen, setOrigen] = useState(cliente.origen ?? '');
  const [fechaBaja, setFechaBaja] = useState(cliente.fechaBaja ?? '');
  const [motivoBaja, setMotivoBaja] = useState<MotivoBaja | ''>(cliente.motivoBaja ?? '');
  const [motivoBajaDetalle, setMotivoBajaDetalle] = useState(cliente.motivoBajaDetalle ?? '');

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
    setOrigen(cliente.origen ?? '');
    setFechaBaja(cliente.fechaBaja ?? '');
    setMotivoBaja(cliente.motivoBaja ?? '');
    setMotivoBajaDetalle(cliente.motivoBajaDetalle ?? '');
  }, [cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dniNorm = normalizarDni(dni);
  const dniMalFormado = dniNorm.length > 0 && !esDniValido(dniNorm);

  // Pasar A 'baja' (no ya estarlo) exige motivo — sin esto el churn vuelve a
  // ser incalculable, que es exactamente lo que se rompió antes. La fecha NO
  // bloquea: el campo vacío ya cae a hoyISO() en onGuardar, así que exigirla
  // aquí bloquearía "Guardar" aunque el input ya muestre "hoy" por defecto
  // (el value visual del <input> no es lo mismo que el estado de React hasta
  // que el usuario lo toca) — encontrado probando el flujo en vivo.
  const pasandoABaja = estadoCrm === 'baja' && cliente.estadoCrm !== 'baja';
  const yaEraBaja = estadoCrm === 'baja' && cliente.estadoCrm === 'baja';
  const mostrarCamposBaja = estadoCrm === 'baja';
  const faltaMotivoDetalle = motivoBaja === 'otro' && !motivoBajaDetalle.trim();
  const bajaIncompleta = estadoCrm === 'baja' && (!motivoBaja || faltaMotivoDetalle) && !yaEraBaja;

  const sucio =
    nombre !== cliente.nombre ||
    dniNorm !== (cliente.dni ?? '') ||
    numero !== (cliente.telefono?.numero ?? '') ||
    prefijo !== (cliente.telefono?.prefijo ?? '+34') ||
    direccion !== (cliente.direccion ?? '') ||
    estadoCrm !== cliente.estadoCrm ||
    origen !== (cliente.origen ?? '') ||
    (pasandoABaja && (fechaBaja !== (cliente.fechaBaja ?? '') || motivoBaja !== (cliente.motivoBaja ?? '') || motivoBajaDetalle !== (cliente.motivoBajaDetalle ?? '')));

  const onGuardar = async () => {
    try {
      await guardar.mutateAsync({
        cliente,
        datos: {
          nombre, dni, direccion, telefono: { prefijo, numero }, estadoCrm,
          origen: origen || undefined,
          // Solo se envían al pasar a baja de verdad — revertir una baja no
          // borra el motivo anterior (queda como histórico de la última vez).
          ...(pasandoABaja ? {
            fechaBaja: fechaBaja || hoyISO(),
            motivoBaja: motivoBaja || undefined,
            motivoBajaDetalle: motivoBajaDetalle || undefined,
          } : {}),
        },
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

  const estados = cliente.fuente === 'perfil' ? ESTADOS_PERFIL : ESTADOS_CONTACTO;

  return (
    <div className="bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-4 space-y-3">
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
            {estados.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Campo>

        <Campo
          label="DNI / NIE"
          error={dniMalFormado ? 'La letra de control no cuadra. Revísalo.' : undefined}
        >
          <input className={inputClass} value={dni} onChange={e => setDni(e.target.value)} placeholder="12345678Z" />
        </Campo>

        <Campo label="Teléfono">
          <div className="flex gap-2">
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

        <div className="sm:col-span-2">
          <Campo label="Origen" hint="Canal de captación — de dónde vino este cliente.">
            <input
              className={inputClass}
              list="origenes-sugeridos"
              value={origen}
              onChange={e => setOrigen(e.target.value)}
              placeholder="instagram, referido, ads..."
            />
            <datalist id="origenes-sugeridos">
              {ORIGENES_SUGERIDOS.map(o => <option key={o} value={o} />)}
            </datalist>
          </Campo>
        </div>
      </div>

      {mostrarCamposBaja && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-surface bg-danger/8 border border-danger/20">
          <div className="sm:col-span-2 flex items-start gap-2">
            <Icon name="warning" size="s" className="text-danger shrink-0" />
            <p className="font-sans text-caption text-danger leading-relaxed">
              Fecha y motivo de baja son obligatorios — sin ellos, el churn de este cliente
              queda incalculable para siempre.
            </p>
          </div>
          <Campo label="Fecha de baja">
            <input className={inputClass} type="date" value={fechaBaja || hoyISO()} onChange={e => setFechaBaja(e.target.value)} />
          </Campo>
          <Campo label="Motivo">
            <select className={inputClass} value={motivoBaja} onChange={e => setMotivoBaja(e.target.value as MotivoBaja)}>
              <option value="">Selecciona…</option>
              {MOTIVOS_BAJA.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Campo>
          {(motivoBaja === 'otro' || yaEraBaja) && (
            <div className="sm:col-span-2">
              <Campo
                label="Detalle"
                error={faltaMotivoDetalle ? 'Obligatorio cuando el motivo es «Otro».' : undefined}
              >
                <input className={inputClass} value={motivoBajaDetalle} onChange={e => setMotivoBajaDetalle(e.target.value)} />
              </Campo>
            </div>
          )}
        </div>
      )}

      {cliente.email && (
        <p className="font-mono text-caption text-ink-3">
          Email: {cliente.email}
          {cliente.fuente === 'perfil' && ' · lo gestiona el propio cliente desde su cuenta'}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {sucio && !bajaIncompleta && (
          <span className="font-mono text-caption uppercase tracking-widest text-warning">Sin guardar</span>
        )}
        <BotonPrimario onClick={onGuardar} disabled={!sucio || bajaIncompleta || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </BotonPrimario>
      </div>
    </div>
  );
}
