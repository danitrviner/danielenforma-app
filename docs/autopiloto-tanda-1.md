# Autopiloto · Tanda 1 — deuda bloqueante (28-10-2026)

Rama `ia-autonoma`, PR contra `main`. Primera tanda del plan de `docs/diseno-ia-autonoma-2026-10-28.md` (§10): lo que había que arreglar **antes** de que nada corra en servidor. Cero cambios de comportamiento para el atleta; el coach nota tres cosas: el asistente ya no lee a quien no ha dado permiso, propone bloques de 12 semanas y rechaza dietas fuera del criterio de Dani.

**Comprobaciones:** `npx tsc --noEmit` 0 errores · `npx eslint src` 0 errores (4 avisos previos, ninguno en lo tocado) · `npx vitest run` 288 archivos, **3.289 tests** (+22) en verde, 4 saltados.

## Qué cambia

### H1 · Una sola puerta de consentimiento (`src/ai/tools/despachador.ts`)
Antes: lista blanca de 10 tools «con datos de atleta»; `get_client_brief`, `get_athlete_dossier`, `get_revision_engine`, `propose_workout_days`… pasaban sin comprobar. Ahora **toda tool que recibe `athlete_email` se comprueba** (`requiereConsentimiento`), salvo las dos plantillas del coach (`TOOLS_SIN_DATOS_DE_ATLETA`), cuyo email solo agrupa la tarjeta. Una tool nueva nace comprobada. Además `get_coach_adjustments` sin email (toda la cartera) **filtra por consentimiento** antes de calcular derivas (`lectores.ts`). `consentimientoIA.ts` no se toca. Test: `despachador.test.ts` (7 casos, con lectores y propuestas sustituidos por espías).

### H2 · `tools.ts` partido en cuatro módulos (`src/ai/tools/`)
| Módulo | Líneas | Qué |
|---|---|---|
| `definiciones.ts` | 988 | `TOOL_DEFINITIONS` (43 tools) y `toolStatusLabel` |
| `comunes.ts` | 130 | `toResult`, alias, `findProfile`, banco del coach, `contextoNutricional` (nuevo) |
| `lectores.ts` | 1.280 | las 27 tools de lectura: las que un servidor podrá reutilizar cambiando el lector |
| `propuestas.ts` | 1.290 | las 20 que escriben (propuestas, hechos, notas, reporte) |
| `despachador.ts` | 370 | `executeTool` + la puerta del consentimiento |

`src/ai/tools.ts` queda como puerta de 7 líneas con los tres exports de siempre (`aiClient.ts`, `AiChatPanel.tsx` y los tests no cambian). Hecho con un script mecánico que solo repartió declaraciones y recalculó imports; `definiciones.test.ts` fija las 43 definiciones contra `__fixtures__/definiciones.json` (regenerado tras los cambios de esta tanda, ver abajo).

### H15 · Lo que Dani corregía siempre, ahora por defecto
- `propose_mesocycle`: `weeks` deja de ser obligatorio; sin él, **12** (`SEMANAS_POR_DEFECTO`, `validators.ts`). Bloques de menos de 8 semanas y repartos a 14 o más grupos devuelven **avisos** al modelo (`avisosDeMesociclo`), que acaban en el `rationale`.
- El paso 1 del guion (`recorridoDelPlan.ts`) dice: doce semanas por defecto y los grupos que Dani deja a cero van a cero. `recorridoDelPlan.test.ts` actualizado carácter a carácter.
- El brief lleva **lo que Dani corrige en este atleta Y en toda la cartera**, y la tarea `revision` también lo lee (`tareas.ts`): en septiembre quitó deltoides, glúteo, gemelo y core en cuatro atletas y el asistente no lo vio porque solo miraba al de turno.

### H24 + H10 · Doctrina de nutrición en código (`validators.ts`)
Decisión de Dani del 28-10: en proteína manda el alta (2 g/kg).
- Doctrina §7 (`doctrina.ts`): **1,6-2,2 g/kg, 2,0-2,4 en déficit profundo; grasa ~0,6 g/kg (0,8 en déficit), nunca < 15-20 % kcal.**
- `revisarObjetivoNutricional(objetivo, { pesoKg, mantenimientoKcal, objetivoFase })`: **rechaza** proteína < 1,2 g/kg, grasa < 0,5 g/kg o < 15 % kcal, déficit > 1.000 kcal (salvo `deficit_acelerado`); **avisa** proteína < 1,6 o > 2,6, grasa justa (< 0,6; < 0,8 en déficit; < 20 %), déficit > 700, superávit > 500, menos de 1.400 kcal. Sin peso ni mantenimiento no acota por kg: no bloquea por un dato que el atleta no dio.
- Lo usan `propose_diet_update` y cada dieta nueva de `propose_nutrition_program`; el peso sale del último pesaje (o del alta) y el mantenimiento de Mifflin (`contextoNutricional`, `comunes.ts`). El esquema del objetivo (`ESQUEMA_OBJETIVO`) le dice al modelo el criterio antes de proponer.
- Tests con los casos reales de septiembre (Angel 2,9 g/kg y grasa 0,4; Marco −999 kcal; Gonzalo +700): `validators.test.ts` (+11), `doctrina.test.ts` actualizado.

**Pendiente de Dani:** la doctrina que lee el modelo es la **guardada en Firestore** (`coachSettings/doctrinaNutricion`, 02-09), no el default. `scripts/actualizarDoctrinaProteina.mjs` sustituye solo el §7 y solo si está exactamente como el original (simulacro por defecto). Ejecutado en seco: el documento existe y el §7 coincide, listo para `--aplicar` cuando lo digas. Hasta entonces el **validador ya aplica el criterio nuevo** aunque el texto viejo siga en el prompt.

### H22 · Modelos (`api/ai-chat.ts`)
Whitelist y precios con `claude-sonnet-5-5` (2 $/10 $) y `claude-haiku-5-5` (0,10 $/0,50 $). El chat del coach sigue en Sonnet 5; el autopiloto elegirá por episodio (diseño §9.10).

## Qué NO cambia
- Ninguna escritura nueva en Firestore ni regla. El atleta no ve nada distinto.
- `consentimientoIA.ts` intacto (decisión de Dani).
- `energyCalc.ts` sigue en 2 g/kg: ahora coincide con la doctrina.

## Cómo se ha verificado
- Partición: `TOOL_DEFINITIONS` idéntico al fixture tomado antes de partir (comprobado), y después regenerado solo por los dos cambios de texto de esta tanda (`weeks` opcional con descripción, criterio g/kg en `ESQUEMA_OBJETIVO`).
- No se ha abierto la app ni lanzado el asistente: todo es lógica pura con tests. Lo que queda por ver en vivo: que el modelo lea los `avisos` del resultado y los recoja en el `rationale` (se verá en la primera propuesta real).
