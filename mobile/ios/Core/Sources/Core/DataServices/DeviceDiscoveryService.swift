import Foundation
import Combine

@MainActor
public class DeviceDiscoveryService: ObservableObject {
    public static let shared = DeviceDiscoveryService()

    @Published public private(set) var devices: [RegisteredDevice] = []
    @Published public private(set) var isLoading: Bool = false
    @Published public private(set) var errorMessage: String? = nil

    private init() {}

    public func refreshDevices() async {
        if isLoading {
            return
        }

        isLoading = true
        errorMessage = nil

        defer {
            isLoading = false
        }

        do {
            let response = try await ServerAPIClient.shared.getDevices()
            devices = response.devices
        } catch {
            devices = []
            errorMessage = error.localizedDescription
        }
    }
}