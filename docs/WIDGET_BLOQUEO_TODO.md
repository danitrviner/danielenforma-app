# Notificaciones, actividad en vivo y pantalla de bloqueo

> Fuente de verdad del bloque: `~/Downloads/design_handoff_notificaciones/README.md`.
> Este documento cubre solo el estado de la implementación.
> Actualizado: **2026-09-03**. Sustituye por completo a la versión de julio,
> que describía un TODO manual en Xcode que ya no existe.

## El bug que se arregla

El descanso se modelaba como un número de segundos que alguien iba
decrementando (`CountDownTimer` en Android, `secondsLeft: Int` empujado desde
la app en iOS). Eso obliga a que la app esté viva para refrescarlo, y con la
pantalla bloqueada el sistema congela el proceso: la cifra se quedaba clavada
en el segundo en que se apagó la pantalla.

Ahora el descanso es **`restEndsAt`, un instante**, y la cuenta atrás la pinta
el sistema:

| | Antes | Ahora |
|---|---|---|
| iOS | `secondsLeft: Int` empujado desde la app | `Text(timerInterval:)` sobre `restEndsAt: Date` |
| Android | `CountDownTimer` renotificando cada segundo | `Chronometer` con `setChronometerCountDown` |
| React | `endsAtMs` en memoria, se perdía al morir la app | `endsAtMs` persistido (`utils/sesionEnCurso.ts`) |

Cero actualizaciones nuestras. Corre con el móvil bloqueado, en otra app y con
el proceso muerto.

## Piezas

**Web (`src/`)**
- `services/sesionEnVivo.ts` — única vía de salida hacia el nativo. Publica el
  estado entero y (re)programa el aviso. Sustituye a `services/restTimer.ts`.
- `services/restTimerNotification.ts` — notificaciones **programadas** de fin
  de descanso y del «¿Sigues ahí?» a los 3 min. Dos ids fijos, nunca una cola.
- `utils/sesionEnCurso.ts` — `guardarDescanso`/`cargarDescanso`, clave hermana
  del borrador de series. Caduca a los 20 min de terminar.
- `components/training/WorkoutSessionPlayer.tsx` — publica el estado en cada
  cambio y aplica el buzón al volver a primer plano.

**iOS (`ios/App/`)**
- `RestTimerWidget/RestTimerAttributes.swift` — estado compartido. Dos targets.
- `RestTimerWidget/EnFormaBuzon.swift` — buzón del App Group. Dos targets.
- `RestTimerWidget/SesionEnVivoIntents.swift` — los botones (iOS 17+).
- `RestTimerWidget/RestTimerWidgetLiveActivity.swift` — la vista.
- `App/SesionEnVivoPlugin.swift` — puente Capacitor. Sustituye a
  `LiveActivityPlugin.swift`.

**Android (`android/app/src/main/`)**
- `java/.../SesionEnVivoService.kt` — foreground service con layout propio.
- `java/.../SesionEnVivoBuzon.kt` — buzón en SharedPreferences.
- `java/.../SesionEnVivoPlugin.kt` — puente Capacitor.
- `res/layout/sesion_en_vivo.xml` — la tarjeta. Layout propio y no una
  notificación estándar porque una estándar solo admite 3 acciones y aquí
  hacen falta 8.
- `RestTimerService.kt` / `RestTimerPlugin.kt` — **borrados**.

## ⚠️ Paso pendiente que NO puede hacer Claude Code

**Activar el App Group `group.app.danielenforma.entreno`** en la cuenta de
Apple Developer. Los `.entitlements` de los dos targets ya lo declaran, pero
el App ID tiene que tenerlo habilitado o el perfil de aprovisionamiento no lo
firmará.

1. developer.apple.com → Certificates, IDs & Profiles → **Identifiers**.
2. **App Groups** → `+` → nombre «En Forma entreno», id
   `group.app.danielenforma.entreno`.
3. En **App IDs**, `app.danielenforma.entreno` → App Groups → Edit → marcarlo.
4. Lo mismo en `app.danielenforma.entreno.temporizador` (la extensión).
5. En Xcode, dejar que regenere los perfiles (Automatically manage signing).

**Qué pasa si no se hace:** la tarjeta se ve y la cuenta atrás corre, pero
`UserDefaults(suiteName:)` devuelve `nil` y **lo que se apunte desde la
pantalla de bloqueo no llega nunca a la app**. Falla en silencio, sin error.

## Qué está verificado y qué no

Verificado en esta máquina:
- iOS: `xcodebuild` de `App` + `RestTimerWidget` → **BUILD SUCCEEDED**.
- Android: `./gradlew :app:assembleDebug` → **APK generado**.
- 1.264 tests verdes, typecheck y eslint limpios.

**Sin verificar — hace falta un móvil de verdad:**
- Que la cuenta atrás siga corriendo con la pantalla bloqueada.
- Que los botones del bloqueo escriban y que la app los recoja (depende del
  App Group de arriba).
- El aspecto real de la tarjeta: alto disponible, truncados, contraste.
- Las Live Activities no son fiables en el simulador.

## Límites conocidos

- **Los botones son iOS 17+.** Apple no permitió ninguno antes. En iOS 16 la
  tarjeta se ve y la cuenta atrás corre; para apuntar se abre la app.
- **No hay «mantener pulsado» para escribir un valor raro.** Dentro de una
  Live Activity el long-press lo secuestra el sistema. Tocar la tarjeta abre
  la app.
- **Tipografías.** El handoff pide IBM Plex Mono y Archivo; la extensión no
  las lleva empaquetadas y usa las monoespaciadas del sistema con los mismos
  pesos. Meter los `.ttf` en el `.appex` por una cifra no compensa.
- **Nada se escribe en Firestore desde el bloqueo.** Los toques van al
  borrador local y suben con «Terminar sesión», igual que el resto de la
  sesión.
