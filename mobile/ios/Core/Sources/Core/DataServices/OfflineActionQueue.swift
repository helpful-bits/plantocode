import Foundation

public enum QueuedActionType: Codable {
    case updateSessionFields(sessionId: String, updates: [String: AnyCodable])
    case updateFiles(sessionId: String, addIncluded: [String]?, removeIncluded: [String]?, addExcluded: [String]?, removeExcluded: [String]?)
    case duplicateSession(sourceSessionId: String, newName: String?)
    case deleteSession(sessionId: String)
    case syncHistoryState(sessionId: String, kind: String, state: Data, expectedVersion: Int64)
}

public enum OfflineActionState: String, Codable {
    case queued, sending, completed, failed
}

public struct QueuedAction: Codable, Identifiable {
    public let id: UUID
    public let idempotencyKey: UUID
    public var state: OfflineActionState
    public let type: QueuedActionType
    public let createdAt: Date
    public var retryCount: Int

    public init(type: QueuedActionType) {
        self.id = UUID()
        self.idempotencyKey = UUID()
        self.state = .queued
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
        switch action.type {
        case .syncHistoryState(let sessionId, let kind, _, _):
            queue.removeAll { existing in
                guard existing.state == .queued || existing.state == .failed else { return false }
                if case .syncHistoryState(let existingSessionId, let existingKind, _, _) = existing.type {
                    return existingSessionId == sessionId && existingKind == kind
                }
                return false
            }

        case .updateSessionFields(let sessionId, let updates):
            var mergedUpdates = updates
            var indicesToRemove: [Int] = []

            for (index, existing) in queue.enumerated() {
                guard existing.state == .queued || existing.state == .failed else { continue }
                if case .updateSessionFields(let existingSessionId, let existingUpdates) = existing.type,
                   existingSessionId == sessionId {
                    mergedUpdates = existingUpdates.merging(mergedUpdates) { _, new in new }
                    indicesToRemove.append(index)
                }
            }

            for index in indicesToRemove.reversed() {
                queue.remove(at: index)
            }

            let mergedAction = QueuedAction(
                type: .updateSessionFields(sessionId: sessionId, updates: mergedUpdates)
            )
            queue.append(mergedAction)
            save()
            return

        case .updateFiles(let sessionId, let addIncluded, let removeIncluded, let addExcluded, let removeExcluded):
            func normalized(_ value: String) -> String? {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }

            func applyUpdate(
                addIncluded: [String]?,
                removeIncluded: [String]?,
                addExcluded: [String]?,
                removeExcluded: [String]?,
                addIncludedSet: inout Set<String>,
                removeIncludedSet: inout Set<String>,
                addExcludedSet: inout Set<String>,
                removeExcludedSet: inout Set<String>
            ) {
                if let addIncluded = addIncluded {
                    for file in addIncluded.compactMap(normalized) {
                        addIncludedSet.insert(file)
                        removeIncludedSet.remove(file)
                        addExcludedSet.remove(file)
                        removeExcludedSet.insert(file)
                    }
                }
                if let removeIncluded = removeIncluded {
                    for file in removeIncluded.compactMap(normalized) {
                        removeIncludedSet.insert(file)
                        addIncludedSet.remove(file)
                    }
                }
                if let addExcluded = addExcluded {
                    for file in addExcluded.compactMap(normalized) {
                        addExcludedSet.insert(file)
                        removeExcludedSet.remove(file)
                        addIncludedSet.remove(file)
                        removeIncludedSet.insert(file)
                    }
                }
                if let removeExcluded = removeExcluded {
                    for file in removeExcluded.compactMap(normalized) {
                        removeExcludedSet.insert(file)
                        addExcludedSet.remove(file)
                    }
                }
            }

            var addIncludedSet = Set<String>()
            var removeIncludedSet = Set<String>()
            var addExcludedSet = Set<String>()
            var removeExcludedSet = Set<String>()
            var indicesToRemove: [Int] = []

            for (index, existing) in queue.enumerated() {
                guard existing.state == .queued || existing.state == .failed else { continue }
                if case .updateFiles(
                    let existingSessionId,
                    let existingAddIncluded,
                    let existingRemoveIncluded,
                    let existingAddExcluded,
                    let existingRemoveExcluded
                ) = existing.type,
                   existingSessionId == sessionId {
                    applyUpdate(
                        addIncluded: existingAddIncluded,
                        removeIncluded: existingRemoveIncluded,
                        addExcluded: existingAddExcluded,
                        removeExcluded: existingRemoveExcluded,
                        addIncludedSet: &addIncludedSet,
                        removeIncludedSet: &removeIncludedSet,
                        addExcludedSet: &addExcludedSet,
                        removeExcludedSet: &removeExcludedSet
                    )
                    indicesToRemove.append(index)
                }
            }

            applyUpdate(
                addIncluded: addIncluded,
                removeIncluded: removeIncluded,
                addExcluded: addExcluded,
                removeExcluded: removeExcluded,
                addIncludedSet: &addIncludedSet,
                removeIncludedSet: &removeIncludedSet,
                addExcludedSet: &addExcludedSet,
                removeExcludedSet: &removeExcludedSet
            )

            for index in indicesToRemove.reversed() {
                queue.remove(at: index)
            }

            func sortedOrNil(_ values: Set<String>) -> [String]? {
                let sorted = values.sorted()
                return sorted.isEmpty ? nil : sorted
            }

            if addIncludedSet.isEmpty &&
                removeIncludedSet.isEmpty &&
                addExcludedSet.isEmpty &&
                removeExcludedSet.isEmpty {
                if !indicesToRemove.isEmpty {
                    save()
                }
                return
            }

            let mergedAction = QueuedAction(type: .updateFiles(
                sessionId: sessionId,
                addIncluded: sortedOrNil(addIncludedSet),
                removeIncluded: sortedOrNil(removeIncludedSet),
                addExcluded: sortedOrNil(addExcludedSet),
                removeExcluded: sortedOrNil(removeExcludedSet)
            ))
            queue.append(mergedAction)
            save()
            return

        default:
            break
        }

        queue.append(action)
        save()
    }

    public var hasPendingActions: Bool {
        return queue.contains { $0.state == .queued || $0.state == .sending || $0.state == .failed }
    }

    public var pendingCount: Int {
        return queue.filter { $0.state == .queued || $0.state == .sending || $0.state == .failed }.count
    }

    public var failedCount: Int {
        return queue.filter { $0.state == .failed }.count
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey),
              let decoded = try? JSONDecoder().decode([QueuedAction].self, from: data) else {
            return
        }
        queue = decoded
    }

    private func save() {
        let queueCopy = queue
        let key = userDefaultsKey
        Task.detached(priority: .utility) {
            guard let encoded = try? JSONEncoder().encode(queueCopy) else { return }
            UserDefaults.standard.set(encoded, forKey: key)
        }
    }

    public func processPending(with sessionService: SessionDataService) async {
        let actionsToProcess = queue.filter { $0.state == .queued || $0.state == .failed }

        for action in actionsToProcess {
            if action.retryCount >= maxRetries {
                updateState(for: action.id, to: .failed)
                continue
            }

            updateState(for: action.id, to: .sending)

            do {
                try await processAction(action, with: sessionService)
                updateState(for: action.id, to: .completed)
                removeAction(action.id)
            } catch {
                if isConnectivityError(error) {
                    updateState(for: action.id, to: .queued)
                    return
                }
                updateState(for: action.id, to: .failed)
                updateRetryCount(for: action.id)
                let delay = min(pow(2.0, Double(action.retryCount)), 30.0)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
    }

    private func updateState(for id: UUID, to state: OfflineActionState) {
        if let index = queue.firstIndex(where: { $0.id == id }) {
            queue[index].state = state
            save()
        }
    }

    private func processAction(_ action: QueuedAction, with sessionService: SessionDataService) async throws {
        switch action.type {
        case .updateSessionFields(let sessionId, let updates):
            let updatesDict = updates.mapValues { $0.value }
            try await sessionService.updateSession(
                id: sessionId,
                updates: updatesDict,
                idempotencyKey: action.idempotencyKey.uuidString,
                enqueueIfOffline: false
            )
        case .updateFiles(let sessionId, let addIncluded, let removeIncluded, let addExcluded, let removeExcluded):
            try await sessionService.updateSessionFiles(
                sessionId: sessionId,
                addIncluded: addIncluded,
                removeIncluded: removeIncluded,
                addExcluded: addExcluded,
                removeExcluded: removeExcluded,
                idempotencyKey: action.idempotencyKey.uuidString,
                enqueueIfOffline: false
            )
        case .duplicateSession(let sourceId, let newName):
            _ = try await sessionService.duplicateSession(
                id: sourceId,
                newName: newName,
                idempotencyKey: action.idempotencyKey.uuidString
            )
        case .deleteSession(let sessionId):
            try await sessionService.deleteSession(id: sessionId, idempotencyKey: action.idempotencyKey.uuidString)
        case .syncHistoryState(let sessionId, let kind, let stateData, _):
            // On reconnect:
            // 1. Fetch remote desktop state
            let remoteState = try await sessionService.getHistoryState(sessionId: sessionId, kind: kind)

            // 2. Decode local queued state
            let localState = try JSONDecoder().decode(HistoryState.self, from: stateData)

            // 3. Merge local offline edits with latest remote state
            let undoManager = UndoRedoManager(deviceId: MultiConnectionManager.shared.activeDeviceId?.uuidString.lowercased())
            await undoManager.applyRemoteHistoryState(localState)
            let mergedState = await undoManager.mergeRemoteHistoryState(remoteState)

            // 4. Sync merged state back to desktop
            _ = try await sessionService.syncHistoryState(
                sessionId: sessionId,
                kind: kind,
                state: mergedState,
                expectedVersion: remoteState.version,
                idempotencyKey: action.idempotencyKey.uuidString
            )
            // 5. On success, action will be removed from queue by caller
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

    private func isConnectivityError(_ error: Error) -> Bool {
        if let relayError = error as? ServerRelayError {
            switch relayError {
            case .notConnected, .disconnected, .networkError, .timeout:
                return true
            default:
                return false
            }
        }

        if let dataError = error as? DataServiceError {
            switch dataError {
            case .offline, .connectionError, .timeout, .serviceUnavailable:
                return true
            case .networkError(let inner):
                return isConnectivityError(inner)
            default:
                return false
            }
        }

        return false
    }
}
