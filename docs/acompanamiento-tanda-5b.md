# Acompañamiento · Tanda 5b · Progreso hacia SU objetivo

29-10-2026 · rama `acompanamiento-5b-objetivo` (apilada sobre la 5a) · plan §5b · hallazgos H-22, H-13, H-14 (H-23, hitos vencidos, queda resuelto por la 5a: ya no hay hitos manuales).

## Qué cambia para el atleta

- **«Lo que viniste a buscar»** en Inicio (debajo de «Lo último de Dani») y dentro de «Tu objetivo» en Perfil › Revisión: su frase del alta tal cual («Llegar a los 40 en forma me haría sentir muy orgulloso de mí mismo»), y el **antes → ahora**: con cuánto empezaste, cuánto pesas ahora (mediana de los últimos 7 días, no el último pesaje), cuánto has cambiado y cuánto falta hasta la meta de la fase. Dos variantes para elegir: *cita* (la frase grande) y *cifras* (empezaste · ahora · meta). En producción 20 de 24 altas tienen esa frase y ninguna pantalla la repetía.
- **«Tu objetivo» deja de prometer lo que no pasa.** «Tu coach lo está siguiendo y ajustará si hace falta» → «Vas algo más despacio de lo previsto. Esta semana: registra la comida todos los días y llega a tus pasos. Dani lo ve en tu revisión del lunes.» Con nombre, en acción, sin reproche.
- **Retos en suave mientras arranca.** En el nivel de arranque (las primeras semanas entrenando) el reto va siempre en «suave»; el fallo repetido sigue rebajando más, como antes. En producción se conseguía el 16 % y fallaba el 67 %.

## Qué cambia para Dani

- **Hitos con audio o vídeo.** En «Mensajes a {nombre}» el cuadro libre admite un archivo y la casilla «Es un hito»: le llega como tipo `hito` con su nombre y el media (primer mes, récord grande, peso objetivo a la vista). Decisión de Dani (28-10): hitos grabados, no solo texto.
- **La bandeja recuerda el primer mes** (día 28-31 del plan): «Primer mes cumplido (día 28): grábale un hito».

## Cómo

- `home/LoQueVinisteABuscar.tsx` (`antesAhora` puro, con tests; `variante: 'cita' | 'cifras'`), montada en `HomeScreen` (fase en curso de `faseEnCurso`) y en `MiObjetivo` (variante cifras, sin marco).
- `MiObjetivo.tsx`: textos con `COACH_NOMBRE` y acción.
- `challengeMemory.difficultyFor(kind, memoria, nivel)`: en `arranque`, nunca por encima de suave; `challengeOptions` le pasa el nivel. Test del techo del 100 % con nivel explícito.
- `MensajesCoachPanel`: media + «Es un hito». `bandejaDelDia`: señal `primer_mes` (`DIA_PRIMER_MES = 28`).
- Icono `format_quote` añadido al subconjunto de la fuente.

## Pruebas

`tsc` 0 · `vitest` todo en verde (+5) · eslint e iconos OK. Las variantes de «Lo que viniste a buscar» se enseñan en la galería `/dev/variantes` (siguiente paso) junto con las de las tandas 1-4.

## Hipótesis y métrica (4 semanas)

Ver cada día su frase y el antes → ahora convierte «me pesa el plan» en «esto va a algún sitio». Métrica (A.5): retos conseguidos **16 % → ≥ 50 %**; perfiles con meta de peso visible: 4 → los que tengan fase con `targetWeight` (hoy 8 de 9 programas); hitos grabados por Dani: 0 → ≥ 1 por atleta al cumplir el mes.
