import React, { useEffect, useRef, useState } from 'react';
import type { WorkoutLog } from '../../types';
import { ZONA_POR_CLAVE, type ZonaIem } from '../../utils/cdg/zonas';
import { respuestaDeAgujetas, type PreguntaAgujetas48h } from '../../utils/agujetas48h';
import { diaDeLaSemana } from '../../utils/cuestionarioAuto';
import { NOTAS_AGUJETAS } from '../cuestionario/AgujetasPaso';
import { colorDeNota } from '../cuestionario/MapaCorporal';
import { Button, Icon, Sheet } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Agujetas a las 48 h, en un toque (D7, 17-11-2026)

   «¿Cómo tienes hoy lo del jueves?»: una fila por zona trabajada en esa sesión
   y cinco botones. Se contesta entre 36 y 72 h después de entrenar, que es
   cuando el curso mira las agujetas; el cuestionario semanal las preguntaba de
   memoria. La escala y sus textos son los MISMOS del paso de agujetas del
   cuestionario (`NOTAS_AGUJETAS`), y los colores, los del mapa corporal.

   Al contestar la última zona se guarda solo, tras un instante por si el dedo
   se fue al botón de al lado. «Ahora no» la quita de en medio y vuelve a salir
   más tarde mientras dure la ventana.

   Dos variantes para que Dani elija (misma lógica, `useRespuestas`):
     · `tarjeta` (por defecto): tarjeta compacta dentro de Inicio.
     · `hoja`: hoja que sube desde abajo al abrir la app, con botones grandes.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteAgujetas48h = 'tarjeta' | 'hoja';
export type RespuestaAgujetas48h = Pick<WorkoutLog, 'agujetas48h' | 'agujetas48hAt'>;

interface Props {
  pregunta: PreguntaAgujetas48h;
  variante?: VarianteAgujetas48h;
  /** Guarda la respuesta completa en el registro de la sesión. Si falla, se puede reintentar. */
  onGuardar: (respuesta: RespuestaAgujetas48h) => Promise<void>;
  /** Ya está guardada y se ha enseñado el «apuntado»: quien la monta puede quitarla. */
  onGuardado?: () => void;
  onAhoraNo: () => void;
  /** Solo `hoja`: no se abre todavía (hay otra ventana delante). */
  enEspera?: boolean;
  key?: React.Key; // convención del proyecto: los tipos de React aquí no fusionan IntrinsicAttributes
}

/** Margen entre el último toque y el guardado, por si se corrige una nota. */
const ESPERA_ANTES_DE_GUARDAR_MS = 900;
/** Lo que se ve el «apuntado» antes de que la tarjeta se vaya. */
const CONFIRMACION_MS = 1300;

type Estado = 'contestando' | 'guardando' | 'guardado' | 'error';

/** «Bíceps (flexores de codo)» → «Bíceps»: en la fila del móvil no cabe más. */
const nombreCorto = (z: ZonaIem) => ZONA_POR_CLAVE[z].nombre.split(' (')[0];
/** Tinta legible sobre el color de cada nota (el rojo del 5 pide blanco). Igual que en el cuestionario. */
const tintaDeNota = (n: number) => (n <= 2 ? 'var(--color-ink)' : n >= 5 ? '#fff' : 'var(--color-on-accent)');
const tituloDe = (n: number | undefined) => NOTAS_AGUJETAS.find(x => x.n === n)?.titulo;

/** La lógica común a las dos variantes: notas, guardado al completar y su estado. */
function useRespuestas({ pregunta, onGuardar, onGuardado }: Pick<Props, 'pregunta' | 'onGuardar' | 'onGuardado'>) {
  const [notas, setNotas] = useState<Partial<Record<ZonaIem, number>>>({});
  const [estado, setEstado] = useState<Estado>('contestando');
  // La última nota tocada: la tarjeta dice debajo qué significa, sin recortarla en la fila.
  const [ultima, setUltima] = useState<{ zona: ZonaIem; n: number } | null>(null);
  const [intento, setIntento] = useState(0);
  const guardar = useRef(onGuardar); guardar.current = onGuardar;
  const avisar = useRef(onGuardado); avisar.current = onGuardado;
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const completa = pregunta.zonas.every(z => notas[z.zona] != null);
  useEffect(() => {
    if (!completa || estado === 'guardando' || estado === 'guardado') return;
    const t = setTimeout(() => {
      const respuesta = respuestaDeAgujetas(pregunta, notas, Date.now());
      if (!respuesta) return;
      setEstado('guardando');
      guardar.current(respuesta).then(
        () => { if (vivo.current) setEstado('guardado'); },
        (err) => { console.warn('No se han podido guardar las agujetas a 48 h:', err); if (vivo.current) setEstado('error'); },
      );
    }, estado === 'error' ? 0 : ESPERA_ANTES_DE_GUARDAR_MS);
    return () => clearTimeout(t);
    // `intento` relanza el guardado tras un error; `estado` no, o se guardaría en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completa, notas, intento, pregunta]);

  useEffect(() => {
    if (estado !== 'guardado') return;
    const t = setTimeout(() => avisar.current?.(), CONFIRMACION_MS);
    return () => clearTimeout(t);
  }, [estado]);

  const bloqueada = estado === 'guardando' || estado === 'guardado';
  return {
    notas, estado, bloqueada, ultima,
    poner: (zona: ZonaIem, n: number) => {
      if (bloqueada) return;
      setNotas(v => ({ ...v, [zona]: n }));
      setUltima({ zona, n });
      if (estado === 'error') setEstado('contestando');
    },
    reintentar: () => setIntento(i => i + 1),
  };
}

/** Los cinco botones de una zona. `grande`: a todo el ancho, para la hoja. */
function Escala({ zona, valor, onElegir, bloqueada, grande }: { zona: ZonaIem; valor?: number; onElegir: (n: number) => void; bloqueada: boolean; grande?: boolean }) {
  return (
    <div className={`flex ${grande ? 'gap-1.5' : 'gap-1 shrink-0'}`} role="radiogroup" aria-label={`Agujetas en ${ZONA_POR_CLAVE[zona].nombre}`}>
      {NOTAS_AGUJETAS.map(({ n, titulo }) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valor === n}
          aria-label={`${n}: ${titulo}`}
          disabled={bloqueada}
          onClick={() => onElegir(n)}
          className={`${grande ? 'h-12 flex-1 rounded-control text-body-s' : 'h-10 w-8 rounded-[10px] text-label'} font-mono tabular-nums transition-transform active:scale-95 ${valor === n ? 'font-bold' : 'bg-raised border border-hairline text-ink-2'}`}
          style={valor === n ? { background: colorDeNota(n), color: tintaDeNota(n) } : undefined}
        >{n}</button>
      ))}
    </div>
  );
}

function Pie({ estado, onReintentar }: { estado: Estado; onReintentar: () => void }) {
  if (estado === 'guardado') {
    return (
      <p className="flex items-center gap-2 font-sans text-body-s font-bold text-success" role="status">
        <Icon name="check_circle" size="m" /> Apuntado. Con esto afinamos tu semana.
      </p>
    );
  }
  if (estado === 'guardando') return <p className="font-sans text-caption text-ink-3" role="status">Guardando…</p>;
  if (estado === 'error') {
    return (
      <p className="font-sans text-label text-danger" role="alert">
        No se ha podido guardar.{' '}
        <button type="button" className="underline font-bold" onClick={onReintentar}>Reintentar</button>
      </p>
    );
  }
  return null;
}

export default function Agujetas48h({ pregunta, variante = 'tarjeta', onGuardar, onGuardado, onAhoraNo, enEspera = false }: Props) {
  const r = useRespuestas({ pregunta, onGuardar, onGuardado });
  const titulo = `¿Cómo tienes hoy lo del ${diaDeLaSemana(pregunta.fecha)}?`;
  const sesion = pregunta.sesion ?? 'Tu sesión';
  const extremos = `1 = ${NOTAS_AGUJETAS[0].titulo.toLowerCase()} · 5 = ${NOTAS_AGUJETAS[NOTAS_AGUJETAS.length - 1].titulo.toLowerCase()}`;

  if (variante === 'hoja') {
    return (
      <Sheet
        open={!enEspera}
        // Cerrarla (✕, fondo, arrastrar) es un «ahora no»; mientras se guarda no hace nada y, ya guardada, solo se va.
        onClose={r.estado === 'guardado' ? () => onGuardado?.() : r.estado === 'guardando' ? () => undefined : onAhoraNo}
        title={titulo}
        size="s"
        footer={r.estado === 'guardado' ? undefined : <Button variant="ghost" fullWidth onClick={onAhoraNo} disabled={r.estado === 'guardando'}>Ahora no</Button>}
      >
        <div className="space-y-4">
          <p className="font-sans text-body-s text-ink-2 text-pretty">
            <span className="font-bold text-ink">{sesion}</span> · agujetas de cada zona, un toque. {extremos}.
          </p>
          {pregunta.zonas.map(({ zona }) => (
            <div key={zona} className="space-y-1.5">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-sans font-bold text-label text-ink">{nombreCorto(zona)}</span>
                <span className="font-sans text-caption text-ink-3 truncate">{tituloDe(r.notas[zona]) ?? 'Sin contestar'}</span>
              </p>
              <Escala zona={zona} valor={r.notas[zona]} onElegir={n => r.poner(zona, n)} bloqueada={r.bloqueada} grande />
            </div>
          ))}
          <Pie estado={r.estado} onReintentar={r.reintentar} />
        </div>
      </Sheet>
    );
  }

  return (
    <section className="rounded-canvas border border-accent-line bg-surface p-4 space-y-3" aria-label="Agujetas de tu última sesión">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-caption uppercase tracking-widest text-ink-3 truncate">Agujetas · {sesion}</p>
          <h2 className="font-sans font-bold text-title-s text-ink text-balance">{titulo}</h2>
        </div>
        {/* Ya guardada se esconde sin quitarse: el título no se recoloca justo al confirmar. */}
        <button
          type="button"
          onClick={onAhoraNo}
          disabled={r.bloqueada}
          className={`shrink-0 -mr-1 -mt-1 h-9 px-2 rounded-control font-sans text-caption text-ink-3 hover:text-ink hover:bg-raised transition-colors ${r.estado === 'guardado' ? 'invisible' : ''}`}
        >Ahora no</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {pregunta.zonas.map(({ zona }) => {
          const valor = r.notas[zona];
          return (
            <div key={zona} className={`flex items-center gap-2 bg-raised border rounded-control pl-3 pr-1.5 py-1.5 ${valor ? 'border-hairline' : 'border-accent-line'}`}>
              <p className="min-w-0 flex-1 font-sans text-label font-bold text-ink truncate">{nombreCorto(zona)}</p>
              <Escala zona={zona} valor={valor} onElegir={n => r.poner(zona, n)} bloqueada={r.bloqueada} />
            </div>
          );
        })}
      </div>
      {r.estado === 'contestando'
        ? (
          // Dos líneas reservadas: al tocar, la leyenda pasa a decir qué significa esa nota sin mover la tarjeta.
          <p className="min-h-[2lh] font-sans text-caption text-ink-4 text-pretty" aria-live="polite">
            {r.ultima
              ? <><span className="font-bold text-ink-2">{nombreCorto(r.ultima.zona)} · {r.ultima.n}</span> = {tituloDe(r.ultima.n)?.toLowerCase()}</>
              : <>Un toque por zona. {extremos}.</>}
          </p>
        )
        : <Pie estado={r.estado} onReintentar={r.reintentar} />}
    </section>
  );
}
