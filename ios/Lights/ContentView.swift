import SwiftUI

enum Palette {
    static let amber = Color(red: 1.0, green: 0.74, blue: 0.36)
    static let ember = Color(red: 1.0, green: 0.46, blue: 0.16)
    static let card = Color.white.opacity(0.06)
    static let offline = Color(red: 1.0, green: 0.42, blue: 0.38)
}

struct ContentView: View {
    @EnvironmentObject private var store: DisplayStore
    /// The slider's value while a finger is on it; sent on release.
    @State private var dragBrightness: Double?

    private var shownBrightness: Double { dragBrightness ?? store.brightness }
    /// How much the room glows: off is dark, on scales with brightness.
    private var glow: Double { store.isOn ? 0.35 + 0.65 * shownBrightness : 0 }

    var body: some View {
        ZStack {
            background
            ScrollView {
                VStack(spacing: 32) {
                    header
                    PowerButton(isOn: store.isOn, applying: store.isApplying, glow: glow) {
                        store.togglePower()
                    }
                    brightnessCard
                    modesCard
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .animation(.easeInOut(duration: 0.35), value: store.isOn)
        .animation(.easeInOut(duration: 0.2), value: store.statusText)
    }

    private var background: some View {
        ZStack {
            Color(red: 0.035, green: 0.035, blue: 0.05)
            RadialGradient(
                colors: [Palette.ember.opacity(0.32 * glow), .clear],
                center: UnitPoint(x: 0.5, y: 0.28), startRadius: 10, endRadius: 460)
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text("Christmas Lights")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
            HStack(spacing: 8) {
                if store.isApplying || !store.loaded {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Palette.amber)
                }
                Text(store.statusText)
                    .font(.headline)
                    .foregroundStyle(statusColor)
                    .contentTransition(.opacity)
            }
            .frame(minHeight: 22)
            if let error = store.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Palette.offline)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: store.errorMessage)
    }

    private var statusColor: Color {
        switch store.status {
        case .unreachable: Palette.offline
        case .applying: Palette.amber
        default: store.isOn ? Palette.amber : .white.opacity(0.55)
        }
    }

    private var brightnessCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Brightness")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Text("\(Int((shownBrightness * 100).rounded()))%")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.white.opacity(0.6))
                    .contentTransition(.numericText())
            }
            HStack(spacing: 12) {
                Image(systemName: "sun.min.fill").foregroundStyle(.white.opacity(0.45))
                Slider(
                    value: Binding(
                        get: { shownBrightness },
                        set: { dragBrightness = $0 }),
                    in: 0...1
                ) { editing in
                    // Send once, on release, not every tick.
                    if !editing, let value = dragBrightness {
                        store.setBrightness(value)
                        dragBrightness = nil
                    }
                }
                .tint(Palette.amber)
                Image(systemName: "sun.max.fill").foregroundStyle(Palette.amber)
            }
        }
        .padding(18)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var playlists: [DisplayMode] { store.modes.filter { $0.kind == .playlist } }
    private var sequences: [DisplayMode] { store.modes.filter { $0.kind == .sequence } }

    @ViewBuilder
    private var modesCard: some View {
        if store.modes.isEmpty {
            Text(store.loaded ? "No playlists or sequences yet" : "Loading modes…")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.5))
                .frame(maxWidth: .infinity)
                .padding(24)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: 24) {
                if !playlists.isEmpty { modeSection("Playlists", playlists) }
                if !sequences.isEmpty { modeSection("Sequences", sequences) }
            }
        }
    }

    private func modeSection(_ title: String, _ modes: [DisplayMode]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.title3.bold())
                .foregroundStyle(.white)
                .padding(.leading, 4)
            VStack(spacing: 0) {
                ForEach(Array(modes.enumerated()), id: \.element.id) { index, mode in
                    if index > 0 {
                        Divider().overlay(Color.white.opacity(0.08)).padding(.leading, 62)
                    }
                    ModeRow(
                        mode: mode,
                        active: store.mode == mode.ref,
                        applying: store.mode == mode.ref && store.isApplying,
                        lit: store.isOn
                    ) {
                        store.select(mode)
                    }
                }
            }
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

struct ModeRow: View {
    let mode: DisplayMode
    let active: Bool
    let applying: Bool
    let lit: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: mode.kind == .playlist ? "music.note.list" : "sparkles")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(active && lit ? Color.black.opacity(0.75) : Palette.amber)
                    .frame(width: 34, height: 34)
                    .background(
                        active && lit ? AnyShapeStyle(Palette.amber) : AnyShapeStyle(Palette.amber.opacity(0.14)),
                        in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                Text(mode.name)
                    .font(.body.weight(active ? .semibold : .regular))
                    .foregroundStyle(.white)
                Spacer()
                if applying {
                    ProgressView().controlSize(.small).tint(Palette.amber)
                }
                if active {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.bold))
                        .foregroundStyle(Palette.amber)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .sensoryFeedback(.selection, trigger: active)
    }
}

private struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Color.white.opacity(configuration.isPressed ? 0.08 : 0))
    }
}

#Preview {
    ContentView()
        .environmentObject(DisplayStore(backend: MockBackend(state: "on")))
        .preferredColorScheme(.dark)
}
