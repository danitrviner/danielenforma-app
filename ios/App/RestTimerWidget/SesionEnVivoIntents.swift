import AppIntents
import ActivityKit
import Foundation

/// Los botones de la tarjeta de la pantalla de bloqueo.
///
/// Requieren iOS 17: Apple no permitió NINGÚN botón dentro de una Live
/// Activity hasta entonces. En iOS 16 la actividad se ve y la cuenta atrás
/// corre igual (la pinta el sistema desde `restEndsAt`), simplemente sin
/// estos controles — el atleta abre la app para apuntar, como siempre.
///
/// Cada intent hace dos cosas y en este orden:
///   1. Deja el toque en el buzón del App Group (la verdad, la app lo recoge).
///   2. Actualiza la actividad EN SU SITIO para que el número cambie al
///      instante bajo el dedo. Nunca abre una notificación nueva: §3.4 del
///      handoff, "un solo aviso por serie, nunca una cola apilada".
///
/// `openAppWhenRun = false` es lo que hace que esto funcione sin desbloquear.

@available(iOS 17.0, *)
struct AjustarCampoIntent: AppIntent {
    static var title: LocalizedStringResource = "Ajustar serie"
    static var openAppWhenRun: Bool = false

    /// "reps" | "weight" | "rir"
    @Parameter(title: "Campo") var campo: String
    /// +1 / -1. El PASO lo decide el campo, no quien pulsa.
    @Parameter(title: "Signo") var signo: Int

    init() {}
    init(campo: String, signo: Int) { self.campo = campo; self.signo = signo }

    func perform() async throws -> some IntentResult {
        await SesionEnVivoActividad.ajusta(campo: campo, signo: signo)
        return .result()
    }
}

@available(iOS 17.0, *)
struct SerieHechaIntent: AppIntent {
    static var title: LocalizedStringResource = "Serie hecha"
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        await SesionEnVivoActividad.serieHecha()
        return .result()
    }
}

@available(iOS 17.0, *)
struct MasTreintaIntent: AppIntent {
    static var title: LocalizedStringResource = "Treinta segundos más"
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        await SesionEnVivoActividad.sumaDescanso(segundos: 30)
        return .result()
    }
}

@available(iOS 17.0, *)
struct EmpezarYaIntent: AppIntent {
    static var title: LocalizedStringResource = "Empezar ya"
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        await SesionEnVivoActividad.terminaDescansoYa()
        return .result()
    }
}

/// Las mutaciones, en un sitio y no repartidas por los intents.
///
/// Todas siguen el mismo patrón: leer el estado actual de la actividad viva,
/// calcular el estado nuevo, anotar el toque y empujar la actualización.
@available(iOS 17.0, *)
enum SesionEnVivoActividad {

    /// Pasos del §3.3 del handoff. El paso lo manda el campo: reps ±1,
    /// peso ±2,5 kg, RIR ±1, con sus topes. Sudando y a una mano, un stepper
    /// que se pasa de rango es peor que uno que se queda quieto.
    private static func aplicaPaso(_ estado: inout RestTimerAttributes.ContentState, campo: String, signo: Int) {
        switch campo {
        case "reps":   estado.reps = min(30, max(0, estado.reps + signo))
        case "weight": estado.weight = min(300, max(0, estado.weight + Double(signo) * 2.5))
        case "rir":    estado.rir = min(5, max(0, estado.rir + signo))
        default: break
        }
    }

    private static var actividad: Activity<RestTimerAttributes>? {
        Activity<RestTimerAttributes>.activities.first
    }

    static func ajusta(campo: String, signo: Int) async {
        guard let actividad else { return }
        var estado = actividad.content.state
        aplicaPaso(&estado, campo: campo, signo: signo)
        estado.guardadoEn = Date()

        EnFormaBuzon.anota(.init(
            exIdx: estado.exIdx, setIdx: estado.setIdx,
            reps: estado.reps, weight: estado.weight, rir: estado.rir,
            done: nil, restEndsAt: nil,
            updatedAt: Date().timeIntervalSince1970 * 1000
        ))
        await actividad.update(ActivityContent(state: estado, staleDate: nil))
    }

    /// `HECHA`: cierra la serie, relanza el descanso completo y avanza el
    /// número de serie — todo sin desbloquear.
    static func serieHecha() async {
        guard let actividad else { return }
        var estado = actividad.content.state
        let ahora = Date()
        let fin = ahora.addingTimeInterval(TimeInterval(estado.restTotalSeconds))

        EnFormaBuzon.anota(.init(
            exIdx: estado.exIdx, setIdx: estado.setIdx,
            reps: estado.reps, weight: estado.weight, rir: estado.rir,
            done: true, restEndsAt: fin.timeIntervalSince1970 * 1000,
            updatedAt: ahora.timeIntervalSince1970 * 1000
        ))

        estado.restEndsAt = fin
        // La serie apuntada pasa a ser histórico de la siguiente: es lo que
        // el handoff llama "arranca desde lo de la última vez".
        estado.lastReps = estado.reps
        estado.lastWeight = estado.weight
        if estado.setNumber < estado.setTotal {
            estado.setNumber += 1
            estado.setIdx += 1
        }
        estado.guardadoEn = ahora
        await actividad.update(ActivityContent(state: estado, staleDate: nil))
    }

    static func sumaDescanso(segundos: Int) async {
        guard let actividad else { return }
        var estado = actividad.content.state
        // Si el descanso ya había llegado a 0, se suma desde AHORA y no desde
        // un fin que quedó atrás.
        let base = max(Date(), estado.restEndsAt)
        estado.restEndsAt = base.addingTimeInterval(TimeInterval(segundos))
        estado.restTotalSeconds += segundos
        await empuja(estado, actividad: actividad)
    }

    static func terminaDescansoYa() async {
        guard let actividad else { return }
        var estado = actividad.content.state
        estado.restEndsAt = Date()
        await empuja(estado, actividad: actividad)
    }

    private static func empuja(_ estado: RestTimerAttributes.ContentState, actividad: Activity<RestTimerAttributes>) async {
        EnFormaBuzon.anota(.init(
            exIdx: estado.exIdx, setIdx: estado.setIdx,
            reps: nil, weight: nil, rir: nil, done: nil,
            restEndsAt: estado.restEndsAt.timeIntervalSince1970 * 1000,
            updatedAt: Date().timeIntervalSince1970 * 1000
        ))
        await actividad.update(ActivityContent(state: estado, staleDate: nil))
    }
}
