// Registro del catálogo de máquinas publicado.
//
// Cada marca es un JSON generado por su importador (scripts/machines/) y
// commiteado al repo: entra en el bundle, se sirve por el CDN y cuesta CERO
// lecturas de Firestore. Con cientos de máquinas idénticas para todos los
// atletas, leerlas de Firestore en cada alta serían cientos de lecturas por
// atleta — y este proyecto ya ha tenido sustos de cuota.
//
// Lo que el admin cambia (ocultar, renombrar, cambiar imagen) y las máquinas
// creadas a mano SÍ viven en Firestore, como overrides; el catálogo efectivo es
// el merge de ambos. Ver src/db/machines.ts.
//
// AÑADIR UNA MARCA NUEVA (Panatta, Matrix, Prime, Atlantis, Nautilus, Cybex...):
//   1. scripts/machines/importers/<marca>.ts  — implementa el contrato Importador
//   2. npx tsx scripts/machines/run-import.ts <marca>
//   3. importa el JSON aquí y añádelo a SEMILLA_MAQUINAS
//   4. sube CATALOGO_VERSION
// El núcleo no se toca en ningún paso.

import type { Maquina } from '../../types';
import hammerStrength from './hammerStrength.json';
import technogym from './technogym.json';

// Se sube a mano cada vez que cambia el contenido de la semilla. Un atleta que
// ya completó el catálogo con una versión anterior vuelve a tener máquinas
// pendientes (solo las nuevas) en vez de quedarse en `completado` para siempre.
export const CATALOGO_VERSION = '2026-08-07.1';

// 41 Hammer Strength (Plate Loaded) + 22 Technogym (Pure Strength).
// Todas llegan con `publicadoEn: null`: no las ve ningún atleta hasta que un
// admin las revisa y publica desde Perfil › Ajustes › Máquinas.
export const SEMILLA_MAQUINAS: Maquina[] = [
  ...(hammerStrength as Maquina[]),
  ...(technogym as Maquina[]),
];
