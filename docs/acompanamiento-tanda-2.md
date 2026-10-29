# Acompañamiento · Tanda 2 · La respuesta de la semana, preparada por el asistente y firmada por Dani

29-10-2026 · rama `acompanamiento-2-respuesta` (apilada sobre `acompanamiento-retencion`, PR #31; incluye `origin/main` con PR #29) · plan §2 · hallazgos H-08, H-09, H-10.

## Qué cambia para el atleta

- **«Dani ha revisado tu semana»** en Inicio, justo debajo del reto, durante 7 días (y 14 en Perfil › Revisión): tres bloques con título —**Cómo ha ido · Qué cambia esta semana · Qué espero ver**— con la fecha y, si lo hay, el audio o vídeo. Con nombre (`COACH_NOMBRE`), no «tu coach».
- Si Dani contestó por WhatsApp, la tarjeta dice **«Dani te ha escrito por WhatsApp»** en vez de quedarse muda.
- El aviso de la campana lleva su nombre y la primera frase de «cómo ha ido».

## Qué cambia para Dani

- En Cliente › Revisiones › Recibidas, **el cuadro de respuesta trae los tres bloques ya rellenados** («Borrador del asistente · edítalo y firma») con lo que está medido: entrenos hechos de los pautados en 7 días, ritmo de peso frente al plan (`evaluarPlan`), la molestia que marcó o escribió, los cambios que él hizo esa semana (`cambiosAtleta`, en su idioma) y la franja de peso y pasos de la semana que viene (`semanasDelPlan`). Si va lento, lo dice sin «desvío» ni reproche (decisión de Dani, 28-10).
- Botones: **Firmar y enviar** (nada sale sin pulsarlo; queda `borrador: 'asistente' | 'coach'` para medir cuánto edita), **Copiar para WhatsApp** (mismo texto sin títulos, con su nombre delante) y **Contestada por WhatsApp** (`canal: 'whatsapp'`, sin texto; la bandeja deja de reclamarla y la latencia del panel la cuenta).
- Coste cero y sin esperar: el borrador es determinista (`utils/borradorRespuesta.ts`, puro). Lee datos del atleta que la ficha ya tiene en caché si se abrió Plan › Objetivo; si no, una vez por ficha.

## Cómo

- `types.ts`: `RespuestaCoachRevision` (`bloques`, `canal`, `borrador`) sustituye al tipo anónimo de `respuestaCoach`; `texto` sigue siendo lo que se enseña y copia, así que las respuestas antiguas se pintan igual.
- `utils/borradorRespuesta.ts` (+ tests): `borradorDeRespuesta`, `textosLibres`, `textoDeBloques`, `TITULOS_BLOQUES`.
- `components/revision/RespuestaCoachBox.tsx` reescrito; `ReceivedReviewsPanel` y `ClientReviewsPanel` le pasan el atleta y la plantilla.
- `components/checkin/RespuestaDelCoach.tsx` pinta bloques y canal, con `maxDias`; `HomeScreen` la monta con la consulta `['responsesForAthlete', email]` que ya comparten Tareas pendientes y Revisión.
- Bancos: `/dev/respuesta` (cuadro del coach con borrador) y `/dev/revision` (tarjeta del atleta). Capturas `07-tanda2-respuesta-coach.jpg` y `08-tanda2-tarjeta-atleta.jpg`.

## Lo que no entra aquí (y por qué)

- **Paquete de cuestionarios recortado (H-26)**: es un cambio de datos en producción (plantillas y asignaciones de 15 atletas). Dani ha dicho que sí; se hace desde la app, cuadrando la semana de cada uno, no con script.
- **Redacción con el modelo**: el borrador determinista cubre lo medido; si Dani quiere que el asistente «escriba mejor», es un botón más sobre el mismo borrador (tarea `respuesta_revision` con Haiku 5.5, ~0,01 $) y entra en la tanda 3 junto al canal de mensajes.

## Pruebas

`tsc` 0 errores · `vitest` 3.329 en verde (+7) · eslint limpio en lo tocado · `/dev/respuesta` y `/dev/revision` comprobados.

## Hipótesis y métrica (4 semanas)

Una respuesta con nombre en < 48 h cada semana es la prueba de supervisión más barata que existe. Métrica (panel de la tanda 1): % de cuestionarios semanales con respuesta en 48 h **0 % → ≥ 80 %**; latencia mediana **170 h → < 36 h**; `borrador: 'asistente'` sin editar vs editado (cuánto se fía Dani del borrador).
