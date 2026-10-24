import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MUSCLE_LABELS, MUSCLE_ORDER, type Exercise, type MuscleGroup } from '../types';
import { corregirClasificacion } from '../dbService';
import { diferenciasDeClasificacion, secundariosLimpios } from '../utils/clasificacionEjercicio';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { useToast } from '../hooks/useToast';
import { Sheet, Select, Chip, Button } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Clasificación muscular de un ejercicio (E-04)

   Se abre desde el Draft y la biblioteca. Cambia el ejercicio del CATÁLOGO
   (principal y secundarios) y deja un registro. Las prescripciones ya guardadas
   conservan su grupo principal; el cambio vale para las nuevas y, en los
   secundarios, para el volumen de todas.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  ejercicio: Exercise | null;
  coachId: string;
  onClose: () => void;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
}

export default function ClasificacionSheet({ ejercicio, coachId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [principal, setPrincipal] = useState<MuscleGroup | undefined>(ejercicio?.muscleGroup);
  const [secundarios, setSecundarios] = useState<MuscleGroup[]>(ejercicio?.secondaryMuscleGroups ?? []);
  const [guardando, setGuardando] = useState(false);

  const diferencias = useMemo(
    () => (ejercicio
      ? diferenciasDeClasificacion(
        { muscleGroup: ejercicio.muscleGroup, secondaryMuscleGroups: ejercicio.secondaryMuscleGroups },
        { muscleGroup: principal, secondaryMuscleGroups: secundarios },
      )
      : { cambia: false, lineas: [] as string[] }),
    [ejercicio, principal, secundarios],
  );

  if (!ejercicio) return null;

  const alternar = (g: MuscleGroup) =>
    setSecundarios(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]));

  const guardar = async () => {
    setGuardando(true);
    try {
      const { ejercicio: nuevo, registrado } = await corregirClasificacion(
        ejercicio, { muscleGroup: principal, secondaryMuscleGroups: secundarios }, coachId,
      );
      queryClient.setQueryData<Exercise[]>(['exercises'], prev => prev?.map(e => (e.id === nuevo.id ? nuevo : e)));
      showToast(registrado ? 'Clasificación guardada.' : 'Clasificación guardada, pero no se pudo anotar en el registro de cambios.');
      onClose();
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'guardar la clasificación'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Clasificación muscular"
      footer={(
        <Button onClick={guardar} fullWidth size="l" disabled={!diferencias.cambia || !principal || guardando}>
          {diferencias.cambia ? 'Guardar cambio' : 'Sin cambios'}
        </Button>
      )}
    >
      <div className="space-y-4">
        <p className="font-sans text-body font-bold text-ink">{ejercicio.name}</p>

        <Select
          label="Grupo principal"
          hint="El que cuenta como serie completa en el volumen."
          value={principal ?? ''}
          onChange={v => setPrincipal((v as MuscleGroup) || undefined)}
          placeholder="— Sin asignar —"
          options={MUSCLE_ORDER.map(g => ({ value: g, label: MUSCLE_LABELS[g] }))}
        />

        <div>
          <p className="font-sans text-label text-ink-2 mb-2">Grupos secundarios <span className="text-ink-3">(cuentan media serie)</span></p>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_ORDER.filter(g => g !== principal).map(g => (
              <Chip key={g} selected={secundariosLimpios(principal, secundarios).includes(g)} onClick={() => alternar(g)}>
                {MUSCLE_LABELS[g]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-control bg-raised px-3 py-2.5 space-y-1">
          <p className="font-sans text-label font-bold text-ink">Qué cambia</p>
          {diferencias.cambia ? (
            <ul className="font-sans text-body-s text-ink-2 space-y-0.5">
              {diferencias.lineas.map(l => <li key={l}>{l}</li>)}
            </ul>
          ) : (
            <p className="font-sans text-body-s text-ink-3">Todavía nada.</p>
          )}
          <p className="font-sans text-body-s text-ink-3 pt-1">
            Las rutinas ya guardadas conservan su grupo principal; el cambio vale para las nuevas.
            Los secundarios sí se aplican al volumen de todas.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
