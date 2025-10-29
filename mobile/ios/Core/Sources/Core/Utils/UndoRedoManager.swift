import Foundation
import Combine
import CommonCrypto

/// Manages undo/redo history for text editing with efficient state management
@MainActor
public class UndoRedoManager: ObservableObject {

    // MARK: - Published Properties
    @Published public private(set) var canUndo: Bool = false
    @Published public private(set) var canRedo: Bool = false

    // MARK: - Private Properties
    private var history: [String] = []
    private var currentIndex: Int = -1
    private let maxHistorySize: Int
    private var isNavigating: Bool = false
    private var version: Int64 = 0
    private var deviceId: String?

    // MARK: - Initialization
    public init(maxHistorySize: Int = 50, deviceId: String? = nil) {
        self.maxHistorySize = maxHistorySize
        self.deviceId = deviceId
    }

    // MARK: - Public Methods

    /// Save a new state to history (called when user makes changes)
    public func saveState(_ text: String) {
        // Don't save while navigating history
        guard !isNavigating else { return }

        // Don't save if it's the same as current
        if currentIndex >= 0 && currentIndex < history.count {
            let currentText = history[currentIndex]
            if currentText == text {
                return
            }
        }

        // Remove any forward history (redo stack)
        if currentIndex < history.count - 1 {
            history.removeSubrange((currentIndex + 1)..<history.count)
        }

        // Add new state
        history.append(text)
        currentIndex = history.count - 1

        // Trim history if needed (keep most recent entries)
        if history.count > maxHistorySize {
            let removeCount = history.count - maxHistorySize
            history.removeFirst(removeCount)
            currentIndex -= removeCount
        }

        updateUndoRedoState()
    }

    /// Initialize history with an existing array of entries
    public func initializeHistory(entries: [String], currentIndex: Int? = nil) {
        self.history = Array(entries.suffix(maxHistorySize))

        if let index = currentIndex {
            self.currentIndex = min(index, self.history.count - 1)
        } else {
            self.currentIndex = max(0, self.history.count - 1)
        }

        updateUndoRedoState()
    }

    /// Get the current history entries
    public func getHistory() -> [String] {
        return history
    }

    /// Undo to previous state
    public func undo() -> String? {
        guard canUndo else { return nil }

        isNavigating = true
        defer {
            Task { @MainActor in
                // Reset navigation flag after a short delay
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
                self.isNavigating = false
            }
        }

        currentIndex -= 1
        updateUndoRedoState()

        return history[currentIndex]
    }

    /// Redo to next state
    public func redo() -> String? {
        guard canRedo else { return nil }

        isNavigating = true
        defer {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
                self.isNavigating = false
            }
        }

        currentIndex += 1
        updateUndoRedoState()

        return history[currentIndex]
    }

    /// Clear all history
    public func clear() {
        history.removeAll()
        currentIndex = -1
        updateUndoRedoState()
    }

    /// Reset with a single initial state
    public func reset(with text: String) {
        history = [text]
        currentIndex = 0
        isNavigating = false
        updateUndoRedoState()
    }

    // MARK: - Private Methods

    private func updateUndoRedoState() {
        canUndo = currentIndex > 0
        canRedo = currentIndex < history.count - 1
    }

    // MARK: - HistoryState Support

    /// Apply remote history state without recording new entries
    @MainActor
    public func applyRemoteHistoryState(_ state: HistoryState, suppressRecording: Bool = true) {
        // Set navigation flag if suppressing recording
        let wasNavigating = isNavigating
        if suppressRecording {
            isNavigating = true
        }

        // Convert entries to history
        history = state.entries.map { $0.value }

        // Set current index (clamp to valid range)
        currentIndex = min(max(0, Int(state.currentIndex)), history.count - 1)

        // Update version
        version = state.version

        // Restore navigation flag
        if suppressRecording {
            isNavigating = wasNavigating
        }

        updateUndoRedoState()
    }

    /// Merge remote history state with local state
    @MainActor
    public func mergeRemoteHistoryState(_ remote: HistoryState) -> HistoryState {
        // Convert local history to entries
        let localEntries = history.enumerated().map { index, value -> HistoryEntry in
            let timestamp = Int64(Date().timeIntervalSince1970 * 1000) - Int64(history.count - index) * 1000
            return HistoryEntry(
                value: value,
                createdAt: timestamp,
                deviceId: deviceId,
                opType: "edit",
                sequenceNumber: Int32(index)
            )
        }

        // Combine local and remote entries
        var allEntries = localEntries + remote.entries

        // Sort by createdAt ascending
        allEntries.sort { entry1, entry2 in
            if abs(entry1.createdAt - entry2.createdAt) <= 100 {
                // Within 100ms, sort by deviceId for deterministic ordering
                let id1 = entry1.deviceId ?? ""
                let id2 = entry2.deviceId ?? ""
                return id1 < id2
            }
            return entry1.createdAt < entry2.createdAt
        }

        // Deduplicate consecutive identical values
        var deduplicated: [HistoryEntry] = []
        var lastValue: String?

        for entry in allEntries {
            if entry.value != lastValue {
                deduplicated.append(entry)
                lastValue = entry.value
            }
        }

        // Cap at 200 entries (keep most recent)
        if deduplicated.count > 200 {
            deduplicated = Array(deduplicated.suffix(200))
        }

        // Calculate merged currentIndex (use max of local/remote, clamped)
        let mergedIndex = Int64(max(currentIndex, Int(remote.currentIndex)))
        let clampedIndex = min(max(0, mergedIndex), Int64(deduplicated.count - 1))

        // Bump version
        let newVersion = max(version, remote.version) + 1

        // Calculate checksum
        let checksum = calculateChecksum(entries: deduplicated)

        return HistoryState(
            entries: deduplicated,
            currentIndex: clampedIndex,
            version: newVersion,
            checksum: checksum
        )
    }

    /// Export current state as HistoryState
    @MainActor
    public func exportState() -> HistoryState {
        let entries = history.enumerated().map { index, value -> HistoryEntry in
            let timestamp = Int64(Date().timeIntervalSince1970 * 1000) - Int64(history.count - index) * 1000
            return HistoryEntry(
                value: value,
                createdAt: timestamp,
                deviceId: deviceId,
                opType: "edit",
                sequenceNumber: Int32(index)
            )
        }

        let checksum = calculateChecksum(entries: entries)

        return HistoryState(
            entries: entries,
            currentIndex: Int64(currentIndex),
            version: version,
            checksum: checksum
        )
    }

    /// Calculate SHA-256 checksum of entries
    private func calculateChecksum(entries: [HistoryEntry]) -> String {
        let values = entries.map { $0.value }.joined(separator: "\n")
        guard let data = values.data(using: .utf8) else {
            return ""
        }

        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }

        return hash.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - HistoryState Types

public struct HistoryEntry: Codable, Equatable {
    public let value: String
    public let createdAt: Int64  // Unix milliseconds
    public let deviceId: String?
    public let opType: String?
    public let sequenceNumber: Int32?

    public init(value: String, createdAt: Int64, deviceId: String? = nil, opType: String? = nil, sequenceNumber: Int32? = nil) {
        self.value = value
        self.createdAt = createdAt
        self.deviceId = deviceId
        self.opType = opType
        self.sequenceNumber = sequenceNumber
    }
}

public struct HistoryState: Codable {
    public let entries: [HistoryEntry]
    public let currentIndex: Int64
    public let version: Int64
    public let checksum: String

    public init(entries: [HistoryEntry], currentIndex: Int64, version: Int64, checksum: String) {
        self.entries = entries
        self.currentIndex = currentIndex
        self.version = version
        self.checksum = checksum
    }
}
