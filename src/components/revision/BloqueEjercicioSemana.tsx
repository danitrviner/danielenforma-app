import React from 'react';
import { Badge } from '../ui';
import { fechaCorta } from '../../utils/trainingWeek';
import {
  ETIQUETA_MARCA, textoSerieCorta,
  type SemanaASemanaDelBloque, type FilaEjercicioBloque, type CeldaEjercicioSemana,
  type SemanaDelBloqueCol, type VezEntrenada, type EstadoDeCelda,
} from '../../utils/semanaASemanaDelBloque';

/* ═══════════════════════════════════════════════════════════════════════════
   Revisión › Bloque › «Cada ejercicio, semana a semana» (23-11-2026).

   Todos los ejercicios del bloque, sesión a sesión, con lo planificado y lo
   hecho (kg × reps de cada serie) en cada semana. La lógica vive en
   utils/semanaASemanaDelBloque. Se probaron tres formas de pintarlo (tabla,
   lista y gráfica) y Dani eligió la TABLA (23-11-2026): ejercicios en filas y
   semanas en columnas, todo de un vistazo. En el móvil la tabla se desplaza a
   lo ancho dentro de su caja, con el nombre del ejercicio fijo a la izquierda.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  datos: SemanaASemanaDelBloque;
}

const FUERA_DEL_PLAN = 'Fuera de la planificación';

function gruposDe(datos: SemanaASemanaDelBloque): { clave: string; nombre: string; filas: FilaEjercicioBloque[] }[] {
  return [
    ...datos.sesiones,
    ...(datos.fueraDelPlan.length > 0 ? [{ clave: 'fuera', nombre: FUERA_DEL_PLAN, filas: datos.fueraDelPlan }] : []),
  ];
}

// ── Piezas comunes ──────────────────────────────────────────────────────────

const COLOR_ESTADO: Record<EstadoDeCelda, string> = {
  cumple: 'bg-success',
  corto: 'bg-warning',
  sin_hacer: 'bg-danger',
  pendiente: 'bg-track',
  por_llegar: 'bg-track',
};

const TEXTO_SIN_MARCA: Partial<Record<EstadoDeCelda, string>> = {
  sin_hacer: 'No registrado',
  pendiente: 'Esta semana',
  por_llegar: 'Por llegar',
};

function Flecha({ v }: { v: CeldaEjercicioSemana['vsAnterior'] }) {
  if (!v) return null;
  if (v === 'sube') return <span className="text-success" aria-label="Más fuerte que la semana anterior">↑</span>;
  if (v === 'baja') return <span className="text-danger" aria-label="Menos fuerte que la semana anterior">↓</span>;
  return <span className="text-ink-3" aria-label="Igual que la semana anterior">=</span>;
}

function Cambio({ fila }: { fila: FilaEjercicioBloque }) {
  if (fila.cambioPct == null) return null;
  const pct = fila.cambioPct;
  const tono = pct > 3 ? 'text-success' : pct < -3 ? 'text-danger' : 'text-ink-3';
  const signo = pct > 0 ? '+' : '';
  return (
    <span className={`font-mono text-caption tabular-nums ${tono}`}>
      {signo}{pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % en el bloque
    </span>
  );
}

function textoPlan(c: CeldaEjercicioSemana): string | null {
  return c.plan ? `${c.plan.esquema} · ${c.plan.rir}` : null;
}

function Leyenda() {
  return (
    <p className="font-sans text-caption text-ink-3">
      Arriba lo planificado; debajo lo que hizo, kg × reps de cada serie.{' '}
      <span className="text-success">↑</span> más fuerte que la semana anterior,{' '}
      <span className="text-danger">↓</span> menos, = igual.
    </p>
  );
}

function SinDatos({ datos }: { datos: SemanaASemanaDelBloque }) {
  if (datos.sesiones.length > 0 || datos.fueraDelPlan.length > 0) return null;
  return <p className="font-sans text-caption text-ink-3">Este bloque no tiene sesiones planificadas ni registradas.</p>;
}

// ── La tabla ───────────────────────────────────────────────────────────────

function SeriesDeLaVez({ vez, conFecha }: { key?: React.Key; vez: VezEntrenada; conFecha: boolean }) {
  return (
    <div className="space-y-0.5">
      {(conFecha || vez.fuera) && (
        <p className="font-mono text-[10px] text-ink-3 uppercase tracking-wider">
          {conFecha ? fechaCorta(vez.fecha) : ''}{vez.fuera ? `${conFecha ? ' · ' : ''}fuera` : ''}
        </p>
      )}
      {vez.series.map((s, i) => (
        <p key={i} className={`font-mono text-label tabular-nums whitespace-nowrap ${s.segmento ? 'text-ink-3' : 'text-ink'}`}>
          {s.segmento ? '↳ ' : ''}{textoSerieCorta(s)}
        </p>
      ))}
    </div>
  );
}

function CeldaTabla({ c }: { c: CeldaEjercicioSemana }) {
  const plan = textoPlan(c);
  const futura = c.estado === 'por_llegar';
  return (
    <div className={`relative h-full pl-2.5 ${futura ? 'opacity-60' : ''}`}>
      <span className={`absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-full ${COLOR_ESTADO[c.estado]}`} aria-hidden />
      {c.otroEjercicio && <p className="font-sans text-caption text-accent-ink">{c.otroEjercicio}</p>}
      {plan && <p className="font-mono text-caption text-ink-3 whitespace-nowrap">{plan}</p>}
      {c.veces.length > 0 ? (
        <div className="mt-1 space-y-1.5">
          {c.veces.map((v, i) => <SeriesDeLaVez key={i} vez={v} conFecha={c.veces.length > 1} />)}
        </div>
      ) : (
        <p className="mt-1 font-sans text-caption text-ink-3">{TEXTO_SIN_MARCA[c.estado]}</p>
      )}
      {c.vsAnterior && <span className="absolute right-0 top-0 font-mono text-label"><Flecha v={c.vsAnterior} /></span>}
    </div>
  );
}

function CabeceraSemana({ s }: { s: SemanaDelBloqueCol }) {
  return (
    <div className="space-y-0.5">
      <p className={`font-mono text-caption uppercase tracking-wider ${s.enCurso ? 'text-accent-ink' : 'text-ink-2'}`}>
        S{s.n}{s.enCurso ? ' · hoy' : ''}
      </p>
      <p className="font-mono text-[10px] text-ink-3 normal-case tracking-normal">{fechaCorta(s.desde)}</p>
      {s.marca && <Badge tone={s.marca === 'descarga' ? 'info' : 'neutral'}>{ETIQUETA_MARCA[s.marca]}</Badge>}
    </div>
  );
}

function TablaPorSesion({ datos }: { datos: SemanaASemanaDelBloque }) {
  const minimo = 180 + datos.semanas.length * 112;
  return (
    <div className="space-y-5">
      {gruposDe(datos).map(g => (
        <div key={g.clave} className="space-y-2">
          <p className="font-sans text-label font-bold text-ink">{g.nombre}</p>
          <div className="overflow-x-auto rounded-surface border border-hairline">
            <table className="w-full border-collapse" style={{ minWidth: `${minimo}px` }}>
              <thead>
                <tr className="bg-bg">
                  <th className="sticky left-0 z-10 bg-bg text-left align-bottom px-3 py-2.5 border-b border-hairline w-[124px] sm:w-[180px] font-mono text-caption text-ink-2 uppercase tracking-wider">
                    Ejercicio
                  </th>
                  {datos.semanas.map(s => (
                    <th key={s.n} className="text-left align-bottom px-2.5 py-2.5 border-b border-hairline font-normal">
                      <CabeceraSemana s={s} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.filas.map(f => (
                  <tr key={f.clave} className="border-b border-hairline last:border-b-0 align-top">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2.5 w-[124px] sm:w-[180px]">
                      <p className="font-sans text-label text-ink">{f.nombre}</p>
                      <Cambio fila={f} />
                    </td>
                    {f.semanas.map(c => (
                      <td key={c.semana} className="px-2.5 py-2.5">
                        <CeldaTabla c={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BloqueEjercicioSemana({ datos }: Props) {
  return (
    <div className="space-y-4">
      <SinDatos datos={datos} />
      <Leyenda />
      <TablaPorSesion datos={datos} />
    </div>
  );
}
