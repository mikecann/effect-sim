import AppIntents
import WidgetKit

// The intents behind the Control Center toggle, the widgets and Siri. They're
// compiled into both the app and the widget extension (so the control can run
// its intent without launching the app), and talk to Convex over HTTP.

enum WidgetKinds {
    static let power = "com.mikecann.lights.power"
    static let status = "com.mikecann.lights.status"
}

/// After a change, ask the system to fetch the control and widgets again.
enum LightsRefresh {
    static func all() {
        WidgetCenter.shared.reloadAllTimelines()
        ControlCenter.shared.reloadControls(ofKind: WidgetKinds.power)
    }
}

// MARK: - Power

/// The Control Center toggle's action.
struct SetLightsPowerIntent: SetValueIntent {
    static let title: LocalizedStringResource = "Christmas Lights"
    static let description = IntentDescription("Turns the Christmas lights on or off.")

    @Parameter(title: "On")
    var value: Bool

    init() {}

    func perform() async throws -> some IntentResult {
        try await LightsAPI.request(isOn: value)
        LightsRefresh.all()
        return .result()
    }
}

struct TurnOnLightsIntent: AppIntent {
    static let title: LocalizedStringResource = "Turn On Christmas Lights"
    static let description = IntentDescription("Turns the Christmas lights on.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await LightsAPI.request(isOn: true)
        LightsRefresh.all()
        return .result(dialog: "Turning the Christmas lights on.")
    }
}

struct TurnOffLightsIntent: AppIntent {
    static let title: LocalizedStringResource = "Turn Off Christmas Lights"
    static let description = IntentDescription("Turns the Christmas lights off.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await LightsAPI.request(isOn: false)
        LightsRefresh.all()
        return .result(dialog: "Turning the Christmas lights off.")
    }
}

// MARK: - Mode

/// A playlist or sequence, for Siri and Shortcuts.
struct ModeEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Lights Mode"
    static let defaultQuery = ModeQuery()

    /// "playlist:<id>" or "sequence:<id>"
    var id: String
    var name: String
    var ref: ModeRef

    init(_ mode: DisplayMode) {
        id = "\(mode.kind.rawValue):\(mode.id)"
        name = mode.name
        ref = mode.ref
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(name)",
            subtitle: ref.kind == .playlist ? "Playlist" : "Sequence")
    }
}

struct ModeQuery: EntityStringQuery {
    func entities(for identifiers: [ModeEntity.ID]) async throws -> [ModeEntity] {
        try await LightsAPI.modes().map(ModeEntity.init).filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [ModeEntity] {
        let needle = string.trimmingCharacters(in: .whitespaces)
        return try await LightsAPI.modes().map(ModeEntity.init).filter {
            $0.name.localizedCaseInsensitiveContains(needle)
        }
    }

    func suggestedEntities() async throws -> [ModeEntity] {
        try await LightsAPI.modes().map(ModeEntity.init)
    }
}

struct SetLightsModeIntent: AppIntent {
    static let title: LocalizedStringResource = "Set Lights Mode"
    static let description = IntentDescription("Plays a playlist or sequence on the Christmas lights, turning them on if they're off.")

    @Parameter(title: "Mode")
    var mode: ModeEntity

    init() {}

    init(mode: ModeEntity) {
        self.mode = mode
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Play \(\.$mode) on the lights")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Picking a mode means you want to see it, so it turns the lights on too.
        try await LightsAPI.request(isOn: true, mode: mode.ref)
        LightsRefresh.all()
        return .result(dialog: "Switching the lights to \(mode.name).")
    }
}
