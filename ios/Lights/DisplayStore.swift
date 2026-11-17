import Combine
import ConvexMobile
import Foundation

/// The display as the screen shows it: the server's state (live over the
/// Convex websocket) with the phone's own not-yet-confirmed changes on top, so
/// every tap shows at once.
@MainActor
final class DisplayStore: ObservableObject {
    @Published private(set) var server: DisplayState?
    @Published private(set) var modes: [DisplayMode] = []
    /// The first `display:get` has come back (it may have been null).
    @Published private(set) var loaded = false
    /// The websocket is down or the queries failed.
    @Published private(set) var connectionProblem: String?
    /// The last change that failed, shown for a few seconds.
    @Published private(set) var errorMessage: String?

    // Changes the phone has asked for that the server hasn't returned yet.
    @Published private var pendingIsOn: Bool?
    @Published private var pendingBrightness: Double?
    @Published private var pendingMode: ModeRef?

    private let backend: Backend
    private var subscriptions = Set<AnyCancellable>()
    private var errorClear: Task<Void, Never>?

    var isOn: Bool { pendingIsOn ?? server?.settings.isOn ?? false }
    var brightness: Double { pendingBrightness ?? server?.settings.brightness ?? 1 }
    var mode: ModeRef? { pendingMode ?? server?.settings.mode }
    var modeName: String? { modes.named(mode)?.name }
    var hasPending: Bool { pendingIsOn != nil || pendingBrightness != nil || pendingMode != nil }
    /// Applying while the phone's own request is on its way, then the server's word.
    var status: DisplayStatus? { hasPending ? .applying : server?.status }
    var isApplying: Bool { status == .applying }

    var statusText: String {
        if !loaded { return connectionProblem ?? "Connecting…" }
        guard server != nil || hasPending else { return "The lights runtime hasn't started yet" }
        switch status {
        case .unreachable:
            return "Lights controller is offline"
        case .applying:
            guard isOn else { return "Turning off…" }
            return modeName.map { "Switching to \($0)…" } ?? "Switching…"
        case .live, nil:
            guard isOn else { return "Lights are off" }
            return modeName.map { "Playing \($0)" } ?? "On"
        }
    }

    init(backend: Backend) {
        self.backend = backend
    }

    /// The real deployment, or a stub when launched with `-mockState on|off|applying|offline`.
    static func make() -> DisplayStore {
        if let mock = UserDefaults.standard.string(forKey: "mockState") {
            return DisplayStore(backend: MockBackend(state: mock))
        }
        return DisplayStore(backend: ConvexBackend())
    }

    func start() {
        backend.display()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in self?.receive(result) }
            .store(in: &subscriptions)
        backend.modes()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in
                guard let self else { return }
                if case .success(let modes) = result, modes != self.modes {
                    self.modes = modes
                    LightsShortcuts.updateAppShortcutParameters()
                }
            }
            .store(in: &subscriptions)
        backend.connected()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.connectionProblem = connected ? nil : "Connecting…"
            }
            .store(in: &subscriptions)
    }

    private func receive(_ result: Result<DisplayState?, Error>) {
        switch result {
        case .success(let state):
            let before = server?.settings
            server = state
            loaded = true
            connectionProblem = nil
            // The widgets and Control Center toggle only refresh when asked.
            if before?.isOn != state?.settings.isOn || before?.mode != state?.settings.mode {
                LightsRefresh.all()
            }
        case .failure:
            connectionProblem = "Can't reach the lights server"
        }
    }

    // MARK: - Changes

    func togglePower() {
        let next = !isOn
        pendingIsOn = next
        send(isOn: next)
    }

    func setBrightness(_ value: Double) {
        let clamped = min(max(value, 0), 1)
        guard abs(clamped - brightness) > 0.001 || pendingBrightness != nil else { return }
        pendingBrightness = clamped
        send(brightness: clamped)
    }

    func select(_ mode: DisplayMode) {
        // Picking a mode means you want to see it, so it turns the lights on too.
        let turnOn = !isOn
        pendingMode = mode.ref
        if turnOn { pendingIsOn = true }
        send(isOn: turnOn ? true : nil, mode: mode.ref)
    }

    private func send(isOn: Bool? = nil, brightness: Double? = nil, mode: ModeRef? = nil) {
        Task {
            do {
                try await backend.request(isOn: isOn, brightness: brightness, mode: mode)
                // Convex delivers the query update a mutation causes before the
                // mutation returns, so the server already has these: let it
                // take over, unless a newer tap has changed them since.
                clearPending(isOn: isOn, brightness: brightness, mode: mode)
            } catch {
                clearPending(isOn: isOn, brightness: brightness, mode: mode)
                show(error: (error as? LocalizedError)?.errorDescription ?? "That didn't reach the lights.")
            }
        }
    }

    private func clearPending(isOn: Bool?, brightness: Double?, mode: ModeRef?) {
        if let isOn, pendingIsOn == isOn { pendingIsOn = nil }
        if let brightness, pendingBrightness == brightness { pendingBrightness = nil }
        if let mode, pendingMode == mode { pendingMode = nil }
    }

    private func show(error: String) {
        errorMessage = error
        errorClear?.cancel()
        errorClear = Task {
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { errorMessage = nil }
        }
    }
}

// MARK: - Backends

protocol Backend {
    func display() -> AnyPublisher<Result<DisplayState?, Error>, Never>
    func modes() -> AnyPublisher<Result<[DisplayMode], Error>, Never>
    func connected() -> AnyPublisher<Bool, Never>
    func request(isOn: Bool?, brightness: Double?, mode: ModeRef?) async throws
}

/// The real deployment over the Convex websocket.
final class ConvexBackend: Backend {
    private let client = ConvexClient(deploymentUrl: Config.deploymentURL)
    private let args: [String: ConvexEncodable?] = ["projectId": Config.projectId]

    func display() -> AnyPublisher<Result<DisplayState?, Error>, Never> {
        subscribe("display:get", DisplayState?.self)
    }

    func modes() -> AnyPublisher<Result<[DisplayMode], Error>, Never> {
        subscribe("display:modes", [DisplayMode].self)
    }

    func connected() -> AnyPublisher<Bool, Never> {
        client.watchWebSocketState()
            .map { $0 == .connected }
            .removeDuplicates()
            // Don't flash "Connecting…" for a blip.
            .debounce(for: .seconds(1.5), scheduler: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    func request(isOn: Bool?, brightness: Double?, mode: ModeRef?) async throws {
        var args = args
        if let isOn { args["isOn"] = isOn }
        if let brightness { args["brightness"] = brightness }
        if let mode {
            args["mode"] = ["kind": mode.kind.rawValue, "id": mode.id] as [String: ConvexEncodable?]
        }
        let outcome: RequestOutcome = try await client.mutation("display:request", with: args)
        try outcome.check()
    }

    /// A subscription that comes back after an error (a function not deployed
    /// yet, a dropped connection), retrying every 5 s.
    private func subscribe<T: Decodable>(_ name: String, _ type: T.Type) -> AnyPublisher<Result<T, Error>, Never> {
        let client = client
        let args = args
        func attempt() -> AnyPublisher<Result<T, Error>, Never> {
            client.subscribe(to: name, with: args, yielding: T.self)
                .map { Result<T, Error>.success($0) }
                .catch { error in
                    Just(Result<T, Error>.failure(error))
                        .append(
                            Deferred { attempt() }
                                .delaySubscription(for: .seconds(5), scheduler: DispatchQueue.main))
                }
                .eraseToAnyPublisher()
        }
        return attempt()
    }
}

private extension Publisher {
    func delaySubscription<S: Scheduler>(for interval: S.SchedulerTimeType.Stride, scheduler: S) -> AnyPublisher<Output, Failure> {
        Just(())
            .delay(for: interval, scheduler: scheduler)
            .setFailureType(to: Failure.self)
            .flatMap { self }
            .eraseToAnyPublisher()
    }
}

/// Sample data for screenshots and trying the UI without touching the real
/// lights: `-mockState on|off|applying|offline`. Changes go from applying to
/// live after a moment, as HWIR would confirm them.
final class MockBackend: Backend {
    private let state: CurrentValueSubject<DisplayState?, Never>
    private let sampleModes: [DisplayMode] = [
        DisplayMode(kind: .playlist, id: "p1", name: "Winter"),
        DisplayMode(kind: .playlist, id: "p2", name: "All Of Them"),
        DisplayMode(kind: .sequence, id: "s1", name: "Rainbow Comet Chase"),
        DisplayMode(kind: .sequence, id: "s2", name: "Slow Fireflies"),
        DisplayMode(kind: .sequence, id: "s3", name: "Candy Cane Twirl"),
        DisplayMode(kind: .sequence, id: "s4", name: "Gentle Snowfall"),
    ]

    init(state name: String) {
        let now = Date().timeIntervalSince1970 * 1000
        var settings = DisplaySettings(isOn: true, brightness: 0.8, mode: ModeRef(kind: .playlist, id: "p1"))
        var status = DisplayStatus.live
        switch name {
        case "off": settings.isOn = false
        case "applying":
            status = .applying
            settings.mode = ModeRef(kind: .sequence, id: "s1")
        case "offline": status = .unreachable
        default: break
        }
        state = CurrentValueSubject(DisplayState(
            settings: settings, status: status, changedAt: now, requestedAt: status == .live ? nil : now))
    }

    func display() -> AnyPublisher<Result<DisplayState?, Error>, Never> {
        state.map { .success($0) }.eraseToAnyPublisher()
    }

    func modes() -> AnyPublisher<Result<[DisplayMode], Error>, Never> {
        Just(.success(sampleModes)).eraseToAnyPublisher()
    }

    func connected() -> AnyPublisher<Bool, Never> {
        Just(true).eraseToAnyPublisher()
    }

    func request(isOn: Bool?, brightness: Double?, mode: ModeRef?) async throws {
        try await Task.sleep(for: .milliseconds(400))
        guard var next = state.value else { return }
        if let isOn { next.settings.isOn = isOn }
        if let brightness { next.settings.brightness = brightness }
        if let mode { next.settings.mode = mode }
        next.status = .applying
        next.changedAt = Date().timeIntervalSince1970 * 1000
        next.requestedAt = next.changedAt
        state.send(next)
        let settings = next.settings
        Task { [state] in
            try? await Task.sleep(for: .seconds(1.5))
            guard var live = state.value, live.settings == settings else { return }
            live.status = .live
            live.requestedAt = nil
            state.send(live)
        }
    }
}
