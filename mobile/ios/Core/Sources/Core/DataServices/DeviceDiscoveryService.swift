import Foundation
import Combine
import OSLog

@MainActor
public class DeviceDiscoveryService: ObservableObject {
    public static let shared = DeviceDiscoveryService()

    @Published public private(set) var devices: [RegisteredDevice] = []
    @Published public private(set) var isLoading: Bool = false
    @Published public private(set) var errorMessage: String? = nil

    private let logger = Logger(subsystem: "com.vibemanager.app", category: "DeviceDiscovery")

    private init() {}

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
            self.devices = try await ServerAPIClient.shared.getDevices()
            self.logger.info("Device discovery completed: \(self.devices.count) devices found")
        } catch {
            self.logger.error("getDevices failed: \(error.localizedDescription)")
            self.devices = []
            self.errorMessage = "Unable to load devices. Ensure your desktop is registered, signed in, and discoverable."
        }
    }
}