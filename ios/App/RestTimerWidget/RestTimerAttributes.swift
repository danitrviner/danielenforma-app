import ActivityKit
import Foundation

/// Estado de la sesión de entreno que se ve en la isla y en la pantalla de
/// bloqueo. Espejo exacto de `EstadoEnVivo` en `src/services/sesionEnVivo.ts`.
///
/// PERTENECE A DOS TARGETS: `App` (que arranca y actualiza la actividad) y
/// `RestTimerWidget` (que la pinta). En el inspector de archivos de Xcode
/// tienen que estar las dos casillas de "Target Membership" marcadas.
///
/// ── Por qué `restEndsAt: Date` y no `secondsLeft: Int` ──────────────────
/// Un entero de segundos restantes obliga a la app a estar viva para
/// refrescarlo. Con el móvil bloqueado el sistema congela el proceso, así que
/// la cifra se quedaba clavada en el segundo en que se apagó la pantalla: el
/// bug que había que arreglar. Mandando el INSTANTE de fin, la vista usa
/// `Text(timerInterval:)` y la cuenta atrás la pinta el propio sistema, sin
/// una sola actualización nuestra. Corre con el móvil bloqueado, en otra app
/// y con la app muerta.
struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Fin del descanso. En el PASADO significa "a por la serie N": la
        /// actividad no se cierra, cuenta hacia arriba en gris.
        var restEndsAt: Date
        /// Segundos prescritos — para la barra de progreso y el "DE 2:00".
        var restTotalSeconds: Int

        var exerciseName: String
        /// Coordenadas dentro de `playerSets`. Viajan de vuelta en el buzón
        /// tal cual, que es lo que permite aplicar el toque sin adivinar.
        var exIdx: Int
        var setIdx: Int
        /// 1-based, solo para "serie 3 de 4".
        var setNumber: Int
        var setTotal: Int

        /// Lo que se está apuntando ahora mismo.
        var reps: Int
        var weight: Double
        var rir: Int

        /// Histórico. `nil` = no hay: la línea "arranca desde lo de la última
        /// vez" se OMITE. No se rellena con nada inventado.
        var lastReps: Int?
        var lastWeight: Double?

        /// Momento del último toque desde el bloqueo, para el sello GUARDADO.
        var guardadoEn: Date?

        var enDescanso: Bool { restEndsAt > Date() }
    }

    /// Fijo durante toda la vida de la actividad. El ejercicio va en el
    /// estado, no aquí: cambia al pasar de ejercicio sin cerrar la sesión.
    var assignmentId: String
}
