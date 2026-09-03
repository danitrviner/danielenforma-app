import ActivityKit
import AppIntents
import WidgetKit
import SwiftUI

/// Paleta del handoff (§6). Se declara aquí y no se importa de la app: la
/// extensión es otro binario y no comparte el CSS ni los tokens de Tailwind.
private enum EF {
    static let oro       = Color(red: 1.00, green: 0.78, blue: 0.17)   // #FFC72C
    static let tinta     = Color(red: 0.96, green: 0.96, blue: 0.96)   // #F5F5F4
    static let negro     = Color(red: 0.043, green: 0.043, blue: 0.043) // #0B0B0B
    static let fondo     = Color(red: 0.078, green: 0.078, blue: 0.078) // rgba(20,20,20,.72)
    static let celda     = Color.white.opacity(0.05)
    static let borde     = Color.white.opacity(0.09)
    static let apagado   = Color.white.opacity(0.45)
    static let mudo      = Color.white.opacity(0.34)
}

/// Tipografía: el handoff pide IBM Plex Mono para los datos. La extensión no
/// lleva las fuentes empaquetadas, así que se usa la monoespaciada del
/// sistema con los mismos pesos y tracking. Es la desviación consciente —
/// meter el .ttf en el .appex por una cifra no compensa el peso ni el riesgo.
private func mono(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
    .system(size: size, weight: weight, design: .monospaced)
}

struct RestTimerWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            TarjetaBloqueo(estado: context.state)
                .padding(18)
                .activityBackgroundTint(EF.fondo)
                .activitySystemActionForegroundColor(EF.tinta)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { LogoEF(lado: 34) }
                DynamicIslandExpandedRegion(.trailing) {
                    Cronometro(estado: s, tamano: 30)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("\(s.exerciseName) · serie \(s.setNumber) de \(s.setTotal)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(EF.tinta)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if #available(iOS 17.0, *) {
                        HStack(spacing: 8) {
                            Button(intent: MasTreintaIntent()) {
                                Text("+30 S").font(mono(12)).frame(maxWidth: .infinity)
                            }
                            .tint(Color.white.opacity(0.07))
                            Button(intent: EmpezarYaIntent()) {
                                Text("SIGUIENTE").font(mono(12)).frame(maxWidth: .infinity)
                            }
                            .tint(EF.oro)
                        }
                        .buttonStyle(.borderedProminent)
                        .frame(height: 42)
                    }
                }
            } compactLeading: {
                // La isla contraída no desaparece al acabar el descanso: sin
                // descanso muestra el punto y el número de serie (§3.1).
                HStack(spacing: 4) {
                    Circle().fill(EF.oro).frame(width: 9, height: 9)
                    if !s.enDescanso {
                        Text("S\(s.setNumber)").font(mono(13)).foregroundStyle(EF.oro)
                    }
                }
            } compactTrailing: {
                if s.enDescanso {
                    Cronometro(estado: s, tamano: 14)
                }
            } minimal: {
                Circle().fill(EF.oro).frame(width: 9, height: 9)
            }
            .keylineTint(EF.oro)
        }
    }
}

/// El logo `EF` — Archivo 900 en el handoff; aquí el peso más pesado del
/// sistema, por lo mismo que la mono.
private struct LogoEF: View {
    var lado: CGFloat
    var body: some View {
        Text("EF")
            .font(.system(size: lado * 0.42, weight: .black))
            .foregroundStyle(EF.negro)
            .frame(width: lado, height: lado)
            .background(EF.oro, in: RoundedRectangle(cornerRadius: lado * 0.28, style: .continuous))
    }
}

/// La cuenta atrás.
///
/// ESTE ES EL ARREGLO. `Text(timerInterval:)` no es un formateo: le da al
/// sistema el intervalo y lo redibuja ÉL, con la app congelada, muerta o el
/// móvil bloqueado. Cero actualizaciones desde la app. Por eso el estado
/// lleva `restEndsAt` y no unos segundos que había que ir empujando.
///
/// Pasado el fin, el mismo componente cuenta hacia ARRIBA en gris: la
/// actividad no desaparece sola (§3.2).
private struct Cronometro: View {
    var estado: RestTimerAttributes.ContentState
    var tamano: CGFloat

    var body: some View {
        Group {
            if estado.enDescanso {
                Text(timerInterval: Date()...estado.restEndsAt, countsDown: true)
                    .foregroundStyle(EF.oro)
            } else {
                Text(timerInterval: estado.restEndsAt...Date.distantFuture, countsDown: false)
                    .foregroundStyle(EF.apagado)
            }
        }
        .font(mono(tamano))
        .monospacedDigit()
        .tracking(-tamano * 0.05)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

/// La tarjeta de la pantalla de bloqueo: cuenta atrás dominante arriba y las
/// tres celdas para apuntar debajo. El handoff las dibuja como dos pantallas
/// (§3.2 descanso y §3.3 apuntar), pero en el móvil son el mismo momento —
/// separarlas obligaría a que el atleta esperase a que acabara el descanso
/// para poder apuntar, que es justo lo que se quería quitar.
private struct TarjetaBloqueo: View {
    var estado: RestTimerAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                LogoEF(lado: 26)
                Text(estado.enDescanso ? "EN FORMA · DESCANSO" : "A POR LA SERIE \(estado.setNumber)")
                    .font(mono(10, .semibold))
                    .tracking(1.0)
                    .foregroundStyle(estado.enDescanso ? EF.apagado : EF.oro)
                Spacer()
                if let guardado = estado.guardadoEn, Date().timeIntervalSince(guardado) < 1.4 {
                    // Sello de guardado: mono ORO. Nunca verde — está fuera
                    // de paleta (§8 del handoff maestro).
                    Text("GUARDADO").font(mono(11)).foregroundStyle(EF.oro)
                }
            }

            HStack(alignment: .bottom, spacing: 12) {
                Cronometro(estado: estado, tamano: 52)
                    .layoutPriority(1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(estado.exerciseName)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(EF.tinta)
                        .lineLimit(1)
                    Text("SERIE \(estado.setNumber) DE \(estado.setTotal) · DE \(formatoMinutos(estado.restTotalSeconds))")
                        .font(mono(10, .medium))
                        .tracking(0.8)
                        .foregroundStyle(EF.apagado)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }

            if estado.enDescanso {
                // La barra también la anima el sistema desde las fechas.
                ProgressView(timerInterval: inicioEstimado...estado.restEndsAt, countsDown: true) {
                    EmptyView()
                } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.linear)
                    .tint(EF.oro)
                    .frame(height: 4)
            }

            if #available(iOS 17.0, *) {
                HStack(spacing: 8) {
                    Celda(etiqueta: "REPS", valor: "\(estado.reps)", campo: "reps")
                    Celda(etiqueta: "PESO", valor: formatoPeso(estado.weight), campo: "weight")
                    Celda(etiqueta: "RIR", valor: "\(estado.rir)", campo: "rir")
                }

                if let r = estado.lastReps, let w = estado.lastWeight {
                    // Si no hay histórico esta línea NO aparece. No se rellena
                    // con el objetivo ni con nada inventado (§3.3).
                    Text("ARRANCA DESDE LO DE LA ÚLTIMA VEZ · \(r) × \(formatoPeso(w)) KG")
                        .font(mono(9.5, .medium))
                        .foregroundStyle(EF.mudo)
                        .frame(maxWidth: .infinity)
                }

                HStack(spacing: 8) {
                    Button(intent: MasTreintaIntent()) {
                        Text("+30 S").font(mono(12)).frame(maxWidth: .infinity)
                    }
                    .tint(Color.white.opacity(0.07))
                    if estado.enDescanso {
                        Button(intent: EmpezarYaIntent()) {
                            Text("EMPEZAR YA").font(mono(12)).frame(maxWidth: .infinity)
                        }
                        .tint(EF.oro)
                    } else {
                        Button(intent: SerieHechaIntent()) {
                            Text("HECHA").font(mono(12)).frame(maxWidth: .infinity)
                        }
                        .tint(EF.oro)
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(height: 44)
            }
        }
    }

    /// El inicio que la barra necesita. Se deduce del total prescrito en vez
    /// de guardarse: un campo más en el estado que solo sirve para pintar una
    /// barra no compensa.
    private var inicioEstimado: Date {
        estado.restEndsAt.addingTimeInterval(-TimeInterval(max(estado.restTotalSeconds, 1)))
    }
}

/// Una celda con su par de botones. El `−` apagado, el `+` en oro tenue con
/// el glifo oro, como en el handoff.
@available(iOS 17.0, *)
private struct Celda: View {
    var etiqueta: String
    var valor: String
    var campo: String

    var body: some View {
        VStack(spacing: 6) {
            Text(etiqueta)
                .font(mono(9, .semibold))
                .tracking(0.9)
                .foregroundStyle(EF.mudo)
            Text(valor)
                .font(mono(22))
                .foregroundStyle(EF.tinta)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 6) {
                Button(intent: AjustarCampoIntent(campo: campo, signo: -1)) {
                    Text("−").font(.system(size: 16, weight: .bold)).frame(maxWidth: .infinity)
                }
                .tint(Color.white.opacity(0.07))
                Button(intent: AjustarCampoIntent(campo: campo, signo: 1)) {
                    Text("+").font(.system(size: 16, weight: .bold)).frame(maxWidth: .infinity)
                }
                .tint(EF.oro.opacity(0.16))
            }
            .buttonStyle(.borderedProminent)
            .frame(height: 30)
        }
        .padding(.vertical, 9)
        .padding(.horizontal, 8)
        .background(EF.celda, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Coma decimal española y sin decimales cuando es redondo: `57,5` y `60`.
private func formatoPeso(_ kg: Double) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "es_ES")
    f.maximumFractionDigits = 1
    f.minimumFractionDigits = 0
    return f.string(from: NSNumber(value: kg)) ?? "\(kg)"
}

private func formatoMinutos(_ segundos: Int) -> String {
    String(format: "%d:%02d", segundos / 60, segundos % 60)
}
