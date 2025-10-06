import Foundation

public enum QueuedActionType: Codable {
    case updateSessionFields(sessionId: String, updates: [String: String])
    case updateFiles(sessionId: String, addIncluded: [String]?, removeIncluded: [String]?, addExcluded: [String]?, removeExcluded: [String]?)
    case duplicateSession(sourceSessionId: String, newName: String?)
    case deleteSession(sessionId: String)
    case syncTaskHistory(sessionId: String, history: [String])
    case updateTaskDescription(sessionId: String, content: String)
}

public struct QueuedAction: Codable, Identifiable {
    public let id: UUID
    public let type: QueuedActionType
    public let createdAt: Date
    public var retryCount: Int

    public init(type: QueuedActionType) {
        self.id = UUID()
        self.type = type
        self.createdAt = Date()
        self.retryCount = 0
    }
}

@MainActor
public class OfflineActionQueue {
    private let userDefaultsKey = "vm_offline_actions"
    private var queue: [QueuedAction] = []
    private let maxRetries = 5

    public init() {
        load()
    }

    public func enqueue(_ action: QueuedAction) {
        queue.append(action)
        save()
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey),
              let decoded = try? JSONDecoder().decode([QueuedAction].self, from: data) else {
            return
        }
        queue = decoded
    }

    private func save() {
        guard let encoded = try? JSONEncoder().encode(queue) else { return }
        UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
    }

    public func processPending(with sessionService: SessionDataService) async {
        let actionsToProcess = queue

        for action in actionsToProcess {
            if action.retryCount >= maxRetries {
                removeAction(action.id)
                continue
            }

            do {
                try await processAction(action, with: sessionService)
                removeAction(action.id)
            } catch {
                updateRetryCount(for: action.id)
                let delay = min(pow(2.0, Double(action.retryCount)), 30.0)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
    }

    private func processAction(_ action: QueuedAction, with sessionService: SessionDataService) async throws {
        switch action.type {
        case .updateSessionFields(let sessionId, let updates):
            let updatesDict = updates as [String: Any]
            try await sessionService.updateSession(id: sessionId, updates: updatesDict)
        case .updateFiles(let sessionId, let addIncluded, let removeIncluded, let addExcluded, let removeExcluded):
            try await sessionService.updateSessionFiles(
                sessionId: sessionId,
                addIncluded: addIncluded,
                removeIncluded: removeIncluded,
                addExcluded: addExcluded,
                removeExcluded: removeExcluded
            )
        case .duplicateSession(let sourceId, let newName):
            _ = try await sessionService.duplicateSession(id: sourceId, newName: newName)
        case .deleteSession(let sessionId):
            try await sessionService.deleteSession(id: sessionId)
        case .syncTaskHistory(let sessionId, let history):
            try await sessionService.syncTaskDescriptionHistory(sessionId: sessionId, history: history)
        case .updateTaskDescription(let sessionId, let content):
            try await sessionService.updateTaskDescription(sessionId: sessionId, content: content)
        }
    }

    private func removeAction(_ id: UUID) {
        queue.removeAll { $0.id == id }
        save()
    }

    private func updateRetryCount(for id: UUID) {
        if let index = queue.firstIndex(where: { $0.id == id }) {
            queue[index].retryCount += 1
            save()
        }
    }
}