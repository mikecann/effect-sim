import Foundation

/// Convex's plain HTTP API, for the widgets and App Intents. They run for a
/// moment in the background, where a websocket client would only just have
/// connected before the process is gone. The app itself uses ConvexMobile.
enum LightsAPI {
    struct ServerError: LocalizedError {
        var message: String
        var errorDescription: String? { message }
    }

    /// `display:get`, or nil when HWIR has never booted.
    static func display() async throws -> DisplayState? {
        try await call("query", "display:get", args: [:], as: DisplayState.self)
    }

    static func modes() async throws -> [DisplayMode] {
        try await call("query", "display:modes", args: [:], as: [DisplayMode].self) ?? []
    }

    /// Asks for any of on/off, brightness and mode; the server merges it with
    /// what's set. This changes the real lights.
    static func request(isOn: Bool? = nil, brightness: Double? = nil, mode: ModeRef? = nil) async throws {
        var args: [String: Any] = [:]
        if let isOn { args["isOn"] = isOn }
        if let brightness { args["brightness"] = brightness }
        if let mode { args["mode"] = ["kind": mode.kind.rawValue, "id": mode.id] }
        try await call("mutation", "display:request", args: args, as: RequestOutcome.self)?.check()
    }

    private struct Envelope<T: Decodable>: Decodable {
        var status: String
        var value: T?
        var errorMessage: String?

        enum CodingKeys: String, CodingKey { case status, value, errorMessage }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            status = try c.decode(String.self, forKey: .status)
            errorMessage = try c.decodeIfPresent(String.self, forKey: .errorMessage)
            // Only decode the value on success, so an error's shape can't
            // hide its message behind a decoding error.
            value = status == "success" ? try c.decodeIfPresent(T.self, forKey: .value) : nil
        }
    }

    private static func call<T: Decodable>(
        _ kind: String, _ path: String, args: [String: Any], as: T.Type
    ) async throws -> T? {
        var allArgs = args
        allArgs["projectId"] = Config.projectId
        var req = URLRequest(url: URL(string: "\(Config.deploymentURL)/api/\(kind)")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 15
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "path": path, "args": allArgs, "format": "json",
        ])
        let (data, response) = try await URLSession.shared.data(for: req)
        let envelope: Envelope<T>
        do {
            envelope = try JSONDecoder().decode(Envelope<T>.self, from: data)
        } catch {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw ServerError(message: "The lights server answered \(code).")
        }
        guard envelope.status == "success" else {
            throw ServerError(message: envelope.errorMessage ?? "The lights server refused \(path).")
        }
        return envelope.value
    }
}
