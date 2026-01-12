import Foundation

// Server Event model
public struct ServerEvent: Codable {
    public let id: String
    public let eventType: String
    public let data: AnyCodable
    public let timestamp: Date
    public let sequence: UInt64
    public let sourceDevice: String?
    public let userId: String?
    public let priority: UInt8

    enum CodingKeys: String, CodingKey {
        case id, data, timestamp, sequence, priority, eventType, sourceDevice, userId
    }

    public init(id: String, eventType: String, data: AnyCodable, timestamp: Date, sequence: UInt64, sourceDevice: String? = nil, userId: String? = nil, priority: UInt8 = 0) {
        self.id = id
        self.eventType = eventType
        self.data = data
        self.timestamp = timestamp
        self.sequence = sequence
        self.sourceDevice = sourceDevice
        self.userId = userId
        self.priority = priority
    }
}

// Connection Handshake
public struct ConnectionHandshake: Codable, Equatable {
    public let sessionId: String
    public let clientId: String
    public let transport: String

    public init(sessionId: String, clientId: String, transport: String) {
        self.sessionId = sessionId
        self.clientId = clientId
        self.transport = transport
    }
}
