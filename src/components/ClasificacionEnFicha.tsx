import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MUSCLE_LABELS, MUSCLE_ORDER, type Exercise, type MuscleGroup } from '../types';
import { corregirClasificacion } from '../dbService';
import { diferenciasDeClasificacion, secundariosLimpios } from '../utils/clasificacionEjercicio';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { useToast } from '../hooks/useToast';
import { Select, Chip, Button } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Clasificación muscular dentro de la ficha (E-04, 12-b)

   Antes era una hoja aparte que se abría desde la ficha. Cambia el ejercicio
   del CATÁLOGO (principal y secundarios) y deja un registro. Las prescripciones
   ya guardadas conservan su grupo principal; el cambio vale para las nuevas y,
   en los secundarios, para el volumen de todas. Sin cifras de atletas
   afectados: contarlos obligaría a barrer colecciones.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  ejercicio: Exercise;
  coachId: string;
  /** El ejercicio ya guardado, para que la ficha enseñe la clasificación nueva. */
  onGuardado: (nuevo: Exercise) => void;
}

export default function ClasificacionEnFicha({ ejercicio, coachId, onGuardado }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [principal, setPrincipal] = useState<MuscleGroup | undefined>(ejercicio.muscleGroup);
  const [secundarios, setSecundarios] = useState<MuscleGroup[]>(ejercicio.secondaryMuscleGroups ?? []);
  const [anadiendo, setAnadiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const limpios = secundariosLimpios(principal, secundarios);
  const diferencias = useMemo(
    () => diferenciasDeClasificacion(
      { muscleGroup: ejercicio.muscleGroup, secondaryMuscleGroups: ejercicio.secondaryMuscleGroups },
      { muscleGroup: principal, secondaryMuscleGroups: secundarios },
    ),
    [ejercicio, principal, secundarios],
  );

  const cancelar = () => {
    setPrincipal(ejercicio.muscleGroup);
    setSecundarios(ejercicio.secondaryMuscleGroups ?? []);
    setAnadiendo(false);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const { ejercicio: nuevo, registrado } = await corregirClasificacion(
        ejercicio, { muscleGroup: principal, secondaryMuscleGroups: secundarios }, coachId,
      );
      queryClient.setQueryData<Exercise[]>(['exercises'], prev => prev?.map(e => (e.id === nuevo.id ? nuevo : e)));
      showToast(registrado ? 'Clasificación guardada.' : 'Clasificación guardada, pero no se pudo anotar en el registro de cambios.');
      setAnadiendo(false);
      onGuardado(nuevo);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'guardar la clasificación'));
    } finally {
      setGuardando(false);
    }
  };

  const cambiaPrincipal = principal !== ejercicio.muscleGroup;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {cambiaPrincipal && ejercicio.muscleGroup && (
          <span className="mb-3 flex items-center gap-2 font-sans text-body-s">
            <span className="rounded-chip border border-hairline px-2.5 py-1 text-danger line-through">{MUSCLE_LABELS[ejercicio.muscleGroup]}</span>
            <span aria-hidden className="text-ink-3">→</span>
          </span>
        )}
        <Select
          label="Grupo principal"
          value={principal ?? ''}
          onChange={v => setPrincipal((v as MuscleGroup) || undefined)}
          placeholder="— Sin asignar —"
          options={MUSCLE_ORDER.map(g => ({ value: g, label: MUSCLE_LABELS[g] }))}
          className="min-w-[12rem] flex-1"
        />
      </div>

      <div>
        <p className="font-sans text-label text-ink-2 mb-2">Secundarios <span className="text-ink-3">(cuentan media serie)</span></p>
        <div className="flex flex-wrap gap-2">
          {limpios.map(g => (
            <Chip key={g} selected onRemove={() => setSecundarios(prev => prev.filter(x => x !== g))}>{MUSCLE_LABELS[g]}</Chip>
          ))}
          {limpios.length === 0 && !anadiendo && <span className="self-center font-sans text-body-s text-ink-3">Ninguno</span>}
          <Chip icon={anadiendo ? 'expand_less' : 'add'} onClick={() => setAnadiendo(v => !v)}>{anadiendo ? 'Listo' : 'Añadir'}</Chip>
        </div>
        {anadiendo && (
          <div className="mt-2 flex flex-wrap gap-2 rounded-control bg-bg p-2" role="group" aria-label="Añadir grupo secundario">
            {MUSCLE_ORDER.filter(g => g !== principal && !limpios.includes(g)).map(g => (
              <Chip key={g} onClick={() => setSecundarios(prev => [...prev, g])}>{MUSCLE_LABELS[g]}</Chip>
            ))}
          </div>
        )}
      </div>

      {diferencias.cambia && (
        <div className="rounded-control bg-warning/10 px-3 py-2.5 space-y-1.5">
          <p className="font-sans text-label font-bold text-warning">Qué cambia</p>
          <ul className="font-sans text-body-s text-ink space-y-0.5">
            {diferencias.lineas.map(l => <li key={l}>{l}</li>)}
          </ul>
          <p className="font-sans text-body-s text-ink-2">
            Cambia el catálogo. Las rutinas ya guardadas conservan su grupo principal; el cambio vale para las nuevas.
            Los secundarios sí se aplican al volumen de todas. Queda en el registro de cambios.
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={cancelar} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={!principal || guardando}>{guardando ? 'Guardando…' : 'Guardar cambio'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
