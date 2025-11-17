import Foundation
import Combine
import OSLog
import UIKit

public enum DiscoveryError: Error {
    case network(String)
    case unauthorized
    case serverError(String)
    case parsing(String)

    public static func == (lhs: DiscoveryError, rhs: DiscoveryError) -> Bool {
        switch (lhs, rhs) {
        case (.network(let lMsg), .network(let rMsg)):
            return lMsg == rMsg
        case (.unauthorized, .unauthorized):
            return true
        case (.serverError(let lMsg), .serverError(let rMsg)):
            return lMsg == rMsg
        case (.parsing(let lMsg), .parsing(let rMsg)):
            return lMsg == rMsg
        default:
            return false
        }
    }
}

@MainActor
public class DeviceDiscoveryService: ObservableObject {
    public static let shared = DeviceDiscoveryService()

    @Published public private(set) var devices: [RegisteredDevice] = []
    @Published public private(set) var isLoading: Bool = false
    @Published public private(set) var error: DiscoveryError? = nil

    private let logger = Logger(subsystem: "com.plantocode.app", category: "DeviceDiscovery")
    private var lastRefreshAt: Date? = nil

    private init() {
        NotificationCenter.default.addObserver(
            forName: Notification.Name("connection-hard-reset-completed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshDevices()
            }
        }

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-token-refreshed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshDevices()
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshDevices()
            }
        }

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-logged-out"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.devices = []
            }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @MainActor
    public func clearList() {
        self.devices = []
        self.error = nil
        self.isLoading = false
    }

    public func refreshDevices() async {
        // Coalesce rapid refresh calls with 2s cool-down
        if let last = lastRefreshAt, Date().timeIntervalSince(last) < 2.0 {
            return
        }
        lastRefreshAt = Date()
        
        if self.isLoading {
            return
        }

        self.logger.info("Starting device discovery")
        self.isLoading = true
        self.error = nil

        defer {
            self.isLoading = false
        }

        do {
            let devices = try await ServerAPIClient.shared.getDevices(deviceType: "desktop")
            let beforeCount = devices.count
            let allowedPlatforms = Set(["macos", "windows", "linux"])
            let allDesktops = devices.filter { device in
                device.deviceType.lowercased() == "desktop"
                    && allowedPlatforms.contains(device.platform.lowercased())
                    && device.deviceName.lowercased() != "unknown"
            }
            let connected = allDesktops.filter { $0.isConnected }
            self.devices = connected
            if let activeId = MultiConnectionManager.shared.activeDeviceId {
                let stillPresent = connected.contains(where: { $0.deviceId == activeId })
                if !stillPresent {
                    MultiConnectionManager.shared.removeConnection(deviceId: activeId)
                }
            }

            if !allDesktops.isEmpty && connected.isEmpty {
                self.error = .serverError("Desktop is registered but not reachable. Enable 'Allow Remote Access' in Desktop settings.")
            }

            self.logger.info("DeviceDiscoveryService: filtered devices before=\(beforeCount) after=\(self.devices.count)")
            self.logger.info("Fetched \(self.devices.count) desktop devices from server at \(Config.serverURL)")
            self.logger.info("Device discovery completed: \(self.devices.count) devices found")
        } catch let apiError as APIError {
            self.logger.error("getDevices failed: \(apiError.localizedDescription)")
            self.devices = []
            switch apiError {
            case .invalidURL, .requestFailed, .decodingFailed:
                self.error = .network(apiError.localizedDescription)
            case .invalidResponse(let statusCode, _):
                if statusCode == 401 || statusCode == 403 {
                    self.error = .unauthorized
                } else {
                    self.error = .serverError("HTTP \(statusCode)")
                }
            }
        } catch {
            self.logger.error("getDevices failed: \(error.localizedDescription)")
            self.devices = []
            self.error = .parsing(error.localizedDescription)
        }
    }
}