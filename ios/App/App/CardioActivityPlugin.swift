import Foundation
import ActivityKit
import Capacitor

// Puente React → Live Activity de cardio (F5 del plan de réplica FITIV).
// Espejo de LiveActivityPlugin.swift, pero con un `update` real: el
// descanso tiene un valor fijo al arrancar y su `start()` hace de `update`
// con solo volver a llamarlo — cardio necesita refrescar BPM y zona muchas
// veces durante la misma sesión, así que hace falta el tercer método.
//
// El throttle de "como mucho cada 2 s, y solo si cambió algo que se vea" vive
// en el lado TypeScript (src/services/cardioLiveActivity.ts), no aquí: es
// donde ya vive el tick de la sesión, y así no hay que duplicar esa lógica
// en Swift/Kotlin. Este plugin llama a `update()` de ActivityKit cada vez
// que se le pide, sin decidir por su cuenta si toca o no.
@objc(CardioActivityPlugin)
public class CardioActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CardioActivityPlugin"
    public let jsName = "CardioActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// `Activity<CardioActivityAttributes>?` en cuanto se castea — `Any?` por
    /// la misma razón que en LiveActivityPlugin.swift: una propiedad
    /// almacenada no admite `@available` y el deployment target de la app es
    /// anterior a iOS 16.1.
    private var currentActivity: Any?

    private func readState(_ call: CAPPluginCall) -> CardioActivityAttributes.ContentState {
        CardioActivityAttributes.ContentState(
            elapsedSec: call.getInt("elapsedSec") ?? 0,
            bpm: call.getInt("bpm") ?? 0,
            zoneLabel: call.getString("zoneLabel") ?? "",
            zoneColorHex: call.getString("zoneColorHex") ?? "#FFFFFF",
            phaseText: call.getString("phaseText") ?? ""
        )
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            // Sin Live Activity la sesión sigue viva igual (F2 + F5b, el
            // UIBackgroundModes de Info.plist son el mecanismo real) — solo
            // se pierde la pantalla de bloqueo, no la sesión.
            call.resolve()
            return
        }

        let sessionTitle = call.getString("sessionTitle") ?? "Cardio"
        let state = readState(call)

        if let activity = currentActivity as? Activity<CardioActivityAttributes> {
            Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
            call.resolve()
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve()
            return
        }

        do {
            currentActivity = try Activity.request(
                attributes: CardioActivityAttributes(sessionTitle: sessionTitle),
                content: ActivityContent(state: state, staleDate: nil)
            )
            call.resolve()
        } catch {
            call.reject("No se pudo iniciar la Live Activity de cardio: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        guard let activity = currentActivity as? Activity<CardioActivityAttributes> else {
            // No hay activity viva (nunca se pidió, o el usuario las tiene
            // desactivadas) — no es un error, simplemente no hay nada que
            // actualizar.
            call.resolve()
            return
        }
        let state = readState(call)
        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        guard let activity = currentActivity as? Activity<CardioActivityAttributes> else {
            call.resolve()
            return
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            currentActivity = nil
            call.resolve()
        }
    }
}
