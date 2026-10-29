# Acompañamiento · Tanda 3 · El canal de mensajes de Dani

29-10-2026 · rama `acompanamiento-3-mensajes` (apilada sobre la tanda 2) · plan §3 · hallazgos H-07, H-11, H-12 (la respuesta a notas de entreno ya está en main, PR #29).

Es la misma pieza que el diseño del autopiloto (§6): todo lo que el atleta lee «de Dani» fuera de la respuesta a su revisión pasa por `mensajesCoach`, y lo que decida la máquina llega como **borrador** que solo existe para el atleta cuando Dani lo firma.

## Qué cambia para el atleta

- **«Lo último de Dani»** en Inicio, debajo del reto: por fecha, los últimos 7 días. La respuesta a su revisión, los **cambios explicados con su porqué** («He bajado la dieta Déficit a 2.050 kcal. Por qué: …»), el **acuse de lo que contó** con estado («Recibido → En ello → Hecho» y la línea de Dani), hitos y mensajes sueltos, y la nota del día (que deja de ser una tarjeta aparte). Lo firmado va en tinta plena; el acuse que escribió la app, en gris y sin nombre.
- **Si no hay nada, no se finge**: «Nada nuevo esta semana. Tu próxima revisión se abre el viernes 31».
- Al marcar una molestia o una alerta en el cuestionario, su propia app escribe el acuse «Recibido: … Lo lee Dani en tu revisión y te dice qué cambia» (texto neutro, `autor: 'app'`). Hasta ahora ese texto caía en un pozo.
- Aviso en la campana (`coach_mensaje`) con el nombre de Dani cuando firma, cuenta un cambio o cierra un problema.

## Qué cambia para Dani

- En **Cliente › Revisión**, encima de los números, **«Mensajes a {nombre}»** con un contador:
  - **Por firmar**: borradores de la máquina. Hoy el latido deja uno al cambiar la fase de la dieta («Desde esta semana tu plan de comida pasa a la fase «X»»); edita, pon el porqué, **Firmar y enviar**. Nada de esto lo ve el atleta antes. Decisión de Dani (28-10): lo automático se cuenta con su nombre solo tras aprobarlo.
  - **Cambios sin contar**: lo que tocó esta semana (`cambiosAtleta`) sin mensaje, con la frase ya traducida («He bajado la dieta Déficit a 2.050 kcal.», «En la sesión Pierna A he cambiado Sentadilla por Prensa.») y un campo para el porqué. **Contárselo** lo firma.
  - **Lo que te ha contado**: los acuses abiertos; Recibido / En ello / Hecho, con una línea suya que el atleta ve bajo el acuse.
  - **Escribirle una línea** con su nombre.
- En la **bandeja del día**: «N mensajes por firmar» (para hoy) hacia la pestaña de revisión del atleta.

## Cómo

- `types.ts`: `MensajeCoach` (`tipo`, `estado: borrador | aprobado`, `autor: coach | asistente | latido | app`, `porque`, `origen`, `problema`), `coach_mensaje` en `NotificationType`.
- `firestore.rules`: `mensajesCoach` — coach lee y escribe todo; el atleta lee los suyos **solo `aprobado`** (la consulta del atleta lleva ese filtro, si no es permiso denegado) y solo puede crear su propio acuse (`tipo: 'problema'`, `autor: 'app'`). `mensajesCoach` en el inventario del borrado de cuenta.
- `db/mensajesCoach.ts` (lectores del atleta y del coach, borradores por firmar, crear/firmar/estado) · `utils/mensajesCoach.ts` (puro: `traducirCambio`, `cambiosSinContar`, `loUltimoDeDani`, `proximaRevision`, `acuseDeProblema`, con tests).
- `components/home/LoUltimoDeDani.tsx` (sustituye a la tarjeta de nota del día y a la de respuesta de la tanda 2 en Inicio; `RespuestaDelCoach` sigue en Perfil › Revisión) · `components/revision/MensajesCoachPanel.tsx` montado en `ClientRevisionPanel` (oculto en modo presentación).
- `latidoDiario.ts`: acción `mensaje_borrador` al cambiar la fase; `db-admin.crearMensajeBorrador` con `create` (no pisa lo firmado). `bandejaDelDia.ts`: entrada `borradoresPorEmail`.
- Banco `/dev/mensajes` con los dos lados y un conmutador «sin mensajes». Captura `09-tanda3-mensajes.jpg`.

## Pruebas

`tsc` 0 · `vitest` todo en verde (+10: canal, bandeja, latido) · eslint limpio · `/dev/mensajes` comprobado. Pendiente de Dani: desplegar las reglas (diff contra producción) y QA con su sesión.

## Lo que queda para más adelante (mismo canal)

- Que el editor de dieta/sesión pregunte «¿Se lo cuentas?» al guardar (hoy aparece después en «Cambios sin contar», que cumple lo mismo con un paso más).
- Hitos con audio/vídeo (tanda 5b) y bienvenida/acuse del alta (tanda 4) son tipos `hito` e `implantacion` de este mismo canal.

## Hipótesis y métrica (4 semanas)

Si cada cambio llega con un porqué y un nombre, y cada problema tiene estado, el atleta deja de escribir al vacío. Métrica (A.4): mensajes firmados por atleta y semana **0 → ≥ 1,5**; alertas de molestia con estado «en ello» o «hecho» en 48 h **0 % → ≥ 80 %**; borradores del latido sin firmar más de 3 días: 0.
