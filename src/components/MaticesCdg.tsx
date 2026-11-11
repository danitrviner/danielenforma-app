import React, { useMemo, useState } from 'react';
import {
  buscarEnCatalogo, comparar, conCambio, cuentaComoUnilateral, esPropio, nombreDeVariante,
  resultadoReferencia, sinMusculos, sumaAlIF, LIMITES, SERIE_DE_REFERENCIA_TEXTO,
  type Cambio, type CdgEjercicio,
} from '../utils/cdg';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Button, Chip, Input, SearchField, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Matices del ejercicio en la ficha (11-11, solo coach)

   Lo que de verdad mueve el índice de hipertrofia para un ejercicio: la
   inestabilidad (solo IF), los 33 valores musculares (IEM, y el IF de los que
   no son «Mediano») y las 11 zonas articulares (estrés articular). Se compara
   con otro ejercicio y, si es propio, se edita viendo al momento el IEM/IF de
   la serie de referencia. Los del Excel no se editan: «Crear variante» hace un
   propio a partir de él y vincula el ejercicio de la biblioteca.

   Formato «tabla» (elegido por Dani el 11-11 entre tabla, barras espejo y
   deslizadores): cifras en columnas, −/+ para editar y, al comparar, columnas
   «otro» y diferencia.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AccionesMatices {
  guardar: (editado: CdgEjercicio) => Promise<void>;
  crearVariante: (base: CdgEjercicio, nombreCorto: string) => Promise<void>;
}

interface Props {
  ejercicio: CdgEjercicio;
  catalogo: CdgEjercicio[];
  /** Sin acciones, todo es de solo lectura. */
  acciones?: AccionesMatices;
  key?: React.Key;
}

const n2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('es-ES');
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const signo = (d: number, f = n2) => (Math.abs(d) < 0.005 ? '=' : `${d > 0 ? '+' : '−'}${f(Math.abs(d))}`);
const PASO = 0.05;

interface FilaDatos {
  clave: string;
  nombre: string;
  sub?: string;
  valor: number;
  original: number;
  otro?: number;
  max: number;
  cambio?: (v: number) => Cambio;
}

export default function MaticesCdg({ ejercicio, catalogo, acciones }: Props) {
  const editable = esPropio(ejercicio) && !!acciones;
  const [editado, setEditado] = useState<CdgEjercicio>(ejercicio);
  const [otro, setOtro] = useState<CdgEjercicio | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [todos, setTodos] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombreVariante, setNombreVariante] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const antes = useMemo(() => resultadoReferencia(ejercicio), [ejercicio]);
  const ahora = useMemo(() => resultadoReferencia(editado), [editado]);
  const cmp = useMemo(() => (otro ? comparar(editado, otro) : null), [editado, otro]);
  const cambiado = useMemo(() => JSON.stringify(editado) !== JSON.stringify(ejercicio), [editado, ejercicio]);
  const nombres = useMemo(() => catalogo.map(e => e.exercise).filter(n => n !== ejercicio.exercise), [catalogo, ejercicio.exercise]);
  const resultados = useMemo(() => buscarEnCatalogo(nombres, consulta, 8), [nombres, consulta]);

  const cambiar = (c: Cambio) => setEditado(e => conCambio(e, c));

  const abrirComparar = () => {
    setBuscando(true);
    // «Press francés con mancuernas» → «press francés»: los parecidos salen solos.
    setConsulta(sinMusculos(ejercicio.exercise).split(/\s+/).slice(0, 2).join(' ').toLowerCase());
  };

  const ejecutar = async (fn: () => Promise<void>, accion: string) => {
    setOcupado(true);
    setError(null);
    try { await fn(); } catch (err) {
      console.error(err);
      setError(err instanceof Error && !('code' in err) ? err.message : mensajeDeErrorFirestore(err, accion));
    } finally { setOcupado(false); }
  };

  const inest = Number(editado.inestability) || 0;
  const filaInestabilidad: FilaDatos = {
    clave: 'inest', nombre: 'Inestabilidad', sub: 'solo mueve el IF',
    valor: inest, original: Number(ejercicio.inestability) || 0, otro: cmp?.inestabilidad.b,
    max: LIMITES.inestabilidad,
    cambio: v => ({ tipo: 'inestabilidad', valor: v }),
  };
  const filasMusculos: FilaDatos[] = editado.muscleStress
    .map((m, i) => ({
      clave: `m${i}`, nombre: m.muscle,
      sub: sumaAlIF(m.size) ? m.size : `${m.size} · no suma al IF`,
      valor: m.value, original: ejercicio.muscleStress[i]?.value ?? 0, otro: otro?.muscleStress[i]?.value,
      max: LIMITES.musculo, cambio: (v: number): Cambio => ({ tipo: 'musculo', i, valor: v }),
    }))
    .filter(f => todos || f.valor > 0 || f.original > 0 || (f.otro ?? 0) > 0);
  const filasArticulaciones: FilaDatos[] = editado.jointStress
    .map((j, i) => ({
      clave: `j${i}`, nombre: j.joint, valor: j.value, original: ejercicio.jointStress[i]?.value ?? 0,
      otro: otro?.jointStress[i]?.value, max: LIMITES.articulacion,
      cambio: (v: number): Cambio => ({ tipo: 'articulacion', i, valor: v }),
    }))
    .filter(f => todos || f.valor > 0 || f.original > 0 || (f.otro ?? 0) > 0);

  const cabecera = otro ? <CabeceraTabla /> : null;
  const pintar = (f: FilaDatos) => (
    <FilaTabla key={f.clave} f={f} comparando={!!otro} onCambio={editable ? (v: number) => f.cambio && cambiar(f.cambio(v)) : undefined} />
  );

  return (
    <div className="space-y-4">
      {/* Origen y acción principal */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-chip border border-hairline px-2.5 py-1 font-sans text-label text-ink-2">
          {esPropio(ejercicio) ? 'Propio · editable' : 'Del Excel · solo lectura'}
        </span>
        {!esPropio(ejercicio) && acciones && !creando && (
          <Button size="s" variant="secondary" onClick={() => { setCreando(true); setNombreVariante(sinMusculos(ejercicio.exercise)); }}>
            Crear variante
          </Button>
        )}
        {!otro && !buscando && <Button size="s" variant="ghost" onClick={abrirComparar}>Comparar con…</Button>}
      </div>

      {creando && acciones && (
        <div className="rounded-control bg-bg p-3 space-y-2">
          <Input label="Nombre de la variante" value={nombreVariante} onChange={setNombreVariante} />
          {nombreVariante.trim() && (
            <p className="font-sans text-body-s text-ink-3">Se guardará como «{nombreDeVariante(ejercicio.exercise, nombreVariante)}».</p>
          )}
          <p className="font-sans text-body-s text-ink-2">
            Copia los valores de este ejercicio para que los cambies, y este ejercicio de la biblioteca pasa a usar la variante.
          </p>
          <div className="flex gap-2">
            <Button size="s" variant="secondary" onClick={() => setCreando(false)} disabled={ocupado}>Cancelar</Button>
            <Button
              size="s"
              disabled={ocupado || !nombreVariante.trim() || nombreDeVariante(ejercicio.exercise, nombreVariante) === ejercicio.exercise}
              onClick={() => ejecutar(() => acciones.crearVariante(ejercicio, nombreVariante), 'crear la variante')}
            >
              {ocupado ? 'Creando…' : 'Crear y vincular'}
            </Button>
          </div>
        </div>
      )}

      {buscando && !otro && (
        <div className="space-y-2">
          <SearchField label="Comparar con" value={consulta} onChange={setConsulta} onCancel={() => setBuscando(false)} placeholder="Buscar en el catálogo…" />
          {consulta.trim() && resultados.length === 0 && <p className="font-sans text-body-s text-ink-3">Nada con esas palabras.</p>}
          <ul className="space-y-1">
            {resultados.map(n => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => { setOtro(catalogo.find(e => e.exercise === n) ?? null); setBuscando(false); }}
                  className="w-full rounded-control px-2 py-1.5 text-left font-sans text-body-s text-ink hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                >
                  {n}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {otro && (
        <div className="flex items-start gap-2 rounded-control bg-bg px-3 py-2">
          <p className="flex-1 font-sans text-body-s text-ink">
            Comparando con <b>{otro.exercise}</b>
          </p>
          <button type="button" onClick={() => setOtro(null)} aria-label="Quitar comparación" className="text-ink-2 hover:text-ink">
            <Icon name="close" size="s" />
          </button>
        </div>
      )}

      {/* Resultado de la serie de referencia: la ficha ya lo enseña arriba; aquí
          solo aparece cuando hay algo que contrastar (un valor tocado o otro ejercicio). */}
      {(cambiado || otro) ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Resultado titulo="IEM por serie" valor={ahora.IEMTotal} antes={cambiado ? antes.IEMTotal : undefined} otro={cmp?.ref.b.IEMTotal} />
            <Resultado titulo="IF por serie" valor={ahora.IF} antes={cambiado ? antes.IF : undefined} otro={cmp?.ref.b.IF} />
            <Resultado titulo="Estrés articular" valor={ahora.estresTotal} antes={cambiado ? antes.estresTotal : undefined} otro={cmp?.ref.b.estresTotal} />
          </div>
          <p className="font-sans text-body-s text-ink-3 -mt-2">
            Una serie {SERIE_DE_REFERENCIA_TEXTO}.{otro ? ' En azul, el otro ejercicio.' : ''}
          </p>
        </>
      ) : editable ? (
        <p className="font-sans text-body-s text-ink-3">Toca un valor y verás al momento cómo cambian el IEM y el IF.</p>
      ) : null}

      <Bloque cabecera={cabecera}>
        {pintar(filaInestabilidad)}
      </Bloque>

      <Bloque
        titulo={`Músculos · ${todos ? 'los 33' : 'los que trabajan'}`}
        ayuda="Suben el IEM. También el IF, menos los «Mediano», que el Excel no cuenta."
        cabecera={cabecera}
      >
        {filasMusculos.map(pintar)}
      </Bloque>

      <Bloque titulo="Zonas articulares" ayuda="Suben el estrés articular." cabecera={cabecera}>
        {filasArticulaciones.length ? filasArticulaciones.map(pintar) : <p className="font-sans text-body-s text-ink-3">Sin carga articular.</p>}
      </Bloque>

      <Chip icon={todos ? 'expand_less' : 'expand_more'} onClick={() => setTodos(v => !v)}>
        {todos ? 'Solo los que trabajan' : 'Ver los 33 músculos y las 11 zonas'}
      </Chip>

      <p className="font-sans text-body-s text-ink-3">
        {cuentaComoUnilateral(ejercicio.exercise)
          ? 'Lleva «unilateral» en el nombre: el índice le cuenta el doble de tiempo por serie. No cambia ni el IEM ni el IF.'
          : '«Unilateral» no es un valor del índice: solo dobla el tiempo de la serie cuando el nombre lleva esa palabra. No cambia ni el IEM ni el IF.'}
      </p>

      {error && <p className="font-sans text-body-s text-danger">{error}</p>}

      {editable && cambiado && (
        <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-raised px-4 py-3 space-y-2">
          <p className="font-sans text-body-s text-ink-2">
            Cambia este ejercicio en todos los mesociclos que lo usan.
          </p>
          <div className="flex gap-2">
            <Button size="s" variant="secondary" onClick={() => setEditado(ejercicio)} disabled={ocupado}>Descartar</Button>
            <Button size="s" onClick={() => ejecutar(() => acciones!.guardar(editado), 'guardar los valores')} disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Resultado({ titulo, valor, antes, otro }: { titulo: string; valor: number; antes?: number; otro?: number }) {
  return (
    <div className="rounded-control bg-raised px-3 py-2.5 min-w-0 border border-hairline">
      <p className="font-sans text-label text-ink-2">{titulo}</p>
      <p className="font-sans text-title-l font-bold text-ink tabular-nums">{n1(valor)}</p>
      {antes !== undefined && Math.abs(antes - valor) >= 0.05 && (
        <p className="font-mono text-body-s text-ink-2 tabular-nums truncate">antes {n1(antes)}</p>
      )}
      {otro !== undefined && (
        <p className="font-mono text-body-s text-data tabular-nums truncate">{n1(otro)} · {signo(otro - valor, n1)}</p>
      )}
    </div>
  );
}

function Bloque({ titulo, ayuda, cabecera, children }: { titulo?: string; ayuda?: string; cabecera?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      {titulo && <p className="font-sans text-label text-ink-2">{titulo}</p>}
      {ayuda && <p className="font-sans text-body-s text-ink-3 mb-1.5">{ayuda}</p>}
      {cabecera}
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

const COLUMNAS = 'grid grid-cols-[minmax(0,1fr)_6.5rem_2.75rem_2.75rem] items-center gap-2';

function CabeceraTabla() {
  return (
    <div className={`${COLUMNAS} mb-1 font-mono text-caption text-ink-3`}>
      <span />
      <span className="text-center">este</span>
      <span className="text-right">otro</span>
      <span className="text-right">dif.</span>
    </div>
  );
}

interface FilaProps { f: FilaDatos; comparando: boolean; onCambio?: (v: number) => void; key?: React.Key }

function Nombre({ f }: { f: FilaDatos }) {
  const tocado = Math.abs(f.valor - f.original) >= 0.005;
  return (
    <span className="min-w-0">
      <span className="block font-sans text-body-s leading-tight text-ink">
        {f.nombre}{tocado && <span className="text-accent-ink"> •</span>}
      </span>
      {f.sub && <span className="block font-sans text-caption text-ink-3 leading-tight">{f.sub}</span>}
    </span>
  );
}

function MasMenos({ f, onCambio }: { f: FilaDatos; onCambio: (v: number) => void }) {
  const boton = 'flex h-8 w-8 items-center justify-center rounded-control bg-bg text-ink-2 hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line';
  return (
    <span className="flex items-center justify-between gap-1">
      <button type="button" className={boton} aria-label={`Bajar ${f.nombre}`} disabled={f.valor <= 0} onClick={() => onCambio(f.valor - PASO)}>
        <Icon name="remove" size="s" />
      </button>
      <span className="font-mono text-body-s text-ink tabular-nums">{n2(f.valor)}</span>
      <button type="button" className={boton} aria-label={`Subir ${f.nombre}`} disabled={f.valor >= f.max} onClick={() => onCambio(f.valor + PASO)}>
        <Icon name="add" size="s" />
      </button>
    </span>
  );
}

function FilaTabla({ f, comparando, onCambio }: FilaProps) {
  return (
    <li className={COLUMNAS}>
      <Nombre f={f} />
      {onCambio ? <MasMenos f={f} onCambio={onCambio} /> : <span className="text-center font-mono text-body-s text-ink tabular-nums">{n2(f.valor)}</span>}
      <span className="text-right font-mono text-body-s text-data tabular-nums">{comparando ? n2(f.otro ?? 0) : ''}</span>
      <span className="text-right font-mono text-body-s text-ink-2 tabular-nums">{comparando ? signo((f.otro ?? 0) - f.valor) : ''}</span>
    </li>
  );
}
