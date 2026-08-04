import React from 'react';
import type { EstadoCrm, EstadoPago, EstadoSuscripcion } from '../types';
import { Badge, type BadgeTone } from '../../../components/ui';

// Colores tomados del bloque @theme de src/index.css. Van como literales de
// Tailwind a propósito: interpolar valores de theme.ts en un className rompe en
// silencio con Tailwind v4 (el scanner solo ve strings literales) — está
// avisado en la cabecera de src/theme.ts.

type Tono = 'ok' | 'aviso' | 'apagado' | 'peligro';

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

/**
 * F11: el pill deja de dibujarse a mano y pasa a `Badge` del DS. El mapa
 * `TONO_CLASS` de arriba desaparece: sus cuatro tonos son los mismos que la
 * primitiva ya define, solo que con otro nombre.
 */
const TONO_BADGE: Record<Tono, BadgeTone> = {
  ok:      'success',
  aviso:   'warning',
  apagado: 'neutral',
  peligro: 'danger',
};

function Pill({ label, tono }: { label: string; tono: Tono }) {
  return (
    <Badge tone={TONO_BADGE[tono]}>{label}</Badge>
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
