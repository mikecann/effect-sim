import Foundation

// The shapes convex/display.ts returns. Shared by the app (websocket client)
// and the widgets and intents (plain HTTP API).

enum ModeKind: String, Codable, Hashable, Sendable {
    case playlist
    case sequence
    /// The editor is camera mapping the LEDs; the phone can't pick this.
    case mapping
}

/// Which playlist or sequence is playing, as the backend stores it. `id` is
/// the playlist's or sequence's key (for mapping, the session's id).
struct ModeRef: Codable, Hashable, Sendable {
    var kind: ModeKind
    var id: String
}

/// A mode the phone can pick, from `display:modes`.
struct DisplayMode: Codable, Hashable, Identifiable, Sendable {
    var kind: ModeKind
    var id: String
    var name: String

    var ref: ModeRef { ModeRef(kind: kind, id: id) }
}

struct DisplaySettings: Codable, Hashable, Sendable {
    var isOn: Bool
    /// 0...1
    var brightness: Double
    var mode: ModeRef
}

/// Whether the lights runtime (HWIR) has confirmed the settings.
enum DisplayStatus: String, Codable, Hashable, Sendable {
    /// The phone asked for these settings and HWIR hasn't confirmed yet.
    case applying
    /// HWIR is playing them.
    case live
    /// HWIR didn't confirm within 15 s: it's offline.
    case unreachable

    // An unknown status from a newer backend reads as live rather than
    // failing to decode the whole display.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DisplayStatus(rawValue: raw) ?? .live
    }
}

/// `display:get`.
struct DisplayState: Codable, Hashable, Sendable {
    var settings: DisplaySettings
    var status: DisplayStatus
    /// ms since the epoch
    var changedAt: Double
    /// When the unconfirmed request was made; null when live.
    var requestedAt: Double?
}

/// `display:request` returns `{status: "done", from, to}` or
/// `{status: "rejected", code, reasons}`. It throws instead when the lights
/// runtime has never booted for the project.
struct RequestOutcome: Decodable, Sendable {
    var status: String
    var reasons: [String]?

    /// Throws on a rejection, with the server's reasons.
    func check() throws {
        guard status == "rejected" else { return }
        let why = reasons?.joined(separator: " ") ?? ""
        throw LightsAPI.ServerError(message: why.isEmpty ? "The lights didn't accept that change." : why)
    }
}

extension Array where Element == DisplayMode {
    func named(_ ref: ModeRef?) -> DisplayMode? {
        guard let ref else { return nil }
        return first { $0.kind == ref.kind && $0.id == ref.id }
    }
}
