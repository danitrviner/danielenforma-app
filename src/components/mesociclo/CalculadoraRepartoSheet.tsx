import React, { useMemo, useState } from 'react';
import { Mesocycle, MuscleGroup, MUSCLE_ORDER, MUSCLE_LABELS, MUSCLE_LABELS_SHORT } from '../../types';
import { Sheet, Button, Icon } from '../ui';
import {
  calcularRepartos, evaluarRepartoActual, frecuenciaPorDefecto, FRECUENCIA_MAXIMA, type OpcionDeReparto,
} from '../../utils/calculadoraReparto';
import { offsetsDelMesociclo, cicloDiasDeMeso } from '../../utils/asignacionMesociclo';
import { SERIES_POR_DIA_TOPE, SERIES_POR_SESION } from '../../utils/volumeSuggestion';

/* ═══════════════════════════════════════════════════════════════════════════
   Calculadora de reparto por frecuencias (Mesociclo › Distribución)

   Paso 1: días de la semana, topes y cuántas veces por semana se toca cada
   grupo (precargado desde el volumen, editable de 0,5 en 0,5).
   Paso 2: 3-4 repartos que lo cumplen, cada uno con su ciclo, sus sesiones y
   sus avisos. «Usar este» lo deja como reparto propio del mesociclo.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** 0 = lunes … 6 = domingo, en hora local. */
function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

const fmt = (n: number) => n.toLocaleString('es-ES');

interface Props {
  editing: Mesocycle;
  onClose: () => void;
  onUsar: (opcion: OpcionDeReparto) => void;
}

const Paso: React.FC<{
  valor: number; onCambio: (v: number) => void; min: number; max: number; paso: number; etiqueta: string;
  formato?: (v: number) => string;
}> = ({ valor, onCambio, min, max, paso, etiqueta, formato = v => (v > 0 ? `${fmt(v)}×` : '—') }) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      aria-label={`Bajar ${etiqueta}`}
      disabled={valor <= min}
      onClick={() => onCambio(Math.max(min, valor - paso))}
      className="w-9 h-9 flex items-center justify-center rounded-control bg-raised text-ink-2 hover:text-ink disabled:opacity-30 transition-colors"
    >
      <Icon name="remove" size="s" />
    </button>
    <span className={`w-10 text-center font-mono text-label tabular-nums ${valor > 0 ? 'text-ink' : 'text-ink-3'}`}>
      {formato(valor)}
    </span>
    <button
      type="button"
      aria-label={`Subir ${etiqueta}`}
      disabled={valor >= max}
      onClick={() => onCambio(Math.min(max, valor + paso))}
      className="w-9 h-9 flex items-center justify-center rounded-control bg-raised text-ink-2 hover:text-ink disabled:opacity-30 transition-colors"
    >
      <Icon name="add" size="s" />
    </button>
  </div>
);

const Aviso: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-surface px-3 py-2">
    <Icon name="warning" size="s" className="text-warning flex-shrink-0 mt-px" />
    <p className="font-sans text-caption text-warning leading-relaxed">{texto}</p>
  </div>
);

function TarjetaOpcion({ opcion, mejor, inicioSemana, onUsar }: {
  key?: React.Key;
  opcion: OpcionDeReparto; mejor: boolean; inicioSemana: number;
  /** Sin él es la tarjeta del reparto actual: se mira, no se elige. */
  onUsar?: () => void;
}) {
  // Filas de 7: un ciclo rotativo de 9 días ocupa una semana y dos días.
  const filas = Math.ceil(opcion.cicloDias / 7);
  const sesionDe = new Map(opcion.sesiones.map(s => [s.dia, s]));
  const actual = !onUsar;
  return (
    <div className={`rounded-surface border p-3 space-y-3 ${
      actual ? 'border-dashed border-strong bg-inset' : mejor ? 'border-accent bg-accent/5' : 'border-hairline bg-surface'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-sans text-title-s text-ink">{opcion.estrategia}</h3>
          <p className="font-mono text-caption text-ink-3">
            {opcion.sesiones.length} sesiones · ciclo de {opcion.cicloDias} días
          </p>
        </div>
        {mejor && (
          <span className="font-mono text-caption px-1.5 py-0.5 rounded-full border border-accent text-accent-ink whitespace-nowrap">★ Mejor encaje</span>
        )}
      </div>

      {/* El ciclo entero, una fila por semana: se ve de un vistazo qué toca cada día. */}
      <div className="space-y-1">
        {Array.from({ length: filas }, (_, w) => (
          <div key={w} className="grid grid-cols-7 gap-1">
            {Array.from({ length: Math.min(7, opcion.cicloDias - w * 7) }, (_, k) => {
              const dia = w * 7 + k;
              const s = sesionDe.get(dia);
              return (
                <div
                  key={k}
                  title={s ? `${s.tipo}: ${s.grupos.map(x => `${MUSCLE_LABELS[x.grupo]} ${x.series}`).join(', ')}` : 'Descanso'}
                  className={`rounded-control border px-1 py-1 text-center min-w-0 ${s ? 'border-accent-line bg-accent/10' : 'border-hairline bg-inset'}`}
                >
                  <span className={`block font-mono text-caption ${s ? 'text-accent-ink' : 'text-ink-3'}`}>{DIAS[(inicioSemana + dia) % 7]}</span>
                  <span className={`block font-sans text-caption truncate ${s ? 'text-ink' : 'text-ink-3'}`}>{s ? s.tipo : '—'}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="space-y-1">
        {opcion.sesiones.map(s => (
          <li key={s.dia} className="flex items-baseline gap-2">
            <span className="font-mono text-caption text-ink-3 w-8 flex-shrink-0">D{s.dia + 1}</span>
            <span className="font-sans text-label text-ink flex-shrink-0">{s.tipo}</span>
            <span className="font-mono text-caption text-ink-3 min-w-0 truncate">
              {s.grupos.filter(x => x.series > 0).map(x => `${MUSCLE_LABELS_SHORT[x.grupo]} ${x.series}`).join(' · ')}
            </span>
            <span className="ml-auto font-mono text-caption text-ink-2 tabular-nums flex-shrink-0">{s.total}</span>
          </li>
        ))}
      </ul>

      {/* En el reparto actual, lo que importa es qué frecuencias NO cumple. */}
      {actual && (() => {
        const distintas = (Object.entries(opcion.frecuencias) as [MuscleGroup, { objetivo: number; conseguida: number }][])
          .filter(([, f]) => f.objetivo > 0 && f.objetivo !== f.conseguida);
        return distintas.length === 0 ? (
          <p className="font-sans text-caption text-success">Ya cumple todas las frecuencias que pides.</p>
        ) : (
          <div className="space-y-1">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Ahora → pides</p>
            <div className="flex flex-wrap gap-1.5">
              {distintas.map(([g, f]) => (
                <span key={g} className="rounded-chip border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-caption text-warning">
                  {MUSCLE_LABELS_SHORT[g]} {fmt(f.conseguida)}× → {fmt(f.objetivo)}×
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {opcion.avisos.map((a, i) => <Aviso key={i} texto={a} />)}

      {onUsar && (
        <Button onClick={onUsar} icon="check" fullWidth variant={mejor ? 'primary' : 'secondary'}>Usar este reparto</Button>
      )}
    </div>
  );
}

export default function CalculadoraRepartoSheet({ editing, onClose, onUsar }: Props) {
  const inicioSemana = editing.startDate ? diaSemana(editing.startDate) : 0;
  const [paso, setPaso] = useState<1 | 2>(1);

  // Días de partida: los que ya tiene el mesociclo en su primera semana.
  const [dias, setDias] = useState<number[]>(() => {
    const ciclo = cicloDiasDeMeso(editing);
    const deLaSemana = offsetsDelMesociclo(editing).filter(o => o < 7 && o < ciclo).map(o => (inicioSemana + o) % 7);
    return [...new Set(deLaSemana)].sort((a, b) => a - b);
  });
  const [frecuencias, setFrecuencias] = useState<Record<MuscleGroup, number>>(() =>
    Object.fromEntries(MUSCLE_ORDER.map(g => [
      g, editing.reparto?.frecuencias?.[g] ?? frecuenciaPorDefecto(editing.groups[g]?.series ?? 0),
    ])) as Record<MuscleGroup, number>);
  const [maxSesion, setMaxSesion] = useState(SERIES_POR_DIA_TOPE);
  const [maxGrupo, setMaxGrupo] = useState(SERIES_POR_SESION);

  const resultado = useMemo(
    () => (paso === 2
      ? calcularRepartos({ diasSemana: dias, inicioSemana, frecuencias, grupos: editing.groups, maxSeriesSesion: maxSesion, maxSeriesGrupoSesion: maxGrupo })
      : null),
    [paso, dias, inicioSemana, frecuencias, editing.groups, maxSesion, maxGrupo],
  );
  // Lo que el mesociclo ya tiene, medido contra las frecuencias pedidas ahora.
  const actual = useMemo(
    () => (paso === 2 ? evaluarRepartoActual(editing, { frecuencias, grupos: editing.groups, maxSeriesSesion: maxSesion }) : null),
    [paso, editing, frecuencias, maxSesion],
  );
  const mejorId = resultado?.opciones.length
    ? resultado.opciones.reduce((a, b) => (b.coste < a.coste ? b : a)).id
    : null;

  const hayMedias = MUSCLE_ORDER.some(g => frecuencias[g] > 0 && !Number.isInteger(frecuencias[g]));
  const toggleDia = (d: number) => setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  return (
    <Sheet
      open
      onClose={onClose}
      title={paso === 1 ? 'Calcular reparto por frecuencias' : 'Repartos que lo cumplen'}
      size="l"
      footer={paso === 1 ? (
        <>
          <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
          <Button onClick={() => setPaso(2)} icon="calculate" fullWidth disabled={dias.length === 0}>Calcular</Button>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setPaso(1)} icon="arrow_back" fullWidth>Ajustar</Button>
      )}
    >
      {paso === 1 ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Días de entrenamiento</span>
            <div className="grid grid-cols-7 gap-1">
              {DIAS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={dias.includes(i)}
                  aria-label={DIAS_LARGOS[i]}
                  onClick={() => toggleDia(i)}
                  className={`h-11 rounded-control font-mono text-label font-bold transition-colors ${
                    dias.includes(i) ? 'bg-accent text-on-accent' : 'bg-raised text-ink-2 hover:text-ink'
                  }`}
                >{d}</button>
              ))}
            </div>
            <p className="font-sans text-caption text-ink-3">
              {dias.length} {dias.length === 1 ? 'día' : 'días'} por semana.{' '}
              {hayMedias
                ? 'Hay frecuencias «y media»: el ciclo será de 14 días (semana A y B) con estos mismos días.'
                : 'Todas las frecuencias son enteras: ciclo semanal.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider block">Máx. series / sesión</span>
              <Paso valor={maxSesion} onCambio={setMaxSesion} min={8} max={40} paso={1} etiqueta="máximo de series por sesión" formato={String} />
            </div>
            <div className="space-y-1">
              <span className="font-mono text-caption text-ink-2 uppercase tracking-wider block">Máx. de un grupo / sesión</span>
              <Paso valor={maxGrupo} onCambio={setMaxGrupo} min={3} max={15} paso={1} etiqueta="máximo de series de un grupo por sesión" formato={String} />
            </div>
          </div>

          <div className="space-y-2">
            <span className="font-mono text-caption text-ink-2 uppercase tracking-wider">Veces por semana</span>
            <p className="font-sans text-caption text-ink-3">
              Salen del volumen (≈ 6 series por sesión). Cámbialas de 0,5 en 0,5; «—» = ese grupo no entra en el reparto.
            </p>
            <ul className="divide-y divide-hairline rounded-surface border border-hairline">
              {MUSCLE_ORDER.map(g => {
                const series = editing.groups[g]?.series ?? 0;
                const f = frecuencias[g];
                const porSesion = f > 0 && series > 0 ? Math.round(series / f) : null;
                return (
                  <li key={g} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="flex-1 min-w-0">
                      <span className={`block font-sans text-label ${series > 0 || f > 0 ? 'text-ink' : 'text-ink-3'}`}>{MUSCLE_LABELS[g]}</span>
                      <span className={`block font-mono text-caption ${porSesion != null && porSesion > maxGrupo ? 'text-warning' : 'text-ink-3'}`}>
                        {series} series/sem{porSesion != null ? ` · ~${porSesion} por sesión` : ''}
                      </span>
                    </div>
                    <Paso
                      valor={f}
                      onCambio={v => setFrecuencias(prev => ({ ...prev, [g]: v }))}
                      min={0}
                      max={FRECUENCIA_MAXIMA}
                      paso={0.5}
                      etiqueta={`frecuencia de ${MUSCLE_LABELS[g]}`}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {resultado!.avisos.map((a, i) => <Aviso key={i} texto={a} />)}
          {resultado!.opciones.length === 0 && resultado!.avisos.length === 0 && (
            <p className="font-sans text-label text-ink-2">No sale ningún reparto con estos datos.</p>
          )}
          {actual && (
            <>
              <TarjetaOpcion opcion={actual} mejor={false} inicioSemana={inicioSemana} />
              <p className="font-mono text-caption text-ink-3 uppercase tracking-wider pt-1">Propuestas</p>
            </>
          )}
          {resultado!.opciones.map(o => (
            <TarjetaOpcion key={o.id} opcion={o} mejor={o.id === mejorId} inicioSemana={inicioSemana} onUsar={() => onUsar(o)} />
          ))}
        </div>
      )}
    </Sheet>
  );
}
