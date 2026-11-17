import AppIntents
import SwiftUI

@main
struct LightsApp: App {
    @StateObject private var store = DisplayStore.make()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .task { store.start() }
        }
    }
}

/// Siri and Shortcuts phrases. Every phrase must name the app.
struct LightsShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TurnOnLightsIntent(),
            phrases: [
                "Turn on the Christmas lights in \(.applicationName)",
                "Turn on \(.applicationName)",
            ],
            shortTitle: "Turn On",
            systemImageName: "lightbulb.fill")
        AppShortcut(
            intent: TurnOffLightsIntent(),
            phrases: [
                "Turn off the Christmas lights in \(.applicationName)",
                "Turn off \(.applicationName)",
            ],
            shortTitle: "Turn Off",
            systemImageName: "lightbulb.slash")
        AppShortcut(
            intent: SetLightsModeIntent(),
            phrases: [
                "Set \(.applicationName) mode to \(\.$mode)",
                "Play \(\.$mode) on \(.applicationName)",
            ],
            shortTitle: "Set Mode",
            systemImageName: "sparkles")
    }

    static let shortcutTileColor: ShortcutTileColor = .orange
}
