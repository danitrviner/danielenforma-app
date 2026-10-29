# Acompañamiento · Tanda 8 · El mes y la renovación

29-10-2026 · rama `acompanamiento-8-cierre-renovacion` (apilada sobre la 6-7) · plan §8 · hallazgos H-15, H-16, H-19 (parcial).

## Qué cambia para el atleta

- **Cierre de bloque, firmado por Dani.** Al acabar un mesociclo, en «Mensajes a {nombre}» aparece por firmar el cierre con las tres cifras del motor (`cierreMesociclo`: sesiones hechas de las programadas, % del trabajo, récords) y sus frases para el cliente; Dani lo retoca y firma, y el atleta lo lee en «Lo último de Dani» como hito. La única baja medida se fue cinco días después de acabar un bloque sin cierre ni siguiente.
- **«Tu plan termina pronto»** en Inicio los últimos 10 días del plan contratado: cuándo, **esto hemos conseguido** (de X a Y kg, a Z kg de tu meta) y **esto viene** («Dani te cuenta el siguiente paso estos días»). Dos versiones (tarjeta / línea) en la galería.

## Qué cambia para Dani

- **Bandeja:** «El plan termina en N días: escríbele el siguiente paso» (≤ 10 días) → su ficha › Revisión, donde escribe la línea.
- **CRM › Renovaciones:** al marcar un servicio como «perdido», un desplegable **¿Por qué?** con los seis motivos de la baja (borde rojo hasta rellenarlo). Alimenta el panel de retención; antes `motivoNoRenovacion` existía en el tipo y no lo escribía nadie.

## Cómo

- `utils/cierreParaAtleta.ts` (puro, con tests): `bloqueCerradoRecientemente` (≤ 14 días), `textoCierre`, `finDePlan`, `diasHastaFinDePlan`.
- `ClientRevisionPanel` calcula el cierre con los logs que ya tiene y lo pasa a `MensajesCoachPanel` como borrador local (`cierre_{mesoId}`): no escribe nadie hasta que Dani firma (entonces se crea ya aprobado). Sin tocar el latido: `cierreMesociclo` y sus motores importan sin `.js` y no pueden correr en `api/`.
- `home/RenovacionCard.tsx` en `HomeScreen` (fase en curso para la meta); `bandejaDelDia` señal `plan_vence` (`DIAS_ULTIMOS_DEL_PLAN = 10`); `RenovacionesTab` del CRM con el motivo.
- Galería: pieza `renovacion`. `/dev/mensajes` enseña el cierre por firmar. Capturas `14a` (renovación) y `14b` (cierre).

## Lo que queda fuera (H-19)

Pantallas de pausa y despedida para el atleta: `estadoCrm: 'pausado' | 'baja'` no cambia hoy la app del atleta (el acceso lo quita `gestionar-acceso.ts`, sin commitear). Lo honesto es una tanda propia cuando ese flujo esté en main.

## Pruebas

`tsc` 0 · `vitest` todo en verde (+6) · eslint OK.

## Hipótesis y métrica (4 semanas)

La renovación se decide con la sensación de haber conseguido algo y un siguiente paso claro. Métrica (A.1): renovación de la cohorte de septiembre (planes de 3 meses, 19-11 → 15-12) ≥ 80 % de los 15 en marcha; bloques terminados sin cierre firmado en 7 días: 0; «perdidos» sin motivo en el CRM: 0.
