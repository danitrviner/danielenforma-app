import React, { useState } from 'react';
import { Sheet, Button, Input, Select } from '../../ui';

/** Lo que el coach puede clavar en un día desde el calendario. `hito` es un
 *  objetivo del roadmap; los otros tres son tareas reales del atleta (TaskItem),
 *  que le salen en su lista de pendientes. */
export type TipoHito = 'hito' | 'revision' | 'cuestionario' | 'foto';

const OPCIONES = [
  { value: 'hito', label: 'Hito del roadmap' },
  { value: 'revision', label: 'Revisión' },
  { value: 'cuestionario', label: 'Cuestionario' },
  { value: 'foto', label: 'Foto de progreso' },
];

interface Props {
  /** Fecha con la que abre: el día seleccionado, o hoy. */
  fechaInicial: string;
  onGuardar: (datos: { titulo: string; fecha: string; tipo: TipoHito }) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Sustituye al `window.prompt('Título del hito')` con el que nació el botón
 * "Añadir hito". El prompt pedía solo el título y clavaba el hito en el día
 * seleccionado —o en hoy, si estabas en el Nivel Año, donde no hay día
 * seleccionado—, sin decir dónde lo había puesto ni permitir elegir el tipo.
 * Desde el Año eso se veía como "el botón no hace nada": creaba el hito en un
 * mes que no estabas mirando.
 */
export default function NuevoHitoSheet({ fechaInicial, onGuardar, onClose }: Props) {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(fechaInicial);
  const [tipo, setTipo] = useState<TipoHito>('hito');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = titulo.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha);

  async function guardar() {
    if (!valido) { setError('Hace falta un título y una fecha.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({ titulo: titulo.trim(), fecha, tipo });
      onClose();
    } catch {
      setError('No se ha podido guardar. Inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nuevo hito"
      size="m"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando} disabled={!valido} icon="flag" className="flex-1">Añadir al calendario</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Título" value={titulo} onChange={setTitulo} placeholder="Foto de control, revisión de mitad de bloque…" />
        <Input label="Fecha" value={fecha} onChange={setFecha} type="date" />
        <Select
          label="Tipo"
          value={tipo}
          onChange={v => setTipo(v as TipoHito)}
          options={OPCIONES}
          hint={tipo === 'hito' ? 'Solo lo ves tú, en el roadmap.' : 'Le aparece al atleta en sus pendientes.'}
        />
        {error && <p className="text-label font-sans text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
