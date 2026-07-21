import ActivityKit
import WidgetKit
import SwiftUI

// Vista de la Live Activity: pantalla de bloqueo + banner + Dynamic Island.
// Colores alineados con la paleta de la app (fondo #111110, acento #fbcb1a).
struct RestTimerWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            // Pantalla de bloqueo / banner
            HStack(spacing: 12) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2)
                    .foregroundColor(Color(red: 0.98, green: 0.80, blue: 0.10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.secondsLeft > 0 ? "Descanso" : "¡Listo!")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(timeString(context.state.secondsLeft))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("Siguiente: \(context.attributes.exerciseName)")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(Color(red: 0.07, green: 0.07, blue: 0.06))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .foregroundColor(Color(red: 0.98, green: 0.80, blue: 0.10))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timeString(context.state.secondsLeft))
                        .font(.system(.title3, design: .rounded)).bold()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.exerciseName)
                        .font(.caption)
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                Text(timeString(context.state.secondsLeft))
                    .font(.caption2).bold()
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }

    private func timeString(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}
