import React, { useState } from 'react';
import type { AntesDespues, BloqueTerminado as Cierre } from '../../utils/bloqueTerminado';
import { Button, Icon, RingSeal } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Bloque terminado», la celebración del atleta (A2, 17-11-2026)

   Lo que ve cuando su bloque acaba: dos o tres «antes → después» reales, su
   constancia y qué viene. Los datos salen de `bloqueTerminadoParaElAtleta`
   (utils/bloqueTerminado.ts): aquí solo se pinta. Sin marcas no hay lista de
   fuerza; sin sesiones asignadas no hay constancia.

   Va de protagonista: el anillo de constancia y cada mejora en grande, con
   el marco dorado del día que toca.

   Se cierra con «Entendido» (por bloque, en este dispositivo), igual que las
   novedades de la semana. Sin confeti: la celebración es el anillo.
   ═══════════════════════════════════════════════════════════════════════════ */

const CLAVE = 'enforma_bloque_terminado_visto_v1';

function leerVistos(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}

interface Props {
  cierre: Cierre | null | undefined;
  /** Para los bancos de pruebas: no recuerda el «Entendido». */
  sinRecordar?: boolean;
  className?: string;
}

function TarjetaAntesDespues({ a }: { a: AntesDespues }) {
  return (
    <li className="rounded-surface border border-hairline bg-surface px-4 py-3">
      <p className="truncate font-mono text-caption uppercase tracking-widest text-ink-3">{a.nombre}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="font-display text-title-l font-black leading-none text-ink">{a.despues}</p>
        <span className="shrink-0 font-mono text-caption font-bold text-success">{a.cambio}</span>
      </div>
      <p className="mt-1 font-mono text-caption text-ink-2">antes: {a.antes}</p>
    </li>
  );
}

export default function BloqueTerminado({ cierre, sinRecordar = false, className = '' }: Props) {
  const [visto, setVisto] = useState(() => !sinRecordar && !!cierre && leerVistos().includes(cierre.mesocycleId));
  if (!cierre || visto) return null;

  const cerrar = () => {
    setVisto(true);
    if (sinRecordar) return;
    try { localStorage.setItem(CLAVE, JSON.stringify([...leerVistos(), cierre.mesocycleId].slice(-20))); } catch { /* sin almacenamiento: solo se oculta en esta visita */ }
  };
  const c = cierre.constancia;
  return (
    <section className={`protagonista rounded-canvas border border-accent/50 bg-accent-bg p-5 space-y-4 shadow-glow ${className}`} aria-label="Bloque terminado">
      <div className="flex items-center gap-4">
        {c && (
          <RingSeal percent={c.pct} size={92} strokeWidth={8} label={c.texto} className="shrink-0">
            <span className="flex flex-col items-center leading-none">
              <span className="font-mono text-body font-bold text-ink">{c.hechas}/{c.tocaban}</span>
              <span className="mt-1 font-mono text-[10px] text-ink-3">sesiones</span>
            </span>
          </RingSeal>
        )}
        <div className="min-w-0">
          <p className="font-mono text-caption uppercase font-bold tracking-widest text-accent-ink">{cierre.nombre}</p>
          <h2 className="font-display text-title-l font-black uppercase leading-tight tracking-tight text-ink">Bloque terminado</h2>
          {c && <p className="mt-1 font-sans text-label text-ink-2 text-pretty">{c.texto}</p>}
        </div>
      </div>
      {cierre.antesDespues.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Lo que mueves ahora</p>
          <ul className="space-y-2">{cierre.antesDespues.map(a => <React.Fragment key={a.exerciseId}><TarjetaAntesDespues a={a} /></React.Fragment>)}</ul>
        </div>
      )}
      <p className="flex items-start gap-2 font-sans text-label text-ink-2">
        <Icon name={cierre.siguiente ? 'arrow_forward' : 'hourglass_top'} size="s" className="text-accent-ink shrink-0" />
        <span className="text-pretty">{cierre.queViene}</span>
      </p>
      <Button size="s" variant="ghost" icon="done_all" onClick={cerrar}>Entendido</Button>
    </section>
  );
}
