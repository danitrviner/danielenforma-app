# Plan de acompañamiento y retención · 28-10-2026

Entrega 2 del encargo. Parte de `docs/revision-acompanamiento-2026-10-28.md` (hallazgos H-00…H-27) y de las respuestas de Dani del 28-10. **No hay código: nada se programa hasta que Dani apruebe este plan.**

## 0 · Decisiones de Dani (28-10) y lo que fijan

| Tema | Decisión | Consecuencia |
|---|---|---|
| Canal fuera de la app | **WhatsApp manual con plantillas** (ni push ni correo) | La app redacta, Dani copia y manda; la app anota que se mandó. Push web queda como opción futura (H-24, sin tanda) |
| Minutos al día en la app | **30 min** | Cabe responder cada cuestionario del día con texto propio sobre un borrador; no cabe escribir desde cero a 15 atletas |
| Revisión de la semana | **La prepara el asistente y Dani la firma** | Borrador con los números del motor + redacción de Haiku 5.5; Dani edita o aprueba. Nada sale sin su OK |
| Silencio | **3 días sin registrar nada** → le escribe por WhatsApp sin reproche | Señal «se está apagando» a los 3 días (no 7 de `lastLoginAt`) con plantilla lista |
| Cambio hecho por la máquina | **Firmado por Dani tras aprobarlo** | Cada cambio del latido/menú/motor genera un texto propuesto; si Dani no lo aprueba, el cambio ocurre pero no se le cuenta como suyo (se enseña neutro: «tu plan se ha ajustado») |
| Bajas vistas | **Se apaga / deja de contestar · resultados o lesión** | Las dos señales son medibles: registros en caída y objetivo «lento» 2 semanas o molestia marcada |
| Hitos | **Audio o vídeo grabado** | La tarjeta de hito reutiliza `mediaUrl`/`mediaKind` de `respuestaCoach` (Storage ya en uso); grabar desde el móvil del coach |
| Promesa de venta | **Revisión semanal personal · respuesta en 24-48 h · plan ajustado cada semana/bloque · contacto diario la primera semana** | Son las cuatro métricas que el panel enseña a Dani y las cuatro frases que la app repite al atleta |

Reglas que se mantienen: todo en español, «el asistente» nunca «IA»; lo que lleva el nombre de Dani lo ha visto Dani; sin escrituras en producción sin su OK; sin reabrir kcal/gramos, recetas fieles, retos sobre el mesociclo, viernes→martes.

**Una sola pieza nueva de infraestructura:** `mensajesCoach/{email}_{fecha}_{n}` (tanda 3), el mismo canal del diseño del autopiloto (§6). Todo lo que el atleta lee «de Dani» (respuesta a la revisión, cambio explicado, hito, acuse de un problema, bienvenida) es un mensaje de ese canal con `autor: 'coach'`, `estado: 'borrador' | 'aprobado'`, `origen: 'revision' | 'cambio' | 'hito' | 'problema' | 'implantacion' | 'whatsapp'` y `firmadoEn`. Las tandas 1-2 escriben en lo que ya existe (`respuestaCoach`, `coachClientTasks`) y la 3 lo unifica.

---

## 1 · Medir y ver: panel de retención + señales que faltan

**PR `acompanamiento/1-panel-y-senales` · 2 días · H-00, H-17 (detección), H-20, H-27**

- **Para el cliente:** nada visible salvo que desaparecen las 22 tareas «Revisión — bloque #1» vencidas desde septiembre (`tasks` tipo `revision` caducan al cerrar el ciclo).
- **Para Dani (−5 min/día):** en `HomeCoachScreen`, encima de la bandeja, cuatro cifras: **atletas en marcha / apagándose / callados**, **latencia mediana de respuesta** (cuestionario → respuesta o mensaje), **% de cuestionarios con respuesta en 48 h**, **primeras semanas en curso (día N)**. Debajo, la bandeja gana señales con acción:
  - «Se está apagando» (`ausencia`, urgencia `hoy`): 3 días sin registrar nada (entreno, diario, peso, cuestionario, menú, pasos) **o** 3 sesiones perdidas en 14 días **o** cuestionario sin contestar 2 ciclos. Botón **Escribirle**: copia una plantilla de WhatsApp con su nombre y lo que falta; al pulsar «Ya le he escrito» se anota `contactos/{email}` y la señal se calla 3 días.
  - «Bloque terminado sin siguiente» (`plan`, `bloqueado`): mesociclo acabado y ningún otro con `startDate` posterior (el caso de Pedro R.).
  - «Alta sin terminar N días» (`setup`, `hoy`): cuenta creada, sin `onboarding.completedAt` o sin plan publicado ≥ 3 días. Con **Archivar en CRM** para las cuentas muertas.
  - «Cuestionario sin respuesta N h» (`revision`, `hoy` a partir de 24 h): `questionnaireResponses` sin `respuestaCoach` ni mensaje posterior.
- **Cómo:** `bandejaDelDia.ts` recibe dos entradas más (registros por atleta de los últimos 14 días, agregados en una consulta por lotes con `limit`, y respuestas de cuestionario sin contestar); `latidoDiario.ts` calcula el agregado de perdidas (`perdidas14d`) y lo deja en `user_profiles.senales` para que la bandeja no lea logs. Panel puro `utils/panelRetencion.ts` con tests; `contactos` nueva (regla: solo coach).
- **Hipótesis:** si Dani ve cada mañana quién se apaga y le escribe el día 3, los atletas que hoy caen (Ander, Alvaro, Marco) vuelven a ≥ 3 registros/semana y nadie llega a baja «no contesta».
- **Métrica (A.2):** atletas con media < 2 días/sem tras ≥ 4 semanas de vida: hoy **4 de 15**. A 4 semanas: ≤ 2, y 0 bajas por «no contesta». Latencia de contacto tras señal: medible por primera vez (`contactos`).
- **Tests:** `panelRetencion.test.ts`, `bandejaDelDia.test.ts` (señales nuevas con fechas inyectadas), `latidoDiario.test.ts` (agregado de perdidas), reglas (`contactos`).
- **Textos (plantilla de WhatsApp, voz de Dani):**
  > Buenas {nombre}, no te leo desde el {día}. ¿Semana chunga? Si ha sido así me lo dices y lo adaptamos, que para eso estoy. Dime solo cómo vas y lo cuadramos.

---

## 2 · El bucle de la semana: cuestionario → respuesta de Dani visible

**PR `acompanamiento/2-respuesta-semana` · 2 días · H-08, H-09, H-10, H-26**

- **Para el cliente:** el martes (o antes) ve en **Inicio**, arriba, «Dani ha revisado tu semana · lunes 3» con tres bloques fijos: **Cómo ha ido** · **Qué cambia esta semana** · **Qué espero ver**. Se queda 7 días; después vive en Perfil › Revisión (ya existe `RespuestaDelCoach`). Notificación propia `coach_reply` («Dani ha revisado tu semana»). Si Dani le escribió por WhatsApp en vez de en la app, la tarjeta dice «Dani te ha escrito por WhatsApp el …» (sin texto) para que la app no quede muda.
- **Para Dani (+10-15 min/día, 3-5 respuestas):** en `RespuestaCoachBox` (Cliente › Revisión › Recibidas) los tres campos salen **rellenados por el asistente** con los números del motor (`titularesRevision`, `adherenciaPorKcal`, `verificarObjetivo`, cambios de la semana ya programados en `semanasDelBloque`/`semanasNutricion`) y las respuestas del atleta; Dani edita o pulsa **Firmar y enviar**. Botón **Copiar para WhatsApp** (mismo texto, sin títulos) y **Marcar como escrito por WhatsApp**. Coste: Haiku 5.5, ~0,01 $ por borrador; en la lista de tareas del asistente (`ai/tareas.ts`) como tarea `respuesta_revision` con la puerta de consentimiento.
- **Paquete de cuestionarios (H-26):** el paquete oficial pasa a **un** cuestionario semanal el viernes («Tu semana», recortado a ≤ 12 preguntas, con «LESIONES/MOLESTIAS» estructurado) y los demás escalonados (DOM's lunes quincenal, Mediciones día 26, Primera semana solo semana 1). Se aplica a los 15 en marcha con el OK de Dani (escritura en `questionnaireAssignments`: se hace desde la app, no con script).
- **Honestidad:** el borrador no se envía solo; si Dani no lo firma, el atleta no ve nada firmado. El texto dice «he visto» solo cuando Dani ha pulsado.
- **Hipótesis:** una respuesta con nombre en < 48 h cada semana es la prueba de supervisión más barata que existe; con ella, el cuestionario se contesta más (y más corto) y la semana siguiente se entiende.
- **Métrica (A.3):** % de cuestionarios con respuesta visible en 48 h: hoy **0 %** (7 % con cualquier reacción). A 4 semanas: ≥ 80 % de los cuestionarios semanales de los 15 en marcha; latencia mediana < 36 h; cuestionarios contestados por atleta y semana ≥ 0,9 (hoy ~0,75 en los que registran).
- **Tests:** `borradorRespuesta.test.ts` (puro: con fixtures de respuestas y titulares produce los tres campos), `RespuestaCoachBox` (firma, copia, marca WhatsApp), `NotificationBell` (tipo nuevo), `pasosDeCuestionario.test.ts` (paquete).
- **Textos (voz de Dani; el asistente redacta en este molde):**
  > **Cómo ha ido.** Buena semana, {nombre}: 4 de 4 entrenos y el peso a −0,4 kg, justo en el ritmo que buscamos. Lo de la rodilla en la última serie de sentadilla lo he leído.
  > **Qué cambia.** Esta semana cambio la sentadilla por prensa, con el mismo esquema, hasta que la rodilla esté callada. Lo demás igual: toca subir una serie en dorsal.
  > **Qué espero ver.** Otra semana en torno a −0,4 kg y que la prensa la hagas sin molestia. Si la rodilla sigue, me lo pones el viernes y lo vemos.

---

## 3 · El canal de mensajes de Dani (el mismo del autopiloto)

**PR `acompanamiento/3-mensajes-coach` · 2 días · H-07, H-11, H-12**

- **Para el cliente:** tarjeta **«Lo último de Dani»** en Inicio (sustituye a la nota del día, que pasa a ser un tipo de mensaje más): los mensajes de los últimos 7 días, cada uno con fecha, origen y, si lo lleva, audio/vídeo. Tipos: respuesta de revisión (tanda 2), **cambio explicado** («He bajado la dieta a 2.600 kcal: el peso iba más rápido de lo que quiero. Esta semana lo notas en la cena.»), **acuse de problema** con estado *recibido → en curso → hecho* («He visto lo del hombro; esta semana te quito el press militar»), respuesta a una nota de entreno (`note_reply`, rama `respuesta-notas-atleta` mergeada aquí), mensaje libre. Si en 7 días no hay nada, la tarjeta enseña «Próxima revisión: viernes 7» y nada más: **no se finge**.
- **Para Dani (+5 min/día):** al guardar un cambio de dieta o sesión (`registrarCambio` en `db/cambios.ts`) el editor pregunta en una línea «¿Se lo cuentas?» con el resumen ya traducido (`cambiosAtleta.lineas` → frase en segunda persona) y un campo «porqué» opcional; «Enviar» crea el mensaje firmado. Las alertas de molestia (`revision_alerta`) y los textos libres de «LESIONES/MOLESTIAS» crean un problema `recibido`; Dani lo pasa a `en curso`/`hecho` desde la bandeja (el atleta ve el estado). Lo que hace la máquina (latido, menú automático, progresión programada) crea un mensaje **en borrador** que Dani aprueba en la bandeja («Hecho hoy» del autopiloto): aprobado → firmado; sin aprobar → el cambio se enseña neutro («tu plan se ha ajustado esta semana») y sin nombre.
- **Cómo:** `mensajesCoach` (regla: coach escribe; el atleta lee los suyos con `estado: 'aprobado'`), `utils/traducirCambio.ts` puro (líneas de `cambiosAtleta` → texto al atleta), `problemas` como subtipo del mensaje con `estado`, `HomeScreen` tarjeta. `coachDayNotes` se mantiene leyendo y deja de escribirse.
- **Hipótesis:** si cada cambio del plan llega con un porqué y un nombre, y cada problema tiene estado, el atleta deja de sentir que «escribe al vacío» y entiende la semana.
- **Métrica (A.4):** mensajes de Dani por atleta y semana: hoy **0**. A 4 semanas: ≥ 1,5 (la revisión + un cambio o acuse). Problemas marcados en cuestionario con acuse en 48 h: hoy 0 % → ≥ 80 %. Textos libres por cuestionario: se espera que bajen (ya no hace falta repetir).
- **Tests:** `traducirCambio.test.ts`, `mensajesCoach.test.ts` (estados, borrador/aprobado, ventana de 7 días), reglas, `HomeScreen` con fixtures.

---

## 4 · La primera semana con guion (contacto diario, como se vende)

**PR `acompanamiento/4-primera-semana` · 2 días · H-02, H-03, H-04, H-05, H-21**

- **Para el cliente:**
  - **Día 0 (sala de espera):** «Dani está montando tu plan · lo tendrás el **jueves 30**» (fecha que Dani fija en implantación; por defecto alta + 2 días) y, debajo, un mensaje de Dani: «He leído tu alta. Lo del hombro lo tengo en cuenta, y empezamos con 4 días como me has dicho». La insignia cuenta hacia la fecha, no desde el alta. Las tres tareas de la espera se quedan.
  - **Día 1 (plan publicado):** mensaje de bienvenida de Dani (borrador del asistente a partir del expediente del alta; opcionalmente audio) y la **lista de la primera semana** en Inicio (`checklistInicial`: primera sesión, cinco ingestas registradas, lección RIR, primer peso, cuestionario «Primera semana»), con cierre y una línea de Dani al completarla.
  - **Día 3 y día 7:** lo que Dani diga desde la bandeja (abajo).
- **Para Dani (+5 min/día solo con altas en curso):** en la bandeja, una fila por atleta en semana 1 con el día que es y la acción: «día 1: primera sesión hecha → dile algo» (1 clic con borrador), «día 3: sin registro de comida → escríbele» (plantilla WhatsApp), «día 7: primera semana contestada → respóndele» (tanda 2). Las 12 `coachClientTasks` del asistente (material, días reales, lesiones) salen aquí con plantilla de WhatsApp para preguntar **antes** de publicar. Plantilla de correo de alta con «Dani» y «esta semana: …» (Firebase Console, manual).
- **Hipótesis:** los días 3 y 7 deciden; si el atleta recibe tres contactos con nombre en la primera semana, la adherencia del primer mes sube y la semana 2 no cae.
- **Métrica (A.2, A.6):** espera alta → plan: mediana **58 h** → ≤ 48 h con fecha cumplida ≥ 90 %. Atletas nuevos con ≥ 5 registros en su semana 2: medir (hoy David M. 2, Felice 1-2, H. Morales 2). Contactos de Dani en la semana 1: 0 → ≥ 3.
- **Tests:** `primeraSemana.test.ts` (qué toca cada día con fecha inyectada), `PlanInPreparationCard` (fecha comprometida), `checklistInicial` (cierre).
- **Textos:**
  > Bienvenido, {nombre}. Ya tienes tu plan: 4 días de entreno y la comida en kcal, como hablamos. Esta semana no busques récords: busca hacer las 4 sesiones y registrar lo que comes. El viernes te pregunto cómo ha ido y el lunes te digo qué cambia.

---

## 5 · Progreso hacia SU objetivo y el Road map que sale de los objetivos

**Dos PR: `acompanamiento/5a-roadmap-objetivos` (2 días, H-28) y `acompanamiento/5b-su-objetivo` (2 días, H-22, H-23, H-13, H-14)**

### 5a · Road map derivado de los objetivos (encargo de Dani del 28-10)

- **Para el cliente:** Perfil › Road map pasa a tener, arriba, **«Dónde estás»**: la fase en curso con su objetivo en su idioma («Déficit · bajar a 79 kg antes del 24 de noviembre»), «semana 6 de 10», la franja de peso esperada esta semana y su peso real (sin rojo ni «desvío»: «vas en el plan» / «vas algo más lento, Dani lo ve el lunes»). Debajo, **el camino**: fases pasadas, actual y siguientes del programa de nutrición (cada una con objetivo, semanas y peso meta) y el bloque de entreno en curso (mesociclo, semana N de M, qué cambia esta semana); **el próximo hito** calculado («salida de déficit en 4 semanas», «fin de bloque el 15-11», «peso objetivo a 1,2 kg»); **esta semana**: kcal, pasos, cardio y el reto (PR #24). Hitos, días señalados y escalera de niveles se quedan como capa encima; «Logros recientes» igual.
- **Para Dani:** deja de rellenar `PlanPhaseEditor`. El Road map se **deriva** de `semanasDelPlan` (fuente de verdad aprobada el 28-10) y del mesociclo publicado; no hay nada que montar aparte. `roadmap.planPhases` se retira de la edición (se mantiene en lectura para Ander hasta migrar) o se genera automáticamente de las fases del programa con `nutritionPhaseId` (`planNutritionBridge.ts` ya enlaza ambas). Lo del coach no se enseña: `decisionesPlan`, `evaluarPlan.opciones`, «Por qué se desvía».
- **Cómo:** nuevo `utils/roadmapDelAtleta.ts` puro: `(semanasDelPlan, mesociclos, retos, hoy) → { dondeEstas, camino, proximoHito, estaSemana }`; `AthleteRoadmapScreen` lo pinta con `PhaseHeroCard`/`PhasePathStepper` adaptados. Depende de que la rama `respuesta-notas-atleta` esté en `main` (o se trabaja sobre ella). **No se toca** `SeguimientoPlanPanel.tsx` ni `seguimientoPlan.ts`.
- **Hipótesis:** si el Road map dice en qué semana está, qué viene y por qué, el cliente deja de sentir que el plan es «lo de esta semana y ya» y entiende el medio plazo que compró.
- **Métrica (A.5):** atletas con Road map con fase y hito: hoy **1 de 15** → 15 de 15 (todo el que tenga programa). Aperturas de Perfil › Road map por atleta y semana (nuevo contador local): medir. Hitos vencidos sin cerrar: 7 → 0.
- **Tests:** `roadmapDelAtleta.test.ts` con fixtures de `semanasDelPlan` (fase única, varias fases, sin programa, programa terminado), `AthleteRoadmapScreen` con `/dev/roadmap` nuevo (sin Firestore).
- **Textos:**
  > **Dónde estás.** Semana 6 de 10 · Déficit. Objetivo de esta fase: 79 kg para el 24 de noviembre. Esta semana: entre 80,1 y 80,9 kg; vas en 80,4.
  > **Lo que viene.** 4 semanas más de déficit → 2 semanas de mantenimiento (descanso de la dieta) → volumen. Bloque de entreno «Hipertrofia 1», semana 3 de 9.
  > **Esta semana.** 2.100 kcal · 9.000 pasos · 2 sesiones de zona 2 · reto: prensa, sube de 120 kg.

### 5b · Progreso hacia SU objetivo

- **Para el cliente:** en Inicio (bajo el reto) y en Perfil › Revisión, **«Lo que viniste a buscar»**: su `goalFreeText` entre comillas, **antes → ahora** (peso medio 7 días al empezar vs hoy, perímetros si hay, foto inicial vs última con `PhotoCompareCurtain`, récords del bloque) y **lo que falta** (del motor: kg al objetivo y semanas al ritmo actual; o «esperado» de la ficha viva traducido: «Dani espera ver: …»). `MiObjetivo` deja de decir «tu coach lo está siguiendo» y dice lo que es verdad: «Dani lo ve en tu revisión del lunes». Hitos del road map con fecha vencida se cierran (logrado / no / pospuesto) y los logrados entran en «Logros recientes». **Hitos con audio/vídeo**: primer mes, primer récord en un básico, peso objetivo a < 1 kg: señal en la bandeja → Dani graba 20 s desde el móvil (misma subida que `respuestaCoach`) → tarjeta en Inicio.
- **Para Dani (+2 min/día):** rellenar `targetWeight`/`initialWeight` donde falten (20 perfiles) desde una lista de la bandeja; cerrar hitos vencidos; grabar hitos cuando salten (1-2 por semana en total).
- **Retos (H-13):** dificultad «suave» por defecto en nivel 0-1 y siempre tras una semana fallida; «justo» tras dos conseguidas.
- **Hipótesis:** ver cada día su frase y el antes→ahora es lo que convierte «me pesa el plan» en «esto va a algún sitio»; y un reto que se consigue la mitad de las veces engancha, uno que falla dos de cada tres desanima.
- **Métrica (A.5):** retos conseguidos: **16 %** → ≥ 50 %. Hitos vencidos sin cerrar: 7 → 0. Perfiles con objetivo verificable (`ObjetivoCorporal` + `targetWeight`): 4 → 15. Atletas con hito grabado en el mes: 0 → ≥ 5.
- **Tests:** `antesAhora.test.ts`, `challengeOptions.test.ts` (dificultad por nivel y racha), `MiObjetivo` (textos), `hitosVencidos.test.ts`.

---

## 6 · Silencio y re-enganche (lado del atleta)

**PR `acompanamiento/6-vuelta` · 1 día · H-18, resto de H-17**

- **Para el cliente:** si vuelve tras ≥ 3 días sin registrar, Inicio no le enseña una fila de rojos: «Qué toca hoy» (la sesión de hoy, no las perdidas), el reto pasa a «suave», y arriba el mensaje que Dani dejó si lo dejó («Me alegro de verte por aquí. Hoy solo la sesión, lo demás ya lo cuadramos»). Las sesiones perdidas se ven en «Esta semana» como «no hecha», sin color de alarma.
- **Para Dani:** tres plantillas de WhatsApp por tipo de silencio (sin registrar, perdidas, cuestionario), con el nombre y el dato; «Ya le he escrito» cierra la señal 3 días. Si tras dos contactos sigue callado 14 días, la bandeja propone «Pausar o dar de baja» con el motivo precargado («se apaga»).
- **Hipótesis:** la culpa aleja; una vuelta amable con una tarea pequeña recupera.
- **Métrica (A.2):** atletas que vuelven a ≥ 3 registros/semana la semana siguiente a un contacto por silencio: medir (hoy no existe el contacto). Objetivo a 4 semanas: ≥ 50 % de los contactados.
- **Tests:** `vueltaTrasSilencio.test.ts` (detección puro), `motorRetoSemanal.test.ts` (suave tras silencio), `HomeScreen` con fixture de vuelta.

---

## 7 · WhatsApp como canal reconocido por la app

**PR `acompanamiento/7-whatsapp` · 1 día · H-09 (resto), H-24 (sustituido)**

- **Para el cliente:** cada vez que Dani le escribe por WhatsApp desde la app (plantilla copiada + «Ya le he escrito»), la tarjeta «Lo último de Dani» lo refleja: «Dani te ha escrito por WhatsApp · martes 3». Nada de push ni correo (decisión de Dani).
- **Para Dani:** una **cola de WhatsApp** en la bandeja: todos los textos pendientes de mandar del día (silencios, preguntas del alta, hitos, respuestas que prefiere mandar por ahí), cada uno con «Copiar», «Abrir chat» (`wa.me/<telefono>` del CRM) y «Mandado». La skill `whatsapp-clientes` lee esta cola en vez de reconstruirla de las fichas de la bóveda.
- **Hipótesis:** si el canal que Dani usa de verdad queda registrado, la latencia de respuesta se mide entera y el atleta ve en la app que le han escrito.
- **Métrica:** contactos registrados por atleta y semana (hoy no existe) ≥ 1; latencia de contacto tras señal ≤ 24 h.
- **Tests:** `colaWhatsApp.test.ts`, plantillas con nombre/datos.

---

## 8 · El mes y la renovación

**PR `acompanamiento/8-cierre-y-renovacion` · 2 días · H-15, H-16, H-19**

- **Para el cliente:** al publicarse el bloque nuevo, tarjeta **«Cierre del bloque»** en Inicio: tres cifras del motor (`cierreMesociclo`: sesiones hechas de N, volumen, récords; peso del bloque) + dos frases de Dani (borrador del asistente, firma suya) + «lo que cambia en el bloque 2». En los **últimos 10 días del plan**: «Esto hemos conseguido / esto viene» con antes→ahora (tanda 5) y el siguiente paso escrito por Dani. Si pausa: «Nos vemos el {fecha}»; si baja: despedida con su recorrido.
- **Para Dani (+5 min por bloque):** al pulsar «Publicar bloque» el editor pide las dos frases (borrador listo); bandeja: «plan vence en 10 días → escribe el siguiente paso»; CRM: motivo obligatorio al no renovar (`motivoNoRenovacion`, hoy 0 usos). El panel de la tanda 1 cruza motivo con las señales previas.
- **Hipótesis:** la renovación se decide con la sensación de haber conseguido algo y con un siguiente paso claro; un bloque que acaba sin cierre ni siguiente es una baja a 5 días (Pedro R.).
- **Métrica (A.1):** renovación de la cohorte de septiembre (planes de 3 meses, 19-11 → 15-12): objetivo ≥ 80 % de los 15 en marcha. Bloques terminados sin siguiente > 2 días: 0.
- **Tests:** `cierreParaAtleta.test.ts`, `ultimosDiezDias.test.ts`, CRM (motivo obligatorio).

---

## 9 · Personalización nombrada

**PR `acompanamiento/9-hecho-con` · 1 día · H-25**

- **Para el cliente:** en el menú semanal y en las recetas, una línea «Hecho con lo que me dijiste: sin lactosa · bebida de avena · cenas rápidas» (de `gustosDelAtleta`, `athleteRecipeRules`, restricciones); en el plan de entreno, «Con tu material: mancuernas y polea» (del alta); en la respuesta de la semana, el asistente usa una de esas cosas por nombre cuando aplique.
- **Para Dani:** nada (lo rellena el motor con lo que ya guarda).
- **Hipótesis:** nombrar lo tenido en cuenta convierte un plan correcto en un plan «mío».
- **Métrica:** intercambios/cambios de menú por semana (`MenuSwapEntry`) y recetas descartadas: se espera que bajen; preferencias actualizadas por el atleta: que suban.
- **Tests:** `hechoCon.test.ts` (puro: perfil + gustos → ≤ 3 etiquetas).

---

## 10 · Orden, dependencias y calendario

| Tanda | Días | Depende de | Minutos/día de Dani al terminar |
|---|---|---|---|
| 1 Panel y señales | 2 | — | −5 (ve en vez de buscar) |
| 2 Respuesta de la semana | 2 | 1 (señal «sin respuesta») | +10-15 |
| 3 Mensajes de Dani | 2 | 2 (la respuesta es un mensaje) | +5 |
| 4 Primera semana | 2 | 3 (bienvenida y acuse son mensajes) | +5 con altas |
| 5a Road map de los objetivos | 2 | rama `respuesta-notas-atleta` en main | −2 (ya no rellena fases) |
| 5b Su objetivo | 2 | 3 (hitos grabados), 5a | +2 |
| 6 Vuelta | 1 | 1 | 0 |
| 7 WhatsApp | 1 | 1, 3 | 0 (ya lo hace) |
| 8 Mes y renovación | 2 | 3, 5 | +5 por bloque |
| 9 Hecho con | 1 | — | 0 |

Total ≈ 17 días de trabajo; con Dani a 20-25 min/día en la app desde la tanda 3 (presupuesto: 30). Las tandas 6, 7 y 9 pueden ir en paralelo con cualquier otra. **La medición de 4 semanas se hace sobre el panel de la tanda 1** con las cifras de la sección A como línea base; se repite el script de solo lectura el 25-11 para contrastar.

Cada tanda: PR contra `main`, `tsc`, `vitest`, `npm run test:reglas` si toca reglas (diff contra producción antes de desplegar), informe `docs/acompanamiento-tanda-N.md`, memoria.

## 11 · Lo que Dani tiene que decidir para arrancar

1. **Aprobar el plan y el orden** (o cambiarlo: la 4 podría ir antes que la 3 si hay altas esta semana; costaría escribir la bienvenida en `coachClientTasks` provisionalmente).
2. **Rama `respuesta-notas-atleta`** (28-10, sin commit): ahora es prerrequisito de la 5a además de la 3 (`seguimientoPlan.ts`, Plan › Objetivo); conviene mergearla antes y desplegar la regla de `decisionesPlan` desde main.
2b. **Road map:** retirar `PlanPhaseEditor` de la edición o generar las fases del road map desde el programa (las dos opciones están en la tanda 5a; propongo retirar y migrar a Ander a mano).
3. **Las 6 cuentas que nunca arrancaron** (Roberto C., Alex D., Malena S., Jony, Sandra B. y la demo «Cliente D.»): archivar en el CRM para que no cuenten como activas.
4. **El paquete oficial de cuestionarios** (tanda 2): aplicar el recorte a los 15 en marcha desde la app, o dejarlo como está.
5. **`targetWeight`/`initialWeight`** vacíos en 20 perfiles: rellenarlos (tanda 5 le da la lista).
