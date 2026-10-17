# src/utils/cdg — motor de la plantilla "Índice de hipertrofia" (CulturaDeGym)

Réplica exacta (validada contra el motor original y hojas reales) de:

| Archivo | Qué hace |
|---|---|
| `motor.ts` | IF, IEM (33 músculos) y estrés articular (11 zonas) por serie, fila de Programación, filtros, tiempo de sesión |
| `seguimiento.ts` | Semana X, filas de Gestión, carga aguda/crónica, RM estimado, tonelaje, rendimiento del ciclo, incrementos de antropometría |
| `adaptadores.ts` | Convierte `WorkoutExercise` / `WorkoutLog` de la app a la entrada del motor |
| `cdg.test.ts` | Valores sacados de la hoja real. `npx vitest run src/utils/cdg` |

## Nombres
En la hoja "IEA" es estrés **articular**. En la app ya existe un "IEA" que es
Índice de Estímulo **Acumulado** (`utils/accumulatedStimulusIndex.ts`). Aquí se
llama `estresArticular` para no mezclarlos.

## Catálogo
`catalogo-cdg.json` (1.034 ejercicios) NO va en el repo ni en el bundle:
se sube a Firestore/Storage con acceso solo del coach y se carga con
`crearMotor(expandirCatalogo(json))`. `__fixtures__/catalogoPrueba.json` son
41 ejercicios para los tests.

## Vínculo ejercicio de la app ↔ ejercicio CDG
El motor busca por nombre EXACTO del catálogo CDG. Cada `Exercise` de la app
necesita `cdgNombre` (campo nuevo). Sin él, el ejercicio cuenta 0.

## Rarezas del original replicadas a propósito
Buscar «RAREZA DEL ORIGINAL» en el código: músculos "Mediano" = 0 en el IF,
RIR 5 no existe, series sin kg se saltan en Semana X, filtro [Compuesto] = media
(las columnas fijas de Programación son suma), "unilateral" se detecta por el nombre.
