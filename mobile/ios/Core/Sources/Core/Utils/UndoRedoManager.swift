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
    private var history: [HistoryEntry] = []
    private var currentIndex: Int = -1
    private let maxHistorySize: Int
    private var isNavigating: Bool = false
    private var version: Int64 = 0
    private var deviceId: String?
    private var nextSequenceNumber: Int64 = 0
    private var cachedChecksum: String?
    private var checksumNeedsRecalc: Bool = true

    // MARK: - Initialization
    public init(maxHistorySize: Int = 200, deviceId: String? = nil) {
        self.maxHistorySize = maxHistorySize
        self.deviceId = deviceId?.lowercased()
    }

    // MARK: - Public Methods

    public func setDeviceId(_ deviceId: String?) {
        self.deviceId = deviceId?.lowercased()
    }

    /// Save a new state to history (called when user makes changes)
    public func saveState(_ text: String) {
        // Don't save while navigating history
        guard !isNavigating else { return }

        // Don't save if it's the same as current
        if currentIndex >= 0 && currentIndex < history.count {
            let currentText = history[currentIndex].value
            if currentText == text {
                return
            }
        }

        // Remove any forward history (redo stack)
        if currentIndex < history.count - 1 {
            history.removeSubrange((currentIndex + 1)..<history.count)
        }

        // Add new state
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        let newEntry = HistoryEntry(
            value: text,
            createdAt: timestamp,
            deviceId: deviceId,
            opType: "edit",
            sequenceNumber: Int32(nextSequenceNumber),
            version: version
        )
        nextSequenceNumber += 1
        history.append(newEntry)
        currentIndex = history.count - 1

        // Trim history if needed (keep most recent entries)
        if history.count > maxHistorySize {
            let removeCount = history.count - maxHistorySize
            history.removeFirst(removeCount)
            currentIndex -= removeCount
        }

        // Invalidate checksum cache since state changed
        checksumNeedsRecalc = true
        cachedChecksum = nil

        updateUndoRedoState()

        // Pre-compute checksum in background so it's ready for next sync
        precomputeChecksum()
    }

    /// Initialize history with an existing array of entries
    public func initializeHistory(entries: [String], currentIndex: Int? = nil) {
        let trimmed = Array(entries.suffix(maxHistorySize))
        let baseTimestamp = Int64(Date().timeIntervalSince1970 * 1000)
        self.history = trimmed.enumerated().map { index, value in
            HistoryEntry(
                value: value,
                createdAt: baseTimestamp + Int64(index),
                deviceId: deviceId,
                opType: "init",
                sequenceNumber: Int32(index),
                version: version
            )
        }
        nextSequenceNumber = Int64(history.count)

        if self.history.isEmpty {
            self.currentIndex = -1
        } else if let index = currentIndex {
            self.currentIndex = min(index, self.history.count - 1)
        } else {
            self.currentIndex = self.history.count - 1
        }

        // Invalidate checksum cache
        checksumNeedsRecalc = true
        cachedChecksum = nil

        updateUndoRedoState()
    }

    /// Get the current history entries
    public func getHistory() -> [String] {
        return history.map { $0.value }
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
        checksumNeedsRecalc = true
        cachedChecksum = nil
        updateUndoRedoState()

        return history[currentIndex].value
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
        checksumNeedsRecalc = true
        cachedChecksum = nil
        updateUndoRedoState()

        return history[currentIndex].value
    }

    /// Clear all history
    public func clear() {
        history.removeAll()
        currentIndex = -1
        nextSequenceNumber = 0
        checksumNeedsRecalc = true
        cachedChecksum = nil
        updateUndoRedoState()
    }

    /// Reset with a single initial state
    public func reset(with text: String) {
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        history = [HistoryEntry(
            value: text,
            createdAt: timestamp,
            deviceId: deviceId,
            opType: "init",
            sequenceNumber: 0,
            version: version
        )]
        currentIndex = 0
        isNavigating = false
        nextSequenceNumber = 1
        checksumNeedsRecalc = true
        cachedChecksum = nil
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
        history = state.entries

        // Set current index (clamp to valid range, handle empty case)
        if history.isEmpty {
            currentIndex = -1
        } else {
            currentIndex = min(max(0, Int(state.currentIndex)), history.count - 1)
        }

        // Update version
        version = state.version
        nextSequenceNumber = (history.compactMap { $0.sequenceNumber }.map { Int64($0) }.max() ?? -1) + 1

        // Restore navigation flag
        if suppressRecording {
            isNavigating = wasNavigating
        }

        // Use the checksum from remote state since we're applying it directly
        cachedChecksum = state.checksum
        checksumNeedsRecalc = false

        updateUndoRedoState()
    }

    /// Merge remote history state with local state
    @MainActor
    public func mergeRemoteHistoryState(_ remote: HistoryState) -> HistoryState {
        // Convert local history to entries
        let localEntries = history

        // Combine local and remote entries
        var allEntries = localEntries + remote.entries

        // Sort by sequenceNumber when available, then createdAt/deviceId for deterministic ordering
        allEntries.sort { entry1, entry2 in
            let id1 = entry1.deviceId ?? ""
            let id2 = entry2.deviceId ?? ""
            if id1 == id2 {
                let seq1 = Int64(entry1.sequenceNumber ?? -1)
                let seq2 = Int64(entry2.sequenceNumber ?? -1)
                if seq1 != seq2 {
                    return seq1 < seq2
                }
            }

            if abs(entry1.createdAt - entry2.createdAt) <= 100 {
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

        // Use most recent entry as the active index to avoid stale rollbacks after merge
        let clampedIndex = deduplicated.isEmpty ? 0 : Int64(deduplicated.count - 1)

        // Bump version
        let newVersion = max(version, remote.version) + 1

        // Calculate checksum (match desktop: JSON of {currentIndex, entries, version})
        let checksum = Self.calculateChecksum(entries: deduplicated, currentIndex: clampedIndex, version: newVersion)

        return HistoryState(
            entries: deduplicated,
            currentIndex: clampedIndex,
            version: newVersion,
            checksum: checksum
        )
    }

    /// Export current state as HistoryState
    /// Note: Uses cached checksum when available to avoid expensive recalculation on main thread
    @MainActor
    public func exportState() -> HistoryState {
        let entries = history

        // Use cached checksum if available, otherwise calculate (this should be rare on main thread)
        let checksum: String
        if let cached = cachedChecksum, !checksumNeedsRecalc {
            checksum = cached
        } else {
            // Calculate synchronously only if we must (e.g., after local changes without sync)
            // This is a fallback - ideally checksums are computed off main thread via exportStateSnapshot
            checksum = Self.calculateChecksum(entries: entries, currentIndex: Int64(currentIndex), version: version)
            cachedChecksum = checksum
            checksumNeedsRecalc = false
        }

        return HistoryState(
            entries: entries,
            currentIndex: Int64(currentIndex),
            version: version,
            checksum: checksum
        )
    }

    /// Pre-compute and cache the checksum asynchronously.
    /// Call this after state changes to warm the cache before exportState() is needed.
    @MainActor
    public func precomputeChecksum() {
        guard checksumNeedsRecalc else { return }

        let entries = history
        let idx = Int64(currentIndex)
        let ver = version

        Task.detached(priority: .utility) { [weak self] in
            let checksum = UndoRedoManager.calculateChecksum(entries: entries, currentIndex: idx, version: ver)
            await MainActor.run {
                // Only update if state hasn't changed since we started computing
                if self?.checksumNeedsRecalc == true {
                    self?.cachedChecksum = checksum
                    self?.checksumNeedsRecalc = false
                }
            }
        }
    }

    /// Export a lightweight snapshot for off-main checksum computation
    @MainActor
    public func exportStateSnapshot() -> HistoryStateSnapshot {
        HistoryStateSnapshot(
            entries: history,
            currentIndex: Int64(currentIndex),
            version: version
        )
    }

    /// Calculate SHA-256 checksum matching desktop: JSON of {currentIndex, entries, version}
    public nonisolated static func calculateChecksum(entries: [HistoryEntry], currentIndex: Int64, version: Int64) -> String {
        struct ChecksumEntry: Encodable {
            let value: String
            let timestampMs: Int64
            let deviceId: String?
            let sequenceNumber: Int64
            let version: Int64

            enum CodingKeys: String, CodingKey {
                case value
                case timestampMs
                case deviceId
                case sequenceNumber
                case version
            }
        }

        struct ChecksumPayload: Encodable {
            let currentIndex: Int64
            let entries: [ChecksumEntry]
            let version: Int64

            enum CodingKeys: String, CodingKey {
                case currentIndex
                case entries
                case version
            }
        }

        let checksumEntries = entries.map { entry in
            ChecksumEntry(
                value: entry.value,
                timestampMs: entry.createdAt,
                deviceId: entry.deviceId,
                sequenceNumber: Int64(entry.sequenceNumber ?? 0),
                version: entry.version
            )
        }

        let payload = ChecksumPayload(currentIndex: currentIndex, entries: checksumEntries, version: version)
        guard let data = try? JSONEncoder().encode(payload) else {
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

public struct HistoryEntry: Codable, Equatable, Sendable {
    public let value: String
    public let createdAt: Int64  // Unix milliseconds
    public let deviceId: String?
    public let opType: String?
    public let sequenceNumber: Int32?
    public let version: Int64  // Entry version

    enum CodingKeys: String, CodingKey {
        case value
        case timestampMs
        case deviceId
        case opType
        case sequenceNumber
        case version
    }

    public init(value: String, createdAt: Int64, deviceId: String? = nil, opType: String? = nil, sequenceNumber: Int32? = nil, version: Int64 = 1) {
        self.value = value
        self.createdAt = createdAt
        self.deviceId = deviceId
        self.opType = opType
        self.sequenceNumber = sequenceNumber
        self.version = version
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        value = try container.decode(String.self, forKey: .value)
        createdAt = try container.decode(Int64.self, forKey: .timestampMs)
        deviceId = try container.decodeIfPresent(String.self, forKey: .deviceId)
        opType = try container.decodeIfPresent(String.self, forKey: .opType)
        sequenceNumber = try container.decodeIfPresent(Int32.self, forKey: .sequenceNumber)
        version = (try? container.decode(Int64.self, forKey: .version)) ?? 1
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(value, forKey: .value)
        try container.encode(createdAt, forKey: .timestampMs)
        try container.encodeIfPresent(deviceId, forKey: .deviceId)
        try container.encodeIfPresent(opType, forKey: .opType)
        try container.encodeIfPresent(sequenceNumber, forKey: .sequenceNumber)
        try container.encode(version, forKey: .version)
    }
}

public struct HistoryState: Codable, Sendable {
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

public struct HistoryStateSnapshot: Sendable {
    public let entries: [HistoryEntry]
    public let currentIndex: Int64
    public let version: Int64

    public init(entries: [HistoryEntry], currentIndex: Int64, version: Int64) {
        self.entries = entries
        self.currentIndex = currentIndex
        self.version = version
    }
}
