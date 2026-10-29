# Acompañamiento · Tanda 1 · Panel de retención y señales que faltaban

29-10-2026 · rama `acompanamiento-retencion` · plan: `docs/plan-acompanamiento-2026-10-28.md` §1 · hallazgos H-00, H-17 (detección), H-20, H-27.

## Qué cambia para Dani

- **Panel de retención** encima de la bandeja del día (`HomeCoachScreen`): en marcha / apagándose (+ callados) / latencia mediana de respuesta a la revisión (y % contestadas en 48 h, la promesa de venta) / revisiones sin contestar (+ cuentas sin plan). Debajo, quién está en su primera semana y en qué día. Sale **siempre**, también con la bandeja vacía: «todo al día» con dos atletas apagándose no era todo al día. Línea base del 28-10: 170 h, 0 %, 4 de 15 apagándose.
- **Cuatro señales nuevas en la bandeja**, todas «para hoy» o «está parado» (la urgencia `pronto` no se pinta desde hace semanas, así que «lleva N días sin abrir la app» no la veía nadie):
  - **Se está apagando**: 3 días sin registrar nada (entreno, peso, pasos, comida o cuestionario; abrir la app no cuenta), o 3 sesiones perdidas en 14 días, o 14 días sin contestar la revisión. Umbral de Dani (28-10).
  - **Revisión sin contestar**: cuestionario enviado hace ≥ 24 h sin `respuestaCoach`. «Vista» no basta: el atleta no ve que la hayas visto.
  - **Bloque terminado sin siguiente** (está parado): el caso de Pedro R.
  - **Alta sin terminar desde hace N días**: cuenta creada ≥ 3 días sin plan publicado.
- **Escribirle / Ya le he escrito** en cada una: la plantilla de WhatsApp con su nombre y el dato (`utils/plantillasWhatsApp.ts`, tono de la skill `whatsapp-clientes`) se copia y se abre `wa.me` con su teléfono del CRM; «Ya le he escrito» registra `contactos/{email}_{fecha}_{motivo}` y la señal se calla 3 días. El contacto cuenta como respuesta en la latencia del panel: por fin se mide lo que pasa por WhatsApp.

## Qué cambia para el atleta

- Las tareas de revisión/cuestionario/foto con fecha caducan solas a los 7 días (`utils/tareasDelAtleta.ts`). En producción había 22 «Revisión — bloque #1» vencidas desde septiembre en «Tareas pendientes».

## Cómo

- `utils/senalesDelAtleta.ts` (puro): `calcularSenales(foto, hoy)` → `UserProfile.senales` (`ultimoRegistro`, `registros14d`, `perdidas14d`, `ultimaRespuesta`, `tieneCuestionarios`). Lo escribe el **latido** (`api/latido-diario.ts` §4, `guardarSenales` en `db-admin.ts`) con lo que ya lee; solo si cambia. El atleta no puede escribirlo (lista bloqueada de `user_profiles` en `firestore.rules`).
- `utils/bandejaDelDia.ts`: entradas opcionales `respuestas` (la misma consulta que la bandeja de Revisiones, `useRespuestasDeLaBandeja`) y `contactos`; campo `contacto` en la señal.
- `utils/panelRetencion.ts` (puro) · `db/contactos.ts` · regla `contactos` (solo coach) · `contactos` en el inventario de borrado de cuenta.
- Banco de pruebas `/dev/bandeja` (`BandejaDevHarness.tsx`) con los ocho casos; captura en `docs/revision-acompanamiento-capturas/06-tanda1-bandeja-panel.jpg`.

## Pruebas

`tsc` 0 errores · `vitest` 3.319 tests en verde (+ 36 nuevos: señales, bandeja, panel, plantillas, tareas) · eslint limpio en lo tocado · `/dev/bandeja` comprobado en el navegador (panel, seis señales, «Copiado» al pulsar Escribirle). **Pendiente de Dani:** desplegar las reglas (diff contra producción antes) y comprobar la bandeja con su sesión; el latido escribe `senales` la primera noche tras el despliegue (hasta entonces la bandeja cae al último login).

## Hipótesis y métrica (4 semanas)

Si Dani ve cada mañana quién se apaga y le escribe el día 3, los que hoy caen (Ander, Alvaro, Marco) vuelven a ≥ 3 registros/semana y nadie llega a baja «no contesta». Métrica: atletas con media < 2 días/sem tras ≥ 4 semanas: **4 de 15** → ≤ 2; latencia de contacto tras señal: medible por primera vez (`contactos`).
