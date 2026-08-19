import ActivityKit
import WidgetKit
import SwiftUI

// Vista de la Live Activity de cardio — pantalla de bloqueo + banner +
// Dynamic Island, según el panel 06 "Isla dinámica y pantalla bloqueada" del
// prototipo aprobado de Fase 3 (docs/design/fase3/Cardio - Experiencia.dc.html):
// "EN FORMA · CARDIO", cronómetro, FC + zona. "La isla cambia de color con la
// fase" — aquí la fase es la zona de FC, así que el icono y el trailing usan
// `zoneColorHex` en vez de un color fijo.
//
// Colores alineados con la paleta ACTUAL del DS (#050505/#FFC72C) — el
// widget del descanso se quedó con la paleta vieja (#111110/#fbcb1a) porque
// nadie lo tocó al migrar; aquí se corrige desde el primer día.
struct CardioLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CardioActivityAttributes.self) { context in
            HStack(spacing: 12) {
                Image(systemName: "heart.fill")
                    .font(.title2)
                    .foregroundColor(Color(hex: context.state.zoneColorHex))
                VStack(alignment: .leading, spacing: 2) {
                    Text("EN FORMA · \(context.attributes.sessionTitle.uppercased())")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text(timeString(context.state.elapsedSec))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("\(context.state.bpm) ppm · \(context.state.zoneLabel)")
                        .font(.caption)
                        .foregroundColor(Color(hex: context.state.zoneColorHex))
                    if !context.state.phaseText.isEmpty {
                        Text(context.state.phaseText)
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(Color(hex: "#050505"))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "heart.fill")
                        .foregroundColor(Color(hex: context.state.zoneColorHex))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timeString(context.state.elapsedSec))
                        .font(.system(.title3, design: .rounded)).bold()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.phaseText.isEmpty ? "\(context.state.bpm) ppm · \(context.state.zoneLabel)" : context.state.phaseText)
                        .font(.caption)
                }
            } compactLeading: {
                Image(systemName: "heart.fill")
                    .foregroundColor(Color(hex: context.state.zoneColorHex))
            } compactTrailing: {
                Text("\(context.state.bpm)")
                    .font(.caption2).bold()
            } minimal: {
                Image(systemName: "heart.fill")
                    .foregroundColor(Color(hex: context.state.zoneColorHex))
            }
        }
    }

    private func timeString(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private extension Color {
    /// Parsea "#RRGGBB" — el mismo formato que `ZONE_COLOR` de cardioZones.ts.
    /// Un hex inválido cae a blanco en vez de crashear: un fallo de red al
    /// mandar el color nunca puede tirar el widget.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt64(s, radix: 16) else {
            self = .white
            return
        }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self = Color(red: r, green: g, blue: b)
    }
}
