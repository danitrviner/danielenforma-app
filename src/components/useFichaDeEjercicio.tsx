import React, { useState } from 'react';
import type { Exercise } from '../types';
import FichaEjercicioSheet from './FichaEjercicioSheet';
import ClasificacionSheet from './ClasificacionSheet';

/** Ficha del ejercicio (E-05) y, desde ella, la clasificación muscular (E-04).
 *  Quien lo usa pinta `hojas` una vez y llama a `abrirFicha(ejercicio)` desde
 *  cualquier botón. Sin `coachId` la ficha no ofrece clasificar. */
export function useFichaDeEjercicio(coachId?: string) {
  const [ficha, setFicha] = useState<Exercise | null>(null);
  const [clasificando, setClasificando] = useState<Exercise | null>(null);
  const hojas = (
    <>
      {ficha && (
        <FichaEjercicioSheet
          key={ficha.id}
          ejercicio={ficha}
          onClose={() => setFicha(null)}
          onClasificar={coachId ? () => { setClasificando(ficha); setFicha(null); } : undefined}
        />
      )}
      {coachId && clasificando && (
        <ClasificacionSheet key={clasificando.id} ejercicio={clasificando} coachId={coachId} onClose={() => setClasificando(null)} />
      )}
    </>
  );
  return { abrirFicha: setFicha, hojas };
}
