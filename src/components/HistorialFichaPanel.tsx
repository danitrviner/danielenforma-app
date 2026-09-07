import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DossierFactKind } from '../types';
import { getDossier } from '../db/dossier';
import { getAiProposalsForAthlete, getMesocycles, getDietsForAthlete } from '../dbService';
import { calcularDerivas } from '../utils/derivaPropuestas';
import { Card, Icon } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Historial de la ficha

   Antes había DOS listas de actividad en la misma pestaña, y nunca se veían
   juntas: «Qué se ha hecho» (los hechos del dossier: qué se propuso, qué
   aprobaste) al final del DossierPanel, y «Últimos cambios» (check-in, entreno,
   peso, reporte) plegada dentro de «Estado actual». Para responder «¿qué ha
   pasado con esta persona desde la última revisión?» había que leer las dos y
   ordenarlas mentalmente.

   Aquí van fusionadas en una sola línea de tiempo, con dos orígenes que se
   pueden filtrar:

     · PLAN   — lo que decidiste tú: propuestas, aprobaciones, y las derivas
                (lo que cambiaste a mano DESPUÉS de aprobar, que era su propia
                tarjeta suelta).
     · ATLETA — lo que hizo él: entrenó, se pesó, hizo check-in, recibió reporte.

   El origen «atleta» llega por props porque esos datos ya están cargados en el
   Hub (checkins, logs, pesos, reportes) y no tiene sentido volver a pedirlos.
   Es opcional: en el diálogo del asistente no hay Hub que los provea y el
   historial se queda solo con la parte de plan.

   Deliberadamente COMPACTO en el lado atleta (lo último de cada tipo, no todo):
   los pesos son diarios y ahogarían la cronología de decisiones, que es la que
   de verdad se relee al preparar una revisión.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un evento del lado atleta, tal y como lo arma el Hub. */
export interface ActividadAtleta {
  date: string;
  icon: string;
  text: string;
}

type Origen = 'plan' | 'atleta';

interface Entrada {
  fecha: string;
  icon: string;
  titulo: string;
  detalle?: string;
  origen: Origen;
}

const ETIQUETA_HECHO: Record<DossierFactKind, string> = {
  propuesta: 'Propuso', aprobacion: 'Aprobaste', cambio: 'Cambió', observacion: 'Anotó',
};

/* Solo iconos del subset de la fuente (src/assets/fonts/material-symbols-iconos.txt):
   uno que no esté ahí no se renderiza, sale el nombre en texto. */
const ICONO_HECHO: Record<DossierFactKind, string> = {
  propuesta: 'auto_awesome', aprobacion: 'check_circle', cambio: 'swap_horiz', observacion: 'sticky_note_2',
};

const FILTROS: { id: Origen | 'todo'; label: string }[] = [
  { id: 'todo',   label: 'Todo' },
  { id: 'plan',   label: 'Plan' },
  { id: 'atleta', label: 'Atleta' },
];

/** dd/mm/aaaa a partir de un ISO, sin arrastrar date-fns hasta aquí. */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Props = {
  athleteEmail: string;
  /** Lo que hizo el atleta. Lo arma el Hub, que ya tiene esos datos cargados. */
  actividad?: ActividadAtleta[];
  key?: React.Key;
};

export default function HistorialFichaPanel({ athleteEmail, actividad = [] }: Props) {
  const [filtro, setFiltro] = useState<Origen | 'todo'>('todo');
  const [verTodo, setVerTodo] = useState(false);

  const { data: ficha } = useQuery({
    queryKey: ['dossier', athleteEmail],
    queryFn: () => getDossier(athleteEmail),
    staleTime: 60_000,
  });

  const { data: derivas = [] } = useQuery({
    queryKey: ['dossierDerivas', athleteEmail],
    queryFn: async () => {
      const [propuestas, mesos, dietas] = await Promise.all([
        getAiProposalsForAthlete(athleteEmail), getMesocycles(athleteEmail), getDietsForAthlete(athleteEmail),
      ]);
      return calcularDerivas(propuestas, mesos, dietas);
    },
    staleTime: 60_000,
  });

  const entradas = useMemo<Entrada[]>(() => {
    const items: Entrada[] = [];

    for (const h of ficha?.hechos ?? []) {
      items.push({
        fecha: h.at,
        icon: ICONO_HECHO[h.kind] ?? 'chevron_right',
        titulo: `${ETIQUETA_HECHO[h.kind] ?? h.kind}: ${h.text}`,
        origen: 'plan',
      });
    }

    for (const d of derivas) {
      items.push({
        fecha: d.fecha,
        icon: 'edit',
        titulo: `Lo ajustaste después de aprobar — ${d.que}`,
        detalle: d.cambios.join(' · '),
        origen: 'plan',
      });
    }

    for (const a of actividad) {
      items.push({ fecha: a.date, icon: a.icon, titulo: a.text, origen: 'atleta' });
    }

    return items
      .filter(e => !isNaN(new Date(e.fecha).getTime()))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [ficha, derivas, actividad]);

  const visibles = entradas.filter(e => filtro === 'todo' || e.origen === filtro);
  const recortadas = verTodo ? visibles : visibles.slice(0, 12);

  return (
    <Card
      title="Historial"
      subtitle="Lo que se decidió y lo que hizo el atleta, en la misma línea de tiempo."
      action={(
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => { setFiltro(f.id); setVerTodo(false); }}
              aria-pressed={filtro === f.id}
              className={`px-3 py-1 rounded-control font-mono text-caption uppercase tracking-wide transition-colors ${
                filtro === f.id
                  ? 'bg-accent text-black font-bold'
                  : 'text-ink-2 border border-hairline hover:text-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    >
      {visibles.length === 0 ? (
        <p className="text-caption text-ink-3">
          {entradas.length === 0
            ? 'Todavía no hay nada. Se llena solo según vayas proponiendo cosas y el atleta vaya registrando las suyas.'
            : 'Nada con este filtro.'}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {recortadas.map((e, i) => (
              <li key={`${e.fecha}-${i}`} className="flex gap-3 items-start">
                <Icon
                  name={e.icon}
                  size="s"
                  className={`mt-0.5 shrink-0 ${e.origen === 'plan' ? 'text-accent' : 'text-ink-3'}`}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-label text-ink">{e.titulo}</span>
                  {e.detalle && <span className="text-caption font-mono text-ink-2">{e.detalle}</span>}
                </div>
                <span className="font-mono text-caption text-ink-4 shrink-0">{fechaCorta(e.fecha)}</span>
              </li>
            ))}
          </ul>

          {!verTodo && visibles.length > recortadas.length && (
            <button
              onClick={() => setVerTodo(true)}
              className="mt-3 font-mono text-caption uppercase tracking-wide text-ink-2 hover:text-accent transition-colors"
            >
              Ver los {visibles.length - recortadas.length} anteriores
            </button>
          )}
        </>
      )}
    </Card>
  );
}
