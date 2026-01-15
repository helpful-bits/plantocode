import Foundation
import Network
import Combine

/// Represents the primary network interface type
public enum NetworkInterfaceType: Equatable, CustomStringConvertible {
    case wifi
    case cellular
    case wiredEthernet
    case other
    case none

    public var description: String {
        switch self {
        case .wifi: return "WiFi"
        case .cellular: return "Cellular"
        case .wiredEthernet: return "Ethernet"
        case .other: return "Other"
        case .none: return "None"
        }
    }
}

/// Describes a network interface change event
public struct NetworkInterfaceChange: Equatable {
    public let previousInterface: NetworkInterfaceType
    public let currentInterface: NetworkInterfaceType
    public let timestamp: Date

    /// True if the underlying transport changed (e.g., WiFi → Cellular)
    public var isInterfaceSwitch: Bool {
        previousInterface != currentInterface &&
        previousInterface != .none &&
        currentInterface != .none
    }
}

@MainActor
public final class NetworkPathObserver: ObservableObject {
    public static let shared = NetworkPathObserver()

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.plantocode.networkpathobserver")

    @Published public private(set) var currentPath: NWPath?
    @Published public private(set) var currentInterfaceType: NetworkInterfaceType = .none
    @Published public private(set) var lastInterfaceChange: NetworkInterfaceChange?
    private var lastOnlineInterfaceType: NetworkInterfaceType = .none
    private var lastInterfaceChangeEmittedAt: Date?

    /// Publisher that emits only when the network interface type changes (e.g., WiFi → Cellular)
    public var interfaceChangePublisher: AnyPublisher<NetworkInterfaceChange, Never> {
        $lastInterfaceChange
            .compactMap { $0 }
            .filter { $0.isInterfaceSwitch }
            .eraseToAnyPublisher()
    }

    public var isOnline: Bool {
        currentPath?.status == .satisfied
    }

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                let previousInterface = self.currentInterfaceType
                let newInterface = self.determineInterfaceType(from: path)
                let previousForChange: NetworkInterfaceType = {
                    if newInterface != .none && previousInterface == .none {
                        return self.lastOnlineInterfaceType
                    }
                    return previousInterface
                }()

                self.currentPath = path
                self.currentInterfaceType = newInterface
                if newInterface != .none {
                    self.lastOnlineInterfaceType = newInterface
                }

                // Record interface change if different
                if previousForChange != newInterface {
                    // Debounce rapid interface changes (1 second window)
                    if let lastEmit = self.lastInterfaceChangeEmittedAt,
                       Date().timeIntervalSince(lastEmit) < 1.0 {
                        return
                    }

                    self.lastInterfaceChange = NetworkInterfaceChange(
                        previousInterface: previousForChange,
                        currentInterface: newInterface,
                        timestamp: Date()
                    )
                    self.lastInterfaceChangeEmittedAt = Date()
                }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    /// Determines the primary interface type from an NWPath
    private func determineInterfaceType(from path: NWPath) -> NetworkInterfaceType {
        guard path.status == .satisfied else {
            return .none
        }

        // Check interfaces in priority order.
        // If both WiFi and Cellular are reported, prefer Cellular when the path is expensive
        // to better reflect WiFi -> LTE transitions.
        let usesWifi = path.usesInterfaceType(.wifi)
        let usesCellular = path.usesInterfaceType(.cellular)

        if usesWifi && usesCellular {
            return path.isExpensive ? .cellular : .wifi
        } else if usesCellular {
            return .cellular
        } else if usesWifi {
            return .wifi
        } else if path.usesInterfaceType(.wiredEthernet) {
            return .wiredEthernet
        } else if path.usesInterfaceType(.loopback) || path.usesInterfaceType(.other) {
            return .other
        }

        return .none
    }
}
