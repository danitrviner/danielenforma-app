import React, { useState } from 'react';
import type { Exercise } from '../types';
import FichaEjercicioSheet from './FichaEjercicioSheet';

/** Ficha del ejercicio (E-05) con la clasificación muscular dentro (E-04, 12-b).
 *  Quien lo usa pinta `hojas` una vez y llama a `abrirFicha(ejercicio)` desde
 *  cualquier botón; en escritorio otra «Ficha» cambia el panel sin cerrarlo.
 *  Sin `coachId` la ficha no deja clasificar. */
export function useFichaDeEjercicio(coachId?: string) {
  const [ficha, setFicha] = useState<Exercise | null>(null);
  const hojas = ficha && (
    <FichaEjercicioSheet
      key={ficha.id}
      ejercicio={ficha}
      onClose={() => setFicha(null)}
      coachId={coachId}
      onGuardado={setFicha}
    />
  );
  return { abrirFicha: setFicha, hojas };
}
