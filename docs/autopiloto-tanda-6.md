# Autopiloto · tanda 6 — episodios emergentes

**Fecha:** 29-10-2026 · **Rama:** `ia-autonoma` (PR #27) · **Estado:** commiteada, sin mergear. Hallazgo H16.

## Qué hace

`src/autopiloto/emergentes.ts`: siete detectores puros sobre la foto que el latido ya tiene leída (asignaciones, logs, pesajes, registros, dietas, programa, respuestas, plantillas) más los check-ins (`leerCheckIns`, nuevo en `db-admin.ts`). Cada uno devuelve episodios con id estable; `crearEpisodioUnaVez` evita duplicados. El latido los encola en el paso 4 detrás de los de siempre.

| Episodio | Dispara | Id | Guion (lo que hace el modelo) |
|---|---|---|---|
| **dolor** (prioridad 1) | texto nuevo (≤ 3 días) con dolor/molestia en cuestionario, check-in o nota de entreno | `dolor_{email}_{hash}` | leve: `get_alternativas_ejercicio` → `propose_week_plan` (cambio desde esta semana) + mensaje «he cambiado X por Y» + **siempre** tarea «Revisar ya». Clínico (lesión declarada en el alta o suena persistente): lleva `alertas` → todo a `proponer`, solo la tarea |
| **nota_libre** (3) | texto ≥ 80 caracteres o con palabra clave (viaje, enfermo, vacaciones, regla, estrés, cambiar, no puedo) | hash | clasifica viaje / enfermedad / disponibilidad / material / pregunta / otro y actúa (acuse, tarea, `propose_workout_days` si pide algo claro) |
| **perdidas** (4) | 3 asignaciones `perdido` en 14 días | última perdida | no toca el plan (§15); mensaje «te he visto faltar» + tarea |
| **peso_sin_registrar** (4) | 10 días sin pesaje en fase con objetivo | día en que se hizo viejo | un recordatorio, una llamada |
| **desvio_peso** (6) | `verificarObjetivo` lento/rápido/contrario esta semana y la pasada, con adherencia ≥ 70 % | semana ISO | `propose_diet_update` con el `ajusteKcal` **del motor** (viaja en el episodio), suelo 1.400, paso 50, ≤ 400; proteína fija |
| **desvio_adherencia** (6) | adherencia por kcal < 70 % (o < 3 días registrados) dos semanas cerradas | semana ISO | no toca kcal; mensaje para simplificar + tarea |
| **bienestar** (6) | contexto desfavorable dos respuestas seguidas, o sueño < 6 h / estrés ≥ 7 en la última | semana ISO | nada en el plan; tarea con la tendencia |

Política: el cambio de ejercicio por molestia leve es `cambio_ejercicio_molestia` (destino aviso); el ajuste de kcal se clasifica por % como siempre; mensajes `mensaje_atleta`. Un texto con dolor no se duplica como nota libre.

## Tests

`emergentes.test.ts` (15): cada detector dispara/no dispara, ids estables, clínico vs leve, adherencia semanal, desvío de peso con 60 pesajes planos en déficit, orden por prioridad, sin consentimiento nada. Suite: 300 archivos, 3.404 tests; `tsc` y `eslint` limpios.

## Notas

- `WeightCheckIn.timestamp` se pasa a fecha local con `isoLocal` (regla de lint).
- `renovacion` sigue sin guion: es humano (tanda 7).
