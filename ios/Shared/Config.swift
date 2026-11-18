import Foundation

/// Where the display lives. Compiled into both the app and the widget extension.
enum Config {
    /// The effect-sim Convex deployment (convex/display.ts).
    static let deploymentURL = "https://aromatic-cardinal-985.convex.cloud"
    /// Mike's house display: the `projects` row HWIR plays.
    static let projectId = "jh7evn9abjw0qyv96xvzk21nd97w8cjw"
    /// The phone remote's token (REMOTE_TOKEN on the deployment), sent with
    /// every change. From ios/Secrets.xcconfig through Info.plist; nil when
    /// it wasn't set, which the server accepts only until REQUIRE_TOKENS.
    static let remoteToken: String? = {
        let value = Bundle.main.object(forInfoDictionaryKey: "LightsRemoteToken") as? String
        guard let value, !value.isEmpty else { return nil }
        return value
    }()
}
