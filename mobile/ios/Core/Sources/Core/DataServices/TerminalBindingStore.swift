import Foundation

public final class TerminalBindingStore {
    public static let shared = TerminalBindingStore()

    private let storageKey = "vm_terminal_bindings_v1"
    private var byTerminalId: [String: TerminalBinding] = [:]
    private var byJobId: [String: TerminalBinding] = [:]

    private init() {
        loadFromDefaults()
    }

    private func saveToDefaults() {
        let arr = Array(byTerminalId.values)
        if let data = try? JSONEncoder().encode(arr) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    private func loadFromDefaults() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let arr = try? JSONDecoder().decode([TerminalBinding].self, from: data) else { return }
        byTerminalId = [:]
        byJobId = [:]
        for b in arr {
            byTerminalId[b.terminalSessionId] = b
            if let jid = b.jobId {
                byJobId[jid] = b
            }
        }
    }

    public func save(_ binding: TerminalBinding) {
        byTerminalId[binding.terminalSessionId] = binding
        if let jid = binding.jobId {
            byJobId[jid] = binding
        }
        saveToDefaults()
    }

    public func getByTerminalSessionId(_ id: String) -> TerminalBinding? {
        return byTerminalId[id]
    }

    public func getByJobId(_ jobId: String) -> TerminalBinding? {
        return byJobId[jobId]
    }

    public func getAll() -> [TerminalBinding] {
        return Array(byTerminalId.values)
    }

    public func delete(terminalSessionId: String) {
        if let existing = byTerminalId.removeValue(forKey: terminalSessionId) {
            if let jid = existing.jobId, let cur = byJobId[jid], cur.terminalSessionId == terminalSessionId {
                byJobId.removeValue(forKey: jid)
            }
            saveToDefaults()
        }
    }
}
