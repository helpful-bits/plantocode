import Foundation
import Network
import Combine

@MainActor
public final class NetworkPathObserver: ObservableObject {
    public static let shared = NetworkPathObserver()

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.plantocode.networkpathobserver")

    @Published public private(set) var currentPath: NWPath?

    public var isOnline: Bool {
        currentPath?.status == .satisfied
    }

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.currentPath = path
            }
        }
        monitor.start(queue: monitorQueue)
    }
}
