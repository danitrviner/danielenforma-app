import WidgetKit
import SwiftUI

// Punto de entrada del target de Widget Extension — Xcode genera uno de estos
// automáticamente al crear el target ("Include Live Activity" marcado); si el
// generado ya existe, basta con añadir `RestTimerWidgetLiveActivity()` a su
// `body` en vez de sustituir el archivo entero.
@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerWidgetLiveActivity()
    }
}
