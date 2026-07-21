import Foundation
import ActivityKit
import Capacitor

// Puente React → Live Activity. Espejo de src/services/restTimer.ts y del
// RestTimerPlugin.kt de Android: start(exerciseName, seconds) arranca (o
// actualiza, si ya hay una activa) la Live Activity; stop() la cierra.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var currentActivity: Activity<RestTimerAttributes>?

    @available(iOS 16.1, *)
    @objc func start(_ call: CAPPluginCall) {
        let exerciseName = call.getString("exerciseName") ?? "tu ejercicio"
        let seconds = call.getInt("seconds") ?? 0

        let attributes = RestTimerAttributes(exerciseName: exerciseName)
        let state = RestTimerAttributes.ContentState(secondsLeft: seconds, totalSeconds: seconds)

        do {
            if let activity = currentActivity {
                Task { await activity.update(using: state) }
            } else {
                currentActivity = try Activity.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: nil)
                )
            }
            call.resolve()
        } catch {
            call.reject("No se pudo iniciar la Live Activity: \(error.localizedDescription)")
        }
    }

    @available(iOS 16.1, *)
    @objc func stop(_ call: CAPPluginCall) {
        Task {
            await currentActivity?.end(nil, dismissalPolicy: .immediate)
            currentActivity = nil
            call.resolve()
        }
    }
}
