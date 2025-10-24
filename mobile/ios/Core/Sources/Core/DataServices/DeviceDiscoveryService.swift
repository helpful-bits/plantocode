import Foundation
import Combine
import OSLog
import UIKit

@MainActor
public class DeviceDiscoveryService: ObservableObject {
    public static let shared = DeviceDiscoveryService()

    @Published public private(set) var devices: [RegisteredDevice] = []
    @Published public private(set) var isLoading: Bool = false
    @Published public private(set) var errorMessage: String? = nil

    private let logger = Logger(subsystem: "com.plantocode.app", category: "DeviceDiscovery")

    private init() {
        // Observe auth token refresh
        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-token-refreshed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshDevices()
            }
        }

        // Observe app activation
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refreshDevices()
            }
        }

        // Observe logout
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

    public func refreshDevices() async {
        if self.isLoading {
            return
        }

        self.logger.info("Starting device discovery")
        self.isLoading = true
        self.errorMessage = nil

        defer {
            self.isLoading = false
        }

        do {
            let devices = try await ServerAPIClient.shared.getDevices(deviceType: "desktop")
            let beforeCount = devices.count
            let allowedPlatforms = Set(["macos", "windows", "linux"])
            self.devices = devices.filter { device in
                device.deviceType.lowercased() == "desktop"
                    && allowedPlatforms.contains(device.platform.lowercased())
                    && device.deviceName.lowercased() != "unknown"
            }
            self.logger.info("DeviceDiscoveryService: filtered devices before=\(beforeCount) after=\(self.devices.count)")
            self.logger.info("Fetched \(self.devices.count) desktop devices from server at \(Config.serverURL)")
            self.logger.info("Device discovery completed: \(self.devices.count) devices found")
        } catch {
            self.logger.error("getDevices failed: \(error.localizedDescription)")
            self.devices = []
            self.errorMessage = "Unable to load devices. Ensure your desktop is registered, signed in, and discoverable."
        }
    }
}