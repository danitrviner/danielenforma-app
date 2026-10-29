# Autopiloto · Tanda 2 — propuestas con «antes», aplicador puro y «Hecho hoy» (29-10-2026)

Rama `ia-autonoma` (PR #27). Segunda tanda del plan de `docs/diseno-ia-autonoma-2026-10-28.md` §10. Lo que el atleta ve no cambia. Lo que Dani nota: una sección «Hecho hoy» en Inicio con lo aplicado en 24 h y un botón **Deshacer** que funciona de verdad.

**Comprobaciones:** `tsc` 0 errores · `eslint` 0 errores en lo tocado · `vitest` 291 archivos, **3.323 tests** (+34) en verde.

## Qué cambia

### H4 · `AiProposal` v2 (`src/types.ts`)
Estados nuevos `aplicada` (la aplicó la máquina), `deshecha`, `caducada`; campos `episodioId`, `autor` (`asistente | latido | coach`), `politica` (`automatico | aviso | proponer | sombra`), **`snapshotAntes`** (`{ coleccion, id, datos | null, parcial? }[]`: cómo estaba cada documento antes de tocarlo; `null` = no existía), `aplicadaEn`, `avisoHasta`, `deshechaEn`, `resultado` (si se comprobó lo esperado), `paraAtleta`. Kind nuevo `latido` con su payload. Todo opcional: las 78 propuestas que ya existen siguen leyéndose igual.

### H3 · `aplicarPropuesta()` puro (`src/autopiloto/aplicarPropuesta.ts`)
Las 600 líneas de «qué escribir al aprobar» salen de `useProposalActions.ts` y pasan a una función sin React ni Firestore: `(propuesta, lector, { coachUid, ahora }) → { operaciones, snapshotAntes, resultEntityId | resultEntityRef }` o `{ ok: false, motivo }`. Las operaciones son de dominio (`crearDieta`, `actualizarRutina`, `guardarPrograma`, `crearAsignacion`…, 21 tipos), no de Firestore; los ids que aún no existen viajan como `$ref:nombre` y `resolverReferencias` los sustituye. Mismo comportamiento que el hook: ajuste de dieta sin comidas conserva las de Dani, sesiones por `dayIndex`, publicación que no duplica fechas, dietas del calendario por nombre, día señalado = hito + tarea + nota.
- `ejecutarEnCliente.ts`: traduce cada operación a la función de `dbService` de siempre (espejo local, sello de `workouts`, `cambiosAtleta`); si falla a mitad, el error dice cuántas se guardaron y que volver a aprobar no duplica.
- `lectorCliente.ts`: las lecturas del hook detrás de la interfaz `LectorAplicacion`, que el servidor implementará con el SDK de administración en la tanda 3.
- `useProposalActions.ts` queda en lo que es de React y, al aprobar, guarda `snapshotAntes`, `aplicadaEn`, `autor` y `politica` en la propuesta.
- Test `aplicarPropuesta.test.ts`: 16 casos con un lector falso (dieta nueva/ajuste/base borrada, periodización con referencias, sesiones, publicación idempotente y sin sesiones, setupConfig con nombres sin resolver, road map, día señalado, semana, bloque con revisiones, reto, feedback, latido).

### Deshacer (`src/autopiloto/deshacer.ts`, `src/db/restauracion.ts`)
`planDeDeshacer(p)` devuelve las fotos en orden inverso (lo último creado se borra primero) y un resumen («2 documentos vuelven a como estaba · 3 creados se borran»); `restaurarTodo` escribe con `setDoc`/`updateDoc`(parcial)/`deleteDoc` y marca cambiados los catálogos con sello (`workouts`, `exercises`, `mesocycleTemplates`). La propuesta pasa a `deshecha` y la ficha viva apunta «Dani deshizo: …». Las propuestas anteriores al 28-10 no tienen snapshot: el botón lo dice y no hace nada.

### H5 · «Hecho hoy» (`src/components/HechoHoy.tsx`, en `HomeCoachScreen`)
Lo aplicado o deshecho en las últimas 24 h (`getAiProposalsRecientes`, `db/ai.ts`): atleta, hora, quién (`latido` / `asistente` / `tú`) y con qué política, el resumen, los cambios y **Deshacer** con confirmación. Se pliega. Aparece también cuando la bandeja está «Todo al día».

### El latido deja huella (`utils/latidoDiario.ts`, `api/latido-diario.ts`, `api/_lib/db-admin.ts`)
`huellaDelLatido(foto, acciones, resumen, hoy, ahora)` construye una propuesta `kind: 'latido'`, `status: 'aplicada'`, `autor: 'latido'` con el snapshot de cada documento que va a tocar (estado de la asignación, `activeDietIds`, `lastSeenPhaseId`, `level`), una por atleta y día (`latido_{email}_{fecha}`, `set`: idempotente; una segunda pasada conserva el «antes» de la primera). Se escribe **antes** de las acciones, para que un fallo a mitad no deje cambios sin su antes. Los avisos (notificaciones) y el reto no entran todavía. Tests: `latidoDiario.test.ts` (+2), `latido-diario.integracion.test.ts` (comprueba la escritura en `aiProposals`).

## Qué NO cambia
- Ninguna regla de Firestore: `aiProposals` ya era solo-coach y el latido escribe con Admin SDK.
- El atleta no ve nada nuevo.
- `cambiosAtleta` sigue registrando solo lo que escribe el coach desde el cliente; lo del latido se ve en «Hecho hoy», no ahí (tanda 3 unifica).

## Pendiente que depende de Dani
- Nada para esta tanda. El primer «Hecho hoy» real aparecerá la noche siguiente al despliegue, con lo que haga el latido.
