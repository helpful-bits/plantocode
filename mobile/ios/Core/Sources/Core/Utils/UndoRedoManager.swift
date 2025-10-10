import Foundation
import Combine

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

    // MARK: - Initialization
    public init(maxHistorySize: Int = 50) {
        self.maxHistorySize = maxHistorySize
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
}
