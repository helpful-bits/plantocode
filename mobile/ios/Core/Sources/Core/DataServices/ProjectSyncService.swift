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

                // Expect payload: { "projectDirectory": "<absolute path>" }
                if let dir = event.data["projectDirectory"]?.value as? String,
                   !dir.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {

                    // Deduplicate identical values (avoid echo/reloads)
                    if AppState.shared.selectedProjectDirectory == dir || lastAppliedDirectory == dir {
                        return
                    }

                    AppState.shared.selectedProjectDirectory = dir
                    self.lastAppliedDirectory = dir

                    // Build ProjectInfo consistently
                    let name = URL(fileURLWithPath: dir).lastPathComponent
                    let project = ProjectInfo(name: name, directory: dir, hash: String(dir.hashValue))

                    // Apply domain state and fetch sessions
                    if let manager = PlanToCodeCore.shared.dataServices {
                        manager.setCurrentProject(project)
                        Task {
                            try? await manager.sessionService.fetchSessions(projectDirectory: dir)
                        }
                    }
                }
            }
    }

    private func detachRelay() {
        relayCancellable?.cancel()
        relayCancellable = nil
    }
}
