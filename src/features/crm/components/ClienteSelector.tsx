import React, { useMemo, useState } from 'react';
import { useClientes } from '../hooks/useClientes';
import { normalizarDni } from '../lib/identidad';
import { inputClass } from './Modal';
import type { Cliente } from '../types';

interface Props {
  value: Cliente | null;
  onChange: (cliente: Cliente) => void;
}

// Combobox de búsqueda de cliente. No existía nada reutilizable parecido en el
// repo — CommandPalette.tsx tiene una búsqueda de atletas muy similar, pero
// inline dentro de ese componente, no extraída. Usado por SuscripcionModal y
// PagoModal cuando se abren desde la pantalla global /crm/pagos (sin cliente
// ya conocido) — desde la ficha del cliente ni se monta, porque `value` llega
// ya fijado desde el principio.
export default function ClienteSelector({ value, onChange }: Props) {
  const { clientes, isPending } = useClientes();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    const qDni = normalizarDni(busqueda);
    return clientes
      .filter(c =>
        c.nombre.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (qDni.length >= 3 && (c.dni ?? '').includes(qDni))
      )
      .slice(0, 8);
  }, [clientes, busqueda]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#141413] border border-white/7">
        <span className="text-[11px] text-[#f5f5f0] truncate">{value.nombre}</span>
        <button
          type="button"
          onClick={() => onChange(null as unknown as Cliente)}
          className="font-mono text-[9px] uppercase tracking-widest text-accent hover:underline shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={busqueda}
        onChange={e => { setBusqueda(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar cliente por nombre, email o DNI"
        aria-label="Buscar cliente"
        className={inputClass}
      />
      {abierto && (
        <div className="absolute z-10 mt-1 w-full max-h-[200px] overflow-y-auto custom-scrollbar rounded-lg bg-raised border border-white/12 shadow-xl">
          {isPending && (
            <p className="px-2.5 py-2 font-sans text-[10px] text-[#555550]">Cargando…</p>
          )}
          {!isPending && resultados.length === 0 && (
            <p className="px-2.5 py-2 font-sans text-[10px] text-[#555550]">Sin resultados</p>
          )}
          {resultados.map(c => (
            <button
              key={c.id}
              type="button"
              // onMouseDown en vez de onClick: dispara antes que el onBlur del
              // input, que si no cierra la lista un instante antes de que el
              // clic llegue a registrarse.
              onMouseDown={() => onChange(c)}
              className="w-full text-left px-2.5 py-2 hover:bg-white/6 transition-colors"
            >
              <p className="font-sans text-[11px] text-[#f5f5f0] truncate">{c.nombre}</p>
              <p className="font-mono text-[9px] text-[#555550] truncate">{c.email ?? c.dni ?? ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
