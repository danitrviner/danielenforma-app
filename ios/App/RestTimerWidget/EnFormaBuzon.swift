import Foundation

/// Buzón compartido entre la app y la extensión del widget.
///
/// PERTENECE A DOS TARGETS (`App` y `RestTimerWidget`).
///
/// Los botones de la pantalla de bloqueo se ejecutan en el proceso de la
/// EXTENSIÓN, no en el WebView. No pueden tocar el `localStorage` del
/// borrador de sesión ni llamar a JavaScript. Lo único que comparten los dos
/// procesos es el contenedor del App Group, así que cada toque se deja aquí
/// escrito y la app lo recoge al volver a primer plano.
///
/// Si el App Group no está activado en el perfil de aprovisionamiento,
/// `UserDefaults(suiteName:)` devuelve `nil` y todo esto degrada a no
/// guardar nada — los botones se verán pero no escribirán. No revienta.
enum EnFormaBuzon {
    static let appGroup = "group.app.danielenforma.entreno"
    private static let clave = "toques_pendientes"

    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    /// Un toque. Describe el VALOR FINAL de la celda, no un incremento: por
    /// eso reaplicarlo dos veces da el mismo resultado (idempotente), que es
    /// lo que permite que la app lo aplique sin llevar la cuenta de cuáles ya
    /// vio.
    struct Toque: Codable {
        var exIdx: Int
        var setIdx: Int
        var reps: Int?
        var weight: Double?
        var rir: Int?
        var done: Bool?
        /// Epoch MILISEGUNDOS — el lado JS trabaja en ms, no en segundos.
        var restEndsAt: Double?
        var updatedAt: Double
    }

    static func anota(_ toque: Toque) {
        guard let defaults else { return }
        var pendientes = leePendientes()
        pendientes.append(toque)
        // Tope de seguridad: si la app pasa días sin abrirse, el buzón no
        // puede crecer sin fin en el contenedor compartido.
        if pendientes.count > 200 { pendientes.removeFirst(pendientes.count - 200) }
        if let data = try? JSONEncoder().encode(pendientes) {
            defaults.set(data, forKey: clave)
        }
    }

    static func leePendientes() -> [Toque] {
        guard let data = defaults?.data(forKey: clave),
              let toques = try? JSONDecoder().decode([Toque].self, from: data) else { return [] }
        return toques
    }

    /// Lee y vacía. Cada toque se aplica una sola vez.
    static func vacia() -> [Toque] {
        let toques = leePendientes()
        defaults?.removeObject(forKey: clave)
        return toques
    }
}
