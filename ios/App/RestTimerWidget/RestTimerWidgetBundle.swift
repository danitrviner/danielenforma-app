import WidgetKit
import SwiftUI

// Punto de entrada del target de Widget Extension — Xcode genera uno de estos
// automáticamente al crear el target ("Include Live Activity" marcado); si el
// generado ya existe, basta con añadir `RestTimerWidgetLiveActivity()` a su
// `body` en vez de sustituir el archivo entero.
//
// F5 del plan de réplica FITIV: `CardioLiveActivity()` se añade aquí mismo —
// un WidgetBundle admite varias Live Activities distintas, no hace falta un
// target de extensión nuevo por cada una.
@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerWidgetLiveActivity()
        CardioLiveActivity()
    }
}
