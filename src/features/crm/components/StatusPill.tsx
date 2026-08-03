import React from 'react';
import type { EstadoCrm, EstadoPago, EstadoSuscripcion } from '../types';

// Colores tomados del bloque @theme de src/index.css. Van como literales de
// Tailwind a propósito: interpolar valores de theme.ts en un className rompe en
// silencio con Tailwind v4 (el scanner solo ve strings literales) — está
// avisado en la cabecera de src/theme.ts.

type Tono = 'ok' | 'aviso' | 'apagado' | 'peligro';

const TONO_CLASS: Record<Tono, string> = {
  ok:       'bg-success/12 text-success border-success/25',
  aviso:    'bg-[#fdba74]/12 text-[#fdba74] border-[#fdba74]/25',
  apagado:  'bg-white/5 text-[#a8a89e] border-white/10',
  peligro:  'bg-[#fca5a5]/12 text-[#fca5a5] border-[#fca5a5]/25',
};

const ESTADO_CLIENTE: Record<EstadoCrm, { label: string; tono: Tono }> = {
  lead:             { label: 'Lead',        tono: 'apagado' },
  llamada_agendada: { label: 'Llamada',     tono: 'aviso' },
  activo:           { label: 'Activo',      tono: 'ok' },
  pausado:          { label: 'Pausado',     tono: 'aviso' },
  baja:             { label: 'Baja',        tono: 'apagado' },
};

const ESTADO_PAGO: Record<EstadoPago, { label: string; tono: Tono }> = {
  pagado:    { label: 'Pagado',    tono: 'ok' },
  pendiente: { label: 'Pendiente', tono: 'aviso' },
};

const ESTADO_SUSCRIPCION: Record<EstadoSuscripcion, { label: string; tono: Tono }> = {
  activa:  { label: 'Activa',  tono: 'ok' },
  pausada: { label: 'Pausada', tono: 'apagado' },
};

function Pill({ label, tono }: { label: string; tono: Tono }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-mono text-[9px] uppercase tracking-widest whitespace-nowrap ${TONO_CLASS[tono]}`}>
      {label}
    </span>
  );
}

export function EstadoClientePill({ estado }: { estado: EstadoCrm }) {
  const m = ESTADO_CLIENTE[estado] ?? ESTADO_CLIENTE.activo;
  return <Pill label={m.label} tono={m.tono} />;
}

export function EstadoPagoPill({ estado }: { estado: EstadoPago }) {
  const m = ESTADO_PAGO[estado] ?? ESTADO_PAGO.pendiente;
  return <Pill label={m.label} tono={m.tono} />;
}

export function EstadoSuscripcionPill({ estado }: { estado: EstadoSuscripcion }) {
  const m = ESTADO_SUSCRIPCION[estado] ?? ESTADO_SUSCRIPCION.activa;
  return <Pill label={m.label} tono={m.tono} />;
}

export default Pill;
