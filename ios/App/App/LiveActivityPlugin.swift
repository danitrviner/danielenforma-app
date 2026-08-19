import Foundation
import ActivityKit
import Capacitor

// Puente React → Live Activity. Espejo de src/services/restTimer.ts y del
// RestTimerPlugin.kt de Android: start(exerciseName, seconds) arranca (o
// actualiza, si ya hay una activa) la Live Activity; stop() la cierra.
//
// `02-9`. Este fichero llevaba desde el 21 de julio en el repo SIN PERTENECER A
// NINGÚN TARGET, así que nunca pasó por el compilador. Al meterlo (13 ago)
// salieron tres errores reales de disponibilidad que llevaban ahí todo ese
// tiempo, y que son la razón de que esto no sea trivial:
//
//   · `Activity<…>` como propiedad almacenada exige iOS 16.1, pero el
//     deployment target de la app es más bajo. Una propiedad almacenada no
//     admite `@available`, así que se guarda como `Any?` y se castea dentro de
//     los bloques que sí están protegidos. Es feo y es la forma correcta.
//   · `Activity.request(attributes:content:pushType:)` y
//     `end(_:dismissalPolicy:)` exigen 16.2, no 16.1.
//
// Fuera de esas versiones el plugin no falla: resuelve sin hacer nada, y el
// descanso se degrada a la notificación local que ya funciona. Que un iPhone
// viejo no tenga Live Activity no puede dejar al atleta sin aviso de descanso.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// `Activity<RestTimerAttributes>?` en cuanto se castea. Se almacena como
    /// `Any?` porque una propiedad almacenada no puede llevar `@available` y el
    /// deployment target de la app es anterior a iOS 16.1.
    private var currentActivity: Any?

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            // Sin Live Activity, pero sin romper: el descanso ya avisa por
            // notificación local (services/restTimer.ts).
            call.resolve()
            return
        }

        let exerciseName = call.getString("exerciseName") ?? "tu ejercicio"
        let seconds = call.getInt("seconds") ?? 0

        let state = RestTimerAttributes.ContentState(secondsLeft: seconds, totalSeconds: seconds)

        // Si ya hay una activity viva, se actualiza en vez de abrir otra: el
        // atleta encadena series y no puede acabar con seis cronómetros.
        if let activity = currentActivity as? Activity<RestTimerAttributes> {
            Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
            call.resolve()
            return
        }

        // `areActivitiesEnabled` es el interruptor del sistema: si el usuario ha
        // desactivado las Live Activities, `request` lanza. Preguntar antes
        // evita convertir una preferencia suya en un error en pantalla.
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve()
            return
        }

        do {
            currentActivity = try Activity.request(
                attributes: RestTimerAttributes(exerciseName: exerciseName),
                content: ActivityContent(state: state, staleDate: nil)
            )
            call.resolve()
        } catch {
            call.reject("No se pudo iniciar la Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        guard let activity = currentActivity as? Activity<RestTimerAttributes> else {
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
