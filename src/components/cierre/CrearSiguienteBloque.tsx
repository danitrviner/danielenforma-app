import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Mesocycle } from '../../types';
import { limitesEnLinea, type LimiteArticularPropuesto } from '../../utils/hipotesisDeBloque/estresArticular';
import { resumenDeTipo, type SiguienteBloque } from '../../utils/hipotesisDeBloque/siguienteBloque';
import { nombreDeMeso } from '../../utils/nombresMeso';
import { fechaCorta } from '../../utils/trainingWeek';
import { useToast } from '../../hooks/useToast';
import { Button, Dialog } from '../ui';
import { useEscriturasDelCierre } from './escriturasDelCierre';
import { Seccion } from './piezas';

/* ═══════════════════════════════════════════════════════════════════════════
   «Bloque siguiente, propuesto» — Revisión › Cierre de bloque (17-11-2026).

   La tarjeta de abajo de la maqueta A: tres datos (ejercicios que se quedan y
   candidatos a cambio, arranque, duración y estrellas) y dos botones. El
   bloque lo monta `siguienteBloque` (utils/hipotesisDeBloque): aquí solo se
   enseña y, al pulsar, se guarda.

   Nada se crea hasta pulsar. El bloque nace como BORRADOR del coach: con sus
   rutinas pero sin asignar al atleta (eso sigue siendo «Asignar mesociclo»,
   en el editor), igual que al aplicar una plantilla. Si ya hay un bloque
   posterior, se pregunta antes.

   18-11-2026 (decisiones de Dani):
    · La tarjeta dice de dónde salen las series y repeticiones del bloque
      nuevo —la última semana normal de este, no la semana 1 ni una descarga—
      porque «con las prescripciones con las que acabó» no se entendía.
    · Si alguna zona con estrella trae molestias, sale qué articulaciones
      vigilar y, cuando se puede calcular, un límite semanal sugerido (su
      media en este bloque) con un botón para fijarlo. El límite es del
      atleta (el de Seguimiento › «Guardar para este atleta»), avisa y no
      bloquea; la línea de «vigilar» se queda escrita en el bloque nuevo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  /** El bloque que se cierra. */
  meso: Mesocycle;
  /** El bloque siguiente ya montado (`siguienteBloque`). */
  propuesto: SiguienteBloque;
  /** Las hipótesis del bloque están sin firmar: la propuesta sale de la lectura de la app. */
  sinFirmar: boolean;
  /** Falta el catálogo CDG: las hipótesis nuevas salen sin cifras de estímulo. */
  sinCifras: boolean;
  /** Guarda como límite semanal del atleta los que sugiere la tarjeta. Sin él no hay botón. */
  onFijarLimites?: (limites: LimiteArticularPropuesto[]) => Promise<void>;
  /** Sin `@types/react` en el repo, TS no excluye la key por su cuenta (ver Chip). */
  key?: React.Key;
}

function Dato({ etiqueta, valor, sub }: { etiqueta: string; valor: string; sub: string }) {
  return (
    <div className="rounded-control border border-hairline bg-bg px-3 py-2">
      <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.08em]">{etiqueta}</span>
      <span className="block font-mono text-title-s font-semibold text-ink tabular-nums">{valor}</span>
      <span className="block font-mono text-caption text-ink-3">{sub}</span>
    </div>
  );
}

export default function CrearSiguienteBloque({ athleteEmail, meso, propuesto, sinFirmar, sinCifras, onFijarLimites }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { crearMesociclo, crearRutina, alAbrirEditor } = useEscriturasDelCierre();
  const [creando, setCreando] = useState(false);
  // Una vez creado se congela lo que se creó: la propuesta se recalcula con el
  // bloque nuevo ya en la lista y dejaría de describirlo.
  const [hecho, setHecho] = useState<{ meso: Mesocycle; resumen: SiguienteBloque['resumen']; rutinas: number } | null>(null);
  const creado = hecho?.meso ?? null;
  /** Qué botón espera la confirmación de «ya hay un bloque posterior». */
  const [pendiente, setPendiente] = useState<'crear' | 'ajustar' | null>(null);

  // Los límites articulares ya fijados desde aquí: al guardarlos la propuesta
  // deja de sugerirlos (el atleta ya los tiene) y hay que poder decir cuáles fueron.
  const [fijando, setFijando] = useState(false);
  const [fijados, setFijados] = useState<LimiteArticularPropuesto[] | null>(null);

  const r = hecho?.resumen ?? propuesto.resumen;
  const sinRutinas = (hecho?.rutinas ?? propuesto.rutinas.length) === 0;
  const n = r.candidatos.length;
  const abrirEditor = () => (alAbrirEditor ? alAbrirEditor(athleteEmail) : navigate(`/clients/${encodeURIComponent(athleteEmail)}/entrenamientos`));

  const crear = async (luegoAjustar: boolean) => {
    setPendiente(null);
    setCreando(true);
    let nuevo: Mesocycle | null = null;
    try {
      nuevo = await crearMesociclo(propuesto.meso);
      // Sus rutinas nacen ya hechas y SIN asignar al calendario del atleta.
      for (const rutina of propuesto.rutinas) await crearRutina({ ...rutina, mesocycleId: nuevo.id });
      showToast(`${nombreDeMeso(nuevo)} creado como borrador: no se ha asignado al atleta.`, 'success');
    } catch (err) {
      console.error('CrearSiguienteBloque: no se pudo crear el bloque', err);
      showToast(nuevo
        ? `${nombreDeMeso(nuevo)} se ha creado, pero no todas sus rutinas. Revísalo en Plan › Entrenamientos antes de asignarlo.`
        : 'No se ha podido crear el bloque siguiente. No se ha guardado nada: vuelve a intentarlo.', 'error');
    } finally {
      setCreando(false);
    }
    if (!nuevo) return;
    const creadoAhora = nuevo;
    queryClient.setQueryData<Mesocycle[]>(['mesocycles', athleteEmail], prev => (prev ? [...prev.filter(m => m.id !== creadoAhora.id), creadoAhora] : prev));
    void queryClient.invalidateQueries({ queryKey: ['mesocycles', athleteEmail] });
    void queryClient.invalidateQueries({ queryKey: ['workouts'] });
    setHecho({ meso: creadoAhora, resumen: propuesto.resumen, rutinas: propuesto.rutinas.length });
    if (luegoAjustar) abrirEditor();
  };
  const pedir = (cual: 'crear' | 'ajustar') => (r.hayPosterior ? setPendiente(cual) : void crear(cual === 'ajustar'));

  // Los límites se leen de la propuesta de AHORA, no de la congelada al crear:
  // se pueden fijar antes o después de crear el bloque.
  const limites = propuesto.resumen.articular.limites;
  const fijarLimites = async () => {
    if (!onFijarLimites || limites.length === 0) return;
    setFijando(true);
    try {
      await onFijarLimites(limites);
      setFijados(limites);
      showToast('Límite semanal guardado para este atleta', 'success');
    } catch (err) {
      console.error('CrearSiguienteBloque: no se pudieron guardar los límites articulares', err);
      showToast('No se ha podido guardar el límite. No se ha cambiado nada: vuelve a intentarlo.', 'error');
    } finally {
      setFijando(false);
    }
  };

  return (
    <Seccion
      titulo="Bloque siguiente, propuesto"
      icon="flag"
      extra={creado ? (
        <Button size="s" variant="secondary" iconTrailing="arrow_forward" onClick={abrirEditor}>Abrir en el editor</Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="s" variant="secondary" onClick={() => pedir('ajustar')} disabled={creando}>Ajustar antes</Button>
          <Button size="s" variant="primary" onClick={() => pedir('crear')} loading={creando} loadingLabel="Creando">Crear siguiente bloque</Button>
        </div>
      )}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Dato
          etiqueta="Ejercicios"
          valor={`${r.seQuedan} se ${r.seQuedan === 1 ? 'queda' : 'quedan'}`}
          sub={n === 0 ? 'ningún candidato a cambio' : `${n} ${n === 1 ? 'candidato' : 'candidatos'} a cambio`}
        />
        <Dato
          etiqueta="Arranque"
          valor={r.semana1Reducida ? 'Semana 1 reducida' : 'Donde acabó'}
          sub={`${fechaCorta(r.inicio, { dia: true })} · ${r.semana1Reducida ? 'algo por debajo de donde acabó' : 'sin semana reducida'}`}
        />
        <Dato etiqueta="Duración" valor={`${r.semanas} semanas`} sub={resumenDeTipo(r)} />
      </div>

      <p className="font-sans text-caption text-ink-2 leading-relaxed">
        {n > 0 && (
          <>Candidatos a cambio: {r.candidatos.map(c => `${c.nombre ?? c.exerciseId} (${c.detalle.replace(/\.$/, '').toLowerCase()})`).join(' · ')}. </>
        )}
        {r.motivoDeArranque && <>{r.motivoDeArranque} </>}
        {creado
          ? <>Creado como <b className="text-ink">{nombreDeMeso(creado)}</b>: está en Plan › Entrenamientos, sin asignar al atleta. Ábrelo allí para ajustarlo y asignarlo.</>
          : <>Mismo reparto, días y ejercicios. <b className="text-ink">Copia lo que hacía en su última semana normal</b> (la S{r.semanaDeReferencia} de este bloque; no la semana 1 ni una descarga): mismas series y repeticiones. Se crea como borrador, sin asignar al atleta. Nada se crea hasta que pulses.</>}
      </p>
      {sinRutinas && !creado && (
        <p className="font-sans text-caption text-warning">
          Este bloque no tiene rutinas guardadas: el siguiente se crearía con el mismo plan pero sin sesiones, y habría que generarlas en Distribución.
        </p>
      )}
      {r.hayPosterior && !creado && (
        <p className="font-sans text-caption text-warning">
          Ya hay un bloque posterior a este. Si creas otro, sería el Meso #{r.numero}; te pediré confirmación.
        </p>
      )}
      {[...r.rotacion, ...r.avisos].map(t => (
        <p key={t} className="font-sans text-caption text-warning">{t}</p>
      ))}
      {/* Molestias en una zona con estrella: qué articulaciones vigilar en el
          bloque nuevo y, si se pudo calcular, el límite semanal sugerido. */}
      {r.articular.vigilar.map(v => (
        <p key={v.zona} className="font-sans text-caption text-warning">{v.texto}</p>
      ))}
      {fijados ? (
        <p className="font-sans text-caption text-ink-2">
          <b className="text-ink">Límite semanal fijado para este atleta:</b> {limitesEnLinea(fijados)}. Se cambia en Seguimiento, dentro del editor del bloque.
        </p>
      ) : limites.length > 0 && onFijarLimites && (
        <div className="flex items-start justify-between gap-3 flex-wrap rounded-control border border-hairline bg-bg px-3 py-2">
          <p className="font-sans text-caption text-ink-2 leading-relaxed min-w-0 flex-1">
            <b className="text-ink">Límite semanal sugerido:</b> {limitesEnLinea(limites)}. Es lo que cargó de media por semana en este bloque, no más alto.
            Si lo fijas queda como límite de este atleta: avisa cuando una semana lo pase y no bloquea nada.
          </p>
          <Button size="s" variant="secondary" onClick={() => void fijarLimites()} loading={fijando} loadingLabel="Guardando">Fijar como límite semanal</Button>
        </div>
      )}
      {/* Por qué alguna hipótesis no propone lo de siempre (déficit, zona ya
          alta). Son propuestas: se cambian en el editor. */}
      {(r.notas ?? []).map(t => (
        <p key={t} className="font-sans text-caption text-ink-2">{t}</p>
      ))}
      {(sinFirmar || sinCifras) && !creado && (
        <p className="font-mono text-caption text-ink-3">
          {sinFirmar && r.estrellas.length > 0 && 'Los veredictos están sin firmar: la propuesta sale de la lectura de la app. '}
          {sinCifras && r.estrellas.length > 0 && 'Sin el catálogo CDG las hipótesis nuevas salen sin cifras de estímulo: se rellenan en el editor.'}
        </p>
      )}

      <Dialog
        open={pendiente != null}
        onClose={() => setPendiente(null)}
        title="Ya hay un bloque posterior"
        footer={(
          <div className="flex justify-end gap-2">
            <Button size="s" variant="secondary" onClick={() => setPendiente(null)}>Cancelar</Button>
            <Button size="s" variant="primary" onClick={() => void crear(pendiente === 'ajustar')}>Crear otro igualmente</Button>
          </div>
        )}
      >
        <p className="font-sans text-label text-ink leading-relaxed">
          Este atleta ya tiene un bloque que empieza después de {nombreDeMeso(meso)}. Si sigues se creará otro más (Meso #{r.numero}),
          que empezaría el {fechaCorta(r.inicio, { dia: true })}. El que ya existe no se toca.
        </p>
      </Dialog>
    </Seccion>
  );
}
