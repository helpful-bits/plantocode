import Foundation
import Combine

@MainActor
public final class ProjectSyncService {
    public static let shared = ProjectSyncService()

    private var cancellables = Set<AnyCancellable>()
    private var relayCancellable: AnyCancellable?
    private var lastAppliedDirectory: String?

    private init() {}

    public func start() {
        // Observe active device changes and connection state
        MultiConnectionManager.shared.$activeDeviceId
            .combineLatest(MultiConnectionManager.shared.$connectionStates)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] activeDeviceId, states in
                guard let self else { return }
                // Attach when active device is connected
                guard let activeId = activeDeviceId,
                      states[activeId]?.isConnected == true else {
                    // Detach if disconnected or no active device
                    self.detachRelay()
                    return
                }
                self.attachRelay(for: activeId)
            }
            .store(in: &cancellables)
    }

    private func attachRelay(for deviceId: UUID) {
        // Prevent duplicate attachments
        relayCancellable?.cancel()
        self.lastAppliedDirectory = nil

        guard let relay = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return
        }

        relayCancellable = relay.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard event.eventType == "project-directory-updated" else { return }

                if let dir = event.data["projectDirectory"]?.value as? String {
                    let trimmed = dir.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { return }

                    if AppState.shared.selectedProjectDirectory == trimmed || lastAppliedDirectory == trimmed {
                        return
                    }

                    AppState.shared.selectedProjectDirectory = trimmed
                    self.lastAppliedDirectory = trimmed
                }
            }
    }

    private func detachRelay() {
        relayCancellable?.cancel()
        relayCancellable = nil
    }
}
