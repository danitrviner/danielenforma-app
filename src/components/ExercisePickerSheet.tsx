import React, { useState } from 'react';
import { Exercise, MuscleGroup, MUSCLE_ORDER, MUSCLE_LABELS } from '../types';
import { Sheet, Icon, EmptyState, Chip } from './ui';

/* T11.a (18-08). Antes solo se podía "cambiar" un ejercicio desde la vista
   previa del generador (un <select> con la biblioteca entera, sin filtro).
   En "Ejercicios programados" —la pestaña que sirve para tocar un mesociclo
   YA asignado— solo se podía editar la configuración (series/reps/RIR), no
   el ejercicio en sí: ese es el hueco real que describía Dani.

   Un solo componente para las dos pantallas: buscador + filtro por grupo
   muscular, preseleccionado al grupo del ejercicio que se está cambiando, y
   el mismo aviso "sin material" que ya calcula el generador (aquí
   reimplementado como función pura porque el original vive cerrado dentro
   del closure del generador en MesocycleManager). */

function esCompatible(ex: Exercise, athleteEquipment: string[]): boolean {
  const eq = ex.equipment ?? [];
  if (eq.length === 0) return true;       // sin etiquetar = siempre disponible
  if (athleteEquipment.length === 0) return true; // sin datos de equipamiento = no filtra
  const equipoAtleta = athleteEquipment.map(e => e.toLowerCase());
  return eq.some(e => equipoAtleta.includes(e.toLowerCase()));
}

interface Props {
  open: boolean;
  onClose: () => void;
  exercises: Exercise[];
  athleteEquipment?: string[];
  /** Grupo muscular preseleccionado — normalmente el del ejercicio que se está cambiando. */
  initialGroup?: MuscleGroup;
  onSelect: (exercise: Exercise) => void;
  title?: string;
}

export default function ExercisePickerSheet({
  open, onClose, exercises, athleteEquipment = [], initialGroup, onSelect, title = 'Elegir ejercicio',
}: Props) {
  const [group, setGroup] = useState<MuscleGroup | 'all'>(initialGroup ?? 'all');
  const [search, setSearch] = useState('');

  if (!open) return null;

  const term = search.trim().toLowerCase();
  const filtered = exercises.filter(ex => {
    if (!term && group !== 'all' && ex.muscleGroup !== group) return false;
    if (term && !ex.name.toLowerCase().includes(term)) return false;
    return true;
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      alto="completo"
      toolbar={(
        <>
          <div className={`px-3 py-2 bg-surface border-b border-hairline flex gap-2 flex-wrap transition-opacity ${term ? 'opacity-40' : ''}`}>
            <Chip selected={group === 'all' && !term} onClick={() => setGroup('all')}>
              Todos
            </Chip>
            {MUSCLE_ORDER.map(g => (
              <Chip key={g} selected={group === g && !term} onClick={() => setGroup(g)}>
                {MUSCLE_LABELS[g]}
              </Chip>
            ))}
          </div>
          <div className="px-4 py-2 bg-surface flex items-center gap-2 border-b border-hairline">
            <Icon name="search" size="s" className="text-ink-2" />
            <input
              type="text"
              placeholder="Buscar ejercicio en todos los grupos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent border-none text-white text-title-s focus:ring-0 focus:outline-none p-2 placeholder-ink-2/45"
            />
          </div>
        </>
      )}
    >
      <div className="pt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState icon="search_off" title="Ningún ejercicio coincide." />
        ) : filtered.map(ex => {
          const mismatch = !esCompatible(ex, athleteEquipment);
          return (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              className="w-full flex items-center justify-between gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
            >
              <div className="min-w-0">
                <p className="font-sans text-label text-white group-hover:text-accent transition-colors leading-snug truncate">{ex.name}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {ex.muscleGroup && <span className="font-mono text-caption text-ink-2">{MUSCLE_LABELS[ex.muscleGroup]}</span>}
                  {mismatch && (
                    <span className="inline-flex items-center gap-1 text-caption font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 rounded-control">
                      <Icon name="warning" size="s" />
                      sin material
                    </span>
                  )}
                </div>
              </div>
              <Icon name="chevron_right" size="m" className="text-ink-2 group-hover:text-accent transition-colors select-none flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
