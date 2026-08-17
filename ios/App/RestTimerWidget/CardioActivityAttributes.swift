import ActivityKit
import Foundation

// Definición compartida de la Live Activity de cardio (F5 del plan de
// réplica FITIV). Target membership doble, igual que RestTimerAttributes:
// App (arranca/actualiza desde CardioActivityPlugin.swift) y RestTimerWidget
// (la renderiza, ver CardioLiveActivity.swift).
//
// A diferencia del descanso, aquí el reloj SUBE (cronómetro de sesión, no
// cuenta atrás) y hace falta un `update` real por tick: el descanso tiene un
// valor fijo al arrancar y `start()` hace de `update` con solo volver a
// llamarlo; cardio actualiza BPM y zona en vivo mientras dura la sesión.
struct CardioActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var elapsedSec: Int
        var bpm: Int
        var zoneLabel: String
        /// Hex tal cual lo manda JS (`ZONE_COLOR` de cardioZones.ts, la
        /// fuente de verdad) — así Swift no mantiene una segunda copia de la
        /// paleta de zonas que se pueda desincronizar de la real.
        var zoneColorHex: String
        /// "Bloque 2/4 · Sprint" en intervalos, "Objetivo: Z2 Base aeróbica"
        /// en zona 2, o vacío en libre.
        var phaseText: String
    }

    /// Fijo durante toda la sesión: "Libre" · "Zona 2" · "Intervalos".
    var sessionTitle: String
}
