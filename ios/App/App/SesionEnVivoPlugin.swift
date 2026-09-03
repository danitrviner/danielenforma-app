import Foundation
import ActivityKit
import Capacitor

/// Puente React → actividad en vivo. Espejo de `src/services/sesionEnVivo.ts`
/// y del `SesionEnVivoPlugin.kt` de Android.
///
/// Sustituye a `LiveActivityPlugin`, que solo sabía `start(nombre, segundos)`
/// y `stop()`. Ahora la actividad vive durante TODA la sesión y lleva el
/// estado completo de la serie, no solo un cronómetro.
///
/// ── Por qué tanto `#available` ────────────────────────────────────────────
/// `Activity<…>` como propiedad almacenada exige iOS 16.1, y una propiedad
/// almacenada no admite `@available`; `request`/`end` exigen 16.2. Fuera de
/// esas versiones el plugin resuelve sin hacer nada y el descanso se degrada
/// a la notificación local programada, que ya avisa igual. Que un iPhone
/// viejo no tenga actividad en vivo no puede dejar al atleta sin aviso.
@objc(SesionEnVivoPlugin)
public class SesionEnVivoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SesionEnVivoPlugin"
    public let jsName = "SesionEnVivo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leerBuzon", returnType: CAPPluginReturnPromise),
    ]

    /// `Activity<RestTimerAttributes>?` en cuanto se castea.
    private var actividad: Any?

    // MARK: - Lectura de la llamada

    @available(iOS 16.1, *)
    private func estado(de call: CAPPluginCall) -> RestTimerAttributes.ContentState {
        // `restEndsAt` viaja en epoch MILISEGUNDOS porque es lo que produce
        // `Date.now()` en JS. Convertirlo aquí y no allí evita que alguien
        // mande segundos por error y el descanso acabe en 1970.
        let finMs = call.getDouble("restEndsAt") ?? 0
        let fin = finMs > 0 ? Date(timeIntervalSince1970: finMs / 1000) : Date()
        return RestTimerAttributes.ContentState(
            restEndsAt: fin,
            restTotalSeconds: call.getInt("restTotalSeconds") ?? 0,
            exerciseName: call.getString("exerciseName") ?? "tu ejercicio",
            exIdx: call.getInt("exIdx") ?? 0,
            setIdx: call.getInt("setIdx") ?? 0,
            setNumber: call.getInt("setNumber") ?? 1,
            setTotal: call.getInt("setTotal") ?? 1,
            reps: call.getInt("reps") ?? 0,
            weight: call.getDouble("weight") ?? 0,
            rir: call.getInt("rir") ?? 0,
            lastReps: call.getInt("lastReps"),
            lastWeight: call.getDouble("lastWeight"),
            guardadoEn: nil
        )
    }

    /// A los 20 min sin tocar nada la actividad se cierra sola y la sesión
    /// queda guardada como incompleta, sin perder ninguna serie (§3.4). Lo
    /// hace el SISTEMA con esta fecha: no depende de que la app siga viva.
    private var caducidad: Date { Date().addingTimeInterval(20 * 60) }

    // MARK: - API

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }

        let nuevo = estado(de: call)

        // Si ya hay una viva se actualiza en vez de abrir otra: encadenar
        // series no puede dejar seis cronómetros en la pantalla de bloqueo.
        if let a = actividad as? Activity<RestTimerAttributes> {
            Task { await a.update(ActivityContent(state: nuevo, staleDate: caducidad)) }
            call.resolve()
            return
        }

        // Reengancharse a una actividad que sobrevivió a que el sistema
        // matara la app: sin esto, volver al entreno abriría una segunda.
        if let viva = Activity<RestTimerAttributes>.activities.first {
            actividad = viva
            Task { await viva.update(ActivityContent(state: nuevo, staleDate: caducidad)) }
            call.resolve()
            return
        }

        // Interruptor del sistema: si el usuario ha desactivado las
        // actividades en vivo, `request` lanza. Preguntar antes evita
        // convertir una preferencia suya en un error en pantalla.
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(); return }

        do {
            actividad = try Activity.request(
                attributes: RestTimerAttributes(assignmentId: call.getString("assignmentId") ?? ""),
                content: ActivityContent(state: nuevo, staleDate: caducidad)
            )
            call.resolve()
        } catch {
            call.reject("No se pudo iniciar la actividad en vivo: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let a = (actividad as? Activity<RestTimerAttributes>) ?? Activity<RestTimerAttributes>.activities.first
        guard let a else { start(call); return }
        actividad = a
        let nuevo = estado(de: call)
        Task {
            await a.update(ActivityContent(state: nuevo, staleDate: caducidad))
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let vivas = Activity<RestTimerAttributes>.activities
        actividad = nil
        Task {
            // Todas, no solo la que tenemos guardada: si el sistema mató la
            // app y se reengancharon mal, aquí se limpia el rastro entero.
            for a in vivas { await a.end(nil, dismissalPolicy: .immediate) }
            call.resolve()
        }
    }

    /// Lo apuntado desde la pantalla de bloqueo. Vacía el buzón: cada toque
    /// se aplica una sola vez.
    @objc func leerBuzon(_ call: CAPPluginCall) {
        let toques = EnFormaBuzon.vacia().map { t -> [String: Any] in
            var d: [String: Any] = ["exIdx": t.exIdx, "setIdx": t.setIdx, "updatedAt": t.updatedAt]
            if let v = t.reps { d["reps"] = v }
            if let v = t.weight { d["weight"] = v }
            if let v = t.rir { d["rir"] = v }
            if let v = t.done { d["done"] = v }
            if let v = t.restEndsAt { d["restEndsAt"] = v }
            return d
        }
        call.resolve(["toques": toques])
    }
}
