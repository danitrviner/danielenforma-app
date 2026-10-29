# Acompañamiento · Tanda 4 · La primera semana, como se vende

29-10-2026 · rama `acompanamiento-4-primera-semana` (apilada sobre la tanda 3) · plan §4 · hallazgos H-02, H-03, H-04, H-05, H-21.

Promesa de venta (Dani, 28-10): contacto diario la primera semana. Los días 3 y 7 deciden.

## Qué cambia para el atleta

- **Día 0, sala de espera:** la insignia deja de contar los días que lleva esperando y cuenta hacia la fecha que Dani se compromete: «LO TENDRÁS EL JUEVES 30» / «TU PLAN LLEGA MAÑANA» / «HOY». Debajo, lo que Dani le haya escrito ya («He leído tu alta, David. Lo del hombro lo tengo en cuenta…»), del mismo canal de mensajes (tipo `implantacion` o `libre`). Si no se ha comprometido fecha ni ha escrito nada, se ve exactamente lo de antes.
- **Día 1, plan publicado:** la bienvenida le llega firmada por Dani (ver abajo) y en Inicio aparece **«Tu primera semana · Día N · hechos/3»**: tu primera sesión, tu primer peso, tu primera revisión, con lo que ya está hecho y a dónde ir. Catorce días; al completarla, «Dani te dice el lunes qué cambia». Sustituye al `checklistInicial` que `HomeScreen` documentaba como pendiente: no hace falta un campo nuevo, los tres se deducen de lo registrado desde que se publicó el plan.
- **Correo de alta** firmado por Dani y con «qué pasa ahora» (alta → plan en dos días → te escribo cada día → viernes revisión → lunes respuesta). Es texto para la plantilla de Firebase (`docs/plantilla-email-alta.md`), que Dani pega en la consola.

## Qué cambia para Dani

- **Ficha › Plan y metas:** «Lo tendrá el» (por defecto dos días tras el alta, nunca en el pasado). Comprometer / Cambiar. Solo mientras no haya plan publicado.
- **Al pulsar «Mostrar el plan al atleta»:** la bienvenida queda en **borrador** en «Mensajes a {nombre}» («Bienvenido, Javier. Ya tienes tu plan: 4 días de entreno y la comida en kcal, como hablamos. Esta semana no busques récords…»), con los días por semana leídos de sus asignaciones. La firma en 10 segundos o la reescribe. La bandeja lo recuerda como «1 mensaje por firmar».
- **Bandeja del día, atletas en su primera semana:** «Día 2 · ya ha registrado algo: dile que lo has visto» (plantilla `primera_sesion`) y «Día 3 con plan y sin registrar nada» (plantilla `dia3_sin_registro`), con Escribirle / Ya le he escrito. Un atleta de tres días no «se apaga»: empieza mal, y la señal lo dice así.
- **Implantación › Tus tareas con este cliente:** «Preguntárselo por WhatsApp» copia las preguntas abiertas del alta que dejó el asistente (material, días reales, lesiones) en un solo mensaje: «Ana, para dejarte el plan bien montado me falta saber: 1) … 2) …». En producción había 12 así, asumidas en vez de preguntadas.

## Cómo

- `types.ts`: `UserProfile.planPrometidoPara` (bloqueado al atleta en `firestore.rules`).
- `utils/primeraSemana.ts` (puro, con tests): `diaDePlan`, `fechaPrometidaPorDefecto`, `listaPrimeraSemana`, `senalPrimeraSemana`, `textoBienvenida`, `preguntasDelAltaParaWhatsApp`.
- `PlanInPreparationCard` (insignia hacia la fecha + mensajes), `home/PrimeraSemanaCard` montada en `HomeScreen`, `ClientFichaPanel` (campo), `ClientWorkoutsPanel` (bienvenida en borrador al publicar), `ClientImplantacionPanel` (botón), `bandejaDelDia` (señales de primera semana, antes que «apagándose»), `plantillasWhatsApp` (dos plantillas nuevas).
- Banco `/dev/primera-semana` (sala de espera + lista). Captura `10-tanda4-primera-semana.jpg`.

## Pruebas

`tsc` 0 · `vitest` todo en verde (+11) · eslint e iconos OK · `/dev/primera-semana` comprobado. Pendiente de Dani: reglas (añade `planPrometidoPara` a la lista bloqueada) y pegar el correo en Firebase Console.

## Hipótesis y métrica (4 semanas)

Tres contactos con nombre en la primera semana (acuse del alta, bienvenida firmada, el toque del día 2 o 3) suben la adherencia del primer mes. Métrica (A.2, A.6): espera alta → plan **58 h → ≤ 48 h** con fecha cumplida ≥ 90 %; atletas nuevos con ≥ 5 registros en su semana 2 (hoy 2 de 3); contactos de Dani en la semana 1: **0 → ≥ 3** (bienvenida firmada + contactos registrados).
