import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getExercises, seedExercisesIfEmpty } from '../dbService';
import { useMotorCdg } from '../hooks/useMotorCdg';
import {
  proponerEmparejados, buscarEnCatalogo, sinMusculos,
  type FilaEmparejado, type RevisionesCdg
} from '../utils/cdg';
import { ScreenSkeleton, Button, Icon, ProgressBar, EmptyState, SegmentedControl, SearchField, Banner, Chip, type SegmentedOption } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Emparejado de ejercicios con el catálogo CDG

   El motor de la plantilla «Índice de hipertrofia» busca cada ejercicio por el
   nombre EXACTO del catálogo CDG. Esta pantalla enseña, por ejercicio, el
   nombre propuesto y los 3 candidatos más parecidos, y deja al coach decidir:
   Confirmar, Cambiar (buscador sobre el catálogo) o Sin equivalente.

   NO escribe en Firestore. Las decisiones quedan en un borrador del navegador
   y se exportan a un JSON que aplica scripts/aplicarEmparejadoCdg.mjs
   (simulacro por defecto, --aplicar para escribir). Así la escritura de
   `cdgNombre` la hace un solo sitio, con simulacro previo.
   ═══════════════════════════════════════════════════════════════════════════ */

const BORRADOR_KEY = 'enforma_cdg_revisiones_v1';
const POR_PAGINA = 40;

type Filtro = 'revisar' | 'probables' | 'exactos' | 'decididos' | 'todos';

function leerBorrador (): RevisionesCdg {
  try {
    const raw = localStorage.getItem(BORRADOR_KEY);
    return raw ? (JSON.parse(raw) as RevisionesCdg) : {};
  } catch { return {}; }
}

interface Props {
  modos: SegmentedOption[];
  modo: string;
  onModo: (m: string) => void;
  onClose?: () => void;
}

/** Nombre CDG partido en lo que se ve grande y los músculos, en pequeño. */
function NombreCdg ({ nombre }: { nombre: string }) {
  const corto = sinMusculos(nombre);
  const musculos = nombre.slice(corto.length).replace(/^\s*-\s*/, '');
  return (
    <span className="block">
      <span className="font-sans text-body-s text-ink">{corto}</span>
      {musculos && <span className="block text-caption font-sans text-ink-3">{musculos}</span>}
    </span>
  );
}

export default function EmparejadoCdgScreen ({ modos, modo, onModo, onClose }: Props) {
  const { data: ejercicios = [], isPending } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => { await seedExercisesIfEmpty(); return getExercises(); }
  });

  // Mientras el catálogo no está en Firestore se puede cargar el JSON a mano
  // (solo en memoria, no se sube ni se guarda).
  const [jsonLocal, setJsonLocal] = useState<string | null>(null);
  const { catalogo, cargando, noSubido, error } = useMotorCdg(jsonLocal);
  const nombresCdg = useMemo(() => catalogo.map(c => c.exercise), [catalogo]);

  const [revisiones, setRevisiones] = useState<RevisionesCdg>(leerBorrador);
  useEffect(() => {
    try { localStorage.setItem(BORRADOR_KEY, JSON.stringify(revisiones)); } catch { /* sin almacenamiento: el borrador solo vive en memoria */ }
  }, [revisiones]);

  const filas = useMemo(
    () => (nombresCdg.length ? proponerEmparejados(ejercicios.filter(e => !e.descartado), nombresCdg) : []),
    [ejercicios, nombresCdg]
  );
  const yaGuardado = useMemo(() => new Map(ejercicios.map(e => [e.id, e])), [ejercicios]);

  // Decisión efectiva: borrador > ya escrito en Firestore > nada.
  const decisionDe = useCallback((id: string): string | null | undefined => {
    if (id in revisiones) return revisiones[id];
    const e = yaGuardado.get(id);
    if (e?.cdgNombre) return e.cdgNombre;
    if (e?.cdgSinEquivalente) return null;
    return undefined;
  }, [revisiones, yaGuardado]);

  const [filtro, setFiltro] = useState<Filtro>('revisar');
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [filtro]);

  const cuentas = useMemo(() => {
    const c = { revisar: 0, probables: 0, exactos: 0, decididos: 0, todos: filas.length };
    for (const f of filas) {
      if (decisionDe(f.id) !== undefined) c.decididos++;
      else if (f.estado === 'exacto') c.exactos++;
      else if (f.estado === 'probable' && f.propuesto) c.probables++;
      else c.revisar++;
    }
    return c;
  }, [filas, decisionDe]);

  const visibles = useMemo(() => filas.filter(f => {
    const d = decisionDe(f.id);
    if (filtro === 'todos') return true;
    if (filtro === 'decididos') return d !== undefined;
    if (d !== undefined) return false;
    if (filtro === 'exactos') return f.estado === 'exacto';
    if (filtro === 'probables') return f.estado === 'probable' && !!f.propuesto;
    return f.estado !== 'exacto' && !(f.estado === 'probable' && f.propuesto);
  }), [filas, filtro, decisionDe]);

  const decidir = useCallback((id: string, valor: string | null) => setRevisiones(r => ({ ...r, [id]: valor })), []);
  const deshacer = useCallback((id: string) => setRevisiones(r => { const c = { ...r }; delete c[id]; return c; }), []);

  const confirmarLote = (lista: FilaEmparejado[]) => setRevisiones(r => {
    const c = { ...r };
    for (const f of lista) if (f.propuesto && !(f.id in c)) c[f.id] = f.propuesto;
    return c;
  });

  const exportar = () => {
    const blob = new Blob([JSON.stringify(revisiones, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revisiones-cdg.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const cargarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setJsonLocal(await file.text());
  };

  if (isPending || cargando) return <ScreenSkeleton />;

  const nRevisiones = Object.keys(revisiones).length;
  const pct = filas.length ? Math.round((cuentas.decididos / filas.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 pb-28 md:pb-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption font-sans uppercase tracking-wide text-ink-3">
            Emparejado con el catálogo CDG
          </p>
          {onClose && (
            <Button variant="ghost" size="s" onClick={onClose} aria-label="Salir de la revisión">
              <Icon name="close" />
            </Button>
          )}
        </div>
        <SegmentedControl label="Modo de revisión" options={modos} value={modo} onChange={onModo} />
      </div>

      {error && <Banner tone="danger">No se pudo leer el catálogo CDG: {error.message}</Banner>}

      {nombresCdg.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon="inventory_2"
            title={noSubido ? 'El catálogo CDG aún no está en Firestore' : 'Sin catálogo CDG'}
            description="Se sube con scripts/subirCatalogoCdg.mjs --aplicar. Mientras tanto puedes cargar el archivo catalogo-cdg.json para revisar (solo en esta pantalla, no se guarda)."
          />
          <label className="block">
            <span className="text-caption font-sans uppercase tracking-wide text-ink-3">Cargar catalogo-cdg.json</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={e => { void cargarArchivo(e.target.files?.[0]); }}
              className="mt-1 block w-full font-sans text-body-s text-ink"
            />
          </label>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <ProgressBar value={pct} label={`Emparejado revisado, ${cuentas.decididos} de ${filas.length}`} />
            <p className="text-caption font-sans text-ink-3">
              {cuentas.decididos} decididos de {filas.length} · {nRevisiones} en el borrador de este navegador
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                ['revisar', `Por revisar · ${cuentas.revisar}`],
                ['probables', `Probables · ${cuentas.probables}`],
                ['exactos', `Exactos · ${cuentas.exactos}`],
                ['decididos', `Decididos · ${cuentas.decididos}`],
                ['todos', `Todos · ${cuentas.todos}`]
              ] as Array<[Filtro, string]>).map(([k, label]) => (
                <Chip key={k} selected={filtro === k} onClick={() => setFiltro(k)}>{label}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(filtro === 'probables' || filtro === 'exactos') && visibles.length > 0 && (
                <Button size="s" variant="secondary" onClick={() => confirmarLote(visibles)}>
                  Confirmar los {visibles.length} {filtro}
                </Button>
              )}
              <Button size="s" variant="primary" onClick={exportar} disabled={nRevisiones === 0}>
                <Icon name="download" size="s" />
                Exportar revisiones ({nRevisiones})
              </Button>
            </div>
            <p className="text-caption font-sans text-ink-3">
              Para escribirlo: exporta, y en la terminal{' '}
              <code>node scripts/aplicarEmparejadoCdg.mjs --revisiones ~/Downloads/revisiones-cdg.json</code>{' '}
              (simulacro; con <code>--aplicar</code> escribe).
            </p>
          </div>

          {visibles.length === 0 && (
            <EmptyState icon="task_alt" title="Nada en este filtro" description="Prueba con otro o con «Todos»." />
          )}

          <ul className="flex flex-col gap-3">
            {visibles.slice(0, pagina * POR_PAGINA).map(f => (
              <FilaRevision
                key={f.id}
                fila={f}
                decision={decisionDe(f.id)}
                enBorrador={f.id in revisiones}
                nombresCdg={nombresCdg}
                onDecidir={v => decidir(f.id, v)}
                onDeshacer={() => deshacer(f.id)}
              />
            ))}
          </ul>
          {visibles.length > pagina * POR_PAGINA && (
            <Button variant="secondary" onClick={() => setPagina(p => p + 1)}>
              Ver más ({visibles.length - pagina * POR_PAGINA} restantes)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function FilaRevision ({ fila, decision, enBorrador, nombresCdg, onDecidir, onDeshacer }: {
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta. */
  key?: React.Key
  fila: FilaEmparejado
  decision: string | null | undefined
  enBorrador: boolean
  nombresCdg: string[]
  onDecidir: (v: string | null) => void
  onDeshacer: () => void
}) {
  const [cambiando, setCambiando] = useState(false);
  const [consulta, setConsulta] = useState('');
  const resultados = useMemo(() => buscarEnCatalogo(nombresCdg, consulta), [nombresCdg, consulta]);
  const decidido = decision !== undefined;

  return (
    <li className="rounded-surface bg-surface px-4 py-3 space-y-3">
      <div>
        <p className="text-caption font-sans uppercase tracking-wide text-ink-3">
          {fila.estado === 'exacto' ? 'Exacto' : fila.estado === 'probable' ? 'Probable (por el id original)' : fila.estado === 'ambiguo' ? 'Ambiguo' : 'Sin pareja clara'}
          {decidido && (enBorrador ? ' · en el borrador' : ' · ya escrito')}
        </p>
        <p className="font-sans text-body text-ink">{fila.nombreApp}</p>
      </div>

      {decidido ? (
        <div className="space-y-2">
          {decision === null
            ? <p className="font-sans text-body-s text-ink-3">Sin equivalente en CDG</p>
            : <NombreCdg nombre={decision} />}
          {enBorrador && <Button size="s" variant="ghost" onClick={onDeshacer}>Deshacer</Button>}
          {!enBorrador && <Button size="s" variant="ghost" onClick={() => setCambiando(true)}>Cambiar</Button>}
        </div>
      ) : fila.propuesto ? (
        <div className="space-y-1">
          <p className="text-caption font-sans uppercase tracking-wide text-ink-3">Propuesto</p>
          <NombreCdg nombre={fila.propuesto} />
        </div>
      ) : null}

      {!decidido && fila.candidatos.length > 0 && !fila.propuesto && (
        <div className="space-y-2">
          <p className="text-caption font-sans uppercase tracking-wide text-ink-3">Candidatos</p>
          {fila.candidatos.map(c => (
            <button
              key={c.cdgNombre}
              type="button"
              onClick={() => onDecidir(c.cdgNombre)}
              className="block w-full text-left rounded-control bg-raised px-3 py-2 hover:bg-field transition-colors"
            >
              <NombreCdg nombre={c.cdgNombre} />
              <span className="text-caption font-sans text-ink-3">{Math.round(c.parecido * 100)} % parecido · pulsar para elegir</span>
            </button>
          ))}
        </div>
      )}

      {(cambiando || (!decidido && !fila.propuesto)) && (
        <div className="space-y-2">
          <SearchField label="Buscar en el catálogo CDG" value={consulta} onChange={setConsulta} placeholder="Buscar en el catálogo CDG…" />
          {resultados.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => { onDecidir(r); setCambiando(false); setConsulta(''); }}
              className="block w-full text-left rounded-control bg-raised px-3 py-2 hover:bg-field transition-colors"
            >
              <NombreCdg nombre={r} />
            </button>
          ))}
        </div>
      )}

      {!decidido && (
        <div className="flex flex-wrap gap-2">
          {fila.propuesto && <Button size="s" variant="primary" onClick={() => onDecidir(fila.propuesto)}>Confirmar</Button>}
          <Button size="s" variant="secondary" onClick={() => setCambiando(c => !c)}>Cambiar</Button>
          <Button size="s" variant="ghost" onClick={() => onDecidir(null)}>Sin equivalente</Button>
        </div>
      )}
    </li>
  );
}
