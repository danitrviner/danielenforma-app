import React, { useState } from 'react';
import type { AntesDespues, BloqueTerminado as Cierre } from '../../utils/bloqueTerminado';
import { Button, Icon, ProgressBar, RingSeal } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   «Bloque terminado», la tarjeta del atleta (A2, 17-11-2026)

   Lo que ve cuando su bloque acaba: dos o tres «antes → después» reales, su
   constancia y qué viene. Los datos salen de `bloqueTerminadoParaElAtleta`
   (utils/bloqueTerminado.ts): aquí solo se pinta. Sin marcas no hay lista de
   fuerza; sin sesiones asignadas no hay constancia.

   Dos variantes con la misma lógica, para que Dani elija:
     · `tarjeta`     — sobria, como el resto de Rutinas: filas «antes →
                       después», barra de constancia y la línea de qué viene.
     · `celebracion` — protagonista: el anillo de constancia y cada mejora en
                       grande, con el marco dorado del día que toca.

   Se cierra con «Entendido» (por bloque, en este dispositivo), igual que las
   novedades de la semana. Sin confeti: la celebración es el anillo.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteBloqueTerminado = 'tarjeta' | 'celebracion';

const CLAVE = 'enforma_bloque_terminado_visto_v1';

function leerVistos(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}

interface Props {
  cierre: Cierre | null | undefined;
  variante?: VarianteBloqueTerminado;
  /** Para los bancos de pruebas: no recuerda el «Entendido». */
  sinRecordar?: boolean;
  className?: string;
}

function FilaAntesDespues({ a }: { a: AntesDespues }) {
  return (
    <li className="flex items-center gap-3 rounded-field border border-hairline bg-raised px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-body-s font-bold text-ink">{a.nombre}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-caption text-ink-2">
          <span>{a.antes}</span>
          <Icon name="arrow_forward" size="s" className="text-ink-3" />
          <span className="font-bold text-ink">{a.despues}</span>
        </p>
      </div>
      <span className="shrink-0 font-mono text-caption font-bold text-success">{a.cambio}</span>
    </li>
  );
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

export default function BloqueTerminado({ cierre, variante = 'tarjeta', sinRecordar = false, className = '' }: Props) {
  const [visto, setVisto] = useState(() => !sinRecordar && !!cierre && leerVistos().includes(cierre.mesocycleId));
  if (!cierre || visto) return null;

  const cerrar = () => {
    setVisto(true);
    if (sinRecordar) return;
    try { localStorage.setItem(CLAVE, JSON.stringify([...leerVistos(), cierre.mesocycleId].slice(-20))); } catch { /* sin almacenamiento: solo se oculta en esta visita */ }
  };
  const c = cierre.constancia;
  const hayFuerza = cierre.antesDespues.length > 0;
  const queViene = (
    <p className="flex items-start gap-2 font-sans text-label text-ink-2">
      <Icon name={cierre.siguiente ? 'arrow_forward' : 'hourglass_top'} size="s" className="text-accent-ink shrink-0" />
      <span className="text-pretty">{cierre.queViene}</span>
    </p>
  );

  if (variante === 'celebracion') {
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
        {hayFuerza && (
          <div className="space-y-2">
            <p className="font-mono text-caption uppercase tracking-widest text-ink-2">Lo que mueves ahora</p>
            <ul className="space-y-2">{cierre.antesDespues.map(a => <React.Fragment key={a.exerciseId}><TarjetaAntesDespues a={a} /></React.Fragment>)}</ul>
          </div>
        )}
        {queViene}
        <Button size="s" variant="ghost" icon="done_all" onClick={cerrar}>Entendido</Button>
      </section>
    );
  }

  return (
    <section className={`rounded-surface border border-hairline bg-surface px-4 py-3.5 space-y-3 ${className}`} aria-label="Bloque terminado">
      <div className="flex items-center gap-2">
        <Icon name="flag" size="s" filled className="text-accent-ink" />
        <p className="font-sans font-bold text-body-s text-ink">Bloque terminado</p>
        <span className="truncate font-mono text-caption text-ink-3">{cierre.nombre}</span>
      </div>
      {hayFuerza && (
        <div className="space-y-1.5">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-3">Empezaste con → acabas con</p>
          <ul className="space-y-1.5">{cierre.antesDespues.map(a => <React.Fragment key={a.exerciseId}><FilaAntesDespues a={a} /></React.Fragment>)}</ul>
        </div>
      )}
      {c && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-sans text-label text-ink">{c.texto}</span>
            <span className="font-mono text-caption font-bold text-ink">{c.pct} %</span>
          </div>
          <ProgressBar value={c.pct} label={c.texto} />
        </div>
      )}
      {queViene}
      <Button size="s" variant="ghost" icon="done_all" onClick={cerrar}>Entendido</Button>
    </section>
  );
}
