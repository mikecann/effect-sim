import AppIntents
import SwiftUI
import WidgetKit

@main
struct LightsWidgetsBundle: WidgetBundle {
    var body: some Widget {
        LightsStatusWidget()
        LightsPowerControl()
    }
}

// MARK: - Control Center toggle

struct LightsPowerControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: WidgetKinds.power, provider: Provider()) { isOn in
            ControlWidgetToggle("Christmas Lights", isOn: isOn, action: SetLightsPowerIntent()) { on in
                Label(on ? "On" : "Off", systemImage: on ? "lightbulb.fill" : "lightbulb")
            }
            .tint(.orange)
        }
        .displayName("Christmas Lights")
        .description("Turn the Christmas lights on or off.")
    }

    struct Provider: ControlValueProvider {
        var previewValue: Bool { false }

        func currentValue() async throws -> Bool {
            try await LightsAPI.display()?.settings.isOn ?? false
        }
    }
}

// MARK: - Home and Lock Screen widget

struct LightsEntry: TimelineEntry {
    var date: Date
    var isOn: Bool
    var modeName: String?
    var status: DisplayStatus?
    /// The server couldn't be reached.
    var failed = false

    static let sample = LightsEntry(date: .now, isOn: true, modeName: "Winter", status: .live)

    var headline: String { isOn ? "On" : "Off" }

    var detail: String {
        if failed { return "Can't reach the lights" }
        switch status {
        case .unreachable: return "Controller offline"
        case .applying: return isOn ? "Switching…" : "Turning off…"
        default: return isOn ? (modeName ?? "Playing") : "Tap to open"
        }
    }
}

struct LightsStatusProvider: TimelineProvider {
    func placeholder(in context: Context) -> LightsEntry { .sample }

    func getSnapshot(in context: Context, completion: @escaping (LightsEntry) -> Void) {
        if context.isPreview { return completion(.sample) }
        Task { completion(await Self.fetch()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LightsEntry>) -> Void) {
        Task {
            let entry = await Self.fetch()
            // Applying settles within 15 s, so look again soon; otherwise the
            // app and intents ask for a reload whenever things change.
            let next = entry.status == .applying || entry.failed ? 60.0 : 15 * 60
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(next))))
        }
    }

    static func fetch() async -> LightsEntry {
        do {
            async let display = LightsAPI.display()
            async let modes = LightsAPI.modes()
            let state = try await display
            let name = (try? await modes)?.named(state?.settings.mode)?.name
            return LightsEntry(date: .now, isOn: state?.settings.isOn ?? false, modeName: name, status: state?.status)
        } catch {
            return LightsEntry(date: .now, isOn: false, failed: true)
        }
    }
}

struct LightsStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKinds.status, provider: LightsStatusProvider()) { entry in
            LightsStatusView(entry: entry)
        }
        .configurationDisplayName("Christmas Lights")
        .description("Whether the lights are on, and what's playing.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private let amber = Color(red: 1.0, green: 0.74, blue: 0.36)
private let ember = Color(red: 1.0, green: 0.46, blue: 0.16)

struct LightsStatusView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LightsEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: entry.isOn ? "lightbulb.fill" : "lightbulb")
                    .font(.title2)
            }
            .containerBackground(.clear, for: .widget)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label("Lights \(entry.headline.lowercased())", systemImage: entry.isOn ? "lightbulb.fill" : "lightbulb")
                    .font(.headline)
                    .widgetAccentable()
                Text(entry.detail)
                    .font(.caption)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .containerBackground(.clear, for: .widget)
        case .accessoryInline:
            Label(
                entry.isOn ? "Lights on · \(entry.modeName ?? "playing")" : "Lights off",
                systemImage: entry.isOn ? "lightbulb.fill" : "lightbulb")
            .containerBackground(.clear, for: .widget)
        default:
            small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                Circle()
                    .fill(entry.isOn ? AnyShapeStyle(RadialGradient(
                        colors: [Color(red: 1, green: 0.9, blue: 0.68), amber, ember],
                        center: .init(x: 0.4, y: 0.35), startRadius: 1, endRadius: 30)) : AnyShapeStyle(Color(white: 0.16)))
                    .shadow(color: amber.opacity(entry.isOn ? 0.8 : 0), radius: 12)
                Image(systemName: "power")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(entry.isOn ? Color(red: 0.36, green: 0.16, blue: 0.02) : .white.opacity(0.5))
            }
            .frame(width: 46, height: 46)
            Spacer(minLength: 0)
            Text(entry.headline)
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundStyle(entry.isOn ? amber : .white.opacity(0.7))
            Text(entry.detail)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white.opacity(0.75))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) {
            ZStack {
                Color(red: 0.035, green: 0.035, blue: 0.05)
                RadialGradient(
                    colors: [ember.opacity(entry.isOn ? 0.35 : 0), .clear],
                    center: .topLeading, startRadius: 4, endRadius: 160)
            }
        }
    }
}

#Preview(as: .systemSmall) {
    LightsStatusWidget()
} timeline: {
    LightsEntry.sample
    LightsEntry(date: .now, isOn: false, modeName: nil, status: .live)
}
