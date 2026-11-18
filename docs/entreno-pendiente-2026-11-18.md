# Entreno · lo que queda por hacer (relevo del 18-11-2026)

Para quien continúe este trabajo, sea quien sea. **En producción desde el 18-11** (PR #78, 1650f572). Lo que sigue aquí como pendiente, pendiente sigue.

## Cómo trabajar aquí

- Comprobar siempre antes de commitear: `npm run lint` (tipos + iconos), `npx vitest run` (unas 4.980 pruebas, todas en verde) y `npx vite build`.
- Servidor de pruebas: `npm run dev -- --port=3047`. Bancos sin sesión: `/dev/hipotesis-bloque`, `/dev/revision-coach` (pestaña Cierre de bloque; `?pantalla=seguimiento`, `?pantalla=ficha`, `?caso=parcial`, `?caso=deficit`), `/dev/entreno`, `/dev/roadmap?v=objetivo` y `?v=cierre`, `/dev/cierre-atleta`, `/dev/plantilla`.
- Puede haber otra sesión escribiendo en este mismo worktree: `git add` con rutas explícitas, nunca `-A` a ciegas.
- No tocar `firestore.rules` sin decírselo a Dani. No subir ni desplegar sin que lo pida.
- Normas de Dani: todo en español; en pantalla nunca «IA» (se dice «el asistente»); lo visual nuevo, en 2-3 versiones para que elija; en una descarga se quita volumen, nunca intensidad; el grupo prioritario va primero en la sesión; mandan los índices (IEM, IF, estrés articular) y las series se enseñan al lado.
- Cifras acordadas y de dónde sale cada una: `src/utils/hipotesisDeBloque/cifras.ts`, `src/utils/ruidoDeMedida.ts`, `src/utils/rmValido.ts`. Historia completa y decisiones: bóveda, `02-Formacion-Cursos/Entrenamiento/mejoras-app-cierre-y-siguiente-bloque-2026-11-17.md`.

## 1. Hipótesis de a qué responde cada atleta (pedido por Dani, viable)

Idea (de la formación de Heracles): al cerrar un bloque, ver si al atleta le va mejor con más volumen, más frecuencia o más cerca del fallo, para individualizar. Dani: «lo que consideres; igual no hace falta tanto». Tres variables, no más: **volumen** (series por semana), **frecuencia** (sesiones por semana en que se trabaja la zona) y **cercanía al fallo** (RIR medio).

- Foto por zona al cerrar («dosis y respuesta»): series/semana, frecuencia, RIR medio, IEM medio y % de RM de sus ejercicios. Para TODAS las zonas con marca, no solo las de estrella. Se guarda al firmar el cierre en `Mesocycle.cierreDeHipotesis.dosis` (tipo ya en `src/types.ts`).
- Lecturas, de más a menos fiables:
  1. La misma zona en bloques distintos: «Pecho: con 12 series subió un 3 %; con 15, un 6 %». Si cambiaron dos variables a la vez, se dice que no se puede separar.
  2. Zonas distintas en el mismo bloque (orientativo: un curl no mejora como una sentadilla): mediana de las de frecuencia 2 o más contra las de 1; mitad con más series contra mitad con menos; RIR medio bajo contra alto. Mínimo 3 zonas por lado.
- Solo cuenta una diferencia de 3 puntos o más (el ruido). Grados: «indicio» (una comparación) y «se repite» (misma dirección en 2 bloques o más). Nunca una conclusión con un dato. Siempre se enseña con cuántos casos.
- Primer bloque de un cliente (8 semanas): con lo mismo, un «punto de partida» de 3-4 frases — qué zonas subieron más y menos, cuáles se quejan con poco volumen, y por dónde seguir. Sin inventar: si no hay marcas, se dice.
- Dónde se ve: sección «A qué responde» bajo los veredictos del cierre, la misma lista en «Qué le funciona» de la ficha del atleta, y como motivo en la propuesta del bloque siguiente (`proponerHipotesis` → `porQue`). El asistente lo recibe en `get_cierre_bloque` (`src/ai/tools/hipotesis.ts`).
- Motor puro y probado en `src/utils/hipotesisDeBloque/respuestaADosis.ts`.

**Hecho (18-11, sin commitear):** motor + pruebas; la foto sale en `veredictosDelCierre` (con y sin motor) y se guarda al firmar (`cierreParaGuardar`), o con «Guardar la foto del bloque» en bloques sin estrellas; sección «A qué responde» / «Punto de partida» en Cierre de bloque, resumen en «Qué le funciona», nota en la propuesta del bloque siguiente y en el `porQue` (también en el editor, vía historial); `hipotesisParaElAsistente` trae `indiciosDeRespuesta`. Banco: `/dev/revision-coach` (bloque en curso) y `?caso=primer`. **Falta:** `src/ai/tools/lectores.ts` ~1179 debe pasar `completo.hipotesis?.dosis` como 3.er argumento para que `get_cierre_bloque` vea la foto del bloque sin firmar; QA real; elegir variante visual (solo hay una).

## 2. Cuestionario de cierre: semana a elegir, mandar ahora y mover fechas — HECHO (18-11, sin commitear)

- Semana del cierre: `Mesocycle.semanaDeCierre` (semana de ciclo, como la descarga; sin valor = la última), campo «Cuestionario de cierre en la semana [N]» en la cabecera del bloque. Solo mueve el cuestionario de CIERRE (señales `meso_end.*` o título «Cierre de bloque»: `esCuestionarioDeCierre`, vía `ScheduleContext.cuestionariosDeCierre`); las mediciones siguen en la última semana (Dani, 18-11). Todo contexto de calendario debe llevar esos ids (hoy: `useRevisionDeLaSemana`, `PendingTasksPanel`, Asignadas y el latido); sin ellos no se mueve ninguno. Además `QSchedule.semanaNumero` (semana de calendario concreta en la asignación), ofrecida en `ScheduleFields` («Una semana de cada bloque»); `claveDeItem` ya la distingue.
- Mandar ahora y Cambiar esta fecha: `QuestionnaireAssignment.excepciones` (`{ ocurrencia?, nuevaFecha }`), aplicadas en `isOverdue`, `hasAnsweredThisOccurrence`, `isDueToday`, `isUpcoming` y `proximaOcurrencia`; funciones puras en `utils/excepcionesCuestionario.ts` (con limpieza de las pasadas) y escritura en `db/questionnaires.ts` (`guardarExcepcionDeFecha`, `quitarExcepcionDeFecha`). Botones en Cliente › Revisiones › Asignadas, con «Deshacer». Sin reglas nuevas.
- Preguntas nuevas del paquete oficial: `utils/preguntasDelPaquete.ts` + aviso «Añadirlas» en el editor de cuestionarios. **Lo pulsa Dani después de desplegar.**
- Banco: `/dev/asignados` (Asignadas) y `/dev/asignados?pantalla=cuestionarios` (aviso).
- Aviso de cuestionario nuevo (18-11, sin commitear): tipo `cuestionario_nuevo` en la campana de la app (no es push: no hay FCM ni web push). Lo deja el coach al pulsar «Mandar ahora», al mover una fecha a hoy o al asignar uno que ya toca; y el latido nocturno, el día que se abre una ocasión fuera del día de apertura (misma clave, no se duplica). El día de apertura, «Tu revisión ya está abierta» nombra lo no semanal (cierre, mediciones, hitos). Funciones en `utils/recordatoriosRevision.ts` (`seAbreHoy` en `questionnaireSchedule.ts`). Necesita desplegar `api/latido-diario.ts` (sin reglas ni índices nuevos).
- Falta: QA real con sesión de coach y de atleta; las acciones de Asignadas van en una sola versión (sin variantes); push real al móvil (ver informe del 18-11).

## 3. Revisión semanal del cliente, pensada para el vídeo

Dani graba un vídeo sobre Cliente › Revisión y se lo manda al atleta: la pantalla es el guion. Propuesta completa en la bóveda (sección «Revisión semanal del cliente»). Sin maquetar. Decisiones ya tomadas:

- Dos caras: **preparar** (solo coach: lo que pide decisión, avisos, estímulo por zona, semáforo de hipótesis, notas) y **presentar** (lo que sale en el vídeo, en este orden: tu semana de un vistazo; lo que me contaste, con el dato al lado; cómo vas; lo que cambio; la semana que viene).
- La lista de comidas día a día **se queda visible**.
- «La semana que viene»: solo datos reales (qué tipo de semana es, cambios ya programados, el siguiente paso de la carga sugerida). Dani: «si nos vamos a inventar datos, prefiero que no salga».
- Fuera el número de «Disposición para entrenar» (no lo usa) y su copia «IRP» en El cuerpo.
- Fuera lo de grupos musculares (el aviso de «no llegan al mínimo efectivo», restos del mapa de calor). Las estadísticas se quedan.
- También propuesto y sin objeción: quitar el % agregado por patrón cuando mezcla ejercicios, la proyección de peso por fórmula cuando hay gasto real medido, los macros del plan contra el objetivo, el «1RM de curl» de El cuerpo y la etiqueta «OVERREACHING» del cardio; comparación fija semana contra semana anterior.
- Siguiente paso: maquetas en 2-3 versiones calcando la pantalla real (`/dev/revision-coach`), y luego construir.

**Hecho (18-11, sin commitear):** lógica pura y probada en `src/utils/revisionDeLaSemana/` (vistazo, lo que me contaste, cómo vas, la semana que viene, lo que pide decisión); componentes nuevos en `src/components/revision/` (`LoQuePideDecision`, `VistazoDeLaSemana`, `LoQueMeContaste`, `ComoVas`, `SemanaQueViene`); `ClientRevisionPanel` reordenado (preparar arriba, relato 1-5, detalle plegado salvo «Qué ha comido»). Quitados: grupos y disposición en titulares, IRP y 1RM del resumen de El cuerpo, % agregado del patrón (ahora suben/bajan/se mantienen), macros del plan, OVERREACHING y la proyección por fórmula con gasto real. Dos versiones de la parte de arriba (`variante` a/b; banco: conmutador o `?variante=b`). **Falta:** que Dani elija versión; QA real; `src/ai/tools/lectores.ts` 1275-1285 sigue mandando al asistente el % por patrón, `volumenPorGrupo` y `disposicion`; `revisionCoach.ts` 505 sigue usando el IRP por dentro (estancamiento y descarga).

## 4. Elecciones

Hechas (18-11): cierre por ejercicio en filas y saltar sesión con hoja; las otras versiones, borradas (commit a52e46de).

## 5. Menores, sin hacer

- Serie de comprobación mensual del RIR («la última, a tope»).
- Semanas puente con recorte selectivo de fatiga y vista previa de estímulo y fatiga.
- Registros del atleta en el asistente al aprobar una propuesta, para la norma de ejercicio nuevo (hoy la aplica el editor al abrir el bloque).
- Las sesiones «fuera de mi gimnasio» no se filtran en `rirStats.ts` ni en las series de `revisionCoach.ts` (`sinSesionesFuera` en `utils/sesionFuera.ts`).
- `mdc.ts` y `ruidoDeMedida.ts` tienen dos cifras distintas para el error de los perímetros.
- El botón «Fijar como límite semanal» (estrés articular tras una molestia) nunca se ha pulsado contra la base de datos real.

## 6. Antes de subir

- QA de Dani con sesión real de coach y de atleta: nada de esta rama se ha probado así.
- Guardar veredictos, crear el bloque siguiente y fijar el límite articular solo se han probado con escrituras de mentira.
- Las cifras del cierre de bloque, los récords y el historial de cargas cambian respecto a producción (RM con series de 3 a 15 repeticiones y RIR 2 o menos; mediana de 2 semanas contra 2).
- El texto por defecto de la doctrina del asistente ha cambiado: una copia guardada por Dani saldrá como «atrasada».
- Tras desplegar: pulsar el botón del punto 2 para poner al día su cuestionario de cierre.

## Elección de la revisión semanal

Hecha (18-11): versión B «Barras y citas» para «Tu semana de un vistazo» y «Lo que me contaste»; la A, borrada (7926ba71).

Pendiente de Dani: notificaciones push de verdad (hoy solo la campana); adelantar las mediciones a la última revisión dentro del bloque cuando el bloque acaba antes del día de revisión; quitar el índice de disposición también de los cálculos internos (`revisionCoach.ts` ~505) y de lo que recibe el asistente (`ai/tools/lectores.ts` ~1275-1285).

**Hecho (18-11, sin commitear): índice de disposición (IRP) quitado del todo.** Borrado `utils/readinessIndex.ts` (+ prueba); fuera de «Explorar los datos», de la tarjeta «Readiness» de Cliente › Cuerpo y de `get_progress_metrics`/`get_revision_engine` (ahora sueño, estrés y agujetas por separado, más el contexto). Donde decidía: estancamiento y caída usan contexto desfavorable del protocolo o cansancio al salir ≥ 8 (+ agujetas crónicas del grupo, como antes); la descarga cuenta «contexto desfavorable (motivos)» como señal. No se guardaba en Firestore. Falta QA real.

## Notificaciones push (fase 1: web) — CONSTRUIDO 18-11, sin commitear ni desplegar

Decisión de Dani (18-11): «notificaciones de verdad». Web push con Firebase Cloud Messaging para todo aviso de la campana dirigido al atleta.

- **Cliente.** `src/services/push/registroPush.ts` (permiso, service worker, token, guardar/refrescar/borrar), `public/firebase-messaging-sw.js` (pinta la notificación; con la app delante no, salvo en iPhone; al tocarla abre `/<pestaña del aviso>`), tarjeta `src/components/avisos/TarjetaActivarAvisos.tsx` en Inicio (Activar / Ahora no 14 días; iPhone sin instalar → cómo añadirla a la pantalla de inicio; bloqueado → se dice una vez), interruptor `AjusteAvisosDispositivo.tsx` en Perfil › Ajustes («Avisos en este dispositivo»), y al cerrar sesión se borra el token del móvil. Lógica pura y probada: `src/utils/avisosPush.ts`.
- **Servidor.** `api/_lib/push.ts` (`avisarPorPush`: tokens del atleta, una notificación aunque haya varios avisos, cada aviso suena una vez —`pushEnviados`—, borra tokens muertos). Lo usan `api/latido-diario.ts` (avisos nuevos de la noche) y la función nueva `api/avisar.ts` (solo el coach; la llama `createNotificationDeduped` tras crear cualquier aviso del coach para un atleta). Funciones en `api/`: 8 de 12.
- **Reglas** (sin desplegar): colecciones nuevas `pushTokens` (escribe/borra solo su dueño, nadie lee) y `pushEnviados` (solo servidor). Probadas en el emulador (`npm run test:reglas`). Las dos, en el borrado de cuenta.
- **Banco:** `/dev/avisos` (tarjeta y ajuste en todas sus caras; sin clave VAPID la tarjeta real no sale).

**Para activarlo (Dani):**
1. Consola de Firebase › proyecto `fleet-operator-z5xj8` › Configuración del proyecto › Cloud Messaging › Configuración web › Certificados push web › «Generar par de claves». Copiar la clave pública.
2. Vercel › proyecto › Settings › Environment Variables: `VITE_FCM_VAPID_KEY` = esa clave (Production y Preview). `FIREBASE_SERVICE_ACCOUNT` ya está.
3. Comprobar que la API «Firebase Cloud Messaging API (V1)» está habilitada (misma pantalla de Cloud Messaging). Si la clave de API del navegador tiene restricciones de API en Google Cloud, añadir «Firebase Installations API» y «FCM Registration API»; si no, «Activar» falla con un 403.
4. Desplegar las reglas (`firebase deploy --only firestore:rules`, tras el diff con producción de siempre) y después la web (push a main → Vercel).
5. Probar: Android/Chrome → abrir la web, Inicio › «Activar». iPhone (iOS 16.4+) → Safari › Compartir › «Añadir a pantalla de inicio», abrirla desde el icono, Inicio › «Activar». Luego, desde el coach, «Mandar ahora» un cuestionario a ese atleta: tiene que sonar en segundos.

**Falta:** QA real en móvil Android e iPhone; fase 2 (app nativa: `@capacitor/push-notifications`, clave APNs, binario nuevo).
