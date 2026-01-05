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
    @Published public private(set) var isMobileDeviceRegistered: Bool = false
    @Published public private(set) var hasLoadedOnce: Bool = false

    private let logger = Logger(subsystem: "com.plantocode.app", category: "DeviceDiscovery")
    private var lastRefreshAt: Date? = nil
    private let serialQueue = DispatchQueue(label: "com.plantocode.deviceDiscovery.serial")
    private var registrationTask: Task<Void, Never>?

    private static let mobileDeviceRegisteredKey = "mobileDeviceRegistered"

    private var hasMobileDeviceRegistered: Bool {
        get { UserDefaults.standard.bool(forKey: Self.mobileDeviceRegisteredKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.mobileDeviceRegisteredKey) }
    }

    private init() {
        isMobileDeviceRegistered = hasMobileDeviceRegistered

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
                await self?.registerMobileDeviceIfNeeded()
                await self?.refreshDevices()
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.registerMobileDeviceIfNeeded()
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
                self?.hasMobileDeviceRegistered = false
                self?.isMobileDeviceRegistered = false
                self?.hasLoadedOnce = false
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
        self.hasLoadedOnce = false
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

        func applyDevices(_ devices: [RegisteredDevice]) {
            let beforeCount = devices.count
            let allowedPlatforms = Set(["macos", "windows", "linux"])
            let allDesktops = devices.filter { device in
                device.deviceType.lowercased() == "desktop"
                    && allowedPlatforms.contains(device.platform.lowercased())
                    && device.deviceName.lowercased() != "unknown"
            }

            // Keep all desktops visible; UI shows connection status per item
            self.devices = allDesktops
            self.hasLoadedOnce = true

            // Get connected subset for status checks
            let connected = allDesktops.filter { $0.isConnected }

            // If active device is missing from connected list, trigger reconnect instead of evicting
            if let activeId = MultiConnectionManager.shared.activeDeviceId {
                let stillPresent = connected.contains(where: { $0.deviceId == activeId })
                if !stillPresent {
                    // Do NOT evict - request reconnect instead
                    MultiConnectionManager.shared.triggerAggressiveReconnect(
                        reason: .connectionLoss(activeId),
                        deviceIds: [activeId]
                    )
                }
            }

            if !allDesktops.isEmpty && connected.isEmpty {
                self.error = .serverError("Desktop is registered but not reachable. Enable 'Allow Remote Access' in Desktop settings.")
            }

            self.logger.info("DeviceDiscoveryService: filtered devices before=\(beforeCount) after=\(self.devices.count)")
            self.logger.info("Fetched \(self.devices.count) desktop devices from server at \(Config.serverURL)")
            self.logger.info("Device discovery completed: \(self.devices.count) devices found")
        }

        func attemptAuthRefreshAndReload() async -> Bool {
            guard AuthService.shared.isAuthenticated else { return false }
            do {
                try await AuthService.shared.refreshAppJWTAuth0()
            } catch {
                return false
            }

            do {
                let refreshedDevices = try await ServerAPIClient.shared.listDevices(deviceType: "desktop", connectedOnly: false)
                applyDevices(refreshedDevices)
                return true
            } catch let reloadError as NetworkError {
                self.logger.error("getDevices failed after refresh: \(reloadError.localizedDescription)")
                switch reloadError {
                case .invalidURL, .requestFailed, .decodingFailed:
                    self.error = .network(reloadError.localizedDescription)
                case .invalidResponse(let statusCode, _):
                    if statusCode == 401 || statusCode == 403 {
                        self.devices = []
                        self.error = .unauthorized
                    } else {
                        self.error = .serverError("HTTP \(statusCode)")
                    }
                case .serverError(let apiError):
                    self.error = .serverError(apiError.message)
                }
                return true
            } catch {
                self.logger.error("getDevices failed after refresh: \(error.localizedDescription)")
                self.error = .parsing(error.localizedDescription)
                return true
            }
        }

        do {
            // Fetch all desktops, not just connected ones
            let devices = try await ServerAPIClient.shared.listDevices(deviceType: "desktop", connectedOnly: false)
            applyDevices(devices)
        } catch let networkError as NetworkError {
            self.logger.error("getDevices failed: \(networkError.localizedDescription)")
            switch networkError {
            case .invalidURL, .requestFailed, .decodingFailed:
                self.error = .network(networkError.localizedDescription)
            case .invalidResponse(let statusCode, _):
                if statusCode == 401 || statusCode == 403 {
                    if await attemptAuthRefreshAndReload() {
                        return
                    }
                    self.devices = []
                    self.error = .unauthorized
                } else {
                    self.error = .serverError("HTTP \(statusCode)")
                }
            case .serverError(let apiError):
                if apiError.code == 401 || apiError.code == 403 {
                    if await attemptAuthRefreshAndReload() {
                        return
                    }
                    self.devices = []
                    self.error = .unauthorized
                } else {
                    self.error = .serverError(apiError.message)
                }
            }
        } catch {
            self.logger.error("getDevices failed: \(error.localizedDescription)")
            self.error = .parsing(error.localizedDescription)
        }
    }

    // MARK: - Mobile Device Registration

    public func registerMobileDeviceIfNeeded() async {
        if hasMobileDeviceRegistered {
            return
        }

        registrationTask?.cancel()
        registrationTask = Task {
            await performMobileDeviceRegistration()
        }
        await registrationTask?.value
    }

    private func performMobileDeviceRegistration() async {
        guard await AuthService.shared.getValidAccessToken() != nil else {
            logger.info("Skipping mobile device registration - no auth token")
            return
        }

        let deviceInfo = DeviceManager.shared.getDeviceInfo()
        let body = RegisterMobileDeviceBody(
            deviceName: deviceInfo.deviceModel,
            platform: "ios",
            appVersion: deviceInfo.appVersion ?? "1.0",
            capabilities: nil,
            pushToken: nil
        )

        do {
            let _ = try await ServerAPIClient.shared.registerMobileDevice(body)
            hasMobileDeviceRegistered = true
            isMobileDeviceRegistered = true
            logger.info("Mobile device registered successfully")
        } catch let error as NetworkError {
            if case .serverError(let apiError) = error, apiError.code == 409 {
                hasMobileDeviceRegistered = true
                isMobileDeviceRegistered = true
                logger.info("Mobile device already registered")
            } else {
                logger.error("Failed to register mobile device: \(error.localizedDescription)")
            }
        } catch {
            logger.error("Failed to register mobile device: \(error.localizedDescription)")
        }
    }

    // MARK: - Device Listing

    public func listAllDevices(deviceType: String? = nil, connectedOnly: Bool = false) async throws -> [RegisteredDevice] {
        await registrationTask?.value
        return try await ServerAPIClient.shared.listDevices(deviceType: deviceType, connectedOnly: connectedOnly)
    }

    // MARK: - Device Unregistration

    public func unregisterDevice(deviceId: UUID) async throws {
        await registrationTask?.value
        try await ServerAPIClient.shared.unregisterDevice(deviceId: deviceId)
        logger.info("Device \(deviceId) unregistered successfully")
        self.devices.removeAll { $0.deviceId == deviceId }
    }

    public func unregisterCurrentDevice() async throws {
        let deviceId = DeviceManager.shared.deviceId
        try await unregisterDevice(deviceId: deviceId)
        hasMobileDeviceRegistered = false
        isMobileDeviceRegistered = false
    }

    // MARK: - Heartbeat

    public func sendHeartbeat(status: String? = nil, metadata: [String: AnyCodable]? = nil) async throws {
        await registrationTask?.value

        if !hasMobileDeviceRegistered {
            await registerMobileDeviceIfNeeded()
        }

        let body = HeartbeatBody(status: status, metadata: metadata)
        try await ServerAPIClient.shared.sendHeartbeat(body)
        logger.info("Heartbeat sent successfully")
    }
}
