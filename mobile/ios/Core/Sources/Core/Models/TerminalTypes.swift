import Foundation

public enum TerminalContextType: String, Codable {
    case taskDescription
    case implementationPlan
}

public struct TerminalBinding: Codable {
    public let terminalSessionId: String
    public let appSessionId: String
    public let contextType: TerminalContextType
    public let jobId: String?
    public let createdAt: Date

    public init(terminalSessionId: String, appSessionId: String, contextType: TerminalContextType, jobId: String?, createdAt: Date) {
        self.terminalSessionId = terminalSessionId
        self.appSessionId = appSessionId
        self.contextType = contextType
        self.jobId = jobId
        self.createdAt = createdAt
    }
}

public struct TerminalContextBinding: Codable {
    public let appSessionId: String
    public let contextType: TerminalContextType
    public let jobId: String?

    public init(appSessionId: String, contextType: TerminalContextType, jobId: String? = nil) {
        self.appSessionId = appSessionId
        self.contextType = contextType
        self.jobId = jobId
    }
}
