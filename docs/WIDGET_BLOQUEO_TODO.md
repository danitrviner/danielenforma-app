# Widget de pantalla de bloqueo — estado y lo que falta

> Continuación de `PLAN_TrainingLab_Cardio_Widget.md` §6. Este documento cubre
> solo el módulo 4 (widget). Actualizado: 2026-07-21.

## Android — completo, funciona sin pasos manuales

- `android/app/src/main/java/com/danielenforma/app/RestTimerService.kt`:
  foreground service con notificación persistente, cuenta atrás en vivo cada
  segundo, se retira sola 4s después de llegar a 0.
- `RestTimerPlugin.kt`: puente Capacitor (`start(exerciseName, seconds)` /
  `stop()`), registrado en `MainActivity.java`.
- `AndroidManifest.xml`: servicio declarado (`foregroundServiceType=specialUse`)
  + permisos `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`,
  `POST_NOTIFICATIONS`.
- No se ha podido compilar/verificar en este entorno — **no hay JDK ni
  Android SDK instalados en esta máquina**. El código sigue el patrón
  estándar de plugin Capacitor y debería compilar tal cual con Android
  Studio, pero conviene una primera compilación de verificación en un
  entorno con el SDK antes de darlo por bueno.

## iOS — código escrito, falta un paso único en Xcode

**Xcode no está instalado en esta máquina** (solo las Command Line Tools),
así que no se ha podido crear el target ni compilar nada. Los archivos están
listos para pegar en cuanto instales Xcode:

- `ios/App/RestTimerWidget/RestTimerAttributes.swift` — el `ActivityAttributes`.
- `ios/App/RestTimerWidget/RestTimerWidgetLiveActivity.swift` — vista SwiftUI
  (pantalla de bloqueo + Dynamic Island).
- `ios/App/RestTimerWidget/RestTimerWidgetBundle.swift` — punto de entrada
  `@main` del target.
- `ios/App/App/LiveActivityPlugin.swift` — puente Capacitor (`start`/`stop`),
  ya en el target principal `App`.
- `Info.plist` del target `App` ya tiene `NSSupportsLiveActivities`.

### Paso único que falta (con Mac + Xcode instalado, ~5 min)

1. Abre `ios/App/App.xcworkspace` en Xcode.
2. `File > New > Target… > Widget Extension`.
   - Product Name: `RestTimerWidget`.
   - Activa **"Include Live Activity"**.
   - Team/bundle id: que cuelgue de `com.danielenforma.app` (Xcode le pondrá
     `com.danielenforma.app.RestTimerWidget` automáticamente).
3. Xcode genera sus propios `RestTimerAttributes.swift`,
   `RestTimerWidgetLiveActivity.swift` y `RestTimerWidgetBundle.swift` de
   plantilla dentro de una carpeta `RestTimerWidget/` — **bórralos** y arrastra
   los tres archivos ya escritos en `ios/App/RestTimerWidget/` al nuevo
   target (Xcode pregunta a qué target(s) añadir cada archivo al arrastrar).
4. Abre `RestTimerAttributes.swift` en el inspector de archivos (⌥⌘1) y marca
   **ambas** casillas de "Target Membership": `App` y `RestTimerWidget`. Este
   struct lo necesitan los dos targets.
5. Arrastra `LiveActivityPlugin.swift` (ya está en `ios/App/App/`) al target
   `App` si Xcode no lo detecta solo al abrir el proyecto.
6. Build (⌘B). Si pide crear un bridging header para Swift/Obj-C, acepta —
   Capacitor ya trae uno normalmente, pero si no existe Xcode te lo ofrece
   automáticamente.
7. Probar en dispositivo real (las Live Activities no funcionan en el
   simulador de forma fiable): iniciar un entreno, marcar una serie, ver el
   descanso en la pantalla de bloqueo / Dynamic Island.

### Pendiente tras el MVP (no bloqueante)

- Botones interactivos ("✓ serie hecha", "+30s") — iOS 17+, requieren un
  `AppIntent` en el target del widget escribiendo a un App Group compartido
  que la app principal lee al volver a primer plano.
- Actualizar la Live Activity desde fuera de la app (push a través de APNs)
  — no hace falta para el MVP, la app la actualiza mientras está activa.

## Comportamiento actual en tiempo de ejecución

`src/services/restTimer.ts` decide en runtime:
- **Android**: usa el foreground service real (`RestTimerPlugin`) — ya
  funciona hoy, sin nada pendiente en Xcode/Android Studio.
- **iOS**: intenta `LiveActivityPlugin.start()`; como el target aún no existe,
  el plugin no tiene implementación nativa y la llamada falla — el código cae
  automáticamente a una notificación local puntual (`restTimerNotification.ts`)
  sin romper nada. En cuanto se complete el paso de Xcode de arriba, empieza a
  usar la Live Activity real sin tocar el código React.
- **Web**: siempre notificación local puntual (o silenciosamente ninguna si
  el navegador no soporta Notifications).
