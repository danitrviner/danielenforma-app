# Autopiloto · tanda 4 — política de autonomía, aplicar en servidor y semana nueva

**Fecha:** 29-10-2026 · **Rama:** `ia-autonoma` (PR #27) · **Estado:** commiteada, sin mergear.

## Qué hace

1. **Política de autonomía** (`src/autopiloto/politica.ts`): tres modos (`sombra` / `rodaje` / `politica`), 19 tipos de decisión con nivel `automatico` / `aviso` / `proponer`, tabla de destino del diseño §4.2, `NUNCA_AUTOMATICO` y `SIEMPRE_HUMANO` (clínico, renovación) por encima de lo que diga la tabla, presupuesto (mes y día) y qué hacer con el menú semanal. `tipoDeDecision` clasifica una propuesta (kcal por % sobre la dieta base, alertas clínicas del episodio → `clinico`). `estadisticasPorTipo` + `evaluarSubida` (8 decididas y 7/8 sin tocar) miden el rodaje y proponen subir; la subida la acepta Dani. Doc `coachSettings/autopiloto`.
2. **Aplicar en servidor** (`api/_lib/ejecutarEnServidor.ts`, `api/_lib/aplicarEnServidor.ts`): el mismo `aplicarPropuesta` del hook de Dani produce las operaciones y el snapshot; el ejecutor Admin las escribe con `$ref` resueltos. Según la política efectiva: `automatico` → `status: 'aplicada'`; `aviso` → además `avisoHasta = ahora + horasAviso`; `proponer` / `sombra` → se deja en la bandeja (o en sombra). Si falla a medias, la propuesta vuelve a `proponer` con el snapshot guardado para deshacer. `ejecutarRonda` recibe `aplicar` inyectable y lo llama por cada propuesta nueva de la ronda.
3. **Consumidor** (`api/autopiloto.ts`): lee la política; el tope diario es el menor entre `presupuesto.diaUsd` y `AI_DAILY_USD_LIMIT`.
4. **Semana nueva** (`detectarSemanaNueva`, episodio `semana_nueva_{email}_{meso}_S{n}`): el primer día de cada semana del bloque (respeta `cycleDays`), prioridad 5, prompt que pide `propose_mensaje_atleta` con qué cambia esta semana. Nueva tool `propose_mensaje_atleta` (45 tools; fixture regenerado).
5. **Menú semanal** (`src/autopiloto/menuSemanal.ts` + latido): `menusQuePublicar` publica el borrador «generado solo» a las 24 h si la política es `borrador24h`, o directo si `publicar`; huella `latido_menu_{email}_{hoy}`.
6. **Pantalla de política** en Perfil › Ajustes › Entrenadores › Asistente (`PoliticaAutopiloto.tsx`): modo, presupuesto, menú, tabla por tipo con las cifras del rodaje (✓ ✎ ✗ ↩) y botón «Subir a…».

## Variantes visuales (elige Dani al final)

Dani pidió 2-3 versiones de todo lo visual (29-10). Lógica y datos en `PoliticaAutopiloto.tsx` / `HechoHoy.tsx`; capa visual en `src/components/autopiloto/{PoliticaVista,HechoHoyVista}.tsx` con prop `variante`. Se comparan en **`/dev/autopiloto`** (datos de ejemplo, nada toca Firestore). La actual en producción es la `A` de cada una (`VARIANTE_POLITICA_ACTUAL`, `VARIANTE_HECHO_HOY_ACTUAL`); al elegir, se cambia esa constante y se borran las otras dos.

| Pieza | A | B | C |
|---|---|---|---|
| Política | Tarjetas de modo + desplegable por tipo | Píldora de modo + tabla semáforo (auto / aviso / propone) | Resumen en lenguaje corriente + bloques por área desplegables |
| Hecho hoy | Lista, una fila por cambio | Cronología con hora y punto por autor | Agrupado por atleta con recuento |

Capturas en `App enforma/variantes-autopiloto-29-10/`.

## Tests

`detectores.test.ts` (semana nueva, ciclo de 10 días, orden por prioridad), `menuSemanal.test.ts`, `politica.test.ts`, `api/agente.test.ts` (aplicar inyectado, fallo no tumba la ronda), `definiciones.test.ts` (45). Suite: 296 archivos, 3.365 tests; `tsc` y `eslint` limpios en lo nuevo.

## Pendiente al final (lo hace Dani «de golpe»)

Merge, reglas (diff antes), cron de `api/autopiloto.ts` (D2: frecuencia), `scripts/actualizarDoctrinaProteina.mjs --aplicar`, elegir variantes.
