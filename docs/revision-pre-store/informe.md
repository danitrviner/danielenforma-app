# Revisión pre-publicación · App Store y Google Play

**Fecha del informe:** 10 ago 2026 · **Última actualización:** 13 ago 2026
**Repo:** `/Users/dani/en-forma` · **Rama:** `ds/f3-experiencia`
**Alcance:** siete bloques en paralelo (cumplimiento, build nativo, auth, seguridad, QA funcional,
rendimiento, visual/UX). El informe original se escribió **sin compilar ni ejecutar nada**; la
sección [Qué quedó fuera](#qué-quedó-fuera) dice qué no se miró y por qué. Desde entonces sí se ha
compilado y ejecutado en iOS —y eso destapó la Fase 1b entera—, pero **Android sigue sin compilarse
ni una vez**.

---

> ## Estado a 13 ago 2026 · lo que hay que leer primero
>
> **De los nueve bloqueantes queda uno, es de configuración, y son cinco minutos de consola:**
> `FIREBASE_SERVICE_ACCOUNT` en Vercel (`checklist-dani.md` § 0.5).
>
> **Ya no queda trabajo de código bloqueando la publicación.** Además de los nueve bloqueantes,
> están cerrados **enteros** los dos grupos de Altas con más riesgo para un cliente de pago —`A-5`
> pérdida de datos y `A-8` presentación— y el mínimo viable de `A-7` (arranque y coste). El índice
> compuesto de `workoutLogs` está **desplegado y verificado en producción**.
>
> **Todo commiteado y en la rama `ds/f3-experiencia`.** El aviso de «nada está commiteado ni
> desplegado» que había aquí ya no aplica.
>
> **Lo que sigue abierto, y no bloquea:** `A-2` (consentimiento de IA), el resto de `A-3` (las 12
> colecciones y pasar la CSP a *enforce*, que sigue en `Report-Only` a propósito), y las partes de
> `A-7` de rendimiento fino. Más las decisiones § 6.4 de Dani (iPad, Live Activity).
>
> **Lo que este informe todavía NO puede afirmar:** que Android compile. Sigue sin haber JDK en la
> máquina, y al arreglar `07-6` apareció que faltaba `colors.xml` entero, con lo que hasta ahora
> **no compilaba**. Ver Fase 1b y `02-4`.
>
> ---
>
> *Contexto de las capas anteriores, 10 ago 2026:* este informe se escribió por la mañana. Después
> se ejecutó la Fase 1 entera, las Fases 2 y 3 en buena parte, y Dani tomó las cinco decisiones de
> producto que bloqueaban el resto.
>
> **Cerrados:** `B-1` borrado de cuenta (endpoint con cascada + UI + página pública), `B-2` política
> de privacidad y términos, `B-3` y `B-4` Google Sign-In, `B-5` enlace mágico, `B-6` purpose strings,
> `B-7` `PrivacyInfo.xcprivacy`, `B-8` firma del AAB (a falta del keystore) y `B-9` el vínculo de
> correo.
>
> **La decisión que más cambió el mapa** fue la de acceso: quitar Google y el enlace mágico, y que la
> cuenta la cree el servidor mandando un correo para que el atleta elija contraseña. Eso no cerró un
> bloqueante, cerró **cuatro a la vez** (`B-3`, `B-4`, `B-5` y `B-9`), porque los cuatro eran
> consecuencias de sostener tres caminos de acceso de los que dos estaban rotos. La app pasa a tener
> uno solo.
>
> **Lo único que queda es configuración:** `FIREBASE_SERVICE_ACCOUNT` en Vercel, sin la cual los dos
> endpoints nuevos devuelven 503. Cinco minutos de consola. Detalle en `checklist-dani.md` § 0.5.

## Resumen ejecutivo

> **Lo de abajo es el diagnóstico original del 10 ago y se conserva como registro de lo que se
> encontró.** Para el estado de hoy, lee el recuadro de arriba. Los nueve bloqueantes de este
> apartado están cerrados salvo la variable de entorno.

**No. Hoy la app no se puede subir a ninguna de las dos tiendas.** No es cuestión de pulido: hay
nueve bloqueantes y ninguno es opinable. Dos impiden siquiera *rellenar el formulario* de envío
(no existe política de privacidad ni URL de borrado de datos), tres son rechazo garantizado en
revisión de Apple (sin borrado de cuenta in-app, Google Sign-In sin alternativa, y un `crash` seguro
al tocar «Hacer foto»), dos impiden que el binario llegue a subirse (falta el manifiesto de
privacidad de iOS, el AAB de Android sale sin firmar), y dos rompen la app por dentro para
cualquiera que no seas tú (el enlace mágico de invitación nunca puede completarse dentro de la app,
y el «Vínculo del correo electrónico» sigue desactivado en Firebase, así que hoy **nadie nuevo puede
darse de alta**).

Lo importante para calibrar el esfuerzo: la mayoría de los bloqueantes son de trámite y
configuración, no de arquitectura. El único trabajo grande de verdad es el borrado de cuenta
(4-6 días) y, si decides ofrecer Sign in with Apple, la migración de identidad de email a UID
(3-5 días). El resto del camino crítico son horas, no semanas.

### Bloqueantes, uno por frase

1. **No existe ninguna forma de borrar la cuenta desde dentro de la app**, y Apple lo exige a
   cualquier app que cree cuentas — la tuya las crea, en el primer `signInWithPopup` o
   `signInWithEmailLink`. `01-1` `03-4`
2. **Google Play exige además una URL web pública de solicitud de borrado** y no existe ninguna;
   sin ella el formulario de Seguridad de los datos no se puede completar. `01-2`
3. **No hay política de privacidad ni términos: ni URL, ni pantalla, ni enlace** — y la Privacy
   Policy URL es un campo obligatorio de App Store Connect, así que el envío ni arranca. `01-6` `04-5`
4. **Se ofrece Google Sign-In sin ninguna alternativa equivalente**, lo que incumple la
   guideline 4.8 (hay dos salidas posibles, ver el detalle: añadir Sign in with Apple, o retirar
   Google en iOS). `01-3`
5. **Google Sign-In no puede funcionar en iOS nativo**: el SDK de Firebase rechaza el origen
   `capacitor://localhost` y en WKWebView no hay ventana emergente, así que el botón termina en
   `auth/unauthorized-domain`. `03-1`
6. **El enlace mágico de invitación nunca puede completarse dentro de la app**: no hay Universal
   Links, ni App Links, ni escucha de deep link, y `window.location.href` en nativo jamás lleva el
   `oobCode`. `03-2` `02-7` `03-16`
7. **Faltan `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription`**, así que tocar «Hacer
   foto» en cualquiera de las cuatro pantallas que abren la cámara mata el proceso en iOS. `01-10`
   `02-1` `05-1`
8. **No hay `PrivacyInfo.xcprivacy` en el target App**, con lo que App Store Connect devuelve
   ITMS-91053 y la build no pasa a revisión; y **el bloque `release` de Android no tiene
   `signingConfig`**, con lo que el AAB sale sin firmar y Play lo rechaza al subirlo. `02-2` `01-17`
   `02-3`
9. **«Vínculo del correo electrónico» sigue desactivado en Firebase Auth**, y como el auto-registro
   se quitó a propósito, el único camino de alta falla con `auth/operation-not-allowed` para
   cualquier correo. `01-16` `04-1` `05-15`

> **Corrección a un bloqueante heredado.** El de «las reglas de Firestore no están desplegadas» ya
> **no está vivo**: el bloque 04 lo comprobó contra el historial de git (`04-2`) y desde el deploy
> del 8 ago solo han cambiado comentarios. Queda como una confirmación de un minuto en la consola,
> no como bloqueante. Es la única severidad que este informe baja respecto al material de partida,
> junto con `01-5`.

---

## Tabla de hallazgos

Leyenda de las dos últimas columnas: **confianza** = cómo de sólida es la observación del agente que
la encontró; **verificación** = si pasó por el verificador adversarial (solo cinco hallazgos
llegaron a esa fase antes del tope del workflow).

### Bloqueantes

| ID(s) | Bloque | Título | Fichero | Confianza | Verificación |
|---|---|---|---|---|---|
| 01-1 · 03-4 | 01, 03 | No existe borrado de cuenta en la app | `src/components/ProfileScreen.tsx:437` | verificado | **confirmado** |
| 01-2 | 01 | Play exige URL web pública de borrado y no existe | — | verificado | **confirmado** |
| 01-6 · 04-5 | 01, 04 | No hay política de privacidad ni términos | `src/components/WelcomeScreen.tsx` | verificado | **confirmado** |
| 01-3 | 01 | Google Sign-In sin alternativa equivalente (4.8) | `src/components/WelcomeScreen.tsx:94` | verificado | **confirmado** |
| 03-1 | 03 | Google Sign-In roto en iOS nativo (`capacitor://`) | `src/components/WelcomeScreen.tsx:94` | verificado | no verificado |
| 03-2 · 02-7 · 03-16 | 03, 02 | El enlace mágico no se completa dentro de la app | `src/components/WelcomeScreen.tsx:31` | verificado | no verificado |
| 01-10 · 02-1 · 05-1 | 01, 02, 05 | Faltan las purpose strings de cámara y fototeca | `ios/App/App/Info.plist` | verificado | no verificado |
| 02-2 · 01-17 | 02, 01 | Falta `PrivacyInfo.xcprivacy` → ITMS-91053 | `ios/App/App/` | verificado | no verificado |
| 02-3 | 02 | El AAB de release sale sin firmar | `android/app/build.gradle:20` | verificado | no verificado |
| 01-16 · 04-1 · 05-15 | 01, 04, 05 | «Vínculo del correo electrónico» desactivado | `src/db/invites.ts:22` | verificado | no verificado |
| ~~01-15~~ | 01 | ~~Reglas de Firestore sin desplegar~~ → **Info**, refutado por `04-2` | `firestore.rules` | verificado | corregido |

### Altas

| ID(s) | Bloque | Título | Fichero | Confianza |
|---|---|---|---|---|
| 01-4 · 03-7 | 01, 03 | Toda la identidad y el rol se deciden por cadena de email | `firestore.rules:65`, `src/App.tsx:72` | verificado |
| 01-7 · 04-6 | 01, 04 | Datos de salud del atleta salen a Anthropic sin consentimiento | `src/ai/tools.ts:54` | verificado |
| 01-8 · 02-13 | 01, 02 | `allowBackup="true"` sube sesión y datos de salud a Drive | `android/.../AndroidManifest.xml:4` | verificado |
| 01-9 | 01 | Foreground service `specialUse` para una cuenta atrás | `android/.../AndroidManifest.xml:33` | verificado |
| 01-12 | 01 | Sin cuentas de demo el revisor ve solo la pantalla de login | `src/App.tsx:418` | verificado |
| 01-13 | 01 | Etiquetas de privacidad de Apple y Data safety sin rellenar | `src/types.ts:632` | verificado |
| 02-4 | 02 | No hay JDK: `bundleRelease` no se puede ni ejecutar | `android/app/capacitor.build.gradle:5` | verificado |
| 02-5 | 02 | Ningún plugin de Capacitor cableado en Android (`plugins.json` = `[]`) | `android/capacitor.settings.gradle:2` | verificado |
| 02-6 · 04-4 · 06-18 | 02, 04, 06 | Los assets web embebidos en iOS/Android son del 21-22 de julio | `ios/App/App/public/index.html` | verificado |
| 02-8 | 02 | Firma iOS sin `DEVELOPMENT_TEAM`, identidad heredada | `ios/.../project.pbxproj:214` | verificado |
| 02-10 · 07-14 | 02, 07 | Se declara landscape sin layout ni bloqueo de orientación | `ios/App/App/Info.plist:35` | verificado |
| 02-12 | 02 | `ACCESS_FINE_LOCATION` se cuela desde el plugin BLE | `android/.../AndroidManifest.xml:46` | verificado |
| 03-3 | 03 | Invitar desde la app nativa manda `capacitor://localhost` como continue URL | `src/db/invites.ts:23` | verificado |
| 03-5 · 04-14 | 03, 04 | Cerrar sesión no limpia caché, IndexedDB ni localStorage | `src/App.tsx:671` | verificado |
| 03-6 | 03 | Lo escrito en modo local nunca se resincroniza y desaparece | `src/db/training.ts:459` | verificado |
| 04-3 | 04 | `questionnaireMedia` sin `email_verified` en storage.rules | `storage.rules:61` | verificado |
| 04-7 | 04 | CSP en Report-Only en web, inexistente en nativo | `vercel.json:16` | verificado |
| 04-9 · 02-18 | 04, 02 | App Check no se inicializa, y reCAPTCHA v3 no sirve en nativo | `src/firebase.ts:84` | verificado |
| 04-10 | 04 | 12 colecciones legibles con solo estar autenticado (quema de cuota) | `firestore.rules:97` | verificado |
| 05-2 | 05 | Sin red, cualquier «Guardar» fuera del CRM se cuelga para siempre | `src/db/training.ts:486` | verificado |
| 05-3 | 05 | El aviso de «no se está guardando» nunca aparece sin conexión | `src/components/LocalModeBanner.tsx:24` | verificado |
| 05-4 | 05 | El alta del atleta pierde los 6 pasos si iOS mata la app | `src/components/AthleteOnboardingWizard.tsx:96` | verificado |
| 05-5 | 05 | Si iOS mata la app a mitad de entreno se pierden todas las series | `src/components/TrainingScreen.tsx:172` | verificado |
| 05-7 | 05 | Preguntas numéricas escriben `NaN` en Firestore | `src/components/QuestionnaireWizard.tsx:258` | verificado |
| 05-8 | 05 | El alta asigna 2000 kcal fijas a todo el mundo | `src/components/AthleteOnboardingWizard.tsx:141` | verificado |
| 05-11 | 05 | Si falla leer las fotos, se le dice al atleta que no tiene fotos | `src/db/media.ts:15` | verificado |
| 06-1 · 07-5 | 06, 07 | Los 590 iconos dependen de una fuente remota (572 ms bloqueantes) | `index.html:16` | verificado |
| 06-2 | 06 | Abrir Inicio del coach dispara ~5.700 lecturas de Firestore | `src/components/ClientsScreen.tsx:62` | verificado |
| 06-5 | 06 | Arranque del atleta en tres viajes en serie, con 8 s de espera tope | `src/App.tsx:251` | verificado |
| 06-6 | 06 | Tocar «Perfil» carga 620 KB extra (344 KB de recharts) | `src/components/ProfileScreen.tsx:7` | verificado |
| 06-11 | 06 | `OnboardingForm` redibuja 1.332 líneas por pulsación de tecla | `src/components/OnboardingForm.tsx:563` | verificado |
| 06-12 | 06 | El cronómetro redibuja `TrainingScreen` entera una vez por segundo | `src/components/TrainingScreen.tsx:206` | verificado |
| 06-13 | 06 | `CardioScreen` redibuja 900 puntos de recharts cada segundo | `src/components/CardioScreen.tsx:493` | verificado |
| 06-15 | 06 | La galería pinta fotos de 1600 px en miniaturas de 48 px | `src/components/PhotosScreen.tsx:174` | verificado |
| 06-20 | 06 | Estimación ~3,3 M lecturas/mes con 31 usuarios | `src/main.tsx:17` | sospecha |
| 07-1 | 07 | Ninguna superficie superior reserva la safe area | `src/App.tsx:522` | verificado |
| 07-2 | 07 | El aviso rojo se dibuja bajo la barra de estado y tapa la cabecera | `src/components/LocalModeBanner.tsx:50` | verificado |
| 07-3 | 07 | La primera pantalla del atleta mete el «Paso N de 6» bajo el notch | `src/components/AthleteOnboardingWizard.tsx:206` | verificado |
| 07-4 | 07 | La tabla de series obliga a scroll horizontal y esconde «Hecha» | `src/components/TrainingScreen.tsx:659` | verificado |
| 07-6 | 07 | Con el móvil en modo claro la barra de estado se vuelve invisible | `ios/App/App/Info.plist:48` | verificado |
| 07-7 | 07 | La pantalla de acceso enseña códigos crudos de Firebase | `src/components/WelcomeScreen.tsx:144` | verificado |
| 07-9 | 07 | Sin gestión del botón Atrás de Android ni del gesto de volver | `src/App.tsx` | verificado |

### Medias

| ID(s) | Bloque | Título | Fichero |
|---|---|---|---|
| 01-5 | 01 | Sin aviso global de «no sustituye consejo médico» — **refutado como bloqueante**, ver detalle | `src/types.ts:632` |
| 01-11 | 01 | `CFBundleDevelopmentRegion = en` en una app en español | `ios/App/App/Info.plist:7` |
| 01-14 | 01 | Cuestionario de clasificación por edad sin decidir | `src/types.ts:824` |
| 01-21 | 01 | `NSSupportsLiveActivities` sin extensión: argumento de 4.2 flojo | `ios/App/App/Info.plist` |
| 02-9 | 02 | Live Activity declarada pero ni la extensión ni el plugin están en el proyecto | `ios/App/App/Info.plist:60` |
| 02-11 · 07-15 | 02, 07 | `TARGETED_DEVICE_FAMILY "1,2"` obliga a capturas y revisión de iPad | `ios/.../project.pbxproj:312` |
| 02-15 | 02 | `minifyEnabled false` en release | `android/app/build.gradle:21` |
| 02-16 | 02 | 21 MB de JSON de recetas dentro del binario | `src/components/CoachesScreen.tsx:397` |
| 02-17 | 02 | `VITE_AI_PROXY_URL` no está en `.env.example` | `src/ai/aiClient.ts:13` |
| 02-22 | 02 | Falta `NSMicrophoneUsageDescription` y el cuestionario acepta vídeo | `src/components/QuestionnaireWizard.tsx:281` |
| 03-8 | 03 | Error de `getRedirectResult` solo en consola | `src/App.tsx:272` |
| 03-9 · 07-17 | 03, 07 | El logo de Google se descarga de gstatic.com | `src/components/WelcomeScreen.tsx:267` |
| 03-11 | 03 | Cuenta creada a mano en consola queda encerrada por `email_verified` | `firestore.rules:16` |
| 04-8 | 04 | La CSP tiene un dominio de Firebase mal escrito y le faltan directivas | `vercel.json:16` |
| 04-11 | 04 | El endpoint de IA no exige `email_verified` | `api/ai-chat.ts:37` |
| 04-12 | 04 | El endpoint de IA refleja cualquier `Origin` en CORS | `api/ai-chat.ts:57` |
| 04-13 | 04 | El tope de gasto de IA no es transaccional y es fail-open | `api/ai-chat.ts:111` |
| 04-15 | 04 | `system` y `tools` del cuerpo llegan a Anthropic sin validar | `api/ai-chat.ts:133` |
| 04-21 | 04 | La base Firestore `(default)` no la gestiona el repo | `firebase.json:2` |
| 04-22 | 04 | No hay copias de seguridad programadas de Firestore | `firebase.json` |
| 05-6 | 05 | El temporizador usa `setTimeout` encadenado: se congela en segundo plano | `src/components/TrainingScreen.tsx:206` |
| 05-9 · 07-12 | 05, 07 | 74 campos `type="number"` sin `inputMode`: la coma decimal no entra | `src/components/TrainingScreen.tsx:714` |
| 05-10 | 05 | Dos definiciones de «hoy», una local y otra UTC | `src/utils/scheduleEngine.ts:19` |
| 05-12 | 05 | Subir dos fotos el mismo día y vista machaca la anterior | `src/db/media.ts:28` |
| 05-13 | 05 | Vídeo de cuestionario sin límite, sin progreso y sin cancelar | `src/db/media.ts:61` |
| 05-14 | 05 | 384 pruebas pero cero de componente, de escritura real y de reglas | `firebase.json` |
| 06-3 | 06 | Abrir «Rutinas» lee la colección `exercises` tres veces | `src/db/training.ts:155` |
| 06-4 | 06 | Cada arranque lee los check-ins dos veces (y siembra datos falsos) | `src/App.tsx:244` |
| 06-7 | 06 | `ClientsScreen` importa estáticamente los ocho paneles del hub | `src/components/ClientHub.tsx:33` |
| 06-8 | 06 | Analytics y App Check se empaquetan enteros estando desactivados | `src/firebase.ts:2` |
| 06-9 | 06 | `firebase/storage` en el chunk de arranque | `vite.config.ts:29` |
| 06-10 | 06 | 868 KB de fuentes, con cirílico, vietnamita y una copia `.woff` inútil | `src/index.css:11` |
| 06-14 | 06 | `useScrollEdgeMask` hace `setState` en cada evento de scroll | `src/components/ui/internal/useScrollEdgeMask.ts:41` |
| 07-8 | 07 | 13 confirmaciones destructivas con `window.confirm` (botones en inglés) | `src/components/MyDietsScreen.tsx:110` |
| 07-10 | 07 | Controles por debajo de 44×44 pt; el avatar es un `div` sin rol | `src/App.tsx:547` |
| 07-11 | 07 | `ink-4` e `ink-5` dan 2,8:1 y 2,1:1 sobre el fondo, en texto de 11 px | `src/index.css:183` |
| 07-13 | 07 | Dynamic Type no tiene ningún efecto: tipografía en px absolutos | `src/index.css:76` |

### Bajas

| ID(s) | Bloque | Título | Fichero |
|---|---|---|---|
| 02-19 | 02 | `UIRequiredDeviceCapabilities = armv7` en un proyecto solo arm64 | `ios/App/App/Info.plist:31` |
| 02-21 | 02 | Falta `ITSAppUsesNonExemptEncryption`: «Missing Compliance» en cada subida | `ios/App/App/Info.plist` |
| 02-24 | 02 | Splash con tres copias idénticas de 1 MB y tres PNG huérfanos | `ios/.../Splash.imageset/Contents.json` |
| 03-10 | 03 | «¿Olvidaste tu contraseña?» depende de un código que ya no se devuelve | `src/components/WelcomeScreen.tsx:82` |
| 03-12 | 03 | El timeout de 8 s puede enseñar el login a quien sí tiene sesión | `src/App.tsx:254` |
| 04-23 | 04 | `npm audit`: 1 crítica y 18 altas, ninguna llega al bundle nativo | `package.json` |
| 04-24 | 04 | `.env.example` anuncia una `GEMINI_API_KEY` que ya no existe | `.env.example` |
| 06-16 | 06 | 228 usos de `transition-all` y cero componentes memoizados | `src/components/ClientReviewsPanel.tsx:409` |
| 06-17 | 06 | El swipe del catálogo mueve la tarjeta con estado de React | `src/features/gimnasio/MachineCard.tsx:71` |
| 07-16 | 07 | `prefers-reduced-motion` no se respeta en el motion dirigido por JS | `src/components/ui/RingSeal.tsx:54` |
| 07-18 | 07 | El bloqueo de scroll de overlays no impide el rebote en WKWebView | `src/components/ui/internal/overlayHooks.ts:33` |

### Info y cobertura positiva

| ID(s) | Bloque | Título |
|---|---|---|
| 01-15 · 04-2 | 01, 04 | **Corrección**: el bloqueante de «reglas sin desplegar» ya no está vivo |
| 01-18 | 01 | Verificado y correcto: no hay compras in-app ni enlaces a comprar para el atleta |
| 01-19 | 01 | Verificado y correcto: no se carga código remoto, no hay `server.url` |
| 01-20 | 01 | Verificado y correcto: targetSdk 36, permisos = usos, nada de HealthKit |
| 01-22 | 01 | Tipo de cuenta de desarrollador de Apple sin decidir (D-U-N-S bloquea semanas) |
| 02-23 | 02 | `versionCode`/`MARKETING_VERSION` sin criterio ni automatización |
| 02-25 | 02 | Los builds de release no se han ejecutado en esta revisión |
| 02-26 | 02 | Verificado y correcto: icono 1024 sin alfa, sin source maps, sin secretos |
| 03-13 | 03 | Persistencia de sesión en WKWebView: sin verificar en dispositivo |
| 03-14 | 03 | Google Sign-In en Android *probablemente* funciona por redirect, sin verificar |
| 03-17 | 03 | Decisión pendiente: borrar frente a anonimizar el rastro comercial |
| 04-16 | 04 | Inyección de prompt: mitigada, residuo acotado, sin ruta a escritura |
| 04-17 | 04 | Verificado y correcto: el bundle no lleva source maps, `.env` ni secretos |
| 04-18 | 04 | Verificado y correcto: `aiUsage` y `aiAuditLog` cerrados al cliente |
| 04-19 | 04 | Inventario completo de datos personales y de salud (insumo de los formularios) |
| 04-20 | 04 | Verificado y correcto: el módulo CRM entero está cerrado al atleta |
| 06-19 | 06 | Medición en simulador pendiente (arranque real, jank, memoria) |
| 06-21 | 06 | Verificado y correcto: `firebase-admin` y el SDK de Anthropic no entran en el bundle |
| 06-22 | 06 | Verificado y correcto: sin fugas de `onSnapshot`, catálogo local, 384 pruebas en verde |
| 07-19 | 07 | Los bloqueantes heredados impiden verificar el recorrido del primer día |
| 07-20 | 07 | Inventario de capturas de tienda: no hay ninguna producida |

---

## Detalle · Bloqueantes

### B-1 · No existe borrado de cuenta en la app `01-1` `03-4` `01-2` `03-17`

**Síntoma.** Atleta con sesión → Perfil → Ajustes (`src/components/ProfileScreen.tsx:437`): la hoja
ofrece nombre deportivo, meta de peso, avatar, «Repetir el tour» y «Cerrar sesión», y nada más. Un
grep de `deleteUser|eliminar cuenta|borrar cuenta|delete account|deleteAccount|reauthenticate` sobre
`src/`, `api/` y `functions/` devuelve **cero**. No hay pantalla legal, ni enlace de soporte, ni
borrado desde el lado coach: el único `deleteDoc` sobre `user_profiles` (`src/db/profiles.ts:253`) es
deduplicación silenciosa de perfiles repetidos por email.

**Guía.** App Store Review Guidelines 5.1.1(v): *«If your app supports account creation, you must
also offer account deletion within the app»*. El documento de soporte añade que desactivar
temporalmente no basta y que aplica a todos los usuarios estén donde estén. Google Play
(«Understanding Google Play's app account deletion requirements», enforcement pleno desde el
15-abr-2024) exige **las dos vías a la vez**: camino in-app **y** un enlace web de solicitud de
borrado, porque hay usuarios que ya desinstalaron la app.

**Veredicto del verificador: confirmado.** Se intentó tumbar por el ángulo más prometedor —«no hay
auto-registro, las cuentas las aprovisiona el coach»— y no se sostiene: Apple no publica esa
excepción, y el registro de Firebase Auth se crea **de facto** dentro de la app en el primer
`signInWithEmailLink` (`WelcomeScreen.tsx:45`) o `signInWithPopup` (`WelcomeScreen.tsx:94`). Además,
el propio equipo ya diseñó la pantalla: `docs/design/fase3/Transversales - Experiencia.dc.html:259` y
`Ajustes (Coach) - Experiencia.dc.html:258` contienen «Eliminar tu cuenta / Esto no se puede deshacer.
Perderías, exactamente:» con el desglose de entrenos, revisiones, fotos e historial de peso. **Al
implementarlo, seguir ese diseño, no inventar otro.**

**Cambio propuesto.**

1. **UI.** Sección «Eliminar mi cuenta» dentro del Sheet de Ajustes, con doble confirmación
   (escribir el email) y reautenticación fuerte antes de llamar: para Google
   `reauthenticateWithCredential`; para quien entró por enlace mágico, reenviar el enlace y exigir
   volver por él. *Ojo al puntero*: la línea 437 es la apertura del `<Sheet>` y cae dentro del
   `<form>` de nombre/meta de peso — no editar a ciegas.
2. **Servidor, no cliente.** `firestore.rules:72` solo deja `allow delete: if isCoach()` sobre
   `user_profiles`, y muchas colecciones ni siquiera dan delete al dueño; borrar desde el cliente
   exigiría abrir reglas de borrado en ~35 colecciones, que es superficie de ataque nueva. Crear
   `api/delete-account.ts` con el patrón de `api/ai-chat.ts:49-52` (import dinámico de
   `firebase-admin/app` + `cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))`), verificar el ID
   token con `verifyFirebaseIdToken` (`api/ai-chat.ts:29`), recorrer el inventario con `BulkWriter`,
   borrar los prefijos de Storage con `bucket.deleteFiles({prefix})` y terminar con
   `getAuth().deleteUser(uid)`.
3. **Inventario a borrar** (cruzado entre los bloques 01 y 03, leído de `firestore.rules` y `src/db/`):
   - *doc-id = email*: `onboarding`, `gimnasios`, `roadmaps`, `nutritionPrograms`,
     `athleteDietConfigs`, `athleteNutritionConfigs`, `recipeFavorites`, `academyAccess`,
     `academyProgress`, `athleteCardioProfile`, `invites`.
   - *doc-id = uid*: `user_profiles`.
   - *por campo `userId`/`athleteId`/`email`*: `checkins`, `workoutLogs`, `workoutAssignments`,
     `diets`, `weeklyMenus`, `dietCompletionLogs`, `menuCompletionLogs`, `bodyweightLogs`,
     `bodyMeasurements`, `stepLogs`, `progressPhotos`, `photoAssignments`,
     `questionnaireAssignments`, `questionnaireResponses`, `exerciseNotes`, `mesocycles`,
     `weeklyChallenges`, `notifications`, `tasks`, `coachNotes`, `coachClientTasks`, `athleteStatus`,
     `coachReports`, `cardioAssignments`, `cardioSessions`, `cardioWeeklyGoals`, `hrTests`,
     `hrvReadings`, `aiChats`, `aiProposals`.
   - *Storage*: `progressPhotos/{email}/**`, `gymPhotos/{email}/**`, `questionnaireMedia/{email}/**`.
4. **URL web pública** (`01-2`, requisito de Play): publicar `/eliminar-cuenta` como **fichero
   estático en `public/`**, accesible sin app y sin login. Atención: `vercel.json` tiene el rewrite
   `{ "source": "/((?!api/).*)", "destination": "/index.html" }`, así que hoy cualquier ruta nueva
   serviría la SPA — es decir, el revisor vería una pantalla de login, que es exactamente lo que
   Google rechaza. Hay que excluir la ruta del rewrite.
5. **Decisión de producto pendiente** (`03-17`, ver checklist): `crmContactos`, `crmPagos`,
   `crmSuscripciones`, `crmServicios` y `crmReuniones` son contabilidad con obligación fiscal de
   conservación, y `firestore.rules:626` ya prohíbe borrar un pago en estado `pagado`. Recomendación
   de ambos bloques: **anonimizar** ahí (nombre, email, teléfono y DNI → identificador opaco
   `borrado_<hash>`, conservando importes y fechas) y **declararlo en la política de privacidad**.

**Esfuerzo:** 4-6 días (2-3 la función de servidor y su prueba, 1 la UI y la reautenticación, 1 la
página web, 1 la decisión de CRM y su redacción legal). Es la pieza más grande de toda la revisión.

---

### B-2 · No hay política de privacidad ni términos `01-6` `04-5`

**Síntoma.** Grep de `privacidad|privacy|términos|condiciones de uso|aviso legal|rgpd|gdpr` sobre
`src/`, `public/` e `index.html`: los dos únicos aciertos son «Términos de búsqueda» en
`src/ai/tools.ts:195` y un comentario en la línea 709, texto sin relación. `public/` solo tiene
iconos, `manifest.json`, `maquinas/` y `recetas/`. `find ios android -iname "*rivacy*"` no devuelve
nada. `vercel.json` no define ninguna ruta legal.

**Guía.** 5.1.1(i) exige el enlace **en los metadatos de App Store Connect y dentro de la propia
app**. La User Data policy de Play lo exige en la ficha y dentro de la app, más el formulario de
Data safety.

**Veredicto: confirmado.** No es «rechazo probable», es un envío que no arranca: la Privacy Policy
URL es campo obligatorio de App Store Connect. La única duda residual: si ya tuvieras una política
publicada en un dominio propio, la parte de metadatos estaría resuelta — pero seguiría faltando el
**enlace dentro de la app**, que sí está verificado que no existe.

**Cambio propuesto.** Redactar la política (responsable; base jurídica art. 6.1.b + consentimiento
explícito del art. 9.2.a para datos de salud; categorías de datos según el inventario de `04-19`;
subencargados Google/Firebase, Vercel y **Anthropic**; plazos de conservación; derechos con el
enlace de borrado de B-1; y la excepción de conservación fiscal del CRM). Publicarla en
`/privacidad` y unos términos en `/terminos`, con el mismo cuidado del rewrite de Vercel que en B-1.
Enlazarlas desde el pie de `WelcomeScreen` y desde el Sheet de Ajustes de `ProfileScreen`. *Ojo a
los punteros del hallazgo original*: `WelcomeScreen.tsx:116` **no** es «bajo el botón de Google», es
`});` dentro del `.catch()` de `handleGoogleSignIn`; el botón está más abajo en el bloque de render.

**Disparador reforzado que no hay que olvidar:** la app trata datos de salud (peso, nutrición, FC por
BLE), lo que en Play activa la categoría «Health and fitness» del Data safety y en Apple las
etiquetas de App Privacy. La política tiene que ser coherente con las dos declaraciones.

**Esfuerzo:** 1 día de redacción + 2 h de publicación y enlazado. Depende de la decisión de CRM
(B-1, punto 5) y del tipo de cuenta de desarrollador (`01-22`), porque el responsable del
tratamiento debe ser el mismo que publica.

---

### B-3 · Google Sign-In sin alternativa equivalente `01-3`

**Síntoma.** `WelcomeScreen.tsx:94` llama `signInWithPopup(auth, googleProvider)` y el botón
«Google Sign-In» se renderiza en las líneas 265-272 **sin ninguna condición de plataforma**, así que
aparece igual en la build de iOS. Grep de `OAuthProvider|apple\.com|SignInWithApple` sobre `src/`:
cero. `find ios -name '*.entitlements'`: vacío. El login con email/contraseña no cumple los tres
requisitos de 4.8 porque no permite mantener el correo privado.

**Veredicto: confirmado**, con un matiz importante: **4.8 no exige Sign in with Apple por nombre**,
exige *«another login service»* que cumpla tres propiedades. Hay por tanto **dos salidas, y la
decisión es de producto**:

- **Opción A — añadir Sign in with Apple.** Habilitar el proveedor en Firebase Auth, añadir la
  capability al target `ios/App` (crea `App.entitlements`, que hoy no existe), exportar
  `new OAuthProvider('apple.com')` junto a `googleProvider` en `src/firebase.ts:74`, y renderizar el
  botón con la misma prominencia cuando `Capacitor.getPlatform() === 'ios'`.
  **Prerrequisito duro: resolver antes A-1 (`01-4` / `03-7`), o el atleta con correo relay queda
  fuera.** Coste real: entitlements + proveedor + QA de un flujo de login nuevo + 3-5 días de
  migración de identidad.
- **Opción B — ocultar el botón de Google en iOS.** Con `Capacitor.getPlatform() === 'ios'` la app de
  iPhone pasa a usar exclusivamente el sistema propio (invitación por enlace + correo/contraseña) y
  cae dentro de la primera excepción de 4.8. Refuerza esta vía que **el popup de Google ya está roto
  en nativo** (B-4), es decir, hoy ese botón es una puerta muerta en iOS. Coste: horas.

Recomendación para la 1.0: **opción B**, y dejar por escrito la decisión. La A es la que hay que
tomar el día que quieras auto-registro real.

---

### B-4 · Google Sign-In no puede funcionar en iOS nativo `03-1`

**Síntoma.** En el iPhone, pulsar «Google Sign-In»: `signInWithPopup` no puede abrir ventana (el
WKWebView de Capacitor no soporta `window.open` con nombre y features; devuelve null →
`auth/popup-blocked`), entra al fallback de `WelcomeScreen.tsx:106`, y `signInWithRedirect` llama a
`_openRedirect` → `_originValidation` → `_validateOrigin` → `matchDomain`, que en
`node_modules/@firebase/auth/dist/esm/index-d90d2ee5.js` hace `if (!HTTP_REGEX.test(protocol)) return
false;` **para todos los dominios autorizados**. En iOS el origen es `capacitor://localhost`,
protocolo `capacitor:`, así que ninguno casa y sale `auth/unauthorized-domain`. **No se arregla
desde la consola**: añadir `capacitor://localhost` a dominios autorizados no sirve porque el filtro
es del SDK, no del servidor.

**Cambio propuesto (solo si se elige la opción A de B-3).** Ramificar por plataforma con
`Capacitor.isNativePlatform()` (el patrón ya está en `src/services/restTimerNotification.ts:10`). En
nativo, instalar `@codetrix-studio/capacitor-google-auth` o `@capacitor-firebase/authentication`,
obtener el idToken nativo y llamar
`signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`: el token se emite fuera del
webview y Firebase JS solo lo canjea, sin popup ni validación de origen. Requiere cliente OAuth iOS
en Google Cloud, `CFBundleURLTypes` con el `REVERSED_CLIENT_ID` en `Info.plist` (hoy el fichero no
tiene ningún `CFBundleURLTypes`) y `GoogleService-Info.plist` / `google-services.json` en los
proyectos nativos. En web se deja `signInWithPopup` tal cual. **Esfuerzo: 1-2 días** con la
configuración de consolas.

**Si se elige la opción B de B-3, este bloqueante desaparece con el botón.**

*Nota (`03-14`, sin verificar):* en Android el origen es `https://localhost`, que **sí** pasa el
`HTTP_REGEX`, y `localhost` está entre los dominios autorizados por defecto, así que el redirect
podría completarse. No se ejecutó. Si funciona, la corrección nativa se puede limitar a iOS.

**Reproducido en vivo (10 ago, post-síntesis).** Con la app compilada en Debug para el simulador de
iOS (iPhone 17 Pro, iOS 26.5) y lanzada fuera del proceso de los siete agentes, tocar «Google
Sign-In» deja el botón «Entrar» del formulario de email/contraseña — comparten el mismo estado
`loading` — en «Entrando…» de forma indefinida (esperado &gt;1 min sin resolver ni mostrar error).
El estado colgado sobrevivió incluso a matar y relanzar el proceso una vez antes de que un tercer
arranque en frío volviera a la pantalla limpia. Confirma el mecanismo descrito arriba con un síntoma
observable de usuario, no solo el análisis de código: no hay ningún mensaje de error, la app
simplemente se queda congelada. Sube el argumento a favor de la opción B de `B-3` — hoy ese botón no
solo está mal etiquetado, activamente rompe la pantalla de acceso.

---

### B-5 · El enlace mágico no se completa dentro de la app `03-2` `02-7` `03-16` `03-3`

Es **el único camino de alta de clientes**, y está roto en tres puntos independientes.

**Síntoma 1 — el enlace no abre la app.** `ios/App/App/` no contiene ningún `.entitlements`
(verificado con `ls` y con `grep CODE_SIGN_ENTITLEMENTS` sobre `project.pbxproj`), luego no hay
Associated Domains; `android/app/src/main/AndroidManifest.xml` no tiene ningún `<intent-filter>` con
`android.intent.action.VIEW` + `BROWSABLE`, luego no hay App Links. El enlace se abre en Safari, la
sesión se crea en el navegador, y la app recién instalada sigue sin sesión.
`ios/App/App/AppDelegate.swift:42` **sí** reenvía `continue userActivity` a
`ApplicationDelegateProxy`, o sea que el puente existe; sin entitlement el sistema nunca entrega el
`userActivity`.

**Síntoma 2 — aunque abriera, el receptor no funcionaría.** `WelcomeScreen.tsx:31` hace
`isSignInWithEmailLink(auth, window.location.href)`, y en nativo `window.location.href` es siempre
`capacitor://localhost/`, que nunca lleva `oobCode`. `@capacitor/app` **no está en `package.json`**,
así que no hay ningún `App.addListener('appUrlOpen', …)` que inyecte la URL real.

**Síntoma 3 (`03-3`, Alta) — invitar desde la app nativa falla.** `src/db/invites.ts:22-25` llama
`sendSignInLinkToEmail(auth, normalized, { url: window.location.origin, handleCodeInApp: true })`, y
en nativo ese origin es `capacitor://localhost`: Firebase devuelve `auth/invalid-continue-uri`, el
correo no sale y el modal pinta el error. Desde la web funciona porque el origin es el dominio de
Vercel.

**Cambio propuesto — las tres piezas son necesarias.**

1. `npm i @capacitor/app` y, junto al `useEffect` de `src/App.tsx:253`, registrar
   `App.addListener('appUrlOpen', ({url}) => { if (isSignInWithEmailLink(auth, url))
   completeInviteSignIn(emailGuardado, url) })`, cambiando la firma de `completeInviteSignIn`
   (`WelcomeScreen.tsx:41-58`) para que reciba la URL en vez de leer `window.location.href`.
2. **iOS.** Crear `ios/App/App/App.entitlements` con
   `com.apple.developer.associated-domains = [applinks:<dominio>]`, referenciarlo con
   `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` en las dos configuraciones del target
   (`project.pbxproj`, ~líneas 298 y 320), y servir `/.well-known/apple-app-site-association`
   (content-type `application/json`, sin extensión) con appID `<TEAM_ID>.com.danielenforma.app`.
3. **Android.** `<intent-filter android:autoVerify="true">` con VIEW/DEFAULT/BROWSABLE y
   `<data android:scheme="https" android:host="<dominio>"/>` en la `MainActivity`, más
   `/.well-known/assetlinks.json` con el SHA-256 de la firma de release.
4. **`03-3`.** En `src/db/invites.ts:23`, `url: import.meta.env.VITE_PUBLIC_APP_URL ??
   window.location.origin`, y añadir `iOS: { bundleId: 'com.danielenforma.app' }` y
   `android: { packageName: 'com.danielenforma.app', installApp: false }`.

**Bloqueado por Dani (`03-16`):** hacen falta el Team ID de Apple (10 caracteres), el SHA-256 del
certificado de firma de Play, y **decidir cuál es el dominio público definitivo** — hoy no está en
ninguna variable del repo. Sin esos tres datos, los ficheros de asociación no se pueden escribir con
valores reales. **Esfuerzo: 1-1,5 días** + verificación en dispositivo.

---

### B-6 · Faltan las purpose strings de cámara y fototeca `01-10` `02-1` `05-1`

**Síntoma.** `ios/App/App/Info.plist` solo declara `NSBluetoothAlwaysUsageDescription` (l.50) y
`NSBluetoothPeripheralUsageDescription` (l.52). No hay `NSCameraUsageDescription` ni
`NSPhotoLibraryUsageDescription` (0 coincidencias). Hay cinco `<input type="file" accept="image/*">`
en la app: `src/features/gimnasio/AddOwnMachineSheet.tsx:115` (con `capture="environment"`, va
**directo** a la cámara, así que ahí revienta siempre), `AddOwnMachineSheet.tsx:116`,
`src/features/gimnasio/AdminMaquinasTab.tsx:293`, `src/components/PhotosScreen.tsx:142` (fotos de
progreso) y `src/components/QuestionnaireWizard.tsx:281`. En iOS, tocar «Hacer foto» desde un input
dentro de WKWebView sin la cadena de propósito **termina el proceso al instante** (SIGABRT por TCC):
crash, no diálogo.

**Guía.** 5.1.1(i) (cadenas de propósito, y Apple rechaza las genéricas tipo «esta app usa la
cámara») y 2.1 (App Completeness: crash).

**Cambio propuesto.** Añadir a `Info.plist` antes de `</dict>`:

```xml
<key>NSCameraUsageDescription</key>
<string>En Forma usa la cámara para que puedas hacer tus fotos de progreso y fotografiar las máquinas de tu gimnasio.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>En Forma accede a tus fotos para que puedas subir tus fotos de progreso y las de tus máquinas.</string>
```

Y, relacionado (`02-22`, Media): el input del cuestionario acepta `video/*`, y «Grabar vídeo» abre la
cámara con audio, lo que exige además `NSMicrophoneUsageDescription`. O se añade, o se restringe el
`accept` de `QuestionnaireWizard.tsx:281` a `image/*` y se aplazan las respuestas en vídeo.

**Verificación pendiente, en serie:** `npm run build && npx cap sync ios`, abrir el workspace,
correr en simulador, Progreso → Subir foto → Hacer foto. Fallo = la app se cierra.
**Esfuerzo: 15 minutos** + la verificación.

---

### B-7 · Falta `PrivacyInfo.xcprivacy` en el target App `02-2` `01-17`

**Síntoma.** `find . -name '*.xcprivacy'` fuera de `node_modules` no devuelve nada; los únicos
manifiestos existentes son los de `@capacitor/ios`, que cubren el framework, **no el target de la
app**. Subir el `.ipa` → correo automático **ITMS-91053 «Missing API declaration»** y la build no
pasa a revisión, porque el binario usa APIs de motivo obligatorio (UserDefaults vía Capacitor y sus
plugins) sin declararlas.

**Cambio propuesto.** Crear `ios/App/App/PrivacyInfo.xcprivacy` y añadirlo al target App (Target
Membership: App), con:

- `NSPrivacyTracking = false`, `NSPrivacyTrackingDomains = []`.
- `NSPrivacyAccessedAPITypes`: una entrada `NSPrivacyAccessedAPICategoryUserDefaults` con
  `NSPrivacyAccessedAPITypeReasons = [CA92.1]`.
- `NSPrivacyCollectedDataTypes` coherente con `01-13`: `EmailAddress`, `Name`, `Health`, `Fitness`,
  `PhotosorVideos`, `OtherUserContent`, todos con `Linked = true`, `Tracking = false`, propósito
  `AppFunctionality`.

Firebase viaja como SDK JS dentro del bundle, no como framework nativo, así que **no aporta
manifiesto propio**: sus datos hay que declararlos aquí a mano. Los tres plugins nativos
(bluetooth-le, local-notifications, haptics) no traen `.xcprivacy` propio; al ser SPM locales no
exigen firma, y su uso de UserDefaults queda cubierto por la declaración de arriba.

**Verificación:** archivar y validar el `.ipa` desde Xcode y comprobar que no aparece ITMS-91053.
**Esfuerzo: 1 h**, dependiente de que `01-13` esté decidido.

---

### B-8 · El AAB de release sale sin firmar `02-3`

**Síntoma.** `android/app/build.gradle:20`: `buildTypes { release { minifyEnabled false;
proguardFiles ... } }` — no hay `signingConfig` ni bloque `signingConfigs` en todo el fichero.
`./gradlew bundleRelease` produce un AAB sin firmar y Play Console lo rechaza al subirlo. Añadido:
`android/.gitignore:57-58` tiene `*.jks` y `*.keystore` **comentados**, así que hoy un keystore
dejado en el repo se commitearía.

**Cambio propuesto.** Los pasos con contraseña son de Dani (ver checklist). En el repo:

1. `android/keystore.properties` (NO commitear) con `storeFile`, `storePassword`, `keyAlias`,
   `keyPassword`.
2. En `android/app/build.gradle`, antes del bloque `android`:
   `def kp = new Properties(); def kpf = rootProject.file('keystore.properties'); if (kpf.exists())
   kp.load(new FileInputStream(kpf))`; dentro de `android`, un `signingConfigs { release { … } }`
   condicionado a `kpf.exists()`, y `signingConfig signingConfigs.release` en `release`.
3. Descomentar `android/.gitignore:57-58` y añadir `keystore.properties` y `*.p12`.
4. **Activar Play App Signing** al crear la app: el `.jks` pasa a ser solo clave de subida y Google
   puede rotarla. Sin eso, perder el keystore = no poder actualizar nunca la app.

**Esfuerzo: 1 h.** Bloqueado por `02-4` (sin JDK no se puede ni comprobar que compila).

---

### B-9 · «Vínculo del correo electrónico» desactivado en Firebase Auth `01-16` `04-1` `05-15`

**Síntoma.** Heredado de `docs/QA-pendiente-dani.md § 1` y **sigue vivo**. `src/db/invites.ts:22`
llama `sendSignInLinkToEmail` y falla con `auth/operation-not-allowed` para cualquier correo. Como el
auto-registro se quitó a propósito (`WelcomeScreen.tsx:110-114`), no hay otro camino de alta.

**Efecto en cadena sobre esta misma revisión:** el recorrido «primera apertura → invitación → alta →
asistente de 6 pasos» no se puede recorrer hoy de punta a punta **por nadie**, así que `05-4` y `05-8`
no se han podido confirmar contra una cuenta nueva real, y todo el bloque 07 se quedó sin QA visual
del primer día (`07-19`).

**Acción de Dani.** Consola de Firebase → Authentication → Método de acceso →
Correo electrónico/contraseña → Editar → activar «Vínculo del correo electrónico (acceso sin
contraseña)» → Guardar. Después, Authentication → Settings → Authorized domains: añadir el dominio
de Vercel y `localhost`. Y **repasar a quién invitaste desde el 8 de agosto y reinvitarlo**.

---

## Detalle · Altas

Agrupadas por tema para que se puedan atacar juntas.

### A-1 · Identidad: todo se decide comparando cadenas de email `01-4` `03-7`

`src/App.tsx:72` (`OWNER_EMAIL`) y `src/db/profiles.ts:116` (`isDanitrviner`) resuelven el rol por
email; el mismo criterio está duplicado en `CheckInScreen.tsx:15`, `CoachesScreen.tsx:15`,
`AthleteRoadmapScreen.tsx:32`, `NutritionScreen.tsx:17`, `HrTestsPanel.tsx:9` y
`src/utils/ensureWeeklyChallenge.ts:18`. Las reglas atan los datos al email: `firestore.rules:11`,
`isOwnerEmail` (`:16-20`) gobierna doc-id = email en ~12 colecciones, y **`firestore.rules:65-66`
exige `exists(/invites/$(request.auth.token.email.lower()))`** para que el atleta pueda crear su
perfil; `storage.rules` ata `progressPhotos/{email}`, `gymPhotos/{email}` y
`questionnaireMedia/{email}` a `request.auth.token.email == email`.

**El nudo:** invitas a `maria@gmail.com`, María entra con Sign in with Apple ocultando su correo, su
token trae `xyz@privaterelay.appleid.com`, no existe esa invitación → `permission-denied` al crear el
perfil y la app queda inutilizable para ella. Si otro día entra con Google, aparece como una segunda
persona distinta. **Es prerrequisito de Sign in with Apple, no un extra.**

**Cambio propuesto:** migrar de email a UID con custom claims. (1) endpoint que asigne
`setCustomUserClaims(uid, { role: 'coach' })` una sola vez con el Admin SDK que ya está en
`api/ai-chat.ts:51`; (2) `isCoach()` pasa a `request.auth.token.role == 'coach'` en `firestore.rules`
y `storage.rules`; (3) sustituir las 8 constantes de email por `profile.role === 'coach'`; (4)
colecciones con doc-id = email → doc-id = uid, o campo `emailCanonico` rellenado por el servidor; (5)
invitación por **código opaco de un solo uso** en vez de indexada por email. Rutas de Storage por
UID, con migración de los objetos existentes. **Esfuerzo: 3-5 días** con migración de datos.

*Alternativa mínima si se descarta:* en el flujo de Apple, pedir el email de la invitación y enlazar
la credencial con `linkWithCredential` — pero entonces el correo real deja de estar oculto y hay que
decirlo en pantalla. Si se elige la **opción B de B-3** (sin Sign in with Apple), esta migración se
puede aplazar a la 1.1.

### A-2 · Datos de salud del atleta salen a Anthropic sin consentimiento `01-7` `04-6`

`get_client_overview` (`src/ai/tools.ts:54`) manda perfil, onboarding con **lesiones y alergias**,
tendencia de peso a 28 días, kcal de mantenimiento y adherencia; `get_checkins` (`:91`) peso, ánimo,
adherencia y notas libres; `get_questionnaire_trends` (`:104`) series de sueño, estrés, **dolor** y
perímetros; `get_diet` (`:79`) la dieta completa. Todo eso acaba como `tool_result` en el cuerpo que
`api/ai-chat.ts:130` manda a la Messages API. El atleta no lo sabe ni lo ha consentido, y Anthropic
no figura como subencargado en ningún sitio. Datos del art. 9 del RGPD a un tercero sin base jurídica
documentada. (Solo el coach dispara las llamadas — `api/ai-chat.ts:14` exige su email — pero el dato
tratado es del atleta.)

**Cambio propuesto:** (1) listar Anthropic PBC como subencargado en la política de B-2, con finalidad
y la nota de que no se entrena con datos de la API; (2) **aceptar el DPA de Anthropic** desde la
consola de la cuenta de API (acción de Dani); (3) casilla de consentimiento explícita y separada en
el onboarding, guardada como `consentimientoIA: { aceptado, fecha }` en `onboarding/{email}`, y que
`src/ai/tools.ts` no devuelva datos de atletas sin ella; (4) filtrar email y nombre completo de las
respuestas de las tools, sustituyéndolos por el alias que el coach ya ve; (5) declararlo en App
Privacy («Health & Fitness», recopilado y vinculado) y en Data safety («Shared with third parties»).

### A-3 · Seguridad de reglas y cuota `04-3` `04-10` `04-7` `04-9` `02-18` `01-8` `02-13` `04-21` `04-22`

- **`04-3` — `questionnaireMedia` sin `email_verified`.** Es el mismo agujero que se tapó en
  `bodyMeasurements` el 8 ago y quedó en un solo sitio: `storage.rules:61, 63 y 67` comparan
  `request.auth.token.email == email` a pelo, mientras `progressPhotos` (l.32) y `gymPhotos` (l.46) sí
  usan `isOwnerEmail()`. Ataque: el coach invita a `victima@x.com`, que aún no se ha registrado; el
  atacante llama a `accounts:signUp` de Identity Toolkit con ese correo (quitar el registro de la UI
  no cierra el endpoint), no verifica nada, y con ese token lee, sobrescribe y borra vídeo corporal
  ajeno. **Arreglo de 3 líneas** copiando el bloque de `gymPhotos`, y `firebase deploy --only storage`.
- **`04-10` — 12 colecciones con `allow read: if request.auth != null`** y nada más: `exercises`
  (97), `maquinas` (108), `workouts` (129), `foodItems` (154), `mesocycleTemplates` (216), `recipes`
  (227), `questionnaires` (304), `challengeTemplates` (388), `resources` (433), `onboardingTemplates`
  (443), `academyCourses` (511), `academyLessons` (515), más `maquinas/{fileName}` en
  `storage.rules:56`. Crear el UID es gratis. Un bucle de `getDocs(collection(db,'recipes'))` son
  millones de lecturas facturables en una hora. Arreglo: añadir
  `&& exists(/databases/$(database)/documents/user_profiles/$(request.auth.uid))`, probándolo antes
  en el emulador porque afecta al atleta recién invitado. Y **presupuesto con alerta en Google Cloud
  Billing**, que no impide el abuso pero lo convierte en un aviso en vez de una factura.
- **`04-7` / `04-8` — CSP.** `vercel.json:16` declara la cabecera como
  `Content-Security-Policy-Report-Only`, sin `report-uri`: no bloquea nada y ni siquiera informa. En
  nativo es peor: `index.html` no tiene `<meta http-equiv="Content-Security-Policy">` y las cabeceras
  de Vercel no llegan al WebView, así que el `.ipa` y el `.aab` corren **sin CSP alguna** — y es ahí
  donde se pinta texto generado por un modelo a partir de campos que escribe el atleta. Antes de
  pasar a enforce hay que corregir `04-8`: `frame-src https://en-forma-.firebaseapp.com` no es ningún
  dominio (el real es `fleet-operator-z5xj8.firebaseapp.com`) y faltan `object-src 'none'` y
  `base-uri 'self'`.
- **`04-9` / `02-18` — App Check.** Hoy no se inicializa: `src/firebase.ts:84-90` solo llama a
  `initializeAppCheck` si existe `VITE_RECAPTCHA_SITE_KEY`, y esa variable no está en ninguna parte.
  Y aunque se pusiera, **reCAPTCHA v3 no sirve dentro de un WebView de Capacitor**: los proveedores
  válidos son App Attest (iOS) y Play Integrity (Android). **Nunca activar Enforce antes de instalar
  el plugin nativo**, o la app de las tiendas deja de hablar con Firestore por completo. Orden
  correcto en el checklist.
- **`01-8` / `02-13` — `allowBackup="true"`.** `AndroidManifest.xml:4`, sin `fullBackupContent` ni
  `dataExtractionRules`. Auto Backup copia a la cuenta de Google el localStorage/IndexedDB del
  WebView y la caché persistente de Firestore (`src/firebase.ts:66`): check-ins, peso, perímetros,
  respuestas de cuestionario **y el token de sesión**. Restaurar en otro dispositivo puede reinstaurar
  una sesión ya cerrada. Con datos de salud, lo defendible es `false`.
- **`04-21` / `04-22`** — comprobar si existe la base Firestore `(default)` con reglas de «modo de
  prueba», y activar copias de seguridad programadas (hoy no hay ninguna; art. 32.1.c del RGPD).
  Ambas son de consola, van en el checklist.

### A-4 · Build nativo: lo que se subiría hoy no es la app de hoy `02-6` `04-4` `06-18` `02-5` `02-4` `02-8` `02-12` `02-10` `07-14`

- **Bundle obsoleto (los tres bloques lo encontraron por separado).** `dist/index.html` es del 8 ago
  19:35 y referencia `assets/index-nV9eOjAA.js` con 165-167 ficheros. `ios/App/App/public` es del
  **22 de julio 10:14** (66 ficheros, `index-Ct4jTZHw.js`) y `android/.../assets/public` del **21 de
  julio 18:04** (54 ficheros). Archivar hoy sube la app **anterior a las doce fases del Design
  System**, al merge de cuestionarios y al arreglo de `bodyMeasurements`. Se confirmó leyendo el
  bundle embebido: su inicialización de Firebase va de `getStorage()` directo a `GoogleAuthProvider`,
  sin la llamada a `initializeAppCheck` que sí está en `src/firebase.ts:86`. Además, ni
  `ios/App/App/public/` ni el equivalente de Android contienen la carpeta `recetas/`, que
  `CoachesScreen.tsx:397` pide con `fetch('/recetas/00_indice.json')` → 404 contra
  `capacitor://localhost` y el recetario sale vacío en nativo. **Arreglo: `npm run build && npx cap
  sync ios && npx cap sync android` como paso obligatorio del guion de release** (hoy no está
  automatizado en ningún script de `package.json`).
- **`02-5` — ningún plugin cableado en Android.** `android/capacitor.settings.gradle` solo incluye
  `:capacitor-android`, el bloque `dependencies` de `capacitor.build.gradle` está vacío, y
  `android/app/src/main/assets/capacitor.plugins.json` contiene literalmente `[]`. Instalar ese AAB y
  abrir Cardio → `BleClient.initialize()` rechaza con «BluetoothLe plugin is not implemented on
  android». Lo arregla el mismo `cap sync`; conviene añadir `"prerelease": "npm run build && npx cap
  sync"` a `package.json`.
- **`02-4` — no hay JDK en la máquina.** `java -version` → «Unable to locate a Java Runtime»;
  `$JAVA_HOME` vacío; `capacitor.build.gradle:5-6` exige `VERSION_21`. Es el mismo bloqueo de
  `docs/WIDGET_BLOQUEO_TODO.md`, vigente. Consecuencia honesta: **`RestTimerService.kt` y
  `RestTimerPlugin.kt` no han pasado nunca por el compilador**, y «Android compila» es una suposición.
- **`02-8` — firma iOS.** `project.pbxproj:214` y `:271` fijan `CODE_SIGN_IDENTITY = "iPhone
  Developer"` (nombre retirado; hoy es «Apple Development»/«Apple Distribution») y las
  configuraciones del target (l.298, l.320) tienen `CODE_SIGN_STYLE = Automatic` **sin
  `DEVELOPMENT_TEAM`**: `xcodebuild archive` falla con «Signing for "App" requires a development
  team».
- **`02-12` — `ACCESS_FINE_LOCATION` se cuela.** El manifiesto de la app está bien
  (`BLUETOOTH_SCAN` con `neverForLocation`), pero
  `node_modules/@capacitor-community/bluetooth-le/android/src/main/AndroidManifest.xml` declara
  `ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION` **sin `maxSdkVersion`**, y el manifest merger las
  incorpora al AAB. Play detecta ubicación precisa y exige el formulario de declaración de permisos
  de ubicación, más declararla en Data safety, para una app que no usa ubicación. Arreglo: `xmlns:tools`
  + `<uses-permission … android:maxSdkVersion="30" tools:node="replace" />` para las dos.
- **`02-10` / `07-14` — landscape declarado sin soportarlo.** `Info.plist:35-40` declara las tres
  orientaciones de iPhone y `:41-47` las cuatro de iPad, y no hay ningún lock en `src/`
  (`grep 'orientation'` solo devuelve una prop de Recharts). El breakpoint del layout es `md`
  (768 px), así que un iPhone 15 Pro Max en apaisado (932×430) **cruza el breakpoint y renderiza la
  maqueta de escritorio**: cabecera de 78 px más barra lateral de 280 px `h-screen` dentro de una
  ventana de 430 px de alto. Un revisor gira el dispositivo de serie. Decisión en el checklist.

### A-5 · Pérdida de datos y mentiras al usuario `05-2` `05-3` `05-5` `05-4` `05-7` `05-11` `03-6` `03-5` `04-14`

Este grupo es el que más daño hace a un cliente real, aunque no lo vea el revisor.

- **`05-2` — «Guardar» se cuelga para siempre sin red.** Con `persistentLocalCache`
  (`src/firebase.ts:62-67`), `addDoc`/`setDoc` devuelven una promesa que solo resuelve cuando el
  servidor confirma: sin red **no resuelve nunca y tampoco lanza**. Modo avión → entreno → «Terminar»
  → `TrainingScreen.tsx:342` se queda en `await createWorkoutLog(...)`, el botón en spinner
  indefinido, sin toast ni celebración, y el atleta acaba matando la app. El repo **ya resolvió esto,
  pero solo en el CRM**: `src/db/crm.ts:39-63` define `conTimeout()` (8 s) y `EscrituraEncolada`, y se
  aplica en 15 sitios de ese fichero y en **ninguno** de los otros 18 de `src/db/`. Arreglo: mover
  `conTimeout` a `src/db/core.ts` y envolver como mínimo `training.ts:486`, `onboarding.ts:64` y
  `questionnaires.submitResponse`, tratando `EscrituraEncolada` como éxito diferido igual que hace
  `PagoModal.tsx:79`.
- **`05-3` — el aviso rojo nunca sale cuando de verdad no hay conexión.** `LocalModeBanner.tsx:24`
  solo se pinta si `isLocalBypassActive()`, y esa bandera solo la enciende un `catch` de Firestore. Con
  caché persistente, sin red no hay `catch`: las escrituras se encolan y las lecturas las sirve la
  caché. `grep navigator.onLine` sobre `src/` → **0 resultados**: no hay ninguna otra detección de
  conectividad en toda la app. Hace falta un tercer estado «encolado», alimentado por los listeners
  `online`/`offline` y por el contador de `EscrituraEncolada`, con texto distinto y en tono aviso, no
  rojo de error.
- **`05-5` — se pierden todas las series si iOS mata la app.** `TrainingScreen.tsx:172` guarda las
  series en `useState` y la única escritura es `handleFinish` (l.342). 40 minutos de sesión, una
  llamada larga, y las 15 series no existen en ningún sitio. En un gimnasio con la pantalla apagada
  entre series, ese es el escenario normal. Arreglo: persistir la sesión en curso en localStorage en
  cada cambio y restaurarla al montar.
- **`05-4` — el alta pierde los 6 pasos.** `AthleteOnboardingWizard.tsx:96-118` mantiene los 18
  campos en `useState` y no hay ni una llamada a localStorage. El contraste está en el mismo repo:
  `QuestionnaireWizard.tsx:107-113` **sí** autoguarda borrador. Es el recorrido que decide si el
  cliente se queda.
- **`05-7` — `NaN` en Firestore.** `QuestionnaireWizard.tsx:258` y `:271` hacen
  `parseFloat(e.target.value)`; con el campo vacío eso es `NaN`. La guarda de obligatoriedad (l.176) y
  el filtro del payload (l.189) comparan solo con `undefined`, así que el `NaN` **atraviesa las dos** y
  el coach ve «NaN» en la revisión. En `persistirMediciones` (l.149) sí hay `isNaN`, así que la
  medición se descarta en silencio: la respuesta dice que hay dato y la serie de perímetros no lo
  tiene. Mismo origen que `05-9`: teclear el punto decimal deja el campo en `NaN`.
- **`05-11` — «no tienes fotos» cuando en realidad falló la lectura.** `src/db/media.ts:15-19` hace
  `console.warn` y `return []`, sin `setLocalBypassMode` y sin copia local (es el único módulo del
  atleta sin respaldo). `PhotosScreen.tsx:153` lo interpreta como vacío y pinta «Sube tu primera foto
  para empezar a registrar tu evolución». El atleta cree que se han borrado. Lo que no puede quedarse
  es un array vacío indistinguible de «no tiene fotos».
- **`03-6` — lo escrito en modo local nunca vuelve.** `src/db/training.ts:468-476` crea el log con id
  `local_log_<timestamp>` solo en localStorage; cuando Firestore vuelve, `getWorkoutLogs` (`:453-460`)
  guarda `[...local, ...logs]` pero **devuelve solo `logs`**. El entrenamiento deja de verse y nunca
  llega al coach. No hay ningún mecanismo de reenvío en todo el repo. La salida limpia es apoyarse en
  la cola offline que Firestore **ya tiene activada** y que `forceLocalOnly` gobierne solo lecturas.
- **`03-5` / `04-14` — cerrar sesión no limpia nada.** `ProfileScreen.tsx:168-175` hace solo
  `signOut(auth)`, y `onLogOut` es literalmente `() => setCurrentUser(null)` (`src/App.tsx:671`). No
  hay `queryClient.clear()` en ningún sitio del repo, el `QueryClient` se crea una vez en
  `src/main.tsx:14`, quedan ~50 claves `enforma_*` en localStorage **y muchas son globales, no por
  usuario** (`enforma_checkins`, `enforma_workout_logs`, `enforma_onboarding_v1`,
  `enforma_bodyweight_v1`, `enforma_coach_reports_v1`, `enforma_ai_chats_v1`), y la caché persistente
  de Firestore deja peso, perímetros, cuestionarios, dietas y notas en IndexedDB. En un móvil
  compartido, o en tu propio iPhone cuando entras como atleta de prueba, es fuga real de datos de
  salud de otra persona. Arreglo: `queryClient.clear()`, `terminate(db)` +
  `clearIndexedDbPersistence(db)` en try/catch, barrido de las claves `enforma_*` y `window.location.reload()`.
  Y mover la limpieza dentro de `onLogOut` para que corra **también cuando `signOut` lanza** (hoy el
  catch se lo traga y ni siquiera se llama).

### A-6 · Cálculo clínico incorrecto en el alta `05-8`

`AthleteOnboardingWizard.tsx:141`: `const targetCalories = 2000;` con reparto fijo 40/30/30. Los cinco
datos necesarios (sexo, edad, peso, altura, actividad) se recogen en los pasos 1 y 5, se guardan, y
**no se usan**. Mujer de 55 kg, 160 cm, 52 años, sedentaria, objetivo reducir grasa → 2000 kcal,
unas 700 por encima de su mantenimiento estimado. Y ese número es el que se le enseña en
`NutritionPlansScreen.tsx:589`, el que ve el coach en `ClientReviewsPanel.tsx:600` y el que consume la
IA en `src/ai/tools.ts:383`. **La función correcta ya existe y la usa el formulario del coach**:
`estimateMaintenanceKcal` en `src/utils/energyCalc.ts:44`, con `GOAL_ADJUSTMENTS` en la l.12.
Alternativa de producto: no escribir `targetCalories` en el alta y mostrar «pendiente de tu coach»
en vez de un 2000 inventado.

### A-7 · Arranque, coste de Firestore y fluidez `06-1` `07-5` `06-2` `06-5` `06-6` `06-11` `06-12` `06-13` `06-15` `06-20`

- **`06-1` / `07-5` — la fuente de iconos viene de Google.** `index.html:16` carga Material Symbols
  desde `fonts.googleapis.com`, marcado `renderBlockingStatus: "blocking"`, **572 ms medidos con
  banda ancha y latencia cero**: `domInteractive` 188 ms pero `domContentLoaded` 798 ms, o sea el 76 %
  del arranque es esperar a Google. En un sótano de gimnasio sin datos, la pantalla se queda en el
  fondo hasta que expira el timeout de red de WKWebView, y cuando pinta, los 590 iconos salen como
  **texto de la ligadura** («fitness_center», «arrow_back», «close»), lo que desmonta la barra
  inferior y las cabeceras. `.ui-icon` (`src/index.css:517`) no declara ninguna familia de reserva.
  Las otras tres fuentes ya están empaquetadas con `@fontsource`. Arreglo: empaquetarla también, o
  subsetear a las ~120 ligaduras reales.
- **`06-2` / `06-20` — el coste de Firestore.** Montar `ClientsScreen` (pantalla de aterrizaje del
  coach) dispara `getAllUserProfiles()` + N × `getWorkoutAssignments` + N × `getWorkoutLogs`, y
  `getWorkoutLogs` (`src/db/training.ts:453-455`) es un `where('athleteId','==',x)` **sin `limit`**:
  todos los logs de toda la vida del atleta. Con 30 atletas, ~5.700 documentos por montaje, para
  pintar **dos números por tarjeta**. Con `staleTime: 60_000` y `refetchOnWindowFocus` en su valor por
  defecto (`true`, no se sobrescribe en ningún sitio), cada vuelta al primer plano pasado un minuto lo
  repite entero. Estimación agregada: **~3,3 M lecturas/mes con 31 usuarios**, 60 veces la cuota
  gratuita diaria ya el primer día — lo que encaja con el susto de cuota que recoge el histórico del
  repo. Marcado *sospecha* porque los conteos por atleta son supuestos, no medidos contra producción.
  Arreglo en tres pasos: techo temporal + `limit(60)` + índice compuesto `workoutLogs (athleteId ASC,
  date DESC)` (hoy `firestore.indexes.json` solo tiene índices de `recipes`, `coachReports` y
  `crmServicios`); `enabled: !athleteId` en los dos `useQueries` de `ClientsScreen.tsx:52-67`; y
  `staleTime: 10 min`, `gcTime: 30 min`, `refetchOnWindowFocus: false` en `src/main.tsx:16-19`.
- **`06-5` — el arranque del atleta va en serie.** `getOrCreateUserProfile` → `getOnboarding` →
  `getGimnasio`, tres viajes encadenados antes de que Home se monte, y un `setTimeout(() =>
  setLoading(false), 8000)` que deja al usuario **8 segundos exactos** delante de «Cargando tu
  sesión…» si Firebase no contesta. Paralelizar con `Promise.all`, bajar el tope a 3 s, y desde 1,5 s
  ofrecer «Entrar sin conexión».
- **`06-6` — 620 KB al tocar «Perfil».** `ProfileScreen.tsx:7-9` importa estáticamente
  `BodyweightPanel`, `BodyMeasurementsPanel` y `QuestionnaireChartsPanel`, que arrastran 344 KB de
  recharts. El atleta los paga aunque entre solo a cambiar el avatar. `React.lazy` + `Suspense`.
  Mismo patrón en `ClientHub` (`06-7`, 1 MB en la ruta del coach).
- **Re-renders (`06-11`, `06-12`, `06-13`).** `React.memo` aparece **cero veces en todo `src/`**.
  Consecuencias medibles por lectura: `OnboardingForm` reconcilia sus 1.332 líneas en cada pulsación
  de tecla (22 controles en un solo `useState`); el cronómetro de descanso redibuja las 1.069 líneas
  de `TrainingScreen` una vez por segundo — 120 re-renders del árbol completo por descanso, justo
  mientras el atleta apunta repeticiones; y `CardioScreen` reconstruye sin `useMemo` un array de hasta
  900 puntos y lo pasa a un `LineChart` de recharts **cada segundo durante una hora**, con la banda BLE
  conectada: CPU sostenida, teléfono caliente, batería.
- **`06-15` — la galería descarga ~10 MB.** Las fotos se suben a 1600 px (correcto para comparar)
  pero no se genera ninguna miniatura, y `PhotosScreen.tsx:174` las mete en huecos de 48×64 px **sin
  `loading="lazy"` y sin cortar la lista**. Con 40 fotos, además de los 10 MB de red, WebKit decodifica
  40 mapas de bits de ~10 MB cada uno: es la causa clásica de que iOS mate la app por memoria. De 53
  `<img>` en todo `src/`, solo 3 llevan `loading`.

### A-8 · Presentación en el dispositivo `07-1` `07-2` `07-3` `07-4` `07-6` `07-7` `07-9`

- **`07-1` — nadie reserva la safe area.** `index.html:5` declara `viewport-fit=cover` y en Capacitor 8
  el WKWebView **es la vista raíz**, así que ocupa el notch. En todo `src/` hay 8 usos de
  `env(safe-area-inset-*)` y **ninguno es `-top`** salvo `TourOverlay` y `cardio/LiveSession`: la
  cabecera global (`src/App.tsx:522`) se dibuja en los primeros 70 px, donde están el reloj, la
  batería y la cobertura. En Android con targetSdk 36 el edge-to-edge es obligatorio y pasa lo mismo.
- **`07-2` — el aviso más importante de la app es el peor colocado.** `LocalModeBanner` es
  `fixed top-0 z-[100]` sin safe area: el texto rojo arranca en y=0, detrás del reloj, y **tapa** la
  cabecera en vez de empujarla. Además `z-[100]` salta la escala de capas documentada en
  `src/index.css:466`.
- **`07-3` — la primerísima pantalla del atleta.** El bloque de progreso del onboarding arranca con
  `pt-8` (32 px), así que la fila «logo + Paso 3 de 6» queda íntegramente detrás de la isla dinámica.
  Y el pie (`pb-10`) deja 6 px de holgura sobre el indicador de inicio.
- **`07-4` — la tabla de series no cabe en ningún iPhone.** `TrainingScreen.tsx:659` es
  `min-w-[480px]` dentro de un ancho útil de 343-361 px. La columna que se queda fuera es la última:
  **«Hecha»**, la casilla que el atleta pulsa una vez por serie, con las manos ocupadas. Hay que
  arrastrar la tabla en horizontal cada vez, dentro de una página que ya scrollea en vertical.
- **`07-6` — barra de estado invisible en modo claro.** La app es oscura siempre, pero `Info.plist`
  no declara `UIStatusBarStyle` ni `UIUserInterfaceStyle`, así que `CAPBridgeViewController` se queda
  con `.default`, que sigue al sistema: con el iPhone en claro, el reloj y la batería se pintan en
  negro sobre el `#050505` de la app. En Android, `SystemBars` por defecto resuelve a `STYLE_LIGHT`
  fuera del modo noche, mismo resultado. Añadido: `styles.xml:5` hereda de
  `Theme.AppCompat.Light.DarkActionBar` y `LaunchScreen.storyboard:18` usa `systemBackgroundColor`,
  blanco en modo claro → destellos blancos al rotar y al aparecer el teclado.
- **`07-7` — la pantalla de acceso enseña códigos crudos.** `WelcomeScreen.tsx:106`, `:113`, `:144` y
  `:84` pintan «(auth/network-request-failed)» y `err.message`, que en Firebase SDK 12 es texto en
  inglés. El repo **ya tiene el traductor**: `src/utils/erroresFirestore.ts`, con entradas específicas
  para `auth/operation-not-allowed`, `auth/too-many-requests` y `auth/invalid-action-code`. Es la
  única pantalla que no lo usa, y es justo donde vive el bloqueante B-9.
- **`07-9` — no hay gestión del botón Atrás.** No existe `@capacitor/app` ni un solo listener de
  `backButton`/`popstate`. En Android, con un Sheet abierto, Atrás no cierra el overlay sino que
  navega; en la pantalla raíz cierra la app sin aviso, **incluso en mitad de un entrenamiento con
  series sin guardar** (que por `05-5` se pierden). En iOS el gesto de borde no hace nada.

---

## Detalle · Medias, Bajas e Info destacables

### El aviso médico: qué era y qué no `01-5` — **refutado como bloqueante, queda en Media**

Merece explicación propia porque el material de partida lo traía como Bloqueante y el verificador lo
tumbó.

**Lo que decía el hallazgo:** «cero avisos médicos en texto de interfaz» y rechazo por 1.4.1.
**Lo que se encontró al verificar:** el síntoma es literalmente falso. Hay al menos dos cadenas
visibles al atleta, **en las dos superficies de mayor riesgo**:

1. `src/components/HrTestsPanel.tsx:167-178` — un **cuestionario PAR-Q completo** que bloquea la
   pantalla antes de cualquier test de esfuerzo alto (`if (activeTest.highEffort && !parqPassed)`),
   con el texto «Este test es de esfuerzo alto. Si respondes SÍ a cualquiera, no continúes y consulta
   con un médico antes de hacerlo» y preguntas explícitas sobre problema cardíaco y medicación. Se
   renderiza en la app del atleta vía `CardioScreen.tsx:719`.
2. `src/utils/micronutrients.ts:107` — el semáforo de micronutrientes se etiqueta a sí mismo «No
   sustituye una analítica», y ese texto se pinta en `NutritionAnalysisPanel.tsx:238`.

El grep original falló porque buscaba «consulta a tu médico» y el código dice «consulta con un
médico». Sobre la guía: 1.4.1 usa **«should», no «must»**, y su encabezado acota el supuesto a apps
médicas que diagnostican o tratan; lo que sí es «must» en ese apartado (medir tensión, glucosa o SpO2
con los sensores del dispositivo) no aplica — la FC viene de una banda BLE externa. Mifflin-St Jeor,
Keytel y e1RM son estimaciones estándar presentes en cualquier app de fitness de la tienda.

**Lo que sobrevive, y sigue mereciendo la pena:** no existe un aviso **global** de «esto no es consejo
médico» ni un consentimiento registrado, y la app sí recoge medicación, lesiones y cirugías recientes
y sí calcula kcal, déficit y progresión de cargas. Cerrar ese hueco es recomendable por
responsabilidad civil en España/UE y por protegerte a ti, no por la tienda. **El trabajo real es
menor del que pedía el hallazgo:** (a) una línea permanente al pie de `NutritionHubScreen` y de la
ficha de mesociclo, y (b) opcionalmente el consentimiento con fecha y versión en el onboarding
—donde el gate ya existe en `src/App.tsx:418`— con casilla separada de la del tratamiento por IA
(A-2). *Y la ancla del hallazgo (`src/types.ts:632`) no es un sitio de defecto: es la declaración del
campo `takesMedication?: boolean`, ahí no hay nada que arreglar.*

### Resto de Medias, en una línea cada una

| ID | Qué hacer |
|---|---|
| `01-11` | `CFBundleDevelopmentRegion` a `es` y declarar Español (España) como idioma principal; si no, la ficha sale rotulada en inglés con contenido en español. |
| `01-14` | Decidir el cuestionario de edad: «Yes» a Medical/Treatment Information, «No» al resto → 12+; en Play, «Health and Fitness» + control de peso + target 18+. |
| `01-21` / `02-9` | `NSSupportsLiveActivities=true` sin extensión (`grep -c RestTimerWidget project.pbxproj` → 0; el único `.swift` del target es `AppDelegate.swift`, al contrario de lo que afirma `docs/WIDGET_BLOQUEO_TODO.md`). Camino corto: borrar las líneas 55-61 del `Info.plist` y corregir ese documento. El argumento de 4.2 se apoya en lo demostrable: BLE con banda real, notificaciones locales y hápticos. |
| `02-11` / `07-15` | `TARGETED_DEVICE_FAMILY "1,2"` obliga a capturas y revisión de iPad para un layout hecho a 375 px. Camino corto: `"1"` y borrar `UISupportedInterfaceOrientations~ipad`. |
| `02-15` | `minifyEnabled true` + `shrinkResources true` con las reglas de ProGuard para Capacitor; **no activarlo a ciegas en la primera subida**, exige prueba funcional del AAB firmado. |
| `02-16` | 21 MB de recetas dentro del binario (27 MB de `dist`). No es rechazo; para la 1.1, servirlas desde Storage o Vercel. |
| `02-17` | `VITE_AI_PROXY_URL` no está en `.env.example`: un build en máquina limpia hornea `/api/ai-chat`, que en nativo resuelve a `capacitor://localhost/api/ai-chat` → 404 silencioso. Documentarla y fallar ruidosamente en nativo. |
| `02-22` | `NSMicrophoneUsageDescription`, o restringir el `accept` del cuestionario a `image/*`. |
| `03-8` | El error de `getRedirectResult` solo va a `console.error`: el usuario vuelve al login sin explicación y en nativo no tiene consola. Pasarlo a estado y pintarlo. |
| `03-9` / `07-17` | El logo de Google se descarga de gstatic.com en la primera pantalla: hueco sin red, y petición a un tercero antes de consentir nada. Incrustarlo en `public/`. **Reproducido en vivo:** en el simulador de iOS, con red disponible, el icono se ve roto (recuadro azul con «?») en las tres capturas tomadas — no es solo un riesgo de hueco sin conexión, hoy se ve así incluso con conexión. |
| `03-11` | Crear un usuario a mano en la consola sin verificar el correo lo deja **encerrado** por `email_verified` en `firestore.rules:16-20`. `sendEmailVerification` no está importado en ningún sitio del repo. Añadir pantalla «Verifica tu correo» y documentarlo. |
| `04-11` | `verifyFirebaseIdToken` no mira `payload.email_verified`, al contrario que `isCoach()`. Una línea. |
| `04-12` | CORS refleja cualquier `Origin`. Lista blanca, **incluyendo `capacitor://localhost` y `https://localhost`** o el asistente deja de funcionar en nativo. |
| `04-13` | El tope diario de IA es lectura + escritura sin transacción y con fail-open: si Firestore falla o falta `FIREBASE_SERVICE_ACCOUNT`, no hay tope. `runTransaction` + 429 + fail-closed, y tope de gasto en la consola de Anthropic. |
| `04-15` | `system` y `tools` llegan del cliente sin validar y se reenvían con `as never`: un XSS en la sesión del coach = uso libre de la API key. Validar tamaños, o mover `systemPrompt.ts` al servidor. |
| `04-21` / `04-22` | Base `(default)` y copias de seguridad: consola, ver checklist. |
| `05-6` | El descanso cuenta con `setTimeout` encadenado; iOS suspende timers en segundo plano, así que al volver marca la hora congelada mientras la notificación nativa ya sonó. Guardar `endsAt` en vez de segundos restantes. |
| `05-9` / `07-12` | 74 `type="number"` sin `inputMode`. Con teclado español la coma no entra y `TrainingScreen.tsx:316` hace `parseFloat('') \|\| 0` → **serie registrada con 0 kg** en el histórico, el PR y el tonelaje. Prioridad: peso y repeticiones de serie, peso y altura del alta. |
| `05-10` | Dos definiciones de «hoy»: `trainingWeek.ts:14` local y `scheduleEngine.ts:19` UTC, con 38 apariciones de `toISOString().split('T')[0]`. Entre las 00:00 y las 02:00 en España no coinciden: la sesión de hoy no se marca, y una medición corporal se archiva con la fecha de ayer **pisando la de ayer**. |
| `05-12` | El id de foto es `email_date_view`: subir una segunda foto del mismo día y vista **machaca la anterior sin avisar**, y la fecha se elige a mano. |
| `05-13` | Vídeo de cuestionario sin tope de tamaño, con `uploadBytes` no reanudable, sin progreso y sin cancelar. Un minuto en 4K son ~400 MB. |
| `05-14` | 384 pruebas en verde y `tsc` limpio, pero **cero pruebas de componente** (`find src -name '*.test.tsx'` → 0), cero de escritura real y **cero de reglas** (`firebase.json` no tiene bloque `emulators`). Los tres caminos que más daño hacen no tienen cobertura de ningún tipo. |
| `06-3` | Abrir «Rutinas» lee `exercises` **tres veces** (120 lecturas): `seedExercisesIfEmpty` invalida la caché y hace dos `getDocs` aunque no siembre nada. |
| `06-4` | Cada arranque lee los check-ins **dos veces** y, la primera vez de un atleta real, **siembra 3 check-ins ficticios** (peso 77,2 kg, «Semana de adaptación pesada», feedback inventado). |
| `06-7` / `06-8` / `06-9` / `06-10` | Peso del bundle: 1 MB en la ruta del coach por imports estáticos de los ocho paneles; Analytics y App Check empaquetados enteros estando apagados; `firebase/storage` en el chunk de arranque con `modulepreload`; **868 KB de fuentes** con 452 KB de `.woff` que ningún dispositivo soportado usa y 264 KB de cirílico y vietnamita. (IBM Plex Mono **sí** hace falta: 1.028 usos de `font-mono`.) |
| `06-14` | `useScrollEdgeMask` hace `setState` con objeto nuevo en cada evento de scroll → re-render por frame en `Tabs` y en el `DataTable` del CRM. Devolver `prev` cuando no cambia. |
| `07-8` | 13 `window.confirm`. En iOS, Capacitor los pinta con botones **«Cancel» y «Ok» en inglés** y sin marcar cuál es peligroso, en una app íntegramente en español. Ninguna ofrece deshacer. |
| `07-10` | Cerrar de Sheet y Dialog 36×36, campana 32×32, botón de IA 32×32, y el **avatar es un `div` de 24×24 con `onClick`**: sin rol, sin foco, sin nombre accesible — con VoiceOver no existe. Mínimo de Apple 44, de Android 48. |
| `07-11` | `ink-3` da 4,17:1 (por debajo de AA) con 349 usos; `ink-4` 2,80:1 y `ink-5` 2,07:1, y **no se usan solo para deshabilitado**: sostienen texto de 11 px real («2 DE 5» comidas hechas, etiquetas del catálogo). Subir `ink-3` a alfa 0,55 arregla 349 usos de golpe. |
| `07-13` | Dynamic Type no hace nada (tipografía en px absolutos). Decidir: asumirlo y quitar los `truncate` y altos fijos, o migrar los tokens a `rem`. |

### Bajas e Info que conviene no perder

`02-19` `armv7` en el `Info.plist` de un binario arm64: declaración falsa, borrar 4 líneas.
`02-21` sin `ITSAppUsesNonExemptEncryption`, cada build queda en «Missing Compliance» y no se puede
ni repartir por TestFlight; la app solo usa TLS y no implementa criptografía propia, así que la
declaración `false` encaja, pero **la responsabilidad legal es tuya**.
`02-24` ~4 MB de splash con 2,2 MB de duplicados exactos y 3 PNG huérfanos.
`03-10` `auth/user-not-found` ya no se devuelve con la protección de enumeración activada, así que la
rama de error pinta texto crudo de Firebase en inglés.
`03-12` el timeout de 8 s puede enseñar el login a quien sí tiene sesión y cambiárselo debajo mientras
teclea; usar `auth.authStateReady()`.
`04-23` `npm audit`: 1 crítica y 18 altas, **ninguna llega al bundle nativo** (todas son cadena de
compilación; la de `react-router-dom` es de modo RSC, que esta SPA no usa). `npm audit fix` sin
`--force` antes de subir; con `--force` sube react-router de mayor y rompe las 24 rutas con
`React.lazy`.
`04-24` `.env.example` anuncia `GEMINI_API_KEY` y `APP_URL`, que no se usan en ningún sitio, y le
falta la que sí hace falta.
`06-16` `06-17` `07-16` `07-18` pulido de motion y gestos, para la 1.1.
`01-22` **el tipo de cuenta de desarrollador de Apple condiciona el plazo**: si eliges organización,
el D-U-N-S tarda semanas y bloquea todo lo demás. Decidir ya.
`02-23` regla a dejar escrita: `CURRENT_PROJECT_VERSION` y `versionCode` suben en **cada** subida;
`MARKETING_VERSION`/`versionName` solo cuando cambia lo que ve el usuario. Para la primera no hay nada
que tocar (`package.json` está en `"0.0.0"` y convendría sincronizarlo a `1.0.0`).

---

## Lo que se verificó y está bien

Esto está comprobado y **no hay que volver a mirarlo** en esta ronda.

**Modelo de negocio y compras (`01-18`).** El CRM muestra euros pero solo se monta para el coach
(`src/App.tsx:159` y ruta tras `isCoach`). Grep de `stripe|paypal|bizum|checkout` en
`src/features/crm/`: cero. Grep de `formatEuros` y del símbolo € en las pantallas del atleta: cero.
Los únicos enlaces salientes son WhatsApp desde pantallas del coach y vídeos de YouTube/Vimeo en la
biblioteca. **3.1.1 no se dispara.** Mantenerlo así: ni precios, ni botones de contratación, ni
siquiera «renueva tu plan en la web» en la UI del atleta.

**Código remoto y TLS (`01-19`).** `capacitor.config.ts` no define `server`, ni los configs
generados. El bundle es local. No hay `network_security_config.xml` con excepciones de texto plano ni
`NSAppTransportSecurity`. No hay relajación de TLS. **2.5.2 cubierto.**

**Permisos y SDK (`01-20`).** `targetSdkVersion 36` (mínimo vigente de Play: 35). Los cinco permisos
del manifiesto tienen uso real. Grep de `healthkit` sobre `ios/` y `src/`: cero, y no hay ningún
`.entitlements`, así que **no hay ninguna declaración de HealthKit por error**.

**Bundle limpio (`02-26`, `04-17`).** `AppIcon-512@2x.png` mide 1024×1024 y `sips -g hasAlpha` dice
«no». `find dist -name '*.map'`: nada, y ningún `sourceMappingURL`. Búsqueda de `sk-ant-`,
`BEGIN PRIVATE KEY`, `service_account`, `ANTHROPIC_API_KEY` y `FIREBASE_SERVICE_ACCOUNT` en `dist/`:
cero. Lo único público que aparece es la `apiKey` de Firebase (pública por diseño) y la URL del
proxy. Los iconos adaptativos de Android están completos hasta xxxhdpi.

**Servidor fuera del cliente (`06-21`).** `firebase-admin`, `google-auth-library`, `@google-cloud` y
el SDK de Anthropic **no aparecen** en ninguno de los 167 chunks de `dist/assets`, gracias al
`import()` dinámico de `api/ai-chat.ts:47-52`. **No mover esos paquetes a `devDependencies`**: Vercel
instala con `--omit=dev` y rompería `/api/ai-chat`.

**Reglas del CRM (`04-20`).** Las cinco colecciones son `read, write: if isCoach()` sin excepciones,
`isCoach()` exige `email_verified`, y `crmPagos` afina el borrado a `estado == 'pendiente'`. Los
campos CRM que viven en `user_profiles` están en la lista de claves bloqueadas del `create` y del
`update`. **Un atleta autenticado no llega a nada del CRM.**

**Telemetría de IA (`04-18`).** `aiAuditLog` es `read: if isCoach()` / `write: if false`, y `aiUsage`
no tiene match, así que cae en el default-deny. Ambas se escriben solo con el Admin SDK.

**Inyección de prompt (`04-16`).** La instrucción anti-inyección está puesta y nombra los vectores
reales. De las 13 tools, once son de lectura, y las dos que escriben pasan por
`validateDietPayload`/`validateMesocyclePayload` y **solo se materializan cuando tú apruebas la
propuesta en la UI**. No hay tool que escriba en la ficha de un atleta ni que haga peticiones
salientes: ni escritura directa ni canal de exfiltración. Residuo acotado: un atleta puede sesgar con
texto libre el borrador que tú lees.

**Sin fugas de listeners (`06-22`).** `grep onSnapshot src/` devuelve 2 ocurrencias, ambas en
`src/firebase.ts` (importar y reexportar): **no hay ni una suscripción en tiempo real abierta**. Las
63 fotos del catálogo son webp locales (944 KB, ~15 KB cada una). La pila del swipe está limitada a 3
tarjetas. Las listas «largas» resultan cortas (~40 ejercicios, ~200 alimentos): virtualizar no
compensa.

**Estado del código.** `npx tsc --noEmit` limpio (comprobado por tres bloques por separado) y
`npm test`: 37 ficheros, **384/384 pruebas en verde**, 1,3 s.

**Build iOS (verificado en vivo, post-síntesis).** `npm run build` + `npx cap sync ios` +
`xcodebuild -configuration Release build` con Xcode 26.6 termina en `** BUILD SUCCEEDED **`: el
código nativo compila sin errores. El único fallo es de firma (`archive` exige un Apple Developer
Team ID, que no existe todavía — checklist), no del código. Un build Debug corrió en el simulador de
iOS 26.5 y se recorrió con capturas la pantalla de bienvenida.

**Corrección al material heredado (`04-2`).** El bloqueante de «reglas sin desplegar» ya no está
vivo: `docs/QA-pendiente-dani.md:8-27` lo marca hecho el 8 ago y el commit `15c873b` lo registra;
`git diff 15c873b..HEAD -- firestore.rules storage.rules firestore.indexes.json` da 5 inserciones y 3
borrados, **las cinco comentarios** del bloque `recipes`. `storage.rules` no se ha tocado desde
`6125521`, anterior al deploy.

---

## Plan de remediación

Ordenado por lo que desbloquea. Los esfuerzos entre paréntesis son estimaciones de los bloques que
encontraron el hallazgo; los que no venían estimados van marcados con `~`.

### Fase 0 · Lo que Dani hace en paralelo desde el minuto uno (bloquea todo lo demás)

| # | Acción | Bloquea a | Esfuerzo |
|---|---|---|---|
| 0.1 | Activar «Vínculo del correo electrónico» en Firebase Auth `B-9` | todo el QA del recorrido de alta | 2 min |
| 0.2 | Confirmar en consola que las reglas publicadas son las del 8 ago `01-15`/`04-2` | nada, es verificación | 2 min |
| 0.3 | Decidir tipo de cuenta Apple; si es organización, **pedir el D-U-N-S hoy** `01-22` | la ficha entera | semanas de espera |
| 0.4 | Copiar Team ID, activar Associated Domains, decidir el **dominio público definitivo** `03-16` | `B-5` | 30 min |
| 0.5 | Crear el keystore de subida y activar Play App Signing `02-3` | `B-8`, `03-16` (SHA-256) | 30 min |
| 0.6 | Instalar Android Studio o Temurin 21 `02-4` | cualquier build de Android | 1 h |
| 0.7 | Decidir: **borrar o anonimizar** el rastro comercial del CRM `03-17` | `B-1`, `B-2` | decisión |
| 0.8 | Decidir: **Sign in with Apple** u **ocultar Google en iOS** `B-3` | `B-4`, `A-1` | decisión |
| 0.9 | Decidir: iPad sí o no `02-11`, landscape sí o no `02-10`, Live Activity sí o no `02-9` | capturas y `Info.plist` | decisión |

### Fase 1 · Bloqueantes de trámite — **COMPLETADA el 10 ago 2026 (tarde)**

| # | Acción | Estado |
|---|---|---|
| 1.1 | Purpose strings de cámara, fototeca y micrófono `B-6` `02-22` | ✅ hecho y verificado en el binario |
| 1.2 | `PrivacyInfo.xcprivacy` en el target App `B-7` | ✅ hecho **y cableado al `.pbxproj`** |
| 1.3 | `signingConfig` + `keystore.properties` + `.gitignore` `B-8` | ✅ código hecho; falta el keystore de Dani (0.5) |
| 1.4 | `ITSAppUsesNonExemptEncryption`, `CFBundleDevelopmentRegion=es`, borrar `armv7` `02-21` `01-11` `02-19` | ✅ hecho. Orientación y device family (`02-10` `02-11`) **siguen abiertos**: dependen de 0.9 |
| 1.5 | Script de sincronización nativa obligatoria `A-4` | ✅ `sync:native` y `prerelease` en `package.json`, y ejecutado |
| 1.6 | Arreglo de `questionnaireMedia` `04-3` | ✅ código hecho; falta `firebase deploy --only storage` |

**Verificación de la fase.** `npx tsc --noEmit` limpio; 392 pruebas en verde (eran 384, +8 nuevas de
`energyCalc`); `xcodebuild -configuration Release` con `** BUILD SUCCEEDED **`; y comprobado sobre el
`App.app` resultante que `PrivacyInfo.xcprivacy` está dentro y que el `Info.plist` compilado lleva
las tres purpose strings, `ITSAppUsesNonExemptEncryption=false`, `CFBundleDevelopmentRegion=es` y un
`UIRequiredDeviceCapabilities` que ya solo dice `arm64`.

**Hallazgo nuevo al ejecutar 1.5.** El `npx cap sync android` reveló que `02-5` era más grave de lo
descrito: `capacitor.build.gradle` tenía el bloque `dependencies` **vacío** y
`capacitor.settings.gradle` solo incluía `capacitor-android`. Es decir, ninguno de los tres plugins
—BLE, háptica y notificaciones locales— entraba en la compilación de Android. La banda de pulso no
es que fallara en Android: no estaba compilada. El sync lo ha cableado, pero sigue **sin compilarse
nunca** hasta que haya JDK (0.6).

### Fase 1b · Lo nativo que impedía siquiera entrar en la app — **COMPLETADA el 12 ago 2026**

No estaba en el plan original porque el informe se escribió sin compilar ni ejecutar nada en
nativo (ver «Qué quedó fuera», punto 1). Al probar la app de verdad en el dispositivo aparecieron
seis fallos que hacían **imposible usarla**, ninguno visible desde el código en frío:

| Hallazgo | Estado |
|---|---|
| `getAuth()` se colgaba para siempre dentro del WebView | ✅ `7a5335c` |
| El WebView de Capacitor colgaba las lecturas de Firestore en silencio | ✅ `3b46c33` |
| Las llamadas a `/api/*` no salían del móvil | ✅ `084fd2f` |
| El login manual podía quedarse cargando indefinidamente | ✅ `5928019` |
| Las tres funciones de API reventaban al arrancar por un import sin extensión | ✅ `4eab823` |
| La URL de las claves públicas de Google daba 404, y con ella **todo** token | ✅ `98a5fdf` |
| `firebase-admin/auth` reventaba en Vercel por un conflicto ESM/CJS | ✅ `2a0a339` |
| La cabecera se metía debajo de la barra de estado (`07-1`) | ✅ `23c8c44` |
| Orientación bloqueada a vertical (decisión § 6.4) | ✅ `e82253e` |

**La lección, que conviene no perder:** siete de estos nueve son fallos que solo existen al ejecutar
en nativo. El informe los había marcado como «no verificado» y tenía razón en marcarlos.

### Fase 2 · Bloqueantes con trabajo real

| # | Acción | Depende de | Esfuerzo |
|---|---|---|---|
| 2.1 | Política de privacidad + términos, publicadas y enlazadas in-app `B-2` | 0.3, 0.7 | 1 día + 2 h |
| 2.2 | Página estática `/eliminar-cuenta` fuera del rewrite de Vercel `B-1.4` | 2.1 | ~3 h |
| 2.3 | Borrado de cuenta completo: UI + `api/delete-account.ts` + cascada + reautenticación `B-1` | 0.7, 2.1 | **4-6 días** |
| 2.4 | Enlace mágico end-to-end: `@capacitor/app` + entitlements + AASA + assetlinks + continue URL `B-5` `03-3` | 0.4, 0.5 | **1-1,5 días** + dispositivo |
| 2.5 | Según 0.8 — **B**: ocultar Google en iOS (~2 h). **A**: migración de identidad a UID `A-1` (3-5 días) + Google nativo `B-4` (1-2 días) + Sign in with Apple `B-3` | 0.8 | 2 h **o** 5-8 días |
| 2.6 | Firma iOS: `DEVELOPMENT_TEAM`, borrar `CODE_SIGN_IDENTITY` heredado, certificados y perfil `02-8` | 0.3 | ~2 h |

### Fase 3 · Altas que hay que cerrar antes de subir

Estas no son bloqueantes formales, pero subir sin ellas es subir algo que pierde datos de clientes o
que el revisor va a ver.

1. **`A-5` — CERRADO ENTERO el 12 ago 2026.** Era el grupo con más riesgo real para un cliente de
   pago y ya no queda nada abierto. Siete arreglos, y en cuatro de ellos lo importante fue lo que
   se decidió NO hacer:

   - `05-5` **Sesión de entrenamiento persistida** (`35ed061`). Cada serie y cada nota se guardan al
     instante. La clave lleva el email del atleta —no se suma otra clave global de las que `03-5`
     documenta como fuga—, el borrador se descarta si la rutina cambió de forma (restaurar por
     índice pondría los kilos en otro ejercicio) y caduca a las 20 h. Volver a la lista no lo borra;
     terminar o saltar sí.
   - `05-4` **Borrador del alta** (`e57b375`). Autoguardado por atleta con el paso incluido y
     caducidad de 30 días. Se lee en el inicializador perezoso de `useState` y no en un efecto:
     leerlo después pisaría 18 campos en un segundo render.
   - `05-2` **Timeout en las escrituras** (`660110f`). `conTimeout` y `EscrituraEncolada` suben de
     `crm.ts` a `core.ts`, que es donde tenían que estar desde el principio. **La trampa que había
     que esquivar:** dejar que `EscrituraEncolada` cayera en el `catch` existente habría activado el
     modo local y creado un `local_log_*` duplicado del que ya estaba encolado — es decir, el arreglo
     de `05-2` habría reintroducido `03-6`. Se trata aparte. Además el id se reserva en cliente con
     `doc()` en vez de `addDoc()`, para que lo encolado lleve ya su id definitivo.
   - `05-3` **Banner honesto** (`9427b43`). Tercer estado «encolado», alimentado por los listeners
     `online`/`offline` y por un contador **real** de escrituras pendientes: `Promise.race` no
     cancela la promesa original, así que se sigue esperando a la de verdad y el aviso se apaga solo
     cuando Firestore confirma. En tono aviso, no rojo de error.
   - `05-11` **Las fotos ya no mienten** (`ac8372d`).
   - `03-6` **Lo escrito en modo local vuelve** (`a1f3edf`). La mezcla y el filtro por atleta —que es
     un guardarraíl de privacidad— viven en `combinarLogs`, con pruebas.
   - `03-5` / `04-14` **Limpieza al cerrar sesión** (`8344db0`, `2e1b1b4`).
   - `05-7` el `NaN`, ya cerrado antes (ver abajo).
   **Ya hecho de este grupo:** `05-7`, el `NaN`. Se filtró en `setAnswer` de `QuestionnaireWizard`,
   que es el único punto por el que pasan todas las respuestas, en vez de en las dos llamadas a
   `parseFloat`: así ninguna vía futura puede saltárselo. Un número no finito significa «sin
   responder», y ahora borra la clave en lugar de escribir un NaN que Firestore guarda como doble
   NaN y que después rompe cualquier media, gráfica o comparación sobre ese campo.
2. ~~**`A-6`** — usar `estimateMaintenanceKcal` en el alta en vez de 2000 fijas.~~ **HECHO.** Se
   subió `computeAuto` de `OnboardingForm.tsx` a `utils/energyCalc.ts` para que el alta del atleta y
   el formulario del coach calculen con la misma función, y el asistente de alta la usa. Si faltara
   algún dato, ahora **no escribe nada** en vez de inventar una cifra. El caso concreto del informe
   —mujer de 55 kg, 160 cm, 52 años, sedentaria, reducir grasa— pasa de 2000 kcal fijas a
   mantenimiento 1355 y objetivo 1084. Cubierto por 8 pruebas nuevas, incluida una que fija que el
   mantenimiento de `computeAuto` y el de `estimateMaintenanceKcal` no se separen nunca (si se
   separan, el atleta ve un número en Nutrición y el coach otro en periodización). **Sigue abierta la
   decisión § 6.5**: calcular (lo que hace ahora) frente a no escribir nada y mostrar «pendiente de
   tu coach».
3. **`A-8` — CERRADO ENTERO el 12 ago 2026.**
   - `07-1` `07-2` `07-3` **Safe areas** — cerradas (`23c8c44` y anteriores).
   - `07-6` **Barra de estado en modo claro** (`18b0679`). No declarar `UIStatusBarStyle` ni
     `UIUserInterfaceStyle` dejaba a `CAPBridgeViewController` en `.default`, que sigue al sistema:
     con el iPhone en claro, reloj y batería en negro sobre el `#050505` de la app. En Android igual,
     por heredar de `Theme.AppCompat.Light`. Además el `LaunchScreen` usaba `systemBackgroundColor`,
     blanco puro en modo claro → destello a pantalla completa al arrancar y al rotar.
     **Hallazgo nuevo y grave al tocar esto:** `styles.xml` referenciaba `@color/colorPrimary`,
     `colorPrimaryDark` y `colorAccent`, y **no existía ningún `colors.xml` en el proyecto Android**.
     `aapt2` no puede resolverlas: la compilación de Android fallaba antes de empezar, y no se había
     visto porque nunca se ha compilado (`02-4`). Verificado en iOS con build de Release real:
     `BUILD SUCCEEDED`, `validate-for-store` OK, las tres claves presentes en el `Info.plist` del
     binario, y captura del simulador **en modo claro** con la barra en blanco.
   - `07-4` **La tabla de series** (`6161ff0`). En vez de dejar «Hecha» fuera y obligar a arrastrar,
     la tabla **cabe**: se esconde la columna «Anterior» en móvil y se aprietan paddings y campos.
     Esconderla no pierde el dato — la tabla llega prerrellenada con lo del último día y ese mismo
     valor está de *placeholder* en cada campo, así que era la tercera vez que se decía lo mismo.
   - `07-9` **Botón Atrás de Android** (`47872a0`).
   - `07-7` los códigos crudos de Firebase, ya cerrado antes (ver abajo).
   **Ya hecho de este grupo:** `07-7`, los errores de acceso. Nuevo `utils/erroresAuth.ts` con el
   mismo criterio que el `erroresFirestore.ts` que ya existía: la persona lee qué ha pasado y cuál es
   el siguiente paso, y el error crudo sigue yendo a la consola. Cubre los 19 códigos que puede
   devolver esa pantalla, y distingue por fin el enlace de invitación caducado del correo mal escrito
   —antes los dos daban «confirma que el correo es el mismo», que con un enlace caducado manda a la
   persona a reescribir su correo indefinidamente—. Verificado en el navegador: credenciales falsas
   dan un mensaje en cristiano y el `auth/invalid-credential` queda en la consola.
4. **`A-7` mínimo viable — HECHO el 12-13 ago 2026** (`cc14b61`, `ddaf2f1`, `7a9d5a4`).
   - `06-1` `07-5` **Material Symbols empaquetada.** Subconjunto de los **204 iconos** que la app usa
     de verdad: **63 KB**, frente a los ~4 MB de la fuente completa con sus ~3.000 iconos. Se genera
     con `npm run iconos:generar` (paso manual a propósito: la fuente se commitea y el build sigue
     sin red). **Lo que casi se rompe:** la clase `.material-symbols-outlined` la servía la hoja de
     Google y la siguen usando **281 iconos en 33 ficheros**; se replica en `index.css` tal cual,
     incluido `font-size: 24px` y **sin capa**, porque meterla en una capa habría hecho que las
     utilidades de Tailwind ganaran y habría cambiado de golpe el tamaño de esos 281 iconos.
     Verificado en el navegador: cero peticiones a googleapis/gstatic, familia en estado `loaded` y
     el glifo de `arrow_back` midiendo **24×24 px** en vez de los 113 px que mide el texto.
     Con `npm run iconos:comprobar` dentro de `lint`, porque subsetear se pudre en silencio: usar un
     icono nuevo sin regenerar no rompe el build, solo saca la palabra dentro del botón.
   - `06-2` `06-20` **Lecturas de la pantalla del coach.** `enabled: !athleteId` en las dos
     `useQueries`, ventana de 120 días con `limit(200)` **bajo una clave de caché propia**, e índice
     compuesto `workoutLogs (athleteId ASC, date DESC)` — **desplegado y verificado en producción el
     13 ago**. **La trampa esquivada, y no es menor:** el plan original decía «`limit(60)`» a secas.
     Un `limit` por defecto habría roto `allTimeBestBefore` y el motor de reportes, que calculan
     récords sobre TODO el historial: un atleta con dos años de entrenamientos habría «batido»
     récords que ya tenía, **sin que nada fallara ni diera error**. Por eso la ventana es un
     parámetro opcional, y de los siete puntos que llaman a `getWorkoutLogs` solo lo usa este.
     Segunda trampa: una lectura con ventana **no** actualiza la copia local, o sobrescribiría el
     espejo completo con un trozo y `combinarLogs` pintaría el resto como pendiente de subir.
   - `06-6` `06-7` **recharts en diferido** en Perfil y Hub. Medido: `ClientsScreen` de
     **334,06 kB a 65,09 kB** (gzip 83,01 → 19,13).
   - **`staleTime` 10 min, `gcTime` 30 min, `refetchOnWindowFocus: false`.** Estaba en 60 s y sin
     sobrescribir el `refetchOnWindowFocus`, así que cada vuelta al primer plano pasado un minuto
     repetía entero el abanico de lecturas de la pantalla.

   **Sigue abierto de `A-7`** (no bloquea publicar): `06-5` arranque en serie del atleta, los
   re-renders `06-11`/`06-12`/`06-13` —`React.memo` sigue apareciendo cero veces— y `06-15` las
   miniaturas de la galería.
5. **`A-2`** — casilla de consentimiento de IA y Anthropic declarado. Va con 2.1. `~4 h`
6. **`A-3`, casi cerrado** — solo queda `04-10` (restringir la lectura de las 12 colecciones a quien
   tiene perfil, probándolo en el emulador) y pasar la CSP a enforce. `~4 h`
   **Ya hecho de este grupo:** `01-8`/`02-13` `allowBackup=false` más reglas de extracción de datos,
   que hacían falta porque en Android 12+ `allowBackup=false` por sí solo no corta la transferencia
   directa entre dispositivos; `04-11` `email_verified` en el endpoint de IA; `04-12` CORS con lista
   blanca (antes reflejaba el `Origin` recibido, que es lo mismo que no tener CORS) y `Vary: Origin`
   siempre, para que una CDN no pueda servir la respuesta de un origen a otro; `04-13` el tope diario
   pasa a transacción y a *fail-closed* —antes leía y escribía sin transacción, así que N peticiones
   simultáneas leían el mismo valor y pasaban todas, y además cualquier fallo de Firestore caía en un
   `catch` que dejaba pasar la llamada, o sea que tumbar el contador levantaba el límite de gasto—; y
   `04-8`, el dominio `https://en-forma-.firebaseapp.com` de la CSP, que estaba mal escrito y ahora
   apunta a `fleet-operator-z5xj8.firebaseapp.com`.

   **Sobre la CSP y por qué no se pasa entera a enforce todavía.** Al completarla apareció que
   `img-src` no incluía `blob:`, y `AddOwnMachineSheet.tsx:45` previsualiza la foto de la máquina con
   `URL.createObjectURL`: haber pasado a enforce sin mirar habría roto esa pantalla. Se ha hecho lo
   que no puede romper nada —`base-uri`, `object-src 'none'`, `form-action` y `frame-ancestors` van
   ya **en enforce**, y ninguna de las cuatro afecta a carga de recursos— y la política completa
   sigue en `Report-Only` con `blob:`, `media-src` y `manifest-src` añadidos. Pasarla entera a
   enforce pide antes mirar los informes de un par de días con tráfico real, que es justo lo que
   `Report-Only` está para dar.
7. **`01-12` + `01-13` + `01-14` + `07-20`** — cuenta de demo con datos realistas, formularios de
   privacidad de ambas tiendas, clasificación por edad y las capturas. Es lo último que se hace y sin
   ello no se envía. `~1-2 días` de Dani
8. **Builds de verdad en serie** (`02-25`, `06-19`, `02-4`): archivar iOS, `bundleRelease` de Android,
   medir arranque real, jank y memoria, y recorrer el primer día con una cuenta de prueba. `~1 día`

### Para la 1.1 (nada de esto bloquea)

Rendimiento fino (`06-3`, `06-4`, `06-7`…`06-17`), `minifyEnabled true` con prueba funcional
(`02-15`), sacar las recetas del binario (`02-16`), `window.confirm` → Dialog (`07-8`), objetivos
táctiles y contraste (`07-10`, `07-11`), Dynamic Type (`07-13`), pruebas de reglas y de componente
(`05-14`), Live Activity real si se decide (`02-9`), miniaturas de fotos (`06-15`), limpieza de
`.env.example` (`04-24`) y del splash (`02-24`).

---

## Qué quedó fuera

**Esta sección no se suaviza. Es tan importante como los hallazgos.**

### 1. Nada se compiló y nada se ejecutó — actualizado tras la síntesis, solo para iOS

> **Actualización 13 ago 2026.** Esta limitación resultó ser la más cara del informe. Al ejecutar de
> verdad en nativo aparecieron **nueve fallos** que hacían imposible usar la app y que ninguna
> lectura del código en frío iba a encontrar: `getAuth()` colgado dentro del WebView, las lecturas de
> Firestore colgadas en silencio, las llamadas a `/api/*` que no salían del móvil, y tres formas
> distintas de que las funciones de Vercel reventaran al arrancar. Están en la **Fase 1b** del plan.
>
> Desde entonces sí se compila y se ejecuta en iOS de forma rutinaria: la verificación de `07-6`
> incluye un build de Release con `validate-for-store`, comprobación de las claves en el `Info.plist`
> del binario resultante, y captura del simulador en modo claro.
>
> **Android sigue sin compilarse ni una sola vez**, y ahora se sabe que además faltaba `colors.xml`
> entero (ver `07-6`), o sea que hasta el 12 de agosto **no habría compilado aunque se hubiera
> intentado**. Todo lo que este informe dice sobre Android sigue siendo lectura de código.

Los siete bloques corrieron en paralelo y Xcode, Gradle y el simulador son un recurso único: compilar
en ese momento habría dado resultados inválidos. Los pasos manuales que el maestro deja fuera a
propósito (bloques 02 y 05) sí se ejecutaron después, en serie, una vez terminada la síntesis:

- **iOS compila.** `npm run build` + `npx cap sync ios` + `xcodebuild -configuration Release archive`
  con Xcode 26.6: falla, pero **solo por firma** (`error: Signing for "App" requires a development
  team` — esperable sin Apple Developer Team ID, va al checklist). Repitiendo con
  `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`, **`** BUILD SUCCEEDED **`** en Release: el
  código compila limpio, sin warnings de error. `RestTimerService`/`LiveActivityPlugin.swift` sí
  pasaron por el compilador esta vez.
- **La app se vio en pantalla.** Build Debug para simulador (iPhone 17 Pro, iOS 26.5), lanzada e
  inspeccionada con capturas reales. Confirma en vivo: `B-3`/`B-4` (Google Sign-In sin alternativa,
  roto en nativo — ver la nota de reproducción en `B-4`), el icono roto de `03-9`/`07-17`, y que el
  `placeholder="••••••"` del campo de contraseña (`WelcomeScreen.tsx:247`) es texto literal, no una
  credencial precargada — duda que se planteó al tocar por error el botón «Entrar» y se cerró leyendo
  el código.
- **Lo que sigue sin verse:** todo lo posterior al login (bloqueado por los dos bloqueantes heredados,
  igual que antes), el crash de cámara de `B-6` (exige entrar y abrir una pantalla con «Hacer foto»),
  rotación, iPad, y cualquier medida de rendimiento en dispositivo.
- **Android sigue sin poderse compilar en esta máquina**, ahora confirmado directamente y no solo por
  `02-4`: no hay JDK (`java -version` falla, sin Android Studio) ni `~/Library/Android/sdk`. `./gradlew
  bundleRelease` no se pudo ni intentar. Instalar Android Studio + JDK 21 va al checklist.
- **Las cifras de rendimiento siguen siendo de Chrome de escritorio sobre localhost**, que es un
  suelo: en WKWebView sobre un iPhone de cuatro años hay que contar del orden de 3-4× en evaluación de
  JS. Falta el número que de verdad importa, el tiempo desde el toque en el icono.

### 2. Nada se comprobó con sesión iniciada ni en ninguna consola

Regla dura: Claude no escribe contraseñas. Y los dos bloqueantes heredados impiden crear una cuenta de
prueba. Por tanto:

- **Todo lo que hay detrás del login está sin recorrer.** Del coach: hub del cliente, crear y asignar
  entrenamientos, mesociclos y plantillas, dietas, periodización, informes, CRM completo, importación,
  asistente de IA y su reflejo real en Firestore, catálogo y ajustes de máquinas. Del atleta:
  nutrición y adherencia, recetas, preferencias, roadmap, retos, check-in semanal, academia. **Ni un
  solo hallazgo de esta revisión está verificado en ejecución.**
- **Ninguna consola se abrió.** Firebase, App Store Connect, Play Console y el portal de Apple
  Developer se dan por vacíos porque la app nunca se ha enviado, no porque se hayan mirado. Sin
  comprobar: si las reglas publicadas son de verdad las del repo, si el proveedor email/contraseña
  permite altas por REST (premisa de `04-3` y `04-10`), si «una cuenta por dirección de correo» está
  activo (atenúa `04-11`), si `VITE_RECAPTCHA_SITE_KEY` está en Vercel, si existe la base `(default)`,
  y si hay copias programadas.
- **El coste real de Firestore no se ha medido.** `06-20` es una estimación razonada, no una lectura
  de la pestaña «Uso». Y el proyecto está en edición Enterprise, cuyo precio por lectura no es el de
  Standard.

### 3. El emulador de Firestore no se levantó

Los ataques de `04-3` y `04-10` están razonados sobre el **texto** de las reglas, no ejecutados. Lo
correcto sería `firebase emulators:exec --only firestore` con un fichero de pruebas de reglas; no se
hizo porque el emulador ocupa puertos fijos y había siete agentes en paralelo. Relacionado: **hoy no
existe ninguna prueba automatizada de las reglas** (`05-14`), que son literalmente lo que separa a un
atleta de los datos de otro.

### 4. Hallazgos graves que el tope del workflow dejó sin verificar

Solo **cinco** hallazgos pasaron por el verificador adversarial: `01-1`, `01-2`, `01-3`, `01-6`
(confirmados) y `01-5` (refutado y bajado de severidad). **Todo lo demás está sin contrastar por un
segundo par de ojos**, incluidos estos bloqueantes y altas:

> `01-10` · `01-15` · `01-16` · `02-1` · `02-2` · `02-3` · `03-1` · `03-2` · `03-4` · `03-16` ·
> `04-1` · `04-5` · `05-1` · `05-15` · `01-4` · `01-7` · `01-8` · `01-9` · `01-12` · `01-13` ·
> `01-17` · `02-4` · `02-5` · `02-6` · `02-7` · `02-8` · `02-10` · `02-12` · `03-3` · `03-5` ·
> `03-6` · `03-7` · `04-3` · `04-4` · `04-6` · `04-7` · `04-9` · `04-10` · `04-14` · `05-2` ·
> `05-3` · `05-4` · `05-5` · `05-7` · `05-8` · `05-11` · `06-1` · `06-2` · `06-5` · `06-6` ·
> `06-11` · `06-12` · `06-13` · `06-15` · `06-18` · `06-20` · `07-1` · `07-2` · `07-3` · `07-4` ·
> `07-5` · `07-6` · `07-7` · `07-9`

Que no estén verificados **no significa que sean dudosos** — casi todos son observaciones directas de
código con `archivo:línea`, y varios los encontraron dos o tres bloques por separado (señal fuerte).
Significa que nadie intentó tumbarlos, y que el ejercicio de `01-5` demuestra que a veces se tumban.
Los más expuestos a un error de ese tipo son los que dependen de comportamiento en ejecución:
`03-1` (validación de origen del SDK), `05-2` (promesa que no resuelve), `05-9` (coma decimal),
`07-14`/`07-15` (landscape e iPad) y `06-20` (coste).

### 5. Zonas del código que directamente no se miraron

- **`src/features/crm/` por dentro** — se revisaron sus reglas y su modelo de acceso (cerrado), pero
  no la validación de importes, el cálculo de churn ni la lógica de cobros. Sin superficie de ataque
  de atleta, pero puede haber errores de integridad de datos financieros.
- **`src/db/`**: sin leer en detalle `academy.ts`, `roadmap.ts`, `coachReports.ts`, `coachTools.ts`,
  `coachSettings.ts`, `recipes.ts`, `tasks.ts`, `athleteMetrics.ts` y `ai.ts`. El patrón de escritura
  silenciosa puede quedar sin detectar en alguno; el escáner `escriturasHonestas.test.ts` **admite en
  su propia cabecera** que no ve las escrituras cuyo `catch` no llama a `setLocalBypassMode`.
- **`src/ai/tools.ts`**: se leyeron las 13 definiciones y el despachador, no la implementación interna
  de cada función de lectura — no se descarta que alguna devuelva más campos de los que declara.
- **Concurrencia coach/atleta sobre el mismo documento**: hay **23 `setDoc` sin `merge`** en
  `src/db/`; no se revisó cuáles pisan escrituras ajenas.
- **Estados vacíos**: solo se comprobó el de fotos, y resultó estar mintiendo (`05-11`). Los demás
  quedan sin revisar uno por uno.
- **`node_modules` plugin por plugin**: solo se miró el manifiesto Android de bluetooth-le y se buscó
  globalmente `.xcprivacy`. Si algún plugin usa APIs de motivo obligatorio no cubiertas por la
  declaración de UserDefaults, se escaparía.
- **Cardio y BLE**: solo la utilería. Nada de banda real, que exige iPhone físico.
- **Textos de la ficha de tienda** (nombre, subtítulo, descripción, palabras clave): no existen
  todavía en ningún fichero, así que la comprobación de «promesas de resultados de salud» queda como
  recordatorio sin hallazgo asociado.
- **RGPD más allá de lo que toca a las tiendas**: sin revisar el registro de actividades de
  tratamiento, los contratos de encargado con Google y Vercel, ni las transferencias internacionales.
  Es trabajo jurídico, no técnico.

### 6. Duplicados descartados

`02-20` y `03-15` se retiraron por duplicar hallazgos de otros bloques.
