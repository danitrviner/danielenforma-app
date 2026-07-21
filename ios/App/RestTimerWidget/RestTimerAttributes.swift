import ActivityKit
import Foundation

// Definición compartida de la Live Activity del descanso entre series.
//
// IMPORTANTE (ver docs/WIDGET_BLOQUEO_TODO.md): este archivo debe pertenecer
// a DOS targets a la vez — el target principal "App" (que arranca/actualiza
// la activity desde LiveActivityPlugin.swift) y el nuevo target de Widget
// Extension "RestTimerWidget" (que la renderiza). En el inspector de
// archivos de Xcode, marca ambas casillas de "Target Membership".
struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var secondsLeft: Int
        var totalSeconds: Int
    }

    // Fijo durante toda la vida de la activity (no cambia con cada tick).
    var exerciseName: String
}
