import Foundation

/// Comprehensive connectivity diagnostics report for troubleshooting device connections
public struct DiagnosticsReport {
    public let serverURL: URL
    public let isAuthenticated: Bool
    public let relayReachable: Bool
    public let devicePresent: Bool
    public let deviceStatus: DeviceConnectionStatus
    public let lastRelayError: RelayErrorInfo?
    public let suggestedFix: String

    public init(
        serverURL: URL,
        isAuthenticated: Bool,
        relayReachable: Bool,
        devicePresent: Bool,
        deviceStatus: DeviceConnectionStatus,
        lastRelayError: RelayErrorInfo?,
        suggestedFix: String
    ) {
        self.serverURL = serverURL
        self.isAuthenticated = isAuthenticated
        self.relayReachable = relayReachable
        self.devicePresent = devicePresent
        self.deviceStatus = deviceStatus
        self.lastRelayError = lastRelayError
        self.suggestedFix = suggestedFix
    }
}

/// Device connection status for diagnostics
public enum DeviceConnectionStatus: Equatable {
    case online
    case away
    case offline
    case unknown

    public var displayName: String {
        switch self {
        case .online: return "Online"
        case .away: return "Away"
        case .offline: return "Offline"
        case .unknown: return "Unknown"
        }
    }
}

/// Relay error information captured from ServerRelayError
public struct RelayErrorInfo {
    public let code: String
    public let message: String

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

/// ConnectivityDiagnostics provides detailed diagnostics for connection issues
public class ConnectivityDiagnostics {

    /// Run comprehensive diagnostics for a specific device
    public static func run(for deviceId: UUID) async -> DiagnosticsReport {
        // Get server URL
        let serverURL = URL(string: Config.serverURL) ?? URL(string: "https://api-us.plantocode.com")!

        // Check authentication status
        let isAuthenticated = await AuthService.shared.isAuthenticated

        guard isAuthenticated else {
            return DiagnosticsReport(
                serverURL: serverURL,
                isAuthenticated: false,
                relayReachable: false,
                devicePresent: false,
                deviceStatus: .unknown,
                lastRelayError: RelayErrorInfo(code: "auth_required", message: "Not authenticated"),
                suggestedFix: "Please sign in to continue."
            )
        }

        // Check relay connection status
        let relayClient = await MultiConnectionManager.shared.relayConnection(for: deviceId)
        let relayReachable = relayClient?.isConnected ?? false

        // Extract last relay error if available
        var lastRelayError: RelayErrorInfo? = nil
        if let error = relayClient?.lastError {
            lastRelayError = extractRelayErrorInfo(from: error)
        }

        // Check if device exists in device list
        var devicePresent = false
        var deviceStatus: DeviceConnectionStatus = .unknown

        do {
            let devices = try await ServerAPIClient.shared.getDevices()
            if let device = devices.first(where: { $0.deviceId == deviceId }) {
                devicePresent = true
                deviceStatus = mapDeviceStatus(device.status)
            }
        } catch {
            // Device list fetch failed - could be network or auth issue
            lastRelayError = RelayErrorInfo(
                code: "device_list_failed",
                message: "Failed to fetch device list: \(error.localizedDescription)"
            )
        }

        // Generate suggested fix based on diagnostics
        let suggestedFix = generateSuggestedFix(
            isAuthenticated: isAuthenticated,
            relayReachable: relayReachable,
            devicePresent: devicePresent,
            deviceStatus: deviceStatus,
            lastRelayError: lastRelayError
        )

        return DiagnosticsReport(
            serverURL: serverURL,
            isAuthenticated: isAuthenticated,
            relayReachable: relayReachable,
            devicePresent: devicePresent,
            deviceStatus: deviceStatus,
            lastRelayError: lastRelayError,
            suggestedFix: suggestedFix
        )
    }

    /// Extract relay error information from ServerRelayError
    private static func extractRelayErrorInfo(from error: ServerRelayError) -> RelayErrorInfo {
        switch error {
        case .serverError(let code, let message):
            return RelayErrorInfo(code: code, message: message)
        case .timeout:
            return RelayErrorInfo(code: "timeout", message: "Connection timed out")
        case .notConnected:
            return RelayErrorInfo(code: "not_connected", message: "Not connected to relay")
        case .networkError(let underlyingError):
            return RelayErrorInfo(code: "network_error", message: underlyingError.localizedDescription)
        case .invalidURL:
            return RelayErrorInfo(code: "invalid_url", message: "Invalid relay URL")
        case .invalidState(let message):
            return RelayErrorInfo(code: "invalid_state", message: message)
        case .encodingError(let underlyingError):
            return RelayErrorInfo(code: "encoding_error", message: underlyingError.localizedDescription)
        case .disconnected:
            return RelayErrorInfo(code: "disconnected", message: "Disconnected from relay")
        }
    }

    /// Map DeviceStatus to DeviceConnectionStatus
    private static func mapDeviceStatus(_ status: DeviceStatus) -> DeviceConnectionStatus {
        switch status {
        case .online: return .online
        case .away: return .away
        case .offline: return .offline
        }
    }

    /// Generate user-friendly suggested fix based on diagnostic results
    private static func generateSuggestedFix(
        isAuthenticated: Bool,
        relayReachable: Bool,
        devicePresent: Bool,
        deviceStatus: DeviceConnectionStatus,
        lastRelayError: RelayErrorInfo?
    ) -> String {
        // Check for specific error codes first
        if let error = lastRelayError {
            switch error.code {
            case "auth_required":
                return "Please sign in to continue."

            case "device_ownership_failed":
                return "This desktop belongs to a different account. Please sign in with the correct account or connect to a different desktop."

            case "invalid_resume":
                return "Recovered from stale session. Reconnecting..."

            case "timeout":
                return "Connection timed out. Check your network connection or ensure the desktop is online and accessible."

            case "network_error", "not_connected", "disconnected":
                return "Network issue detected. Check your internet connection and try again."

            default:
                break
            }
        }

        // Authentication issues
        if !isAuthenticated {
            return "Please sign in to continue."
        }

        // Device not found in registry
        if !devicePresent {
            return "Desktop device not found. On your desktop: ensure **PlanToCode** is running, you're signed in with the same account, and 'Allow Remote Access' is enabled in Settings."
        }

        // Device is offline
        if deviceStatus == .offline {
            return "Desktop is offline. On your desktop: ensure **PlanToCode** is running and both 'Allow Remote Access' and 'Discoverable' are enabled in Settings."
        }

        // Relay not reachable
        if !relayReachable && deviceStatus != .offline {
            return "Cannot reach desktop. On your desktop: enable 'Allow Remote Access' and 'Discoverable' in Settings, then ensure your network allows connections."
        }

        // Generic fallback
        return "Unable to connect. Check your network connection and ensure the desktop is online with remote access enabled."
    }

    /// Map ServerRelayError to user-friendly message
    public static func userFriendlyMessage(for error: ServerRelayError) -> String {
        switch error {
        case .serverError(let code, let message):
            return userFriendlyMessage(forErrorCode: code, message: message)
        case .timeout:
            return "Connection timed out. Check network or desktop availability."
        case .notConnected:
            return "Not connected to relay server."
        case .networkError(let underlyingError):
            return "Network error: \(underlyingError.localizedDescription)"
        case .invalidURL:
            return "Invalid server configuration."
        case .invalidState(let message):
            return "Connection error: \(message)"
        case .encodingError:
            return "Internal error occurred. Please try again."
        case .disconnected:
            return "Disconnected from server."
        }
    }

    /// Map error code to user-friendly message
    public static func userFriendlyMessage(forErrorCode code: String, message: String) -> String {
        switch code {
        case "auth_required":
            return "Authentication required. Please sign in."

        case "device_ownership_failed":
            return "This desktop belongs to a different account."

        case "timeout":
            return "Connection timed out. Check network or desktop availability."

        case "relay_failed":
            return "Desktop is offline or not connected to relay."

        case "invalid_resume":
            return "Recovered from stale resume. Reconnecting..."

        case "network_error", "not_connected", "disconnected":
            return "Network error: \(message)"

        default:
            return "Connection error: \(message)"
        }
    }
}
