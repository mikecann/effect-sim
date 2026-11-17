import SwiftUI

/// The big round power button. It glows warm when on (brighter with the
/// brightness), and a ring spins round it while a change is applying, so a tap
/// never looks idle.
struct PowerButton: View {
    let isOn: Bool
    let applying: Bool
    /// 0 when off, up to 1 at full brightness.
    let glow: Double
    let action: () -> Void

    private let size: CGFloat = 196

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(
                        isOn
                            ? AnyShapeStyle(RadialGradient(
                                colors: [Color(red: 1, green: 0.9, blue: 0.68), Palette.amber, Palette.ember],
                                center: .init(x: 0.42, y: 0.36), startRadius: 4, endRadius: size * 0.62))
                            : AnyShapeStyle(LinearGradient(
                                colors: [Color(white: 0.17), Color(white: 0.09)],
                                startPoint: .top, endPoint: .bottom)))
                Circle()
                    .strokeBorder(isOn ? Color.white.opacity(0.35) : Color.white.opacity(0.1), lineWidth: 1.5)
                Image(systemName: "power")
                    .font(.system(size: 66, weight: .semibold))
                    .foregroundStyle(isOn ? Color(red: 0.36, green: 0.16, blue: 0.02) : Color.white.opacity(0.55))
            }
            .frame(width: size, height: size)
            .shadow(color: Palette.amber.opacity(0.75 * glow), radius: 28)
            .shadow(color: Palette.ember.opacity(0.55 * glow), radius: 70)
            .overlay {
                if applying { SpinningRing().padding(-14) }
            }
        }
        .buttonStyle(PressScale())
        .sensoryFeedback(.impact(weight: .medium), trigger: isOn)
        .accessibilityLabel(isOn ? "Turn the lights off" : "Turn the lights on")
        .accessibilityValue(isOn ? "On" : "Off")
        .padding(.vertical, 12)
    }
}

private struct SpinningRing: View {
    var body: some View {
        TimelineView(.animation) { context in
            let angle = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.1) / 1.1 * 360
            ZStack {
                Circle().stroke(Palette.amber.opacity(0.15), lineWidth: 3)
                Circle()
                    .trim(from: 0, to: 0.24)
                    .stroke(Palette.amber, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(angle))
            }
        }
        .transition(.opacity)
    }
}

private struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
