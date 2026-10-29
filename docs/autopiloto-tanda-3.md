# Autopiloto · Tanda 3 — el bucle en servidor, en sombra (29-10-2026)

Rama `ia-autonoma` (PR #27). Tercera tanda del plan (`docs/diseno-ia-autonoma-2026-10-28.md` §10). A partir de aquí el asistente puede trabajar **sin la app abierta**: el latido encola episodios y `api/autopiloto.ts` los consume con las mismas tools que usa el chat. Todo en **modo sombra**: decide y escribe propuestas con `status: 'sombra'`, que no aparecen en la bandeja ni llegan al atleta. Nada se despliega con esta tanda (cron nuevo y reglas quedan para cuando Dani lo diga).

**Comprobaciones:** `tsc` 0 errores · `eslint` 0 errores en lo tocado · `vitest` 294 archivos, **3.343 tests** (+20) en verde · `api/importsConExtension.test.ts` recorre ahora también el grafo del autopiloto.

## Qué cambia

### Las tools cargan en Node (H6)
- **644 imports relativos** de `src/utils`, `src/ai`, `src/data`, `src/legal`, `src/autopiloto`, `src/types.ts` y la semilla llevan `.js` (codemod; Vite y vitest lo resuelven igual). Los cuatro imports de componentes desde utils son `import type`. El test de extensiones ya no exige extensión a los `import type` (se borran al compilar).
- **`src/ai/tools/datos.ts`**: la fuente de datos de las tools es una interfaz (`FuenteDeDatos`, 44 funciones + `coachActual()`) con un registro. Lectores, propuestas y despachador importan de ahí, no de `dbService`. La app registra `fuenteCliente` (`tools/fuenteCliente.ts`) al importar la puerta `src/ai/tools.ts`; el servidor registra `fuenteAdmin(db, uid)`. `src/ai/tools.server.ts` es la puerta sin Firebase de cliente. Comprobado: `despachador.ts` y `lectores.ts` cargan en Node sin el SDK del navegador.
- `renderDossier`, `DOSSIER_VACIO` y `normalizarFicha` pasan a `src/utils/fichaViva.ts` (puro); `db/dossier.ts` los reexporta. `conMarcaDeCacheAlFinal` y `CACHE_1H` a `src/ai/cache.ts`. La tabla de precios y la whitelist a `src/ai/costes.ts`, compartida por `api/ai-chat.ts` y el autopiloto.

### `api/_lib/fuenteAdmin.ts`
`FuenteDeDatos` con el SDK de administración: las 44 lecturas/escrituras calcadas consulta a consulta de `dbService` (colección, filtro, orden, valor por defecto, `Timestamp → Date` en check-ins, 26 semanas de respuestas, `fijarAlViernes`, grupos normalizados…). `createAiProposal` añade el **contexto del episodio** (`episodioId`, `autor`, `politica`) y en sombra guarda `status: 'sombra'`. Además `uidDelCoach`, `leerDoctrina` (la guardada en `coachSettings`, o el default) y `leerInstruccionesFijas`.

### Episodios y detectores (`src/autopiloto/`)
- `episodios.ts`: el tipo `Episodio` (`episodios/{id}`, id determinista `{tipo}_{clave}`), 13 tipos con **prioridad** y **tope de gasto** por tipo, `nuevoEpisodio`, `promptDeEpisodio` (el guion del episodio, como las tareas de `tareas.ts`) y `extraerParaDani` (la línea «PARA DANI:» con la que cierra). Guion escrito: **cuestionario_recibido**: brief `revision` + `get_revision_engine` semana; con alertas del motor → nota `Revisar ya:` y cierre (es de Dani); sin alertas → `propose_respuesta_revision`, en segunda persona, firmado por Dani, solo con lo `paraCliente` y lo que el atleta contó; nunca toca kcal, sesiones ni reparto.
- `detectores.ts`: `detectarCuestionariosRecibidos` (respuestas de los últimos 3 días → episodio; `alertasDeRespuesta` del motor en servidor como `alertas`; **sin consentimiento, nada**). Tests: 8.

### Tool nueva: `propose_respuesta_revision` (H9)
El canal vivo: `questionnaireResponses.respuestaCoach`. Comprueba que la respuesta exista y sea del atleta, rechaza textos que mencionen «IA» o «asistente», avisa si ya tenía respuesta. Kind `respuestaRevision`; `aplicarPropuesta` la traduce a `responderRevision` (snapshot parcial de la respuesta anterior; ejecutor cliente → `guardarRespuestaCoach`). Las definiciones pasan de 43 a **44** (fixture regenerado).

### `api/_lib/agente.ts` — una ronda
`ejecutarRonda({ episodio, modelo, cliente, sistema, alias, ahora })`: construye los mismos bloques de sistema que el navegador (prompt, doctrina, sufijo con «estás en un episodio, sin Dani delante: no preguntes»), llama al modelo **una vez**, ejecuta las tools que pida con el despachador de siempre (consentimiento incluido) y devuelve el episodio con `historial`, `ronda`, `coste` y las `propuestas` creadas. `end_turn` → `hecho` (o `escalado` si había alertas) con `paraDani`; `max_tokens`/`refusal` → `fallido` con historial saneado; tope de gasto y de rondas antes de llamar. Cliente del modelo inyectable: tests sin red (6).

### `api/autopiloto.ts` — el consumidor
Secreto del cron (igual que el latido), `?seco=1`, presupuesto diario compartido con el chat (`aiUsage/daily_*`, `AI_DAILY_USD_LIMIT`), hasta 5 episodios por invocación encadenando rondas mientras queden 230 s, guardado tras cada ronda (si la función muere, la siguiente retoma), `aiAuditLog` con `episodioId` y resumen sin correos en `autopiloto/{fecha_ts}`. Modelo: Sonnet 5.5. Tests de puerta (5).

### El latido encola (`api/latido-diario.ts`)
Paso 4 por atleta: `detectarEpisodios` con las respuestas de 21 días, las plantillas del coach y el consentimiento del alta; `crearEpisodioUnaVez` (idempotente). Política fija `sombra` hasta la tanda 4.

### Reglas y borrado
`firestore.rules`: `episodios` y `autopiloto` solo lectura del coach (escribe el servidor). **Sin desplegar.** `api/delete-account.ts` borra `episodios` del atleta; `autopiloto` declarado sin datos personales.

## Qué NO cambia
- El chat del coach funciona igual (misma puerta, misma fuente de cliente).
- Ningún episodio corre hasta que exista el cron de `api/autopiloto.ts` en Vercel y Dani lo active; mientras, el latido solo encola.

## Pendiente de Dani (al final, de golpe)
- Desplegar reglas (diff contra producción antes) y añadir el cron de `api/autopiloto.ts` (cada 30 min si el plan lo permite, D2).
- Decidir cuántas semanas de sombra antes de pasar `cuestionario_recibido` a `proponer` (tanda 4 trae la política editable).
