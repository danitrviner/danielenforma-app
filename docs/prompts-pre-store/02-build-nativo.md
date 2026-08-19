# BLOQUE 02 — Build nativo y configuración de release

<!-- Pégale este texto a una sesión nueva apuntando al repo ~/en-forma, rama ds/f3-experiencia. -->

Eres un ingeniero de release móvil. Vas a revisar la configuración nativa de **En Forma**
(Capacitor 8, iOS + Android) y a comprobar que **se puede compilar y subir un release** a la App
Store y a Google Play. Los proyectos nativos los generó Capacitor y apenas se han tocado desde
julio de 2026.

**Trabaja en solo lectura sobre el código.** Compilar sí (es lectura del estado real), modificar
no. Cada hallazgo lleva `archivo:línea`, el síntoma concreto y el cambio exacto propuesto.
Severidades: Bloqueante / Alta / Media / Baja / Info. Marca cada hallazgo como `verificado` o
`sospecha` — aquí casi todo se puede verificar, así que apenas debería haber sospechas.

## Estado de partida

```
capacitor.config.ts   appId com.danielenforma.app · appName "En Forma" · webDir dist
                      backgroundColor #050505 · sin server.url (bundle local)
ios/App               MARKETING_VERSION 1.0 · CURRENT_PROJECT_VERSION 1
                      IPHONEOS_DEPLOYMENT_TARGET 15.0 · TARGETED_DEVICE_FAMILY "1,2"
                      CODE_SIGN_STYLE Automatic · SPM (CapApp-SPM), no CocoaPods
android               minSdk 24 · compileSdk 36 · targetSdk 36 · versionCode 1 · versionName 1.0
Xcode 26.6 instalado (/Applications/Xcode.app)
```

Plugins: `@capacitor-community/bluetooth-le`, `@capacitor/local-notifications`,
`@capacitor/haptics`. Más código nativo propio: `ios/App/App/LiveActivityPlugin.swift` y, en
Android, `RestTimerService` (foreground service).

---

## 1. iOS · Info.plist

Fichero: `ios/App/App/Info.plist`. Ya localizado en la lectura previa, **verifícalo tú**:

- **Faltan `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription`.** Y hay entradas de
  fichero con cámara en cuatro sitios:
  - `src/features/gimnasio/AddOwnMachineSheet.tsx:115` — `<input type="file" accept="image/*" capture="environment">`
  - `src/features/gimnasio/AdminMaquinasTab.tsx:293`
  - `src/components/PhotosScreen.tsx:142` — fotos de progreso
  - `src/components/QuestionnaireWizard.tsx:281` — preguntas de tipo archivo

  En WKWebView, un `<input capture>` abre la cámara del sistema: **sin la clave, iOS mata el
  proceso**. Verifica el comportamiento real en el simulador y clasifícalo. Redacta los textos de
  uso en español, explicando para qué (Apple rechaza los genéricos).
- **Falta `ITSAppUsesNonExemptEncryption`.** Sin ella, App Store Connect pregunta por cumplimiento
  de exportación en cada subida. Determina el valor correcto: la app usa HTTPS y Firebase, que
  normalmente entra en la exención, pero **confírmalo, no lo asumas**.
- **`NSSupportsLiveActivities` está declarado en `true`** — pero el target `RestTimerWidget`
  **no existe en el proyecto**: `grep -c RestTimerWidget ios/App/App.xcodeproj/project.pbxproj`
  da **0**, aunque la carpeta `ios/App/RestTimerWidget/` y `LiveActivityPlugin.swift` sí están.
  Es decir: hay un plugin que llama a una extensión que no se compila. Verifica qué pasa en
  runtime cuando `src/services/restTimer.ts:29` llama al plugin en iOS, y plantea la decisión:
  crear la extensión (trabajo real de Xcode) o quitar la clave y degradar a notificación local.
  Mira también `docs/WIDGET_BLOQUEO_TODO.md`, que documenta este pendiente.
- **`TARGETED_DEVICE_FAMILY = "1,2"`** → la app se declara para iPhone **y iPad**. Consecuencias:
  Apple la revisa en iPad, y App Store Connect **exige capturas de iPad**. La app está diseñada a
  375 px. Evalúa cómo se ve en un iPad en el simulador y presenta la decisión con su coste:
  `"1"` (solo iPhone, camino corto) frente a soportar iPad de verdad.
- **`UIRequiredDeviceCapabilities: armv7`** — resto del generador de Capacitor, sin sentido en un
  proyecto solo arm64. Comprueba si estorba.
- **Orientaciones**: se declaran las tres de iPhone (portrait + los dos landscape) y las cuatro de
  iPad. Contrasta con lo que la app soporta de verdad (ver bloque 07) — declarar landscape y no
  tener layout para él es un rechazo fácil.
- **`CFBundleDevelopmentRegion = en`** en una app íntegramente en español.
- **Associated Domains** — no hay entitlement. Hace falta para que el enlace mágico de invitación
  vuelva a la app en vez de abrir Safari (ver bloque 03). Verifica el estado del fichero de
  entitlements y qué habría que añadir.

## 2. iOS · Manifiesto de privacidad

- **Falta `PrivacyInfo.xcprivacy` en el target de la app.** Solo existen los de Capacitor dentro de
  `node_modules/@capacitor/ios/`. Es **obligatorio** para subir. Comprueba el requisito vigente y
  construye el contenido:
  - **Tipos de datos recogidos** — se cruza con el inventario del bloque 01.
  - **Motivos de API de acceso obligatorio** (`NSPrivacyAccessedAPITypes`): busca en el código
    nativo y en los plugins usos de `UserDefaults`, marcas de tiempo de ficheros, espacio en disco
    y APIs de sistema, y asigna el código de motivo correcto a cada uno.
  - **SDK de terceros** que necesitan su propio manifiesto y su firma. Revisa qué trae cada
    dependencia nativa (`bluetooth-le`, `local-notifications`, `haptics`) y si vienen firmados.
- Comprueba también que no falta ninguna declaración por parte del SDK web de Firebase, que en
  nativo viaja dentro del bundle JS y no como framework.

## 3. iOS · Compilar y archivar

Esto es trabajo manual de esta sesión, no de un agente:

```bash
cd ~/en-forma && npm run build && npx cap sync ios
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/EnForma.xcarchive archive
```

Reporta: si compila, cuánto tarda, y **todos los avisos**. Después:

- **Firma:** `CODE_SIGN_STYLE = Automatic` y `CODE_SIGN_IDENTITY = "iPhone Developer"` (nombre
  antiguo). Sin `DEVELOPMENT_TEAM` en el `.pbxproj`. Determina exactamente qué hace falta en la
  cuenta de Apple Developer: App ID, capacidades (Push si aplica, Associated Domains, App Groups
  si entra la Live Activity), y perfiles. **No intentes hacerlo tú**: va al checklist de Dani.
- **Iconos y launch screen:** revisa `ios/App/App/Assets.xcassets` y el `LaunchScreen`. Falta de
  icono de 1024 px es rechazo automático en la validación. Comprueba también que el icono no tiene
  canal alfa ni esquinas redondeadas propias.
- **Versión y build:** `1.0` / `1` sirven para la primera subida. Deja anotado el criterio para las
  siguientes (`CURRENT_PROJECT_VERSION` sube en cada subida, aunque la versión de marketing no
  cambie) y si conviene automatizarlo.
- **Tamaño del `.ipa`** y del bundle JS embebido (hoy `dist/assets` pesa ~3,2 MB de JS). Contrasta
  con el límite de descarga por red móvil.
- Confirma que `dist/` **no incluye** ficheros de entorno ni source maps con rutas locales, y que
  `.env.local` no acaba dentro del `.ipa`.

## 4. Android

- **`android/app/build.gradle`: el bloque `release` no tiene `signingConfig`** (línea 20). Sin
  keystore de subida no se puede publicar. Describe el procedimiento completo —crear el keystore,
  dónde guardarlo (nunca en el repo; el `.gitignore` actual no lo cubre), cómo referenciarlo desde
  Gradle sin commitear la contraseña— y si conviene usar la **firma de apps de Play**.
- **`minifyEnabled false`** en release: sin R8, el AAB va más gordo y sin ofuscar. Evalúa
  activarlo y qué reglas ProGuard harían falta para Capacitor y los plugins.
- **Compilar el bundle de subida:**
  ```bash
  cd ~/en-forma && npm run build && npx cap sync android
  cd android && ./gradlew bundleRelease
  ```
  Si falla por falta de JDK, dilo tal cual y no lo des por verificado — hay antecedente de este
  bloqueo (ver `docs/PLAN_TrainingLab_Cardio_Widget.md`).
- **`AndroidManifest.xml`:** `allowBackup`, `RestTimerService` con `specialUse` (el porqué está en
  el bloque 01), `FileProvider`, `launchMode singleTask`, y los `configChanges` declarados.
- **`versionCode 1` / `versionName "1.0"`**, y el criterio de subida para las siguientes.
- **Iconos adaptativos** y splash: revisa `android/app/src/main/res/`.
- Comprueba que `minSdk 24` es coherente con lo que usan los plugins (BLE en Android 12+ cambió los
  permisos; el manifiesto ya tiene `neverForLocation`, verifica que el código lo respeta).

## 5. Coherencia web ↔ nativo

- **`npx cap sync`** deja `ios/App/App/public/` y `android/.../assets/public/` como copias de
  `dist/`. Verifica que están **al día** y que no hay una build vieja embebida.
- **`VITE_AI_PROXY_URL`** (`src/ai/aiClient.ts:13`): si no está definida en el build, el cliente
  llama a `/api/ai-chat` **relativo**, que en la app nativa resuelve contra `capacitor://localhost`
  y da 404. Comprueba `.env.example`, `.env.local` y qué variables entran realmente en el build
  que se empaqueta. Si el asistente de IA se rompe en el móvil, es **Bloqueante** para esa
  funcionalidad.
- Lo mismo con **`VITE_RECAPTCHA_SITE_KEY`** (`src/firebase.ts:84`): en nativo reCAPTCHA v3 no es
  el proveedor correcto de App Check (ver bloque 04), pero comprueba primero qué se está
  empaquetando.
- Revisa el resto de `import.meta.env` del código y qué pasa con cada una cuando falta.

---

## Entregable

Escribe tu parte en `docs/revision-pre-store/informe.md` con ids `02-1`, `02-2`… Incluye:

- **Tabla de claves de `Info.plist`**: clave · presente sí/no · valor · veredicto.
- **Tabla equivalente del `AndroidManifest.xml`** y del `build.gradle` de release.
- **Resultado literal de los dos builds** (iOS y Android), con los avisos.
- Lo que dependa de la cuenta de Apple Developer o de Play Console va a
  `docs/revision-pre-store/checklist-dani.md`, con la ruta exacta de menús.
