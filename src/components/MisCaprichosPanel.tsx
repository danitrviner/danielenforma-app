import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCatalogoAlimentos, updateOnboardingCaprichos } from '../dbService';
import { nombreDeAlimento, type AlimentoCatalogo } from '../utils/catalogoAlimentos';
import {
  MAX_LARGO_NOTA, buscarCaprichos, caprichosPorGrupo, conCapricho, nuevoCapricho, sinCapricho, textoDeRacion,
  type CaprichoDelAtleta,
} from '../utils/caprichos';
import { hoyIsoLocal } from '../utils/trainingWeek';
import { Button, Icon, Input, SearchField } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Mis caprichos (11-2026, Dani)

   El atleta apunta lo que le gustaría meter en su plan, a su manera: de la
   lista (con sus kcal, el coach lo mete de un toque) o escrito tal cual, con
   una nota de cuándo le apetece. El coach lo ve arriba del todo al poner el
   «extra fijo» de una comida (IngestasDelMenu) y en la ficha del atleta.

   Cada cambio se guarda al momento: no hay botón «Guardar» que olvidar.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteEmail: string;
  caprichos: CaprichoDelAtleta[];
  onSaved: (caprichos: CaprichoDelAtleta[]) => void;
  /** Lo ve el coach en la ficha: mismos datos, textos en tercera persona. */
  vista?: 'atleta' | 'coach';
}

type Paso = { tipo: 'lista' } | { tipo: 'buscar' } | { tipo: 'nota'; nombre: string; alimento?: AlimentoCatalogo };

export default function MisCaprichosPanel({ athleteEmail, caprichos, onSaved, vista = 'atleta' }: Props) {
  const [paso, setPaso] = useState<Paso>({ tipo: 'lista' });
  const [q, setQ] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esCoach = vista === 'coach';

  const guardar = async (siguiente: CaprichoDelAtleta[]) => {
    setGuardando(true);
    setError(null);
    try {
      await updateOnboardingCaprichos(athleteEmail, siguiente);
      onSaved(siguiente);
      return true;
    } catch {
      setError('No se ha podido guardar. Revisa la conexión y vuelve a probar.');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const elegir = (nombre: string, alimento?: AlimentoCatalogo) => {
    setNota('');
    setPaso({ tipo: 'nota', nombre, ...(alimento ? { alimento } : {}) });
  };

  const confirmar = async () => {
    if (paso.tipo !== 'nota') return;
    const nuevo = nuevoCapricho({ nombre: paso.nombre, nota, alimento: paso.alimento }, hoyIsoLocal());
    if (!nuevo) return;
    if (await guardar(conCapricho(caprichos, nuevo))) {
      setPaso({ tipo: 'lista' });
      setQ('');
    }
  };

  if (paso.tipo === 'buscar') {
    return <Buscador q={q} onQ={setQ} onElegir={elegir} onVolver={() => setPaso({ tipo: 'lista' })} />;
  }

  if (paso.tipo === 'nota') {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setPaso({ tipo: 'buscar' })}
          className="flex items-center gap-1 font-sans text-caption font-bold text-ink-2 hover:text-ink">
          <Icon name="arrow_back" size="s" />Volver
        </button>
        <div className="flex items-start gap-2 rounded-surface border border-hairline bg-bg p-3">
          <Icon name="cookie" size="m" className="mt-0.5 flex-shrink-0 text-accent-ink" />
          <div className="min-w-0">
            <p className="font-sans text-label font-bold text-ink">{paso.nombre}</p>
            <p className="font-mono text-caption text-ink-3">
              {paso.alimento ? textoDeRacion(paso.alimento) : 'Escrito a tu manera: tu entrenador le pondrá las kcal.'}
            </p>
          </div>
        </div>
        <Input name="capricho-nota" label={esCoach ? 'Cuándo o cómo le gusta (opcional)' : '¿Cuándo o cómo te gusta? (opcional)'}
          placeholder="El viernes con la peli, después de cenar…" value={nota} onChange={v => setNota(v.slice(0, MAX_LARGO_NOTA))} />
        {error && <p className="font-sans text-caption text-danger">{error}</p>}
        <Button variant="primary" fullWidth onClick={confirmar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Apuntar capricho'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-sans text-caption text-ink-3">
        {esCoach
          ? 'Lo que el atleta quiere meter en su plan. Te sale arriba del todo al poner el extra fijo de una comida.'
          : 'Lo que te gustaría tener en tu plan: un dulce, un helado, unas patatas… Tu entrenador lo ve y lo encaja en tu menú.'}
      </p>
      {caprichos.length > 0 && (
        <ul className="space-y-1.5">
          {caprichos.map(c => (
            <li key={c.id} className="flex items-start gap-2 rounded-control border border-hairline bg-bg px-3 py-2">
              <Icon name="cookie" size="s" className="mt-0.5 flex-shrink-0 text-accent-ink" />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-label font-bold leading-tight text-ink">{c.nombre}</p>
                <p className="font-mono text-caption text-ink-3">{c.alimento ? textoDeRacion(c.alimento) : esCoach ? 'Sin kcal: escrito a su manera' : 'Escrito a tu manera: tu entrenador le pone las kcal'}</p>
                {c.nota && <p className="font-sans text-caption text-ink-2">«{c.nota}»</p>}
              </div>
              <button type="button" aria-label={`Quitar ${c.nombre}`} disabled={guardando}
                onClick={() => { void guardar(sinCapricho(caprichos, c.id)); }}
                className="zona-tactil flex-shrink-0 text-ink-3 hover:text-ink disabled:opacity-40"><Icon name="close" size="s" /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="font-sans text-caption text-danger">{error}</p>}
      <button type="button" onClick={() => setPaso({ tipo: 'buscar' })}
        className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-strong px-3 py-2.5 font-sans text-caption font-bold text-ink-2 hover:text-ink">
        <Icon name="add" size="s" />{caprichos.length > 0 ? 'Añadir otro capricho' : 'Añadir un capricho'}
      </button>
    </div>
  );
}

function Buscador({ q, onQ, onElegir, onVolver }: {
  q: string; onQ: (q: string) => void;
  onElegir: (nombre: string, alimento?: AlimentoCatalogo) => void;
  onVolver: () => void;
}) {
  const { data: catalogo = [] } = useQuery({ queryKey: ['catalogoAlimentos'], queryFn: getCatalogoAlimentos, staleTime: 60 * 60_000 });
  const buscando = q.trim() !== '';
  const resultados = useMemo(() => (buscando ? buscarCaprichos(q, catalogo) : []), [buscando, q, catalogo]);
  const grupos = useMemo(() => caprichosPorGrupo(), []);

  const fila = (a: AlimentoCatalogo) => (
    <li key={a.id}>
      <button type="button" onClick={() => onElegir(nombreDeAlimento(a), a)}
        className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-label leading-tight text-ink">{nombreDeAlimento(a)}</p>
          <p className="font-mono text-caption text-ink-3">{textoDeRacion(a)}</p>
        </div>
        <Icon name="add" size="m" className="text-ink-3" />
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <button type="button" onClick={onVolver} className="flex items-center gap-1 font-sans text-caption font-bold text-ink-2 hover:text-ink">
        <Icon name="arrow_back" size="s" />Volver
      </button>
      <SearchField label="Buscar capricho" placeholder="Helado, chocolate, patatas…" value={q} onChange={onQ} onCancel={() => onQ('')} />
      {buscando && (
        <button type="button" onClick={() => onElegir(q)}
          className="flex w-full items-center gap-2 rounded-control border border-dashed border-strong px-3 py-2.5 text-left font-sans text-caption text-ink-2 hover:text-ink">
          <Icon name="edit_note" size="m" className="flex-shrink-0 text-accent-ink" />
          <span className="min-w-0">Apuntar <b className="text-ink">«{q.trim()}»</b> tal cual, a tu manera</span>
        </button>
      )}
      {buscando ? (
        resultados.length === 0
          ? <p className="py-4 text-center font-sans text-caption text-ink-3">No está en la lista. Apúntalo tal cual y tu entrenador le pone las kcal.</p>
          : <ul className="space-y-0.5">{resultados.map(fila)}</ul>
      ) : (
        grupos.map(g => (
          <div key={g.id} className="space-y-1">
            <p className="font-sans text-caption uppercase text-ink-3">{g.titulo}</p>
            <ul className="space-y-0.5">{g.caprichos.map(fila)}</ul>
          </div>
        ))
      )}
    </div>
  );
}
